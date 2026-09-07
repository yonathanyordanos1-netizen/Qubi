import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function getSupabase(): SupabaseClient {
  return createClient(url, key);
}

export type WaitlistEntry = {
  id: string;
  email: string;
  created_at: string;
};