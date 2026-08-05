/**
 * ChatErrorBoundary — 채팅 컴포넌트 전용 에러 바운더리
 *
 * ChatScreen 내부에서 예외가 발생하더라도 앱 전체가 하얀 화면으로 멈추지 않도록
 * 채팅 영역에만 선택적으로 적용합니다.
 *
 * 에러 발생 시: 안전한 Fallback UI를 보여주고 유저가 스스로 복구할 수 있도록 합니다.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** 에러 복구 후 호출 — 부모 컴포넌트에서 채팅 상태를 초기화할 수 있도록 */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error ?? '알 수 없는 오류');
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 에러를 콘솔에만 기록 — 사용자에게 기술적 내용은 노출하지 않음
    console.error('[ChatErrorBoundary] 채팅 렌더링 오류:', error.message, info.componentStack?.slice(0, 300));
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 px-8 text-center">
        <div className="text-5xl select-none">💬</div>
        <p className="text-gray-700 font-semibold">채팅을 불러오는 중 문제가 생겼어요</p>
        <p className="text-xs text-gray-400 max-w-xs">
          일시적인 오류입니다. 아래 버튼을 누르면 채팅 화면이 새로 시작됩니다.
        </p>
        <button
          onClick={this.handleReset}
          className="mt-2 px-6 py-2.5 bg-pink-500 text-white rounded-full text-sm font-medium
                     active:scale-95 transition-transform shadow-sm"
        >
          다시 시도
        </button>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-gray-400 underline underline-offset-2"
        >
          그래도 안 되면 페이지 새로고침
        </button>
      </div>
    );
  }
}
