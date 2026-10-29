import { useState } from "react";
import { HubButton } from "./HubUi";

/** Presentation only: the original notice and consent/version remain on the server. */
export function noticePages(notice: string): string[] {
  const pages: string[] = [];
  for (const paragraph of notice.split(/\n+/).filter(Boolean)) {
    const last = pages.length - 1;
    if (last >= 0 && pages[last].length + paragraph.length < 430) pages[last] += "\n\n" + paragraph;
    else pages.push(paragraph);
  }
  return pages.length ? pages : ["공지사항을 준비하고 있습니다."];
}

export function NoticePages({ notice, halloween=false }: { notice: string; halloween?:boolean }) {
  const pages = noticePages(notice);
  const [index, setIndex] = useState(0);
  const page = Math.min(index, pages.length - 1);
  return <section className="hub-notice-pages" data-notice-theme={halloween?'halloween':undefined} aria-label="행사 필독 공지">
    <div className="flex items-center justify-between gap-2"><strong>{halloween?'🎃 함께 즐기는 할로윈':'행사 안내'}</strong><small>{page + 1} / {pages.length}</small></div>
    <div className="hub-notice-paragraphs" aria-live="polite">{pages[page].split(/\n\n/).map((paragraph,i)=><p key={i} className="whitespace-pre-wrap text-sm leading-7">{paragraph}</p>)}</div>
    {pages.length > 1 && <div className="flex justify-between gap-2">
      <HubButton disabled={page === 0} onClick={() => setIndex(page - 1)}>← 이전 안내</HubButton>
      <HubButton disabled={page === pages.length - 1} onClick={() => setIndex(page + 1)}>다음 안내 →</HubButton>
    </div>}
    {pages.length > 1 && <details className="text-xs mt-3"><summary>전체 안내 한 번에 보기</summary><p className="whitespace-pre-wrap leading-6 py-3">{notice}</p></details>}
  </section>;
}
