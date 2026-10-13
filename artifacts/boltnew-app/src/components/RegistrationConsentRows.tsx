import { useState, type ReactNode } from 'react';
import { InfoDialog } from './InfoDialog';
import { RESET_PRIVACY_NOTICE, type RegistrationConsent } from '../lib/registration-consent';

/** Separate explicit choices; a pre-ticked box is not treated as participant consent. */
export function RegistrationConsentRows({ value, onChange, children }: {
  value: RegistrationConsent; onChange: (next: RegistrationConsent) => void; children?: ReactNode;
}) {
  const [detail, setDetail] = useState<'collection' | 'sharing' | null>(null);
  return <section aria-label="개인정보 및 알림 동의" className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
      <p className="text-xs font-bold text-gray-700">필수 동의를 직접 선택해 주세요</p>
      <button type="button" aria-label="필수 약관 모두 동의" onClick={() => onChange({ ...value, collection: true, sharing: true })}
        className="shrink-0 rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-bold text-teal-800">
        필수 약관 모두 동의
      </button>
    </div>
    {([
      ['collection', '[필수] 개인정보 수집 및 이용 동의'],
      ['sharing', '[필수] 개인정보 제3자 제공 동의'],
    ] as const).map(([key, label]) => <div key={key} className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
      <label className="flex-1 flex items-center gap-2 min-h-11 text-xs font-bold text-gray-700 cursor-pointer">
        <input type="checkbox" checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })}
          aria-label={label} className="w-4 h-4 shrink-0 accent-teal-700" />
        <span>{label}</span>
      </label>
      <button type="button" aria-label={`${label} 내용 보기`} onClick={() => setDetail(key)}
        className="touch-target shrink-0 text-xs underline text-gray-600">보기</button>
    </div>)}
    <div className="p-3">{children}</div>
    <p className="px-3 pb-3 text-xs text-gray-600 leading-relaxed">{RESET_PRIVACY_NOTICE}</p>
    <InfoDialog open={detail !== null} title={detail === 'sharing' ? '개인정보 제3자 제공 안내' : '개인정보 수집·이용 안내'} onClose={() => setDetail(null)} closeLabel="내용 확인">
      {detail === 'collection' ? <>
        <p><strong>이용 목적:</strong> BINPC2 행사 참가자 등록, 프로필 표시, 하트·채팅 기능 제공과 서비스 운영.</p>
        <p><strong>입력 항목:</strong> 닉네임, 년생·지역, MBTI, 관심사, 성향 및 직접 입력한 프로필 정보. 사진·연락처 등 추가 입력 항목은 해당 기능의 공개 설정에 따릅니다.</p>
        <p>동의 여부를 직접 선택할 수 있습니다. 행사 참가에 필요한 동의를 하지 않으면 이 등록 절차는 진행되지 않습니다. 알림 수신 동의는 별도 선택입니다.</p>
      </> : <>
        <p><strong>제공받는 대상:</strong> 같은 행사에 참여하는 BINPC2 참가자.</p>
        <p><strong>제공 목적:</strong> 행사 안에서 상대 프로필을 확인하고 하트·채팅으로 소통하기 위함입니다.</p>
        <p><strong>제공 항목:</strong> 참가자에게 공개하도록 입력한 닉네임·프로필 정보·성향·이상형 등. 휴대폰 푸시 인증정보와 비공개 연락처를 전체 참가자에게 제공하지 않습니다. 연락처는 기존 공개·교환 설정을 따릅니다.</p>
        <p>행사 참가자에게 프로필을 제공하는 데 동의하지 않으면 이 등록 절차는 진행되지 않습니다.</p>
      </>}
      <p><strong>초기화 안내:</strong> {RESET_PRIVACY_NOTICE}</p>
      <p className="text-xs">개인정보 삭제·열람 문의는 행사 운영진에게 요청해 주세요.</p>
    </InfoDialog>
  </section>;
}
