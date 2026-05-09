import { env } from "../config/env.js";
import { formatConversationHistory } from "../lib/conversation-history.js";
import { extractUsage } from "../lib/openai-usage.js";
import { getOpenAiClient } from "../lib/openai-client.js";
import { loadPrompt } from "../lib/prompt-loader.js";
import { renderPrompt } from "../lib/prompt-template.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { reportJsonSchema } from "../schemas/report-schema.js";
import { recordOpenAiUsage } from "./cost-service.js";
import { getActivePromptVersion } from "./prompt-version-service.js";

function parseDecimalScore(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadSimulationForReport(sessionId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_sessions")
    .select("id, session_key, status, user_id, finished_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load simulation for report: ${error.message}`);
  }

  return data;
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

function ensureReportPayload(payload) {
  const requiredFields = [
    "P",
    "A",
    "C",
    "E",
    "Preparacao",
    "Analise",
    "Cocriacao",
    "Engajamento",
    "Resumo",
    "Transcricao",
    "Media",
    "Recomendacoes"
  ];

  for (const field of requiredFields) {
    if (typeof payload[field] !== "string") {
      throw new Error(`Report payload is missing field ${field}.`);
    }
  }
}

export async function generateReportForSimulation({ sessionId, user }) {
  const simulation = await loadSimulationForReport(sessionId, user.id);
  if (!simulation) {
    return {
      ok: false,
      reason: "simulation_not_found"
    };
  }

  const messages = await loadMessages(sessionId);
  if (messages.length === 0) {
    return {
      ok: false,
      reason: "empty_conversation"
    };
  }

  const promptVersion = await getActivePromptVersion("gerente");
  const promptTemplate = await loadPrompt("gerente");
  const threadCompleta = formatConversationHistory(messages);
  const prompt = renderPrompt(promptTemplate, {
    thread_completa: threadCompleta
  });

  const openai = getOpenAiClient();
  const response = await openai.responses.create({
    model: env.openAiModelGerente,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        ...reportJsonSchema
      }
    }
  });

  const payload = JSON.parse(response.output_text);
  ensureReportPayload(payload);

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
        questions_score: parseDecimalScore(payload.P),
        analysis_score: parseDecimalScore(payload.A),
        creativity_score: parseDecimalScore(payload.C),
        engagement_score: parseDecimalScore(payload.E),
        average_score: parseDecimalScore(payload.Media),
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

  return {
    ok: true,
    report
  };
}
