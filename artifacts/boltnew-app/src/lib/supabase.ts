import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ocvjorxlhwnkzhzjoazk.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdmpvcnhsaHdua3poempvYXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzQ2ODcsImV4cCI6MjA5ODg1MDY4N30.69iPkEspH1Y8wPYvhicgZ9_8TMYJ6zfDkSZUJ6KBADg';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
