import { env } from "../config/env.js";
import { formatConversationHistory } from "../lib/conversation-history.js";
import { extractJsonPayload } from "../lib/json-response.js";
import { extractUsage } from "../lib/openai-usage.js";
import { getOpenAiClient } from "../lib/openai-client.js";
import { loadPrompt } from "../lib/prompt-loader.js";
import { renderPrompt } from "../lib/prompt-template.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { moderatorJsonSchema } from "../schemas/moderator-schema.js";
import { recordOpenAiUsage } from "./cost-service.js";
import { getActivePromptVersion } from "./prompt-version-service.js";

async function loadSimulationContext(sessionId, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("simulation_sessions")
    .select(`
      id,
      session_key,
      status,
      user_id,
      scenario_id,
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

  if (!data) {
    return null;
  }

  return data;
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

async function updateSimulationStatus(sessionId, status) {
  const supabase = getSupabaseAdmin();
  const payload = {
    status
  };

  if (status === "in_progress") {
    payload.started_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("simulation_sessions")
    .update(payload)
    .eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to update simulation status: ${error.message}`);
  }
}

async function runModerator(inputVendedor) {
  const promptTemplate = await loadPrompt("moderador");
  const prompt = renderPrompt(promptTemplate, {
    input_vendedor: inputVendedor
  });

  const openai = getOpenAiClient();
  const response = await openai.responses.create({
    model: env.openAiModelModerador,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        ...moderatorJsonSchema
      }
    }
  });

  const payload = extractJsonPayload(response.output_text);
  return {
    responseId: response.id,
    payload,
    response
  };
}

async function runClient({ blocoDinamico, historico, inputVendedor }) {
  const promptTemplate = await loadPrompt("cliente");
  const prompt = renderPrompt(promptTemplate, {
    bloco_dinamico: JSON.stringify(blocoDinamico, null, 2),
    historico,
    input_vendedor: inputVendedor
  });

  const openai = getOpenAiClient();
  const response = await openai.responses.create({
    model: env.openAiModelCliente,
    input: prompt
  });

  return {
    responseId: response.id,
    text: response.output_text?.trim() ?? "",
    response
  };
}

async function runIntent({ inputVendedor, respostaCliente }) {
  const promptTemplate = await loadPrompt("intencao");
  const prompt = renderPrompt(promptTemplate, {
    input_vendedor: inputVendedor,
    resposta_cliente: respostaCliente
  });

  const openai = getOpenAiClient();
  const response = await openai.responses.create({
    model: env.openAiModelIntencao,
    input: prompt
  });

  return {
    responseId: response.id,
    text: response.output_text?.trim() ?? "",
    response
  };
}

export async function processVendorMessage({ sessionId, user, message }) {
  const simulation = await loadSimulationContext(sessionId, user.id);
  if (!simulation) {
    return {
      ok: false,
      reason: "simulation_not_found"
    };
  }

  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    return {
      ok: false,
      reason: "missing_message"
    };
  }

  await updateSimulationStatus(sessionId, "in_progress");

  const vendorPromptVersionId = null;
  await insertMessage({
    sessionId,
    role: "user",
    actor: "vendor",
    messageType: "text",
    content: trimmedMessage,
    metadata: {
      prompt_version_id: vendorPromptVersionId
    }
  });

  const moderatorPromptVersion = await getActivePromptVersion("moderador");
  const moderator = await runModerator(trimmedMessage);
  const wasModerated = moderator.payload.status_moderator === "true";

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
    content: wasModerated ? moderator.payload.motivo : "",
    moderationFlag: wasModerated,
    moderationReason: moderator.payload.motivo,
    metadata: {
      response_id: moderator.responseId,
      prompt_version_id: moderatorPromptVersion?.id ?? null
    }
  });

  if (wasModerated) {
    return {
      ok: true,
      moderated: true,
      moderator: {
        reason: moderator.payload.motivo
      }
    };
  }

  const messages = await loadSessionMessages(sessionId);
  const historico = formatConversationHistory(messages);

  const clientPromptVersion = await getActivePromptVersion("cliente");
  const client = await runClient({
    blocoDinamico: simulation.scenarios.dynamic_block_json,
    historico,
    inputVendedor: trimmedMessage
  });

  await recordOpenAiUsage({
    sessionId,
    stage: "client",
    model: env.openAiModelCliente,
    usage: extractUsage(client.response)
  });

  const clientMessage = await insertMessage({
    sessionId,
    role: "assistant",
    actor: "client",
    messageType: "text",
    content: client.text,
    metadata: {
      response_id: client.responseId,
      prompt_version_id: clientPromptVersion?.id ?? null
    }
  });

  const intentPromptVersion = await getActivePromptVersion("intencao");
  const intent = await runIntent({
    inputVendedor: trimmedMessage,
    respostaCliente: client.text
  });

  await recordOpenAiUsage({
    sessionId,
    stage: "intent",
    model: env.openAiModelIntencao,
    usage: extractUsage(intent.response)
  });

  const normalizedIntent = intent.text.toLowerCase();
  const shouldEnd = normalizedIntent.includes("intention_true");

  await insertMessage({
    sessionId,
    role: "assistant",
    actor: "intent",
    messageType: "event",
    content: intent.text,
    intentResult: normalizedIntent,
    metadata: {
      response_id: intent.responseId,
      prompt_version_id: intentPromptVersion?.id ?? null
    }
  });

  return {
    ok: true,
    moderated: false,
    reply: clientMessage.content,
    shouldEnd,
    intent: intent.text
  };
}
