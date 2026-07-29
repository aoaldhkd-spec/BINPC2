import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { X, Camera, RefreshCw } from 'lucide-react';

interface Props {
  onDetected: (profileId: string) => void;
  onClose: () => void;
  darkMode?: boolean;
}

// QR 코드 URL에서 profileId 추출
// 지원 형식: ?share=<uuid> 또는 ?userId=<uuid>
function extractProfileId(text: string): string | null {
  try {
    // 전체 URL인 경우
    const url = new URL(text);
    return url.searchParams.get('share') ?? url.searchParams.get('userId');
  } catch {
    // 상대 경로 또는 쿼리 스트링 직접
    const match = text.match(/[?&]share=([0-9a-f-]{36})/i) ?? text.match(/[?&]userId=([0-9a-f-]{36})/i);
    return match?.[1] ?? null;
  }
}

export function QrScannerModal({ onDetected, onClose, darkMode: _darkMode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState<'requesting' | 'scanning' | 'error'>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopStream = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    stopStream();
    detectedRef.current = false;
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStatus('scanning');
      }
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name === 'NotAllowedError') {
        setErrorMsg('카메라 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.');
      } else if (err?.name === 'NotFoundError') {
        setErrorMsg('카메라를 찾을 수 없습니다.');
      } else {
        setErrorMsg('카메라를 시작할 수 없습니다.');
      }
      setStatus('error');
    }
  }, [stopStream]);

  // 스캔 루프
  const scan = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || detectedRef.current) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code?.data) {
          const profileId = extractProfileId(code.data);
          if (profileId) {
            detectedRef.current = true;
            stopStream();
            onDetected(profileId);
            return;
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scan);
  }, [stopStream, onDetected]);

  useEffect(() => {
    startCamera(facingMode);
    return stopStream;
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 비디오가 재생되면 스캔 루프 시작
  const handleCanPlay = useCallback(() => {
    rafRef.current = requestAnimationFrame(scan);
  }, [scan]);

  const switchCamera = () => {
    setFacingMode(m => m === 'environment' ? 'user' : 'environment');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-black/80">
        <button onClick={onClose} className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-6 h-6" />
        </button>
        <div className="text-center">
          <p className="text-white font-black text-base">📷 QR 스캔</p>
          <p className="text-white/50 text-xs">연락처 QR을 카메라에 비춰주세요</p>
        </div>
        <button onClick={switchCamera} className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* 카메라 뷰 */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {status === 'error' ? (
          <div className="flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Camera className="w-16 h-16 text-white/30" />
            <p className="text-white font-bold">{errorMsg}</p>
            <button onClick={() => startCamera(facingMode)}
              className="px-6 py-3 bg-cyan-500 text-white font-bold rounded-2xl active:scale-95 transition-all">
              다시 시도
            </button>
          </div>
        ) : (
          <>
            {/* 비디오 */}
            <video
              ref={videoRef}
              onCanPlay={handleCanPlay}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* 스캔 오버레이 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* 어두운 주변부 */}
              <div className="absolute inset-0 bg-black/40" />
              {/* 스캔 박스 */}
              <div className="relative w-64 h-64">
                {/* 투명 창 */}
                <div className="absolute inset-0 bg-transparent border-0" />
                {/* 모서리 */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />
                {/* 스캔 라인 애니메이션 */}
                {status === 'scanning' && (
                  <div className="absolute left-2 right-2 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_2px_rgba(34,211,238,0.6)] animate-scan-line" />
                )}
              </div>
            </div>
            {status === 'requesting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white font-bold">카메라 시작 중...</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 숨긴 캔버스 (jsQR 처리용) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 안내 */}
      <div className="px-6 py-4 bg-black/80 text-center pb-safe-bottom">
        <p className="text-white/60 text-xs">
          상대방 앱의 <span className="text-cyan-400 font-bold">연락처 QR</span>을 네모 안에 맞춰주세요
        </p>
      </div>
    </div>
  );
}
