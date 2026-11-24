import { createDataClient, type DataClient } from "@dib/data-client";

let cached: DataClient | null | undefined;

export function getBrowserDataClient(): DataClient | null {
  if (cached !== undefined) return cached;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  cached = null;
  if (supabaseUrl && supabaseAnonKey && !supabaseAnonKey.startsWith("paste-")) {
    try {
      cached = createDataClient({ supabaseUrl, supabaseAnonKey });
    } catch {
      // The bundled catalogue is available without a working Supabase configuration.
    }
  }
  return cached;
}
