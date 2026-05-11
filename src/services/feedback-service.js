import { formatConversationHistory } from "../lib/conversation-history.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { clampString, isInt } from "../lib/validation.js";

const SCORE_FIELDS = [
  "realismScore",
  "challengeScore",
  "interactionQualityScore",
  "feedbackUtilityScore",
  "learningImpactScore"
];

async function loadOwnedSimulation(sessionId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load simulation for feedback: ${error.message}`);
  }

  return data ?? null;
}

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
  const simulation = await loadOwnedSimulation(sessionId, userId);
  if (!simulation) {
    return { ok: false, reason: "simulation_not_found" };
  }

  for (const field of SCORE_FIELDS) {
    if (!isInt(payload[field], { min: 1, max: 5 })) {
      return { ok: false, reason: "invalid_scores" };
    }
  }

  const supabase = getSupabaseAdmin();
  const messages = await loadMessages(sessionId);
  const transcriptSnapshot = formatConversationHistory(messages, {
    actors: ["vendor", "client", "moderator"]
  });

  const row = {
    session_id: sessionId,
    user_id: userId,
    realism_score: payload.realismScore,
    challenge_score: payload.challengeScore,
    interaction_quality_score: payload.interactionQualityScore,
    feedback_utility_score: payload.feedbackUtilityScore,
    learning_impact_score: payload.learningImpactScore,
    transcript_snapshot: transcriptSnapshot,
    user_feedback: clampString(typeof payload.userFeedback === "string" ? payload.userFeedback : "", 4_000)
  };

  const { data, error } = await supabase
    .from("feedbacks")
    .upsert(row, { onConflict: "session_id" })
    .select("id, session_id, realism_score, challenge_score, interaction_quality_score, feedback_utility_score, learning_impact_score, user_feedback")
    .single();

  if (error) {
    throw new Error(`Failed to persist feedback: ${error.message}`);
  }

  return { ok: true, feedback: data };
}
