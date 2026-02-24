// Supabase client bootstrap for browser usage.
// Replace these with your project values from Supabase project settings.
const SUPABASE_URL = "https://glbukxjtlriqrimksdns.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_79bNZwzrZ2Posq69Xu5Obg_D_87Vxvy";

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
