import type { HubMaterial } from "../../../../lib/api-zod/src/event-hub";
export function EventMedia({
  links,
  materials,
}: {
  links: string[];
  materials?: HubMaterial[];
}) {
  const ordered = materials
    ? [
        ...materials
          .filter((m) => !m.hidden && links.includes(m.url))
          .map((m) => m.url),
        ...links.filter((url) => !materials.some((m) => m.url === url)),
      ]
    : links;
  if (!ordered.length) return null;
  return (
    <div className="space-y-4">
      {ordered.map((url, i) => {
        const material = materials?.find((m) => m.url === url),
          alt = material?.alt || `행사 안내 자료 ${i + 1}`;
        return (
          <figure key={url} className="space-y-2">
            {material && (
              <figcaption className="text-sm font-bold">
                {material.purpose === "map"
                  ? "승인자용 지도·약도"
                  : material.purpose === "notice"
                    ? "공지 사진"
                    : "대기방 자료"}
                {material.alt ? ` · ${material.alt}` : ""}
              </figcaption>
            )}
            {/\.(mp4|webm)(?:\?|$)/i.test(url) ? (
              <video
                src={url}
                controls
                preload="none"
                className="w-full rounded-xl"
              />
            ) : /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(url) ||
              /^data:image\/svg\+xml,/.test(url) ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${alt} 크게 보기`}
              >
                <img
                  src={url}
                  alt={alt}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl"
                />
              </a>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-teal-700 underline break-words"
              >
                안내 자료 {i + 1} 열기
              </a>
            )}
          </figure>
        );
      })}
    </div>
  );
}
