// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { Profile } from '../types/app';
const { order } = vi.hoisted(() => ({ order: vi.fn() }));
vi.mock('../lib/supabase', () => ({supabase:{from:()=>({select:()=>({order})})}}));
import { useProfilePrivacyLoaders } from './useProfilePrivacyLoaders';
const me = { id:'owner', nickname:'본인', pin_code:'123456', created_at:'2026-10-30T13:00:00Z' } as Profile;
function mount() {
  return renderHook(() => {
    const [profiles,setProfiles] = useState<Profile[]>([me]);
    const profilesRef = useRef(profiles); profilesRef.current = profiles;
    const hook = useProfilePrivacyLoaders({
      currentUserId:null, userIdRef:useRef('owner'), profilesRef,
      loadProfilesRef:useRef(async()=>[]),setProfiles,
      setUserSignals:vi.fn(),setBlockedUsers:vi.fn(),setProfileVisitors:vi.fn(),
    });
    return {profiles,...hook};
  });
}
describe('mobile profile refresh request ordering',()=>{
  it('retains the same profile and PIN on partial lists and read failures',async()=>{
    order.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:null,error:{code:'TEMPORARY'}});
    const {result}=mount();
    await act(async()=>{await result.current.loadProfiles();});
    expect(result.current.profiles).toEqual([me]);
    await act(async()=>{await expect(result.current.loadProfiles()).rejects.toThrow('PROFILE_READ_UNAVAILABLE');});
    expect(result.current.profiles).toEqual([me]);
  });
  it('ignores an earlier read resolving after a newer complete read',async()=>{
    let resolveOld!: (v:unknown)=>void;
    order.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
      .mockResolvedValueOnce({data:[{...me,nickname:'최신'}],error:null});
    const {result}=mount();
    let older!:Promise<Profile[]>;
    await act(async()=>{older=result.current.loadProfiles(); await result.current.loadProfiles(true);});
    await act(async()=>{resolveOld({data:[{...me,nickname:'과거',pin_code:''}],error:null});await older;});
    expect(result.current.profiles[0].nickname).toBe('최신');
    expect(result.current.profiles[0].pin_code).toBe('123456');
  });
});
