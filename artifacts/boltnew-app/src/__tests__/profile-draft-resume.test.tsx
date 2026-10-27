// @vitest-environment happy-dom
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {NicknameSetupScreen} from '../components/NicknameSetupScreen';
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
