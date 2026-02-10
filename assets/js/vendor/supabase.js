// Supabase JS via CDN (kept as a tiny loader so this project works as static HTML)
// Docs: https://supabase.com/docs/reference/javascript/installing
(function loadSupabase() {
  const existing = document.querySelector('script[data-supabase-cdn="true"]');
  if (existing) return;

  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.defer = true;
  s.dataset.supabaseCdn = 'true';
  document.head.appendChild(s);
})();

