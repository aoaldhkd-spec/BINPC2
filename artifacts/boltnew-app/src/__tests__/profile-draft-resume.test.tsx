// @vitest-environment happy-dom
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {NicknameSetupScreen} from '../components/NicknameSetupScreen';
import {saveProfileSetupDraft} from '../lib/profile-setup-draft';
import {ls} from '../lib/storage';
import {MATCHING_DRAFT_KEY} from '../lib/constants';
vi.mock('../lib/supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[],error:null})})})})}}));
afterEach(()=>{cleanup();ls.removeItem(MATCHING_DRAFT_KEY);});
it('restores the unfinished actual profile screen and entered MBTI after unmount and reload',()=>{
 ls.removeItem(MATCHING_DRAFT_KEY);
 const props={onSubmit:vi.fn(),loading:false,onReset:vi.fn()};
 const first=render(<NicknameSetupScreen {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'INTJ'}));
 fireEvent.click(screen.getByRole('button',{name:/다음/}));
 first.unmount();
 render(<NicknameSetupScreen {...props}/>);
 expect(screen.getByRole('button',{name:'00년대'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/^이전$/}));
 expect(screen.getByRole('button',{name:/다음/}).hasAttribute('disabled')).toBe(false);
});

it('lets a restored final-step draft confirm required consent and notification choice without losing its profile',async()=>{
 saveProfileSetupDraft({lastStep:6,nickname:'정상복구',mbti:'ENFP',birthYear:1995,location:'부산',interests:['영화','음악'],personalityScore:50});
 const onSubmit=vi.fn();render(<NicknameSetupScreen onSubmit={onSubmit} loading={false} onReset={vi.fn()}/>);
 const enter=screen.getByRole('button',{name:'입장하기'});expect(enter.hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'필수 약관 모두 동의'}));
 fireEvent.click(screen.getByRole('button',{name:'알림 없이 계속'}));
 await waitFor(()=>expect(enter.hasAttribute('disabled')).toBe(false));fireEvent.click(enter);
 expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({nickname:'정상복구',mbti:'ENFP',birthYear:1995,location:'부산',pushOptIn:false,privacyConsent:expect.objectContaining({collection:true,sharing:true})}));
});
