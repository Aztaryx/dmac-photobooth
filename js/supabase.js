// The publishable (anon) key is meant to be public; database rules (RLS) protect the data.
export const SUPABASE_URL = "https://hnfabodytzqmzttenanx.supabase.co";
export const SUPABASE_KEY = "sb_publishable_Kq2QtWHMGCUo-LhCDlXqew_WWI_SyUt";
// persistSession:false => a PIN is required every time a booth page opens.
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
});
