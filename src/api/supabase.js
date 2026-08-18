import { createClient } from '@supabase/supabase-js';

let url = import.meta.env.VITE_SUPABASE_URL;
let anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Placeholder keeps the UI renderable for previews; every backend call will
  // fail until the real values are set (in .env.local, or the repo's Actions
  // variables for the Pages deploy — see .env.example / README).
  console.error(
    'Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
      'Running in UI-preview mode — auth and data calls will fail.'
  );
  url = 'https://placeholder.supabase.co';
  anonKey = 'ui-preview-placeholder';
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
