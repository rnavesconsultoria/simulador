import crypto from "node:crypto";
import { env } from "../config/env.js";
import { extractUsage } from "../lib/openai-usage.js";
import { callOpenAiResponses } from "../lib/openai-call.js";
import { loadPrompt } from "../lib/prompt-loader.js";
import { renderPrompt } from "../lib/prompt-template.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { scenarioJsonSchema } from "../schemas/scenario-schema.js";
import { recordOpenAiUsage } from "./cost-service.js";
import { getActivePromptVersion } from "./prompt-version-service.js";

function normalizeUserLevel(level) {
  if (typeof level === "number") {
    return String(level);
  }
  return level ?? "";
}

function randomSessionKey() {
  return crypto.randomUUID();
}

function assertScenarioPayload(payload, expectedSellerName, userLevel) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Scenario payload is not an object.");
  }

  if (!payload.contexto_vendedor || !payload.contexto_gerente) {
    throw new Error("Scenario payload is missing top-level contexts.");
  }

  const personagem = payload.personagem;
  if (!personagem || typeof personagem !== "object") {
    throw new Error("Scenario payload is missing personagem.");
  }

  const requiredPersonagemFields = [
    "nome",
    "cargo",
    "empresa",
    "cidade",
    "personalidade_pace",
    "tom_linguagem",
    "historia",
    "personalidade_nivel",
    "negociacao"
  ];

  for (const field of requiredPersonagemFields) {
    if (!personagem[field]) {
      throw new Error(`Scenario payload is missing personagem.${field}.`);
    }
  }

  const negociacao = personagem.negociacao;
  const personalidadeNivel = personagem.personalidade_nivel;

  if (negociacao.nome_vendedor !== expectedSellerName) {
    throw new Error("Scenario payload returned an unexpected seller name.");
  }

  if (!Array.isArray(personalidadeNivel.cenarios_validos)) {
    throw new Error("Scenario payload must include cenarios_validos as an array.");
  }

  if (!Array.isArray(negociacao.objecoes) || negociacao.objecoes.length === 0) {
    throw new Error("Scenario payload must include at least one objection.");
  }

  if (!Array.isArray(negociacao.beneficios_ocultos) || negociacao.beneficios_ocultos.length === 0) {
    throw new Error("Scenario payload must include hidden benefits.");
  }

  if (!negociacao.preco?.minimo_aceitavel || !negociacao.preco?.ideal) {
    throw new Error("Scenario payload is missing price targets.");
  }

  if (
    !negociacao.notas_cortes?.negociacao_objecoes ||
    !negociacao.notas_cortes?.negociacao_preco
  ) {
    throw new Error("Scenario payload is missing score cutoffs.");
  }

  const objectionCount = negociacao.objecoes.length;
  const expectedCountByLevel = { "1": 1, "2": 2, "3": 3 };

  const expectedCount = expectedCountByLevel[String(userLevel)];
  if (expectedCount && objectionCount !== expectedCount) {
    throw new Error(
      `Scenario payload returned ${objectionCount} objections, expected ${expectedCount}.`
    );
  }

  if (String(userLevel) === "3" && personalidadeNivel.cenarios_validos.length !== 2) {
    throw new Error("Senior scenario payload must include two valid scenarios.");
  }
}

async function generateScenarioPayload({ promptTemplate, briefing, username, userlevel }) {
  let lastError;
  const responses = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const correction = attempt === 1
      ? ""
      : `\n\nObservação: a tentativa anterior falhou na validação. Retorne **estritamente** o JSON exigido.`;
    const prompt = renderPrompt(promptTemplate, {
      briefing,
      username,
      userlevel,
      seed_diversidade: ""
    }) + correction;

    const response = await callOpenAiResponses(
      {
        model: env.openAiModelCriador,
        input: prompt,
        text: { format: { type: "json_schema", ...scenarioJsonSchema } }
      },
      { stage: "creator" }
    );
    responses.push(response);

    try {
      const payload = JSON.parse(response.output_text);
      assertScenarioPayload(payload, username, userlevel);
      return { payload, response, responses };
    } catch (error) {
      lastError = error;
      console.warn(`[scenario-service] attempt ${attempt} failed: ${error.message}`);
    }
  }

  throw lastError ?? new Error("Failed to generate scenario.");
}

export async function generateScenarioForUser(user) {
  if (!user?.companies?.briefing_markdown) {
    throw new Error("User does not have an associated company briefing.");
  }

  const promptTemplate = await loadPrompt("criador");
  const { payload: scenarioPayload, response, responses } = await generateScenarioPayload({
    promptTemplate,
    briefing: user.companies.briefing_markdown,
    username: user.name,
    userlevel: normalizeUserLevel(user.level)
  });

  const sessionKey = randomSessionKey();
  const supabase = getSupabaseAdmin();
  const promptVersion = await getActivePromptVersion("criador");

  const { data: scenario, error: scenarioError } = await supabase
    .from("scenarios")
    .insert({
      session_key: sessionKey,
      user_id: user.id,
      company_id: user.company_id,
      seller_context: scenarioPayload.contexto_vendedor,
      manager_context: scenarioPayload.contexto_gerente,
      dynamic_block_json: scenarioPayload,
      prompt_version_id: promptVersion?.id ?? null
    })
    .select("id, session_key, seller_context, manager_context, dynamic_block_json")
    .single();

  if (scenarioError) {
    throw new Error(`Failed to persist scenario: ${scenarioError.message}`);
  }

  const { data: simulationSession, error: sessionError } = await supabase
    .from("simulation_sessions")
    .insert({
      session_key: sessionKey,
      user_id: user.id,
      company_id: user.company_id,
      scenario_id: scenario.id,
      status: "scenario_ready",
      current_phase: "preparar"
    })
    .select("id, session_key, status, current_phase")
    .single();

  if (sessionError) {
    throw new Error(`Failed to create simulation session: ${sessionError.message}`);
  }

  for (const attemptResponse of responses) {
    await recordOpenAiUsage({
      sessionId: simulationSession.id,
      stage: "creator",
      model: env.openAiModelCriador,
      usage: extractUsage(attemptResponse)
    });
  }

  return {
    scenario,
    simulationSession,
    openAiResponseId: response.id
  };
}
