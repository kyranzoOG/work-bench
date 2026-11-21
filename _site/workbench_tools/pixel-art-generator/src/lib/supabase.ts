import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://hsrdjjpkujhfohxmdxxv.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzcmRqanBrdWpoZm9oeG1keHh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2ODc5NjAsImV4cCI6MjEwNzI2Mzk2MH0.NneZxubQ726-iNNvvcymjL5ahV63GKMsGtpYlQEzS_0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export interface AccessTokenRecord {
  id: string;
  token_code: string;
  expires_at: string;
  created_at: string;
  is_used: boolean;
  is_revoked: boolean;
  max_uses: number | null;
  times_used: number;
}

/**
 * Fetches authoritative server time from Supabase HTTP Date header
 * so client OS clock manipulation cannot bypass or extend token expiration.
 */
export async function fetchAuthoritativeServerTimeMs(): Promise<number> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/access_tokens?select=id&limit=0`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: 'no-store',
      }
    );
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      const parsed = Date.parse(dateHeader);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to local clock only if header fetch fails; Supabase DB check still runs
  }
  return Date.now();
}
