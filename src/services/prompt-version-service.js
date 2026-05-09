import { getSupabaseAdmin } from "../lib/supabase-admin.js";

export async function getActivePromptVersion(promptName) {
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

  return data ?? null;
}
