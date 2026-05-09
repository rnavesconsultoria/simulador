import { formatConversationHistory } from "../lib/conversation-history.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";

async function loadMessages(sessionId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, role, actor, message_type, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages for feedback: ${error.message}`);
  }

  return data ?? [];
}

export async function saveSimulationFeedback({ sessionId, userId, payload }) {
  const supabase = getSupabaseAdmin();
  const messages = await loadMessages(sessionId);
  const transcriptSnapshot = formatConversationHistory(messages);

  const row = {
    session_id: sessionId,
    user_id: userId,
    realism_score: payload.realismScore ?? null,
    challenge_score: payload.challengeScore ?? null,
    interaction_quality_score: payload.interactionQualityScore ?? null,
    feedback_utility_score: payload.feedbackUtilityScore ?? null,
    learning_impact_score: payload.learningImpactScore ?? null,
    transcript_snapshot: transcriptSnapshot,
    user_feedback: payload.userFeedback ?? ""
  };

  const { data, error } = await supabase
    .from("feedbacks")
    .upsert(row, { onConflict: "session_id" })
    .select("id, session_id, realism_score, challenge_score, interaction_quality_score, feedback_utility_score, learning_impact_score, user_feedback")
    .single();

  if (error) {
    throw new Error(`Failed to persist feedback: ${error.message}`);
  }

  return data;
}
