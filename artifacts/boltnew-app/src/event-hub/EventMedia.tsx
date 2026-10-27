export function EventMedia({ links }: { links: string[] }) {
  if (!links.length) return null;
  return (
    <div className="space-y-3">
      {links.map((url, i) =>
        /\.(mp4|webm)(?:\?|$)/i.test(url) ? (
          <video
            key={url}
            controls
            preload="none"
            className="w-full rounded-xl"
            src={url}
          />
        ) : /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(url) ||
          /^data:image\/svg\+xml,/.test(url) ? (
          <img
            key={url}
            src={url}
            alt={`행사 안내 자료 ${i + 1}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full max-h-96 object-contain rounded-xl"
          />
        ) : (
          <a
            key={url}
            className="block text-sm text-teal-700 underline break-words"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            사진·포스터·영상 자료 {i + 1} 열기
          </a>
        ),
      )}
    </div>
  );
}
