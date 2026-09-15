/**
 * App chrome + overlay fan-in peeled from App JSX (behavior unchanged).
 * Renders nav / toasts / profile·chat·group / modals around `children` (main shell).
 */
import { Suspense, lazy, type ReactNode, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PROFILE_ROW_SELECT } from '../lib/profile-select';
import { hasInterestHeart, isInterestHeart } from '../lib/signal-match';
import { hasProfileFortuneCompatData } from '../lib/profile';
import type { NetUiStatus } from '../lib/net-health';
import type {
  Profile, ContactShare, View, MainTab, Message, GroupChat, GroupMessage, GroupParticipant, UserSignal,
} from '../types/app';
import { type HeartType } from '../lib/constants';
import { NavLayer } from '../hooks/useParticipantNav';
import { AppErrorBoundary } from './AppErrorBoundary';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import ProfileDetail from './ProfileDetail';
import ReconnectOverlay from './ReconnectOverlay';
import { NotifModal } from './NotifModal';
import { ConfettiOverlay } from './ConfettiOverlay';
import { LikeConfirmDialog } from './LikeConfirmDialog';
import { ContactShareModal } from './ContactShareModal';
import { ContactViewModal } from './ContactViewModal';
import { FortuneTabLazy } from './FortuneTab.lazy';
import { ResetPasswordSheet } from './ResetButton';
import { ContactRevealModal } from './ContactRevealModal';
import { GroupChatScreen } from './GroupChatScreen';
import {
  BottomNotification,
  type BottomNotificationData,
} from './BottomNotification';
import {
  ShareEventNotification,
  type ShareEventNotificationData,
} from './ShareEventNotification';
import { FirstEntryCoachMarks } from './FirstEntryCoachMarks';

const ChatScreen = lazy(() => import('./ChatScreen'));
const TutorialModal = lazy(() => import('./TutorialModal').then(m => ({ default: m.TutorialModal })));
const QrScannerModal = lazy(() => import('./QrScannerModal').then(m => ({ default: m.QrScannerModal })));
const ContactDisplayModal = lazy(() => import('./ContactDisplayModal').then(m => ({ default: m.ContactDisplayModal })));

const overlayLazyFallback = (
  <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
    <div className="h-5 w-5 rounded-full border-2 border-slate-400/25 border-t-slate-300 animate-spin" />
  </div>
);

type Notif = { id: string; message: string; type: string; target: string };

