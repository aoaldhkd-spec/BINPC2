import { useState } from "react";
import { quoteFor, type HubEvent } from "../lib/event-hub-client";
import { HubButton, HubCard, HubField, inputClass } from "./HubUi";
/** Removable local preview: deliberately receives no mutation client or real owner/application IDs. */
export function EventLaboratory({ event }: { event?: HubEvent }) {
  const [rank, setRank] = useState(3),
    [stage, setStage] = useState("회비 확인"),
    [role, setRole] = useState("참가자"),
    [cards, setCards] = useState(0);
  const e = event ?? {
    fee: 50000,
    benefitsEnabled: true,
    benefits: [
      {
        from: 1,
        to: 3,
        type: "discount" as const,
        value: 10000,
        label: "선착순 1~3등 혜택",
      },
    ],
    revision: 1,
  };
  const q = quoteFor(e, rank);
  return (
    <HubCard>
      <h2 className="font-black">🧪 선착순 시험실</h2>
      <p className="text-sm text-amber-800">
        가상 화면입니다. 실제 신청·입금·공지·재고·통계에는 저장하지 않습니다.
      </p>
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4, 10, 11, 15].map((n) => (
          <HubButton
            key={n}
            onClick={() => setRank(n)}
            aria-pressed={rank === n}
          >
            {n}등
          </HubButton>
        ))}
      </div>
      <HubField label="가상 순위 직접 입력">
        <input
          type="number"
          min={1}
          className={inputClass}
          value={rank}
          onChange={(e) => setRank(Math.max(1, Number(e.target.value)))}
        />
      </HubField>
      <HubField label="가상 진행 상태">
        <select
          className={inputClass}
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          {[
            "기본정보 작성 중",
            "공지 동의 완료",
            "회비 확인",
            "입금 신고",
            "입금 승인",
            "입금확정 대기자",
            "프로필 미완료",
            "프로필 완료",
            "현장 입장",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </HubField>
      <div className="flex gap-2">
        <HubButton onClick={() => setRole("참가자")}>
          참가자 화면으로 보기
        </HubButton>
        <HubButton onClick={() => setRole("관리자")}>
          관리자 화면으로 보기
        </HubButton>
      </div>
      <section
        aria-label="가상 참가 화면"
        className="bg-teal-50 rounded-2xl p-4 space-y-2"
      >
        <strong>
          {role} 체험 · 가상 {rank}등
        </strong>
        <p>{stage}</p>
        {["기본정보 작성 중", "공지 동의 완료"].includes(stage) ? (
          <p>회비는 공지 저장 완료 후 처음 공개합니다.</p>
        ) : (
          <>
            <p>{q.benefit}</p>
            <p className="font-black">
              최종 납부 금액 {q.fee.toLocaleString()}원
            </p>
          </>
        )}
        <p>
          {stage === "프로필 미완료"
            ? "입장하려면 프로필을 먼저 완성해야 합니다"
            : stage === "입금확정 대기자"
              ? "입금 확인 완료 · 참가 승인 대기"
              : "입금 신고는 자동 승인이 아닙니다."}
        </p>
        <HubField label="가상 카드 사용 횟수">
          <select
            className={inputClass}
            value={cards}
            onChange={(e) => setCards(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v}장{v === 4 ? " · 초과 시도" : ""}
              </option>
            ))}
          </select>
        </HubField>
        <p>
          {cards >= 3
            ? "추가 카드 거부 · 행사별 3장 제한"
            : `${3 - cards}장 남음`}
        </p>
      </section>
      <HubButton
        onClick={() => {
          setRank(3);
          setStage("회비 확인");
          setCards(0);
        }}
      >
        시험 데이터만 초기화
      </HubButton>
    </HubCard>
  );
}
