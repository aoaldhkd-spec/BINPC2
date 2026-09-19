/**
 * Early entry/gate screens peeled from App JSX (not a wholesale rewrite).
 * Returns null when the main shell should render.
 */
import type { ComponentProps, ReactNode } from 'react';
import { WaitingOverlay } from './WaitingOverlay';
import { ProfileRecoveryScreen } from './ProfileRecoveryScreen';
import { NicknameSetupScreen } from './NicknameSetupScreen';
import type { View } from '../types/app';

type NicknameSubmit = ComponentProps<typeof NicknameSetupScreen>['onSubmit'];
type RecoverFn = (profileId: string, pinCode: string) => void;

export type AppEntryGatesProps = {
  appLoading: boolean;
  sessionActive: boolean | null;
  showWaiting: boolean;
  showRecovery: boolean;
  showNicknameSetup: boolean;
  currentUserId: string | null;
  hasValidProfile: boolean;
  profileBoot: string;
  view: View;
  loading: boolean;
  registrationError: string | null;
  onWaitingEnter: () => void;
  onRecover: RecoverFn;
  onRecoveryBackToRegister: () => void;
  onRecoveryBackToEntry: () => void;
  onNicknameSubmit: NicknameSubmit;
  onReset: () => void;
  onShowRecovery: () => void;
};

function SpinnerScreen({ message, detail }: { message: string; detail?: string }): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-base font-black text-white">{message}</p>
      {detail ? <p className="text-sm font-bold text-slate-400">{detail}</p> : null}
    </div>
  );
}

function CompactSpinner({ label }: { label: string }): ReactNode {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin" />
      <p className="text-sm text-slate-400 font-semibold">{label}</p>
    </div>
  );
}

/** @returns gate UI, or null to continue into the main App shell */
export function renderAppEntryGates(props: AppEntryGatesProps): ReactNode {
  if (props.appLoading || props.sessionActive === null) {
    return (
      <SpinnerScreen
        message="서버랑 X스 중입니다..."
        detail="조ㄹ라 잠시만 기다려주세요! 🍺"
      />
    );
  }

  if (props.showWaiting) {
    return (
      <WaitingOverlay
        sessionActive={props.sessionActive}
        onEnter={props.onWaitingEnter}
        onRecover={props.onRecover}
      />
    );
  }

  if (props.currentUserId && !props.hasValidProfile && props.profileBoot !== 'ok') {
    if (props.showRecovery) {
      return (
        <ProfileRecoveryScreen
          onRecover={props.onRecover}
          onBack={props.onRecoveryBackToRegister}
        />
      );
    }
    return <CompactSpinner label="프로필 확인 중..." />;
  }

  if (props.view === 'loading-main') {
    return <CompactSpinner label="프로필 저장 중..." />;
  }

  if (props.showRecovery) {
    return (
      <ProfileRecoveryScreen
        onRecover={props.onRecover}
        onBack={props.onRecoveryBackToEntry}
      />
    );
  }

  if (props.showNicknameSetup) {
    return (
      <NicknameSetupScreen
        onSubmit={props.onNicknameSubmit}
        loading={props.loading}
        registrationError={props.registrationError}
        onReset={props.onReset}
        onShowRecovery={props.onShowRecovery}
      />
    );
  }

  if (props.currentUserId && (props.view === 'entry-1' || props.view === 'entry-recover')) {
    return <CompactSpinner label="프로필 확인 중..." />;
  }

  return null;
}
