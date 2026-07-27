import React, { useState, useEffect, useRef } from 'react';

export function TimerBanner({ endAt, label }: { endAt: string; label: string }) {
  const calc = () => Math.max(0, Math.round((new Date(endAt).getTime() - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(calc);
  const [showAlert, setShowAlert] = useState(false);
  const startedAbove60Ref = useRef(calc() > 60);
  const alertShownRef = useRef(false);

  useEffect(() => {
    startedAbove60Ref.current = calc() > 60;
    alertShownRef.current = false;
    const id = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (r <= 60 && startedAbove60Ref.current && !alertShownRef.current) {
        alertShownRef.current = true;
        setShowAlert(true);
      }
    }, 1000);
    return () => { clearInterval(id); setShowAlert(false); };
  }, [endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const expired = remaining === 0;
  const nearEnd = remaining <= 60;

  return (
    <>
      <div className={`px-4 py-1.5 flex items-center justify-end gap-2 ${
        expired ? 'bg-gray-50 border-gray-200'
        : nearEnd ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-100'
      } border-t`}>
        <span className={`text-sm font-black tabular-nums ${
          expired ? 'text-gray-400' : nearEnd ? 'text-red-600' : 'text-amber-700'
        }`}>{formatted}</span>
        {label && <span className={`text-xs font-medium ${
          expired ? 'text-gray-400' : nearEnd ? 'text-red-500' : 'text-amber-600'
        }`}>· {label}</span>}
      </div>
      {showAlert && (
        <div className="mx-4 my-1 px-4 py-2.5 bg-red-500 rounded-xl flex items-center gap-3 animate-pulse">
          <span className="text-lg">🔔</span>
          <span className="text-sm font-black text-white">곧 진행이 시작됩니다!</span>
        </div>
      )}
    </>
  );
}
