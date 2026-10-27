import { formatHubTime } from "./HubUi";
/** Deliberately render only the notice text and time, never prior bank/location fields. */
export function NoticeHistory({
  history,
}: {
  history?: { at: string; notice: string }[];
}) {
  if (!history?.length) return null;
  return (
    <details>
      <summary className="text-sm font-bold cursor-pointer">
        이전 공지·변경 이력 ({history.length}건)
      </summary>
      <ol className="space-y-3 mt-3">
        {[...history].reverse().map((entry, index) => (
          <li
            key={`${entry.at}:${index}`}
            className="rounded-xl border border-slate-200 p-3"
          >
            <p className="text-xs text-slate-600">{formatHubTime(entry.at)}</p>
            <p className="text-sm whitespace-pre-wrap break-words">
              {entry.notice}
            </p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-600 mt-2">
        위 기록은 과거 공지입니다. 현재 공지와 동의 상태를 확인해 주세요. 확정된
        입금 내역과 회비는 다시 신청하지 않아도 보존됩니다.
      </p>
    </details>
  );
}
