import { getSupabaseAdmin } from "../lib/supabase-admin.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

export async function getActivePromptVersion(promptName) {
  const cached = cache.get(promptName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, prompt_name, version, model")
    .eq("prompt_name", promptName)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load prompt version for ${promptName}: ${error.message}`);
  }

  const value = data ?? null;
  cache.set(promptName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function clearPromptVersionCache() {
  cache.clear();
}
