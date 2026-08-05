// ─── 앱 공통 타입 정의 ────────────────────────────────────────────────────────
// App.tsx에서 분리된 공유 타입들. 모든 컴포넌트에서 이 파일을 import합니다.

import type { Database } from './database';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type Seat = Database['public']['Tables']['seats']['Row'];
export type ContactShare = Database['public']['Tables']['contact_shares']['Row'];
export type Suggestion = Database['public']['Tables']['suggestions']['Row'];
export type BalanceGame = Database['public']['Tables']['balance_games']['Row'];
export type BalanceVote = Database['public']['Tables']['balance_votes']['Row'];
export type AnonymousReport = Database['public']['Tables']['anonymous_reports']['Row'];

export type Chat = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  lastMessage?: string;
  messageCount?: number;
};

export type View = 'entry-1' | 'entry-recover' | 'loading-main' | 'main' | 'profile' | 'chat';
export type MainTab =
  | 'profiles' | 'seating' | 'status' | 'chats' | 'suggestions'
  | 'game' | 'tutorial' | 'stats' | 'ranking' | 'fortune' | 'my-table';

export type TableMiniGameSession = {
  sessionId: string;
  type: 'ladder' | 'roulette';
  participants: string[];
  hostNickname: string;
  tableNumber: number;
  startedAt: string;
  bars?: { row: number; col: number }[];
  endCols?: number[];
  shuffledPrizes?: string[];
  winnerIdx?: number;
};

export interface GameState {
  active: boolean;
  type: 'balance' | 'image' | 'custom' | 'dice' | 'roulette' | 'ladder';
  title: string;
  description: string;
  rules: string;
  penalty: string;
  option_a?: string;
  option_b?: string;
  game_id?: string;
  image_url?: string;
  started_at?: string;
  table_number?: number;
  result?: string;
  roulette_options?: string[];
  ladder_participants?: string[];
  ladder_prizes?: string[];
}

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
