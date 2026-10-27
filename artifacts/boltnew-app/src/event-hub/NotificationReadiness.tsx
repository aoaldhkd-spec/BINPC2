import { useState } from "react";
import { currentPushStatus } from "../lib/webPush";
import { hubFetch, type HubEvent } from "../lib/event-hub-client";
import { HubButton, HubCard } from "./HubUi";
export function NotificationReadiness({ event }: { event?: HubEvent }) {
  const [preview, setPreview] = useState<{
      eligibleCount: number;
      externalSendingEnabled: boolean;
      reason: string;
    } | null>(null),
    [error, setError] = useState("");
  const status = currentPushStatus();
  return (
    <HubCard>
      <h3 className="font-black">문의·알림 지원 상태 확인</h3>
      <p>현재 브라우저: {status.message}</p>
      <p className="text-sm">
        웹 문의는 화면이 열려 있을 때 폴링으로 확인합니다. 관리자·행사 안내 외부
        푸시는 발송하지 않습니다. 기존 참가자 하트·1:1 정책과 분리됩니다.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>기기·경로</th>
            <th>확인 상태</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>현재 Chromium 웹 문의</td>
            <td>브라우저 자동검증 대상</td>
          </tr>
          <tr>
            <td>Android 실기기 백그라운드</td>
            <td>UNKNOWN · 실기기 검사 필요</td>
          </tr>
          <tr>
            <td>iPhone/iPad 홈 화면 앱</td>
            <td>UNKNOWN · 설치·권한·실기기 검사 필요</td>
          </tr>
          <tr>
            <td>Windows 브라우저 Push</td>
            <td>UNKNOWN · 권한·실기기 검사 필요</td>
          </tr>
        </tbody>
      </table>
      <HubButton
        disabled={!event}
        onClick={async () => {
          try {
            setPreview(
              await hubFetch(`/campaign-preview/${event!.id}`, undefined, true),
            );
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        광고 동의 대상 수만 미리 확인
      </HubButton>
      {preview && (
        <p role="status">
          동의 대상 {preview.eligibleCount}명 · {preview.reason}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </HubCard>
  );
}
export function UnsubscribePage() {
  const [token] = useState(
      () => new URLSearchParams(window.location.search).get("token") ?? "",
    ),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="min-h-screen bg-slate-50 p-5">
      <div className="max-w-lg mx-auto">
        <HubCard>
          <h1 className="font-black text-xl">향후 행사 광고 안내 수신거부</h1>
          <p>
            재사용 프로필·이번 행사 신청·입금 기록·하트/1:1 알림은 그대로
            유지됩니다.
          </p>
          {done ? (
            <p role="status">향후 행사 광고 안내 수신거부가 저장되었습니다.</p>
          ) : (
            <HubButton
              disabled={!token}
              onClick={async () => {
                try {
                  await hubFetch("/unsubscribe", { token });
                  setDone(true);
                  window.history.replaceState({}, "", "/events/unsubscribe");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              광고 안내 수신거부 저장
            </HubButton>
          )}
          {error && <p role="alert">{error}</p>}
          <a href="/events" className="underline text-sm">
            내 신청 목록
          </a>
        </HubCard>
      </div>
    </main>
  );
}
