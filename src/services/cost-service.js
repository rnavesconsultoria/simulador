import { getSupabaseAdmin } from "../lib/supabase-admin.js";

export async function recordOpenAiUsage({ sessionId, stage, model, usage }) {
  if (!sessionId || !usage) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("openai_costs").insert({
    session_id: sessionId,
    stage,
    model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    input_cost: null,
    output_cost: null,
    total_cost: null
  });

  if (error) {
    throw new Error(`Failed to record OpenAI usage for ${stage}: ${error.message}`);
  }
}
