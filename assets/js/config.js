// 1) Create a Supabase project
// 2) Paste your project URL + anon key here
// IMPORTANT: Do NOT put your service_role key in frontend code.

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

function getSupabaseClient() {
  if (!window.supabase) {
    throw new Error("Supabase library not loaded yet. Check assets/js/vendor/supabase.js");
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

