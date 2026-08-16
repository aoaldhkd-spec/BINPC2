export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nickname: string;
          bio: string | null;
          photo_url: string;
          personality_score: number;
          dom_sub_score: number | null;
          mbti: string | null;
          birth_year: number | null;
          birth_month: number | null;
          birth_day: number | null;
          location: string | null;
          interests: string | null;
          contact_private: boolean;
          hide_personality: boolean;
          kakao_id: string | null;
          instagram_id: string | null;
          phone_number: string | null;
          pin_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          nickname: string;
          bio?: string | null;
          photo_url?: string;
          personality_score?: number;
          dom_sub_score?: number | null;
          mbti?: string | null;
          birth_year?: number | null;
          birth_month?: number | null;
          birth_day?: number | null;
          location?: string | null;
          interests?: string | null;
          contact_private?: boolean;
          hide_personality?: boolean;
          kakao_id?: string | null;
          instagram_id?: string | null;
          phone_number?: string | null;
          pin_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          nickname?: string;
          bio?: string | null;
          photo_url?: string;
          personality_score?: number;
          dom_sub_score?: number | null;
          mbti?: string | null;
          birth_year?: number | null;
          birth_month?: number | null;
          birth_day?: number | null;
          location?: string | null;
          interests?: string | null;
          contact_private?: boolean;
          hide_personality?: boolean;
          kakao_id?: string | null;
          instagram_id?: string | null;
          phone_number?: string | null;
          pin_code?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      likes: {
        Row: {
          id: string;
          liker_id: string;
          liked_id: string;
          status: 'pending' | 'accepted' | 'rejected';
          heart_type: 'friendly' | 'romantic' | 'secret' | 'red' | 'blue' | 'pink' | 'green';
          created_at: string;
        };
        Insert: {
          id?: string;
          liker_id: string;
          liked_id: string;
          status?: 'pending' | 'accepted' | 'rejected';
          heart_type?: 'friendly' | 'romantic' | 'secret' | 'red' | 'blue' | 'pink' | 'green';
          created_at?: string;
        };
        Update: {
          id?: string;
          liker_id?: string;
          liked_id?: string;
          status?: 'pending' | 'accepted' | 'rejected';
          heart_type?: 'friendly' | 'romantic' | 'secret' | 'red' | 'blue' | 'pink' | 'green';
          created_at?: string;
        };
        Relationships: [];
      };
      chats: {
        Row: { id: string; user1_id: string; user2_id: string; created_at: string; };
        Insert: { id?: string; user1_id: string; user2_id: string; created_at?: string; };
        Update: { id?: string; user1_id?: string; user2_id?: string; created_at?: string; };
        Relationships: [];
      };
      messages: {
        Row: { id: string; chat_id: string; sender_id: string; content: string; image_url: string | null; created_at: string; client_id: string | null; };
        Insert: { id?: string; chat_id: string; sender_id: string; content: string; image_url?: string | null; created_at?: string; client_id?: string | null; };
        Update: { id?: string; chat_id?: string; sender_id?: string; content?: string; image_url?: string | null; created_at?: string; };
        Relationships: [];
      };
      contact_shares: {
        Row: { id: string; liker_id: string; liked_id: string; kakao: string | null; instagram: string | null; phone: string | null; created_at: string; };
        Insert: { id?: string; liker_id: string; liked_id: string; kakao?: string | null; instagram?: string | null; phone?: string | null; created_at?: string; };
        Update: { id?: string; liker_id?: string; liked_id?: string; kakao?: string | null; instagram?: string | null; phone?: string | null; created_at?: string; };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: number;
          session_active: boolean;
          admin_phone: string;
          admin_password: string;
          entry_password: string | null;
          reset_password: string | null;
          test_password: string | null;
          updated_at: string;
          timer_end_at: string | null;
          timer_label: string | null;
          functions_locked: boolean | null;
          active_tables: number[] | null;
          reset_signal: string | null;
          table_labels: Record<string, string> | null;
        };
        Insert: {
          id?: number;
          session_active?: boolean;
          admin_phone?: string;
          admin_password?: string;
          entry_password?: string | null;
          reset_password?: string | null;
          test_password?: string | null;
          updated_at?: string;
          timer_end_at?: string | null;
          timer_label?: string | null;
          functions_locked?: boolean | null;
          active_tables?: number[] | null;
          reset_signal?: string | null;
          table_labels?: Record<string, string> | null;
        };
        Update: {
          id?: number;
          session_active?: boolean;
          admin_phone?: string;
          admin_password?: string;
          entry_password?: string | null;
          reset_password?: string | null;
          test_password?: string | null;
          updated_at?: string;
          timer_end_at?: string | null;
          timer_label?: string | null;
          functions_locked?: boolean | null;
          active_tables?: number[] | null;
          reset_signal?: string | null;
          table_labels?: Record<string, string> | null;
        };
        Relationships: [];
      };
      session_history: {
        Row: { id: string; ended_at: string; created_at?: string; };
        Insert: { id?: string; ended_at?: string; created_at?: string; };
        Update: { id?: string; ended_at?: string; created_at?: string; };
        Relationships: [];
      };
      anonymous_reports: {
        Row: { id: string; table_number: number | null; content: string; created_at: string; ack_at: string | null; ack_message: string | null; status: string | null; admin_reason: string | null; };
        Insert: { id?: string; table_number?: number | null; content: string; created_at?: string; ack_at?: string | null; ack_message?: string | null; status?: string | null; admin_reason?: string | null; };
        Update: { id?: string; table_number?: number | null; content?: string; created_at?: string; ack_at?: string | null; ack_message?: string | null; status?: string | null; admin_reason?: string | null; };
        Relationships: [];
      };
      notifications: {
        Row: { id: string; message: string; type: string; target: string; is_active: boolean; created_at: string; };
        Insert: { id?: string; message: string; type: string; target: string; is_active?: boolean; created_at?: string; };
        Update: { id?: string; message?: string; type?: string; target?: string; is_active?: boolean; created_at?: string; };
        Relationships: [];
      };
      contact_share_events: {
        Row: { id: string; from_user_id: string; to_user_id: string; event_type: string; created_at: string; };
        Insert: { id?: string; from_user_id: string; to_user_id: string; event_type: string; created_at?: string; };
        Update: { id?: string; from_user_id?: string; to_user_id?: string; event_type?: string; created_at?: string; };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_auth_phone: {
        Args: { p_phone: string; p_password: string };
        Returns: string;
      };
      admin_create_session: {
        Args: { p_phone: string; p_password: string };
        Returns: string;
      };
      admin_invalidate_session: {
        Args: { p_token: string };
        Returns: undefined;
      };
      admin_full_reset: {
        Args: { p_admin_password: string };
        Returns: undefined;
      };
      admin_event_end_reset: {
        Args: { p_admin_password: string };
        Returns: undefined;
      };
      admin_delete_profile: {
        Args: { p_profile_id: string; p_admin_password: string };
        Returns: undefined;
      };
      admin_update_profile: {
        Args: { p_profile_id: string; p_nickname: string; p_mbti: string; p_bio: string; [key: string]: unknown };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