export type AppOverlaysProps = {
  children: ReactNode;
  isSubScreen: boolean;
  showTutorialModal: boolean;
  setShowTutorialModal: Dispatch<SetStateAction<boolean>>;
  activeNotif: Notif | null;
  setActiveNotif: Dispatch<SetStateAction<Notif | null>>;
  showResetPassword: boolean;
  setShowResetPassword: Dispatch<SetStateAction<boolean>>;
  likeConfirmTarget: Profile | null;
  setLikeConfirmTarget: Dispatch<SetStateAction<Profile | null>>;
  contactShareTarget: Profile | null;
  setContactShareTarget: Dispatch<SetStateAction<Profile | null>>;
  contactViewShare: { share: ContactShare; profile: Profile } | null;
  setContactViewShare: Dispatch<SetStateAction<{ share: ContactShare; profile: Profile } | null>>;
  showContactQr: boolean;
  setShowContactQr: Dispatch<SetStateAction<boolean>>;
  showQrScanner: boolean;
  setShowQrScanner: Dispatch<SetStateAction<boolean>>;
  scannedContactProfile: Profile | null;
  setScannedContactProfile: Dispatch<SetStateAction<Profile | null>>;
  fortuneModalTarget: Profile | null;
  setFortuneModalTarget: Dispatch<SetStateAction<Profile | null>>;
  connStatus: NetUiStatus;
  onReconnectRetry: () => void;
  rejectionNotif: string | null;
  setRejectionNotif: Dispatch<SetStateAction<string | null>>;
  functionsLockToast: string | null;
  bottomNotif: BottomNotificationData | null;
  setBottomNotif: Dispatch<SetStateAction<BottomNotificationData | null>>;
  setMySubTabHint: Dispatch<SetStateAction<'status' | 'chats' | null>>;
  handleMainTabChange: (tab: MainTab) => void;
  profiles: Profile[];
  receivedLikers: Profile[];
  setSelectedProfile: Dispatch<SetStateAction<Profile | null>>;
  setView: Dispatch<SetStateAction<View>>;
  openChatGuarded: (p: Profile) => void | Promise<void>;
  reset: () => void;
  view: View;
  selectedProfile: Profile | null;
  currentUserId: string | null;
  likedIds: Set<string>;
  sentHeartTypes: Map<string, HeartType>;
  sentHeartsPerPerson: Map<string, Set<HeartType>>;
  receivedHeartTypes: Map<string, HeartType>;
  functionsLocked: boolean;
  userSignals: UserSignal[];
  handleLike: (id: string, hint?: Profile) => void;
  goParticipantBack: () => void;
  showFunctionsLockToast: () => void;
  activeGroupId: string | null;
  groupChats: GroupChat[];
  groupMessages: GroupMessage[];
  groupParticipants: GroupParticipant[];
  profileMap: Map<string, Profile>;
  darkMode: boolean;
  sendGroupMessageGuarded: (content: string) => Promise<void>;
  leaveGroupChatGuarded: (groupId: string) => void | Promise<void>;
  chatId: string | null;
  setChatId: Dispatch<SetStateAction<string | null>>;
  chatIdRef: MutableRefObject<string | null>;
  messages: Message[];
  sendMessageGuarded: (content: string) => void | Promise<void>;
  sendImageGuarded: (file: File) => Promise<string | null>;
  deleteMessage: (messageId: string) => void | Promise<void>;
  hasMoreOlderMessages: boolean;
  loadingOlderMessages: boolean;
  loadOlderMessages: () => Promise<boolean>;
  receivedContactShares: ContactShare[];
  contactSharedWithIds: Set<string>;
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
  chatDraftRef: MutableRefObject<Map<string, string>>;
  likedByTypeRecord: () => Record<HeartType, number>;
  execLikeGuarded: (heartType: HeartType) => void | Promise<void>;
  showConfetti: boolean;
  shareEventNotif: ShareEventNotificationData | null;
  setShareEventNotif: Dispatch<SetStateAction<ShareEventNotificationData | null>>;
  handleContactShareGuarded: (toUserId: string, kakao: string, instagram: string, phone: string) => void | Promise<void>;
  saveScannedContact: (p: Profile) => void;
  privacyProfileIds: { blockedUserIds: Set<string>; hiddenByIds: Set<string> };
};

