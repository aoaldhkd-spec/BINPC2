import { publicationBlockedForTx } from "./event-hub-publication.js";
import { z, eventEnded, eventEndAt, quoteFor, HALLOWEEN_RECOGNITION_LABELS, type HubEvent, type HubApplication } from '@workspace/api-zod';
import { fail, type HubTx } from './event-hub-store.js';

export function recruitmentConfigurationIssue(e: HubEvent): string | null {
  if (!e.account || !e.deadline || !e.area || !e.notice) return '계좌·입금기한·지역·공지를 확인하세요.';
  if (e.campaign?.kind === 'tour' && !e.campaign.advance) return '전국투어 선입금액을 입력하세요.';
  if (e.closesAt && e.opensAt && Date.parse(e.closesAt) <= Date.parse(e.opensAt)) return '접수 종료는 시작 이후여야 합니다.';
  return null;
}
/** Called within the same durable advisory transaction by timer/read/write paths. */
export async function applyScheduledRecruitment(tx: HubTx, now: Date, enabled: boolean) {
  if (!enabled) return;
  const blocked = await publicationBlockedForTx(tx);
  const events = await tx.all<HubEvent>('event');
  for (const e of events) {
    if (!e.scheduleEnabled || e.schedulePaused) continue;
    const dueClose = eventEnded(e, now) || Boolean(e.closesAt && Date.parse(e.closesAt) <= now.getTime());
    let action = '';
    if (dueClose) { e.recruitment = false; e.schedulePaused = true; action = 'schedule.closed'; }
    else if (!e.recruitment && e.opensAt && Date.parse(e.opensAt) <= now.getTime()) {
      if (blocked || recruitmentConfigurationIssue(e)) continue;
      if (events.some(other => other.id !== e.id && other.date === e.date && other.recruitment
        && (other.autoDate || e.autoDate || (e.campaign?.kind === 'tour' && other.campaign?.kind === 'tour')))) continue;
      e.recruitment = true; action = 'schedule.opened';
    }
    if (action) {
      e.revision++; e.history.push({actor:'system',action,at:now.toISOString()});
      await tx.put('event',e.id,e);
    }
  }
}
export function applyApplicationOperation(
 a: HubApplication,e: HubEvent,action:string,data:Record<string,unknown>,now:Date,admin:boolean,
): boolean {
  if (action === 'admin.application.costume') {
    if (!admin) fail('ADMIN','관리자만 처리할 수 있습니다.',403);
    if (!e.campaign || !['halloween-friday','halloween-saturday'].includes(e.campaign.kind))
      fail('HALLOWEEN_POLICY','할로윈 행사에서만 분장 혜택을 인정할 수 있습니다.');
    const {kind,reason} = z.object({
      kind:z.enum(['none','costume','painting-sticker']),
      reason:z.string().trim().min(1).max(500),
    }).parse(data);
    if (!a.quote) fail('QUOTE','저장된 신청 회비를 먼저 확인해 주세요.');
    // The original application time, not the operator's review time, controls 21:00 eligibility.
    const proposed = quoteFor(e,a.benefitExcluded?1000000:(a.benefitRank??a.rank),new Date(a.history[0]?.at??now.toISOString()),kind);
    const previousFee = a.quote.fee;
    const frozen = Boolean(a.quote.fee === 0 || a.confirmedAt || a.reportedAt || a.approvedAt || a.waivedAt || a.payment !== 'none');
    if (frozen && proposed.fee !== previousFee)
      a.differenceReview={previous:previousFee,proposed:proposed.fee,at:now.toISOString()};
    else {
      delete a.differenceReview;
      if (!frozen) a.quote=proposed;
    }
    const participantNotice = `${HALLOWEEN_RECOGNITION_LABELS[kind]} · ${
      frozen && proposed.fee !== previousFee
        ? `기존 확정 금액 ${previousFee.toLocaleString('ko-KR')}원 유지. 혜택 검토 금액 ${proposed.fee.toLocaleString('ko-KR')}원은 관리자 별도 안내를 확인해 주세요.`
        : `적용 회비 ${a.quote.fee.toLocaleString('ko-KR')}원. 유효한 혜택 중 가장 낮은 금액 한 가지만 적용합니다.`
    }`;
    a.halloweenRecognition={kind,at:now.toISOString(),finalFee:a.quote.fee,proposedFee:proposed.fee,participantNotice};
    a.history.push({actor:'admin',action:'admin.halloween.recognition',at:now.toISOString(),
      reason:JSON.stringify({reason,previousFee,...a.halloweenRecognition})});
    return true;
  }
  if (action === 'application.phone') {
    a.rewardPhone = z.string().regex(/^0[0-9 -]{8,14}$/).parse(data.phone);
    return true; // Existing session ownership only; no new verification, merging or password.
  }
  if (action === 'application.late') {
    const at = z.string().datetime().parse(data.at);
    const millis = Date.parse(at);
    if (millis < Date.parse(e.date+'T00:00:00+09:00') || millis > Date.parse(e.date+'T00:00:00+09:00')+2*86400000)
      fail('ARRIVAL_DATE','해당 행사 날짜와 차수를 확인해 주세요.');
    const review = millis >= eventEndAt(e) || Boolean(e.lateReviewAfter && millis >= Date.parse(e.lateReviewAfter));
    a.lateArrival={at,reason:z.string().max(500).parse(data.reason??''),status:review?'review':'noted'};
    return true;
  }
  if (action === 'admin.application.late') {
    if (!admin) fail('ADMIN','관리자만 처리할 수 있습니다.',403);
    if (!a.lateArrival) fail('ARRIVAL','도착 신고가 없습니다.');
    a.lateArrival.status=z.enum(['approved','declined']).parse(data.status);
    a.lateArrival.reviewReason=z.string().min(1).max(500).parse(data.reason);
    return true;
  }
  if (action === 'admin.application.result') {
    if (!admin) fail('ADMIN','관리자만 처리할 수 있습니다.',403);
    const row=z.object({id:z.string().uuid(),label:z.string().min(1).max(100),amount:z.number().int().min(0).max(10000000),reason:z.string().min(1).max(500)}).parse(data);
    if (a.manualResults?.some(r=>r.id===row.id)) fail('RESULT_DUPLICATE','이미 저장된 결과입니다.',409);
    a.manualResults=[...(a.manualResults??[]),{...row,at:now.toISOString()}];
    return true;
  }
  if (action === 'admin.application.result.confirm') {
    if (!admin) fail('ADMIN','관리자만 처리할 수 있습니다.',403);
    const r=a.manualResults?.find(r=>r.id===data.id);
    if (!r) fail('RESULT','저장된 결과가 없습니다.',404);
    const field=z.enum(['receivedAt','paidAt']).parse(data.field);
    if (r[field]) fail('RESULT_DUPLICATE','이미 확인했습니다.',409);
    if (field==='paidAt' && data.doubleChecked!==true) fail('DOUBLE_CHECK','지급 전 직접 대조해 주세요.');
    r[field]=now.toISOString();return true;
  }
  return false;
}
