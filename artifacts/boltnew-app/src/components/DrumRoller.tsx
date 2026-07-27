import { useState, useRef } from 'react';

// ─── DrumRoller ───────────────────────────────────────────────────────────────
// 드럼 롤러 방식의 선택 컴포넌트 (생년월일, 생월·생일 선택에 사용)

function DrumRoller<T extends string | number>({
  items, selected, onSelect, renderItem, itemHeight = 36, visibleCount = 3,
}: {
  items: T[];
  selected: T | null;
  onSelect: (v: T) => void;
  renderItem?: (v: T) => string;
  itemHeight?: number;
  visibleCount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const [offset, setOffset] = useState(() => {
    const idx = selected !== null ? items.indexOf(selected) : 0;
    return idx >= 0 ? idx * itemHeight : 0;
  });

  const clamp = (v: number) => Math.max(0, Math.min(v, (items.length - 1) * itemHeight));

  const snapToNearest = (raw: number) => {
    const clamped = clamp(Math.round(raw / itemHeight) * itemHeight);
    setOffset(clamped);
    onSelect(items[Math.round(clamped / itemHeight)]);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startOffset.current = offset;
    containerRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    setOffset(clamp(startOffset.current + (startY.current - e.clientY)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    isDragging.current = false;
    snapToNearest(offset);
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    snapToNearest(clamp(offset + Math.sign(e.deltaY) * itemHeight));
  };

  const visH = visibleCount * itemHeight;
  const centerTop = Math.floor(visibleCount / 2) * itemHeight;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{ height: visH, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div className="absolute inset-x-0 top-0 z-10 pointer-events-none"
        style={{ height: centerTop, background: 'linear-gradient(to bottom, white 0%, rgba(255,255,255,0) 100%)' }} />
      <div className="absolute inset-x-0 z-10 pointer-events-none border-y-2 border-cyan-400/40 bg-cyan-50/60"
        style={{ top: centerTop, height: itemHeight }} />
      <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
        style={{ height: centerTop, background: 'linear-gradient(to top, white 0%, rgba(255,255,255,0) 100%)' }} />
      <div className="absolute inset-x-0" style={{ top: centerTop - offset }}>
        {items.map((item, i) => {
          const dist = Math.abs(i - offset / itemHeight);
          return (
            <div
              key={String(item)}
              onClick={() => { setOffset(i * itemHeight); onSelect(item); }}
              className={`flex items-center justify-center font-bold transition-all duration-100 ${
                dist < 0.6 ? 'text-cyan-700 text-sm' : dist < 1.5 ? 'text-gray-400 text-xs' : 'text-gray-200 text-xs'
              }`}
              style={{ height: itemHeight }}
            >
              {renderItem ? renderItem(item) : String(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DrumRoller;
