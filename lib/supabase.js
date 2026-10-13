import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Persist auth in browser/PWA storage and renew short-lived access tokens.
// Do not use sessionStorage: it is lost when the standalone app closes.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(typeof window !== "undefined" && window.localStorage
      ? { storage: window.localStorage }
      : {}),
  },
});
