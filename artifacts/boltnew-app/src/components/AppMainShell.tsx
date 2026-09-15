/**
 * Main tab shell peeled from App JSX — behavior unchanged.
 * Profiles stay mounted under overlays (inert when sub-screen).
 */
import { Suspense, type ComponentProps } from 'react';
import { AppErrorBoundary } from './AppErrorBoundary';
import { MainScreen } from './MainScreen';

export type AppMainShellProps = ComponentProps<typeof MainScreen> & {
  isSubScreen: boolean;
  onBoundaryReset: () => void;
};

export function AppMainShell({
  isSubScreen,
  onBoundaryReset,
  ...mainProps
}: AppMainShellProps) {
  return (
    <div
      className={isSubScreen ? 'pointer-events-none' : undefined}
      aria-hidden={isSubScreen}
      inert={isSubScreen || undefined}
    >
      <AppErrorBoundary screenName="메인 화면" onReset={onBoundaryReset}>
        <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
          <MainScreen {...mainProps} />
        </Suspense>
      </AppErrorBoundary>
    </div>
  );
}
