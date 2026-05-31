// Secondary Supabase client for AI command_history + realtime (same production project).
import { createClient } from "@supabase/supabase-js";
import { EXT_SUPABASE_URL, EXT_SUPABASE_ANON } from "./extFn";

export const extSupabase = createClient(EXT_SUPABASE_URL, EXT_SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
});