export function AppOverlays(p: AppOverlaysProps) {
  const {
    children,
    isSubScreen,
    showTutorialModal, setShowTutorialModal,
    activeNotif, setActiveNotif,
    showResetPassword, setShowResetPassword,
    likeConfirmTarget, setLikeConfirmTarget,
    contactShareTarget, setContactShareTarget,
    contactViewShare, setContactViewShare,
    showContactQr, setShowContactQr,
    showQrScanner, setShowQrScanner,
    scannedContactProfile, setScannedContactProfile,
    fortuneModalTarget, setFortuneModalTarget,
    connStatus, onReconnectRetry,
    rejectionNotif, setRejectionNotif,
    functionsLockToast,
    bottomNotif, setBottomNotif,
    setMySubTabHint, handleMainTabChange,
    profiles, receivedLikers, setSelectedProfile, setView, openChatGuarded,
    reset, view, selectedProfile, currentUserId,
    likedIds, sentHeartTypes, sentHeartsPerPerson, receivedHeartTypes,
    functionsLocked, userSignals, handleLike, goParticipantBack, showFunctionsLockToast,
    activeGroupId, groupChats, groupMessages, groupParticipants, profileMap, darkMode,
    sendGroupMessageGuarded, leaveGroupChatGuarded,
    chatId, setChatId, chatIdRef, messages,
    sendMessageGuarded, sendImageGuarded, deleteMessage,
    hasMoreOlderMessages, loadingOlderMessages, loadOlderMessages,
    receivedContactShares, contactSharedWithIds, setProfiles, chatDraftRef,
    likedByTypeRecord, execLikeGuarded, showConfetti,
    shareEventNotif, setShareEventNotif, handleContactShareGuarded, saveScannedContact,
    privacyProfileIds,
  } = p;

  return (
    <>
      <NavLayer id="tutorial" open={showTutorialModal} onClose={() => setShowTutorialModal(false)} />
      <NavLayer id="notif" open={!!activeNotif} onClose={() => setActiveNotif(null)} />
      <NavLayer id="reset-password" open={showResetPassword} onClose={() => setShowResetPassword(false)} />
      <NavLayer id="like-confirm" open={!!likeConfirmTarget} onClose={() => setLikeConfirmTarget(null)} />
      <NavLayer id="contact-share" open={!!contactShareTarget} onClose={() => setContactShareTarget(null)} />
      <NavLayer id="contact-view" open={!!contactViewShare} onClose={() => setContactViewShare(null)} />
      <NavLayer id="contact-qr" open={showContactQr} onClose={() => setShowContactQr(false)} />
      <NavLayer id="qr-scanner" open={showQrScanner} onClose={() => setShowQrScanner(false)} />
      <NavLayer id="scanned-contact" open={!!scannedContactProfile} onClose={() => setScannedContactProfile(null)} />
      <NavLayer id="fortune-modal" open={!!fortuneModalTarget} onClose={() => setFortuneModalTarget(null)} />
      {/* Tutorial modal — JS (TutorialVideo) loads on first open */}
      {showTutorialModal && (
        <Suspense fallback={overlayLazyFallback}>
          <TutorialModal
            onClose={() => {
              setShowTutorialModal(false);
            }}
            darkMode={darkMode}
          />
        </Suspense>
      )}

      <FirstEntryCoachMarks isSubScreen={isSubScreen} suspended={showTutorialModal} />
      {connStatus !== 'ok' && (
        <ReconnectOverlay
          status={connStatus}
          onRetry={onReconnectRetry}
        />
      )}
      {/* Broadcast notification modal */}
      {activeNotif && (
        <AppErrorBoundary screenName="공지 알림" onReset={() => setActiveNotif(null)}>
          <NotifModal notif={activeNotif} onClose={() => setActiveNotif(null)} />
        </AppErrorBoundary>
      )}
      {/* Heart rejection notification */}
      {rejectionNotif && (
        <AppErrorBoundary screenName="거절 알림" onReset={() => setRejectionNotif(null)}>
          <div className="fixed bottom-[calc(0.75rem+var(--participant-tabbar,0px))] left-0 right-0 z-[150] flex justify-center px-4 pointer-events-none">
            <div className="max-w-full bg-gray-800 text-white px-4 min-[360px]:px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto animate-bounce">
              <span className="text-lg">💔</span>
              <div>
                <p className="text-sm font-bold">{rejectionNotif}님이 하트를 거절했습니다</p>
              </div>
              <button onClick={() => setRejectionNotif(null)} className="touch-target text-white/60 hover:text-white text-lg flex-shrink-0 flex items-center justify-center">×</button>
            </div>
          </div>
        </AppErrorBoundary>
      )}
      {/* Bottom notification: new heart / chat */}
      {functionsLockToast && (
        <div className="fixed bottom-[calc(0.75rem+var(--participant-tabbar,0px))] left-0 right-0 z-[10060] flex justify-center px-3 min-[360px]:px-4 pointer-events-none">
          <div className="max-w-full bg-gray-800/95 text-white px-4 py-2 rounded-full shadow-xl text-[12px] font-bold">
            {functionsLockToast}
          </div>
        </div>
      )}
      {bottomNotif && (
        <AppErrorBoundary screenName="하단 알림" onReset={() => setBottomNotif(null)}>
          <BottomNotification
            notification={bottomNotif}
            onClose={() => setBottomNotif(null)}
            onGoToStatus={() => { setMySubTabHint('status'); handleMainTabChange('my'); setBottomNotif(null); }}
            onGoToChats={() => { setMySubTabHint('chats'); handleMainTabChange('my'); setBottomNotif(null); }}
            onViewProfile={() => {
              const id = bottomNotif.profileId;
              const p = (id && (profiles.find(x => x.id === id) ?? receivedLikers.find(x => x.id === id))) || null;
              if (p) { setSelectedProfile(p); setView('profile'); }
              setBottomNotif(null);
            }}
            onStartChat={() => {
              const id = bottomNotif.profileId;
              const p = (id && (profiles.find(x => x.id === id) ?? receivedLikers.find(x => x.id === id))) || null;
              if (p) void openChatGuarded(p);
              setBottomNotif(null);
            }}
          />
        </AppErrorBoundary>
      )}
      {children}
      {showResetPassword && (
        <ResetPasswordSheet
          onCancel={() => setShowResetPassword(false)}
          onConfirm={() => { setShowResetPassword(false); reset(); }}
        />
      )}
      {view === 'profile' && selectedProfile && (
        <div className="binpc-screen-in safe-fullscreen fixed inset-0 z-40 overflow-y-auto bg-white">
          <AppErrorBoundary screenName="프로필" onReset={() => setView('main')}>
            <ProfileDetail
              profile={selectedProfile}
              isMe={selectedProfile.id === currentUserId}
              isLiked={likedIds.has(selectedProfile.id)}
              heartType={sentHeartTypes.get(selectedProfile.id)}
              sentHeartsCount={sentHeartsPerPerson.get(selectedProfile.id)?.size ?? 0}
              locked={functionsLocked}
              idealMsg={userSignals.find((s) => s.user_id === selectedProfile.id)?.ideal_msg}
              featureMsg={userSignals.find((s) => s.user_id === selectedProfile.id)?.feature_msg}
              onLike={() => { if (!functionsLocked) handleLike(selectedProfile.id, selectedProfile); }}
              onChat={() => { void openChatGuarded(selectedProfile); }}
              onBack={goParticipantBack}
              onViewFortune={hasProfileFortuneCompatData(selectedProfile) ? () => {
                if (functionsLocked) { showFunctionsLockToast(); return; }
                setFortuneModalTarget(selectedProfile);
              } : undefined}
            />
          </AppErrorBoundary>
        </div>
      )}
      {view === 'group-chat' && activeGroupId && (
        <div className="binpc-screen-in fixed inset-0 z-40 min-w-0">
          <GroupChatScreen
            group={groupChats.find(g => g.id === activeGroupId) ?? null}
            messages={groupMessages}
            participants={groupParticipants}
            currentUserId={currentUserId}
            profileMap={profileMap}
            darkMode={darkMode}
            functionsLocked={functionsLocked}
            onBack={goParticipantBack}
            onSendMessage={sendGroupMessageGuarded}
            onLeave={async () => { if (activeGroupId) await leaveGroupChatGuarded(activeGroupId); }}
          />
        </div>
      )}
      {view === 'chat' && selectedProfile && !chatId && (
        <div className="binpc-screen-in safe-fullscreen fixed inset-0 z-40 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">채팅방 열는 중…</p>
          </div>
        </div>
      )}
      {view === 'chat' && selectedProfile && chatId && (
        <div className="binpc-screen-in fixed inset-0 z-40 min-w-0">
          <ChatErrorBoundary onReset={() => { chatIdRef.current = null; setChatId(null); setView('main'); }}>
            <Suspense fallback={<div className="h-screen bg-white" />}>
              <ChatScreen
                chatId={chatId}
                messages={messages}
                currentUserId={currentUserId!}
                otherProfile={selectedProfile}
                onSend={sendMessageGuarded}
                onSendImage={sendImageGuarded}
                onBack={goParticipantBack}
                onDeleteMessage={deleteMessage}
                hasMoreOlder={hasMoreOlderMessages}
                loadingOlder={loadingOlderMessages}
                onLoadOlder={loadOlderMessages}
                currentUserProfile={profiles.find(p => p.id === currentUserId) ?? null}
                receivedContactShares={receivedContactShares}
                contactSharedWithIds={contactSharedWithIds}
                onGoToTab={(tab) => {
                  chatIdRef.current = null;
                  setChatId(null);
                  setView('main');
                  handleMainTabChange(tab as MainTab);
                }}
                onUpdateProfile={(update) => setProfiles(prev => prev.map(p => p.id === update.id ? { ...p, ...update } : p))}
                initialInput={chatDraftRef.current.get(chatId) ?? ''}
                onInputChange={(v) => chatDraftRef.current.set(chatId, v)}
                showSignalOpeners={
                  !!(selectedProfile
                    && hasInterestHeart(sentHeartsPerPerson.get(selectedProfile.id))
                    && isInterestHeart(receivedHeartTypes.get(selectedProfile.id)))
                }
              />
            </Suspense>
          </ChatErrorBoundary>
        </div>
      )}
      {likeConfirmTarget && (
        <LikeConfirmDialog
          target={likeConfirmTarget}
          likedByType={likedByTypeRecord()}
          sentTypesForTarget={sentHeartsPerPerson.get(likeConfirmTarget.id) ?? new Set()}
          onConfirm={execLikeGuarded}
          onCancel={() => setLikeConfirmTarget(null)}
        />
      )}
      <ConfettiOverlay show={showConfetti} />
      <div className={isSubScreen ? 'hidden' : undefined} aria-hidden={isSubScreen}>
      {shareEventNotif && (() => {
        const fromProfile = profiles.find(p => p.id === shareEventNotif.fromUserId);
        const name = fromProfile?.nickname ?? '상대방';
        return (
          <ShareEventNotification
            notification={shareEventNotif}
            nickname={name}
            onClose={() => setShareEventNotif(null)}
          />
        );
      })()}
      {contactShareTarget && (
        <ContactShareModal
          liker={contactShareTarget}
          alreadyShared={contactSharedWithIds.has(contactShareTarget.id)}
          myProfile={currentUserId ? (profileMap.get(currentUserId) ?? null) : null}
          onSubmit={(kakao, instagram, phone) => handleContactShareGuarded(contactShareTarget.id, kakao, instagram, phone)}
          onClose={() => setContactShareTarget(null)}
        />
      )}
      {contactViewShare && (
        <ContactViewModal
          share={contactViewShare.share}
          likedProfile={contactViewShare.profile}
          onClose={() => setContactViewShare(null)}
        />
      )}
      {showContactQr && currentUserId && profileMap.get(currentUserId) && (
        <Suspense fallback={overlayLazyFallback}>
          <ContactDisplayModal
            profile={profileMap.get(currentUserId)!}
            onClose={() => setShowContactQr(false)}
          />
        </Suspense>
      )}
      {/* QR 카메라 스캐너 — jsqr loads on first open */}
      {showQrScanner && (
        <Suspense fallback={overlayLazyFallback}>
          <QrScannerModal
            darkMode={darkMode}
            onClose={() => setShowQrScanner(false)}
            onDetected={async (profileId) => {
              setShowQrScanner(false);
              const cached = profiles.find(p => p.id === profileId);
              if (cached) { saveScannedContact(cached); setScannedContactProfile(cached); return; }
              const { data } = await supabase.from('profiles').select(PROFILE_ROW_SELECT).eq('id', profileId).maybeSingle();
              if (data) { saveScannedContact(data as import('../types/app').Profile); setScannedContactProfile(data as import('../types/app').Profile); }
            }}
          />
        </Suspense>
      )}
      {/* 연락처 스캔 결과 모달 */}
      {scannedContactProfile && (
        <ContactRevealModal
          profile={scannedContactProfile}
          darkMode={darkMode}
          onClose={() => setScannedContactProfile(null)}
        />
      )}
      {/* ── 사주 궁합 팝업 모달 ── */}
      {fortuneModalTarget && (
        <div className="safe-fullscreen fixed inset-0 z-[200] flex flex-col bg-slate-900/95 backdrop-blur-sm overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <p className="text-white font-black text-sm">🔮 {fortuneModalTarget.nickname}님과의 궁합</p>
            <button
              onClick={() => setFortuneModalTarget(null)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense fallback={<div className="flex items-center justify-center py-20 text-slate-400 text-sm">불러오는 중...</div>}>
              <FortuneTabLazy
                currentUserId={currentUserId}
                myProfile={currentUserId ? (profileMap.get(currentUserId) ?? null) : null}
                profiles={profiles}
                likedIds={likedIds}
                initialCompatProfileId={fortuneModalTarget.id}
                blockedUserIds={privacyProfileIds.blockedUserIds}
                hiddenByIds={privacyProfileIds.hiddenByIds}
              />
            </Suspense>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
