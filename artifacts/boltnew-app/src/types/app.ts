// ─── 앱 공통 타입 정의 ────────────────────────────────────────────────────────
// App.tsx에서 분리된 공유 타입들. 모든 컴포넌트에서 이 파일을 import합니다.

import type { Database } from './database';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type ContactShare = Database['public']['Tables']['contact_shares']['Row'];

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
  room_kind?: string | null;
  hidden?: boolean | null;
  merged_into?: string | null;
  lastMessage?: string;
  memberCount?: number;
  joined?: boolean;
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
  last_read_at?: string | null;
};

export type BlockedUser = {
  id: string;
  user_id: string;   // 차단/숨기기 한 사람
  target_id: string; // 차단/숨기기 당한 사람
  block_type: 'block' | 'hide'; // block=상호, hide=단방향(상대방이 나를 못 봄)
  created_at: string;
};

export type ProfileView = {
  id: string;
  viewer_id: string;
  viewed_id: string;
  viewed_at: string;
};

export type UserSignal = {
  id: string;
  user_id: string;
  status_msg: string | null;  // 오늘의 상태 메시지 (전광판 출력)
  ideal_msg: string | null;   // 나의 이상형 (카드 뒤면 출력)
  feature_msg?: string | null; // 나의 특징 (시그널 매칭, 카드에 원문 비공개)
  created_at: string;
};
export type MainTab =
  | 'profiles' | 'signal' | 'status' | 'chats'
  | 'stats' | 'ranking' | 'fortune' | 'settings';

export type TutorialSlide = {
  emoji: string;
  title: string;
  desc?: string;
  renderBody?: (darkMode?: boolean) => React.ReactNode;
  color: string;
};
