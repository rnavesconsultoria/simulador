import { env } from "../config/env.js";
import { formatConversationHistory } from "../lib/conversation-history.js";
import { extractUsage } from "../lib/openai-usage.js";
import { callOpenAiResponses } from "../lib/openai-call.js";
import { loadPrompt } from "../lib/prompt-loader.js";
import { renderPrompt } from "../lib/prompt-template.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { reportJsonSchema } from "../schemas/report-schema.js";
import { recordOpenAiUsage } from "./cost-service.js";
import { getActivePromptVersion } from "./prompt-version-service.js";

function clampScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 10) return 10;
  return Math.round(value * 2) / 2;
}

async function loadSimulationForReport(sessionId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_sessions")
    .select(`
      id,
      session_key,
      status,
      user_id,
      finished_at,
      scenarios ( dynamic_block_json )
    `)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load simulation for report: ${error.message}`);
  }

  return data ?? null;
}

async function loadModeratorEvents(sessionId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, content, moderation_reason, metadata, created_at")
    .eq("session_id", sessionId)
    .eq("actor", "moderator")
    .eq("moderation_flag", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load moderator events: ${error.message}`);
  }

  return data ?? [];
}

async function loadMessages(sessionId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, role, actor, message_type, content, moderation_flag, moderation_reason, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages for report: ${error.message}`);
  }

  return data ?? [];
}

export async function generateReportForSimulation({ sessionId, user }) {
  const simulation = await loadSimulationForReport(sessionId, user.id);
  if (!simulation) {
    return { ok: false, reason: "simulation_not_found" };
  }

  const messages = await loadMessages(sessionId);
  const conversationActors = ["vendor", "client", "moderator"];
  const hasConversation = messages.some((m) =>
    m.content && (m.actor === "vendor" || m.actor === "client")
  );
  if (!hasConversation) {
    return { ok: false, reason: "empty_conversation" };
  }

  const promptVersion = await getActivePromptVersion("gerente");
  const promptTemplate = await loadPrompt("gerente");
  const threadCompleta = formatConversationHistory(messages, { actors: conversationActors });

  const personagemJson = simulation.scenarios?.dynamic_block_json
    ? JSON.stringify(simulation.scenarios.dynamic_block_json, null, 2)
    : "";

  const moderatorEvents = await loadModeratorEvents(sessionId);
  const violacoesModerador = moderatorEvents.length
    ? JSON.stringify(
        moderatorEvents.map((m) => ({
          motivo: m.moderation_reason,
          severidade: m.metadata?.severidade ?? null,
          categoria: m.metadata?.categoria ?? null,
          acao_sugerida: m.metadata?.acao_sugerida ?? null,
          em: m.created_at
        })),
        null,
        2
      )
    : "[]";

  const prompt = renderPrompt(promptTemplate, {
    thread_completa: threadCompleta,
    personagem_json: personagemJson,
    violacoes_moderador: violacoesModerador
  });

  const response = await callOpenAiResponses(
    {
      model: env.openAiModelGerente,
      input: prompt,
      text: { format: { type: "json_schema", ...reportJsonSchema } }
    },
    { stage: "manager" }
  );

  let payload;
  try {
    payload = JSON.parse(response.output_text);
  } catch (error) {
    throw new Error(`Invalid JSON from manager agent: ${error.message}`);
  }

  await recordOpenAiUsage({
    sessionId,
    stage: "manager",
    model: env.openAiModelGerente,
    usage: extractUsage(response)
  });

  const supabase = getSupabaseAdmin();
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        questions_score: clampScore(payload.P),
        analysis_score: clampScore(payload.A),
        creativity_score: clampScore(payload.C),
        engagement_score: clampScore(payload.E),
        average_score: clampScore(payload.Media),
        report_json: payload,
        report_summary: payload.Resumo,
        report_url: null,
        prompt_version_id: promptVersion?.id ?? null
      },
      { onConflict: "session_id" }
    )
    .select("id, session_id, questions_score, analysis_score, creativity_score, engagement_score, average_score, report_summary, report_json")
    .single();

  if (reportError) {
    throw new Error(`Failed to persist report: ${reportError.message}`);
  }

  const { error: updateError } = await supabase
    .from("simulation_sessions")
    .update({
      status: "completed",
      finished_at: new Date().toISOString()
    })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(`Failed to finalize simulation: ${updateError.message}`);
  }

  return { ok: true, report };
}
