import { createRoot } from 'react-dom/client';
import './style.css';
import { EventLaboratory } from '../src/event-hub/EventLaboratory';
// This entry deliberately does not mount App, useEventHub, a service worker or analytics.
createRoot(document.getElementById('root')!).render(<main className="max-w-3xl mx-auto p-4 space-y-4"><h1 className="text-2xl font-black">BINPC2 V6 · 독립 가상 체험판</h1><p>테스트 전용 · 로그인 불필요 · 실제 개인정보 입력 금지</p><p>참가자/관리자는 아래 버튼으로 전환합니다. 처음부터 신청하려면 ‘시험 데이터만 초기화’를 누르세요. 기본 화면은 가상 3등입니다.</p><p>이 파일의 저장·복원은 현재 탭의 가상 저장소입니다. 다른 기기 복구·실제 서버 저장·실제 알림 발송은 지원하지 않습니다. 탭 종료 후 보존은 보장하지 않습니다.</p><EventLaboratory /></main>);
