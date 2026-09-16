/**
 * Functions-lock wrappers for hearts / 1:1 chat / group actions.
 * App keeps view routing setters; this hook only gates + composes existing handlers.
 * No new useState.
 */
import { useCallback, type MutableRefObject } from 'react';
import type { Profile, View, MainTab } from '../types/app';
import type { HeartType } from '../lib/constants';
import { SOCIAL_LOCKED_TABS } from '../lib/functions-lock';
import { isHomeCoachPending } from '../lib/coach-marks';

export type UseSocialLockGuardsArgs = {
  functionsLocked: boolean;
  functionsLockedRef: MutableRefObject<boolean>;
  showFunctionsLockToast: (msg?: string) => void;
  handleLike: (profileId: string, hint?: Profile) => void;
  handleHeartResponse: (likerId: string, response: 'accepted' | 'rejected') => void | Promise<void>;
  handleContactShare: (likerId: string, kakao: string, instagram: string, phone: string) => void | Promise<void>;
  executeLike: (heartType: HeartType) => Promise<boolean>;
  triggerConfetti: () => void;
  setLikeConfirmTarget: (p: Profile | null) => void;
  setContactShareTarget: (p: Profile | null) => void;
  openChat: (profile: Profile) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  sendImage: (file: File) => Promise<string | null>;
  openGroupChat: (groupId: string) => Promise<void> | void;
  joinGroupChat: (groupId: string) => Promise<boolean>;
  leaveGroupChat: (groupId: string) => Promise<void>;
  closeGroupChat: () => void;
  sendGroupMessage: (content: string) => Promise<void>;
  setView: (v: View) => void;
  setMainTab: (t: MainTab) => void;
};

export function useSocialLockGuards(args: UseSocialLockGuardsArgs) {
  const {
    functionsLocked,
    functionsLockedRef,
    showFunctionsLockToast,
    handleLike,
    handleHeartResponse,
    handleContactShare,
    executeLike,
    triggerConfetti,
    setLikeConfirmTarget,
    setContactShareTarget,
    openChat,
    sendMessage,
    sendImage,
    openGroupChat,
    joinGroupChat,
    leaveGroupChat,
    closeGroupChat,
    sendGroupMessage,
    setView,
    setMainTab,
  } = args;

  const execLikeWithConfetti = useCallback(async (heartType: HeartType) => {
    const ok = await executeLike(heartType);
    if (ok) triggerConfetti();
  }, [executeLike, triggerConfetti]);

  const handleLikeGuarded = useCallback((profileId: string, hint?: Profile) => {
    if (functionsLocked) { showFunctionsLockToast(); return; }
    handleLike(profileId, hint);
  }, [functionsLocked, handleLike, showFunctionsLockToast]);

  const handleHeartResponseGuarded = useCallback((likerId: string, response: 'accepted' | 'rejected') => {
    if (functionsLocked) { showFunctionsLockToast(); return; }
    return handleHeartResponse(likerId, response);
  }, [functionsLocked, handleHeartResponse, showFunctionsLockToast]);

  const handleContactShareGuarded = useCallback((likerId: string, kakao: string, instagram: string, phone: string) => {
    if (functionsLocked) { showFunctionsLockToast(); return; }
    return handleContactShare(likerId, kakao, instagram, phone);
  }, [functionsLocked, handleContactShare, showFunctionsLockToast]);

  const openChatGuarded = useCallback((profile: Profile) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return Promise.resolve(); }
    return openChat(profile);
  }, [openChat, showFunctionsLockToast, functionsLockedRef]);

  const sendMessageGuarded = useCallback(async (content: string) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    return sendMessage(content);
  }, [sendMessage, showFunctionsLockToast, functionsLockedRef]);

  const sendImageGuarded = useCallback(async (file: File): Promise<string | null> => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return null; }
    return sendImage(file);
  }, [sendImage, showFunctionsLockToast, functionsLockedRef]);

  const openGroupChatGuarded = useCallback(async (groupId: string) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    void openGroupChat(groupId);
    setView('group-chat');
  }, [openGroupChat, showFunctionsLockToast, functionsLockedRef, setView]);

  const joinGroupChatGuarded = useCallback(async (groupId: string) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    const joinPromise = joinGroupChat(groupId);
    void openGroupChat(groupId);
    setView('group-chat');
    const ok = await joinPromise;
    if (!ok) {
      closeGroupChat();
      setView('main');
    }
  }, [joinGroupChat, openGroupChat, closeGroupChat, showFunctionsLockToast, functionsLockedRef, setView]);

  const leaveGroupChatGuarded = useCallback(async (groupId: string) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    closeGroupChat();
    setView('main');
    await leaveGroupChat(groupId);
  }, [leaveGroupChat, closeGroupChat, showFunctionsLockToast, functionsLockedRef, setView]);

  const handleMainOpenGroupChat = useCallback((groupId: string) => {
    void openGroupChatGuarded(groupId).catch((e) => console.error('[openGroupChat]', e));
  }, [openGroupChatGuarded]);

  const handleMainJoinGroupChat = useCallback((groupId: string) => {
    void joinGroupChatGuarded(groupId).catch((e) => console.error('[joinGroupChat]', e));
  }, [joinGroupChatGuarded]);

  const handleMainLeaveGroupChat = useCallback((groupId: string) => {
    void leaveGroupChatGuarded(groupId).catch((e) => console.error('[leaveGroupChat]', e));
  }, [leaveGroupChatGuarded]);

  const sendGroupMessageGuarded = useCallback(async (content: string) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    return sendGroupMessage(content);
  }, [sendGroupMessage, showFunctionsLockToast, functionsLockedRef]);

  const handleMainTabChange = useCallback((t: MainTab) => {
    if (functionsLocked && SOCIAL_LOCKED_TABS.has(t)) {
      showFunctionsLockToast();
      return;
    }
    // Coach must finish participant tips before hearts/chat (or other tabs) can take focus.
    // After home advances, sequential coach (and the user) may open other tabs.
    if (t !== 'profiles' && isHomeCoachPending()) {
      setMainTab('profiles');
      return;
    }
    setMainTab(t);
  }, [functionsLocked, showFunctionsLockToast, setMainTab]);

  const execLikeGuarded = useCallback((heartType: HeartType) => {
    if (functionsLockedRef.current) {
      setLikeConfirmTarget(null);
      showFunctionsLockToast();
      return;
    }
    void execLikeWithConfetti(heartType);
  }, [execLikeWithConfetti, showFunctionsLockToast, setLikeConfirmTarget, functionsLockedRef]);

  const handleContactShareOpen = useCallback((profile: Profile) => {
    if (functionsLockedRef.current) { showFunctionsLockToast(); return; }
    setContactShareTarget(profile);
  }, [showFunctionsLockToast, functionsLockedRef, setContactShareTarget]);

  return {
    handleLikeGuarded,
    handleHeartResponseGuarded,
    handleContactShareGuarded,
    openChatGuarded,
    sendMessageGuarded,
    sendImageGuarded,
    openGroupChatGuarded,
    joinGroupChatGuarded,
    leaveGroupChatGuarded,
    handleMainOpenGroupChat,
    handleMainJoinGroupChat,
    handleMainLeaveGroupChat,
    sendGroupMessageGuarded,
    handleMainTabChange,
    execLikeGuarded,
    handleContactShareOpen,
  };
}
