import { env } from "../config/env.js";
import { formatConversationHistory } from "../lib/conversation-history.js";
import { extractUsage } from "../lib/openai-usage.js";
import { callOpenAiResponses } from "../lib/openai-call.js";
import { loadPrompt } from "../lib/prompt-loader.js";
import { renderPrompt } from "../lib/prompt-template.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { clientJsonSchema } from "../schemas/client-schema.js";
import { intentJsonSchema } from "../schemas/intent-schema.js";
import { moderatorJsonSchema } from "../schemas/moderator-schema.js";
import { recordOpenAiUsage } from "./cost-service.js";
import { getActivePromptVersion } from "./prompt-version-service.js";

const PHASE_ORDER = ["preparar", "analisar", "cocriar", "engajar"];

async function loadSimulationContext(sessionId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_sessions")
    .select(`
      id,
      session_key,
      status,
      started_at,
      user_id,
      scenario_id,
      current_phase,
      scenarios (
        id,
        dynamic_block_json
      )
    `)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load simulation session: ${error.message}`);
  }

  return data ?? null;
}

async function loadSessionMessages(sessionId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, role, actor, message_type, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load session messages: ${error.message}`);
  }

  return data ?? [];
}

async function insertMessage({
  sessionId,
  role,
  actor,
  messageType,
  content,
  moderationFlag = null,
  moderationReason = null,
  intentResult = null,
  metadata = {}
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_messages")
    .insert({
      session_id: sessionId,
      role,
      actor,
      message_type: messageType,
      content,
      moderation_flag: moderationFlag,
      moderation_reason: moderationReason,
      intent_result: intentResult,
      metadata
    })
    .select("id, role, actor, message_type, content, created_at")
    .single();

  if (error) {
    throw new Error(`Failed to insert session message: ${error.message}`);
  }

  return data;
}

async function markSimulationInProgress(simulation) {
  const supabase = getSupabaseAdmin();
  const update = { status: "in_progress" };
  if (!simulation.started_at) {
    update.started_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("simulation_sessions")
    .update(update)
    .eq("id", simulation.id);

  if (error) {
    throw new Error(`Failed to update simulation status: ${error.message}`);
  }
}

async function updateCurrentPhase(sessionId, phase) {
  if (!phase || !PHASE_ORDER.includes(phase)) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("simulation_sessions")
    .update({ current_phase: phase })
    .eq("id", sessionId);
  if (error) {
    console.warn(`[message-service] failed to persist phase: ${error.message}`);
  }
}

function parseJson(rawText, stage) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Invalid JSON from ${stage} agent: ${error.message}`);
  }
}

async function runModerator(inputVendedor) {
  const promptTemplate = await loadPrompt("moderador");
  const prompt = renderPrompt(promptTemplate, { input_vendedor: inputVendedor });

  const response = await callOpenAiResponses(
    {
      model: env.openAiModelModerador,
      input: prompt,
      text: { format: { type: "json_schema", ...moderatorJsonSchema } }
    },
    { stage: "moderator" }
  );

  return {
    responseId: response.id,
    payload: parseJson(response.output_text, "moderator"),
    response
  };
}

async function runClient({
  blocoDinamico,
  historico,
  inputVendedor,
  faseAtual,
  sinalModerador
}) {
  const promptTemplate = await loadPrompt("cliente");
  const prompt = renderPrompt(promptTemplate, {
    bloco_dinamico: JSON.stringify(blocoDinamico, null, 2),
    historico,
    input_vendedor: inputVendedor,
    fase_atual: faseAtual,
    sinal_moderador: sinalModerador ?? ""
  });

  const response = await callOpenAiResponses(
    {
      model: env.openAiModelCliente,
      input: prompt,
      text: { format: { type: "json_schema", ...clientJsonSchema } }
    },
    { stage: "client" }
  );

  const payload = parseJson(response.output_text, "client");
  return {
    responseId: response.id,
    payload,
    response
  };
}

async function runIntent({ inputVendedor, respostaCliente }) {
  const promptTemplate = await loadPrompt("intencao");
  const prompt = renderPrompt(promptTemplate, {
    input_vendedor: inputVendedor,
    resposta_cliente: respostaCliente
  });

  const response = await callOpenAiResponses(
    {
      model: env.openAiModelIntencao,
      input: prompt,
      text: { format: { type: "json_schema", ...intentJsonSchema } }
    },
    { stage: "intent" }
  );

  const payload = parseJson(response.output_text, "intent");
  return {
    responseId: response.id,
    payload,
    response
  };
}

export async function processVendorMessage({ sessionId, user, message }) {
  const simulation = await loadSimulationContext(sessionId, user.id);
  if (!simulation) {
    return { ok: false, reason: "simulation_not_found" };
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  if (!trimmedMessage) {
    return { ok: false, reason: "missing_message" };
  }
  if (trimmedMessage.length > 4_000) {
    return { ok: false, reason: "message_too_long" };
  }

  await markSimulationInProgress(simulation);

  await insertMessage({
    sessionId,
    role: "user",
    actor: "vendor",
    messageType: "text",
    content: trimmedMessage,
    metadata: {}
  });

  const moderatorPromptVersion = await getActivePromptVersion("moderador");
  const moderator = await runModerator(trimmedMessage);
  const wasModerated = moderator.payload.violacao === true;

  await recordOpenAiUsage({
    sessionId,
    stage: "moderator",
    model: env.openAiModelModerador,
    usage: extractUsage(moderator.response)
  });

  await insertMessage({
    sessionId,
    role: "assistant",
    actor: "moderator",
    messageType: "event",
    content: wasModerated ? (moderator.payload.motivo ?? "") : "",
    moderationFlag: wasModerated,
    moderationReason: moderator.payload.motivo ?? null,
    metadata: {
      response_id: moderator.responseId,
      prompt_version_id: moderatorPromptVersion?.id ?? null,
      categoria: moderator.payload.categoria ?? null,
      severidade: moderator.payload.severidade ?? null,
      acao_sugerida: moderator.payload.acao_sugerida ?? null
    }
  });

  const shouldForceEnd = moderator.payload.acao_sugerida === "encerrar_sessao";
  if (wasModerated && shouldForceEnd) {
    return {
      ok: true,
      moderated: true,
      moderator: { reason: moderator.payload.motivo ?? "Conduta inadequada detectada." }
    };
  }

  const sinalModerador = wasModerated
    ? JSON.stringify(
        {
          violacao: moderator.payload.violacao,
          categoria: moderator.payload.categoria,
          severidade: moderator.payload.severidade,
          acao_sugerida: moderator.payload.acao_sugerida,
          motivo: moderator.payload.motivo
        },
        null,
        2
      )
    : "";

  const allMessages = await loadSessionMessages(sessionId);
  const historico = formatConversationHistory(allMessages, { actors: ["vendor", "client"] });

  const clientPromptVersion = await getActivePromptVersion("cliente");
  const client = await runClient({
    blocoDinamico: simulation.scenarios.dynamic_block_json,
    historico,
    inputVendedor: trimmedMessage,
    faseAtual: simulation.current_phase ?? "preparar",
    sinalModerador
  });

  await recordOpenAiUsage({
    sessionId,
    stage: "client",
    model: env.openAiModelCliente,
    usage: extractUsage(client.response)
  });

  const clientFala = (client.payload.fala ?? "").trim();
  const clientPhase = client.payload.fase ?? simulation.current_phase ?? "preparar";

  const clientMessage = await insertMessage({
    sessionId,
    role: "assistant",
    actor: "client",
    messageType: "text",
    content: clientFala,
    metadata: {
      response_id: client.responseId,
      prompt_version_id: clientPromptVersion?.id ?? null,
      fase: clientPhase
    }
  });

  await updateCurrentPhase(sessionId, clientPhase);

  const intentPromptVersion = await getActivePromptVersion("intencao");
  const intent = await runIntent({
    inputVendedor: trimmedMessage,
    respostaCliente: clientFala
  });

  await recordOpenAiUsage({
    sessionId,
    stage: "intent",
    model: env.openAiModelIntencao,
    usage: extractUsage(intent.response)
  });

  const shouldEnd = intent.payload.intencao_encerrar === true;

  await insertMessage({
    sessionId,
    role: "assistant",
    actor: "intent",
    messageType: "event",
    content: shouldEnd ? "intencao_encerrar" : "",
    intentResult: shouldEnd ? "intention_true" : "intention_false",
    metadata: {
      response_id: intent.responseId,
      prompt_version_id: intentPromptVersion?.id ?? null,
      confianca: intent.payload.confianca ?? null
    }
  });

  return {
    ok: true,
    moderated: wasModerated,
    moderator: wasModerated
      ? {
          reason: moderator.payload.motivo ?? null,
          severidade: moderator.payload.severidade ?? null,
          acao_sugerida: moderator.payload.acao_sugerida ?? null
        }
      : null,
    reply: clientMessage.content,
    phase: clientPhase,
    phaseChanged: client.payload.fase_mudou === true,
    intentConfidence: intent.payload.confianca ?? null,
    shouldEnd
  };
}
