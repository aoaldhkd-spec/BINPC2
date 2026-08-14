/**
 * AppErrorBoundary — 앱 전역 에러 바운더리
 *
 * 웹사이트의 모든 주요 뷰(메인, 프로필, 채팅 등)를 감싸서,
 * 예상치 못한 렌더링 에러가 발생해도 전체 앱이 백지화(White Screen)되지 않도록 합니다.
 * 에러 발생 영역만 안전한 Fallback UI로 격리합니다.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** 어느 화면인지 식별 (로그·UI에 표시) */
  screenName?: string;
  /** 복구 버튼 클릭 시 호출 — 부모가 상태를 초기화할 수 있음 */
  onReset?: () => void;
  /** 전역 앱 오류에는 기존의 어두운 전체 화면 UI를 사용 */
  variant?: 'screen' | 'app';
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error ?? '알 수 없는 오류');
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const screen = this.props.screenName ?? '알 수 없는 화면';
    console.error(
      `[AppErrorBoundary:${screen}] 렌더링 오류:`,
      error.message,
      info.componentStack?.slice(0, 400),
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const screen = this.props.screenName ?? '화면';
    if (this.props.variant === 'app') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-center gap-4">
          <span className="text-5xl">⚡</span>
          <div>
            <p className="text-white font-black text-lg mb-1">앱에서 오류가 발생했습니다</p>
            <p className="text-slate-400 text-sm">잠시 후 다시 시도해 주세요</p>
          </div>
          <button
            onClick={this.handleReset}
            className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-white font-black rounded-2xl transition-all"
          >
            새로고침
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4 px-8 text-center">
        <div className="text-5xl select-none">⚠️</div>
        <p className="text-gray-800 font-semibold text-base">
          일시적인 오류가 발생했어요
        </p>
        <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
          {screen} 화면을 불러오는 중 문제가 생겼습니다.
          아래 버튼을 눌러 다시 시도해주세요.
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
