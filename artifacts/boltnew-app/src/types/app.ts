// ─── 앱 공통 타입 정의 ────────────────────────────────────────────────────────
// App.tsx에서 분리된 공유 타입들. 모든 컴포넌트에서 이 파일을 import합니다.

import type { Database } from './database';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type ContactShare = Database['public']['Tables']['contact_shares']['Row'];
export type Suggestion = Database['public']['Tables']['suggestions']['Row'];
export type AnonymousReport = Database['public']['Tables']['anonymous_reports']['Row'];

export type Chat = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  lastMessage?: string;
  messageCount?: number;
};

export type View = 'entry-1' | 'entry-recover' | 'loading-main' | 'main' | 'profile' | 'chat' | 'group-chat';

export type GroupChat = {
  id: string;
  name: string;
  interest_tag: string;
  age_group: string | null;
  max_members: number;
  created_at: string;
  lastMessage?: string;
  memberCount?: number;
};

export type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  client_id?: string | null;
};

export type GroupParticipant = {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
};
export type MainTab =
  | 'profiles' | 'status' | 'chats' | 'suggestions'
  | 'game' | 'tutorial' | 'stats' | 'ranking' | 'fortune';



export type NickTpl = { template: string; label: string; type: 'any' | 'action' };
export type UserGameSubTab = 'balance' | 'ladder' | 'roulette';
export interface LadderBar { row: number; col: number; }
export type TutorialSlide = {
  emoji: string;
  title: string;
  desc?: string;
  renderBody?: (darkMode?: boolean) => React.ReactNode;
  color: string;
};
