import { createClient } from "@supabase/supabase-js";
import { env, validateEnv } from "../config/env.js";

let client;

export function getSupabaseAdmin() {
  if (!client) {
    validateEnv();
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return client;
}
