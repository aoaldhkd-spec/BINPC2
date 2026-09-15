/**
 * Nickname setup + profile recovery + reset — App wires setState only.
 * Pure insert/error helpers live in lib/nickname-registration.
 */
import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { supabase, getDeviceSecret, setDeviceRecoveryPin, fetchAndSetSseToken } from '../lib/supabase';
import { MATCHING_USER_KEY, MATCHING_DRAFT_KEY } from '../lib/constants';
import { ls } from '../lib/storage';
import { mergeProfilesPreserveOrder } from '../lib/profile-list-order';
import { PROFILE_ROW_SELECT } from '../lib/profile-select';
import {
  buildRegistrationProfileInsert,
  buildRegistrationSignalRow,
  mapRegistrationErrorMessage,
  type NicknameSetupInput,
} from '../lib/nickname-registration';
import type { Profile, UserSignal, View } from '../types/app';
export type ProfileBootPhase = 'checking' | 'ok' | 'recover' | 'register';

type SetState<T> = Dispatch<SetStateAction<T>>;

export type UseNicknameRegistrationArgs = {
  isNewRegistration: MutableRefObject<boolean>;
  setLoading: SetState<boolean>;
  setRegistrationError: SetState<string | null>;
  setProfiles: SetState<Profile[]>;
  setUserSignals: SetState<UserSignal[]>;
  setCurrentUserId: SetState<string | null>;
  setProfileBoot: SetState<ProfileBootPhase>;
  setView: SetState<View>;
  setShownWaiting: SetState<boolean>;
  setEntryVerified: SetState<boolean>;
};

export function useNicknameRegistration(args: UseNicknameRegistrationArgs) {
  const {
    isNewRegistration,
    setLoading,
    setRegistrationError,
    setProfiles,
    setUserSignals,
    setCurrentUserId,
    setProfileBoot,
    setView,
    setShownWaiting,
    setEntryVerified,
  } = args;

  const handleNicknameSetup = useCallback(async (data: NicknameSetupInput) => {
    setLoading(true);
    setRegistrationError(null);
    try {
      const newProfileId = crypto.randomUUID();
      const { data: profile, error } = await supabase
        .from('profiles')
        .insert(buildRegistrationProfileInsert(newProfileId, getDeviceSecret(newProfileId), data))
        .select()
        .single();

      if (error) {
        setRegistrationError(mapRegistrationErrorMessage(error.code, error.message));
        setLoading(false);
        return;
      }
      if (profile) {
        const signalRow = buildRegistrationSignalRow(profile.id, data.idealMsg, data.featureMsg);
        if (signalRow) {
          const { error: signalError } = await supabase
            .from('user_signals')
            .upsert(signalRow as never, { onConflict: 'user_id' });
          if (signalError) {
            console.warn('[handleNicknameSetup] user_signals upsert:', signalError);
          } else {
            setUserSignals(prev => {
              const rest = prev.filter(s => s.user_id !== profile.id);
              return [...rest, signalRow as UserSignal];
            });
          }
        }
        ls.setItem(MATCHING_USER_KEY, profile.id);
        ls.removeItem(MATCHING_DRAFT_KEY);
        isNewRegistration.current = true;
        setProfiles(prev => prev.some(p => p.id === profile.id)
          ? prev
          : mergeProfilesPreserveOrder(prev, [...prev, profile as Profile]));
        setCurrentUserId(profile.id);
        setProfileBoot('checking');
        setView('loading-main');
      }
    } catch (e) {
      console.error('[handleNicknameSetup] 오류:', e);
      setRegistrationError(mapRegistrationErrorMessage(undefined, undefined));
    } finally {
      setLoading(false);
    }
  }, [
    isNewRegistration,
    setLoading,
    setRegistrationError,
    setProfiles,
    setUserSignals,
    setCurrentUserId,
    setProfileBoot,
    setView,
  ]);

  const reset = useCallback(() => {
    ls.removeItem(MATCHING_USER_KEY);
    ls.removeItem(MATCHING_DRAFT_KEY);
    setCurrentUserId(null);
    setShownWaiting(false);
    setProfileBoot('register');
    setView('entry-1');
  }, [setCurrentUserId, setShownWaiting, setProfileBoot, setView]);

  const handleProfileRecovery = useCallback(async (profileId: string, pinCode: string) => {
    setLoading(true);
    setShownWaiting(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select(PROFILE_ROW_SELECT)
        .eq('id', profileId)
        .single();
      if (profile) {
        ls.setItem(MATCHING_USER_KEY, profile.id);
        ls.removeItem(MATCHING_DRAFT_KEY);
        setDeviceRecoveryPin(pinCode);
        isNewRegistration.current = true;
        setProfiles(prev => prev.some(p => p.id === profile.id)
          ? prev
          : mergeProfilesPreserveOrder(prev, [...prev, profile as Profile]));
        setCurrentUserId(profile.id);
        setProfileBoot('checking');
        setEntryVerified(true);
        void fetchAndSetSseToken(profile.id as string);
        setView('loading-main');
      } else {
        alert('프로필을 찾을 수 없습니다. 관리자에게 문의하세요.');
        setView('entry-1');
      }
    } catch (e) {
      console.error('[handleProfileRecovery] 오류:', e);
      alert('프로필 복구 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setView('entry-1');
    } finally {
      setLoading(false);
    }
  }, [
    isNewRegistration,
    setLoading,
    setShownWaiting,
    setProfiles,
    setCurrentUserId,
    setProfileBoot,
    setEntryVerified,
    setView,
  ]);

  return { handleNicknameSetup, handleProfileRecovery, reset };
}
