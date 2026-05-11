export const MODERATOR_CATEGORIES = [
  "linguagem_agressiva",
  "assedio",
  "discriminacao",
  "ameaca",
  "jailbreak",
  "fuga_de_contexto"
];

export const MODERATOR_SEVERITIES = ["leve", "moderada", "grave"];

export const MODERATOR_ACTIONS = [
  "registrar_e_seguir",
  "avisar_vendedor",
  "encerrar_sessao"
];

export const moderatorJsonSchema = {
  name: "moderator_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["violacao", "categoria", "severidade", "acao_sugerida", "motivo"],
    properties: {
      violacao: { type: "boolean" },
      categoria: {
        type: ["string", "null"],
        enum: [...MODERATOR_CATEGORIES, null]
      },
      severidade: {
        type: ["string", "null"],
        enum: [...MODERATOR_SEVERITIES, null]
      },
      acao_sugerida: {
        type: ["string", "null"],
        enum: [...MODERATOR_ACTIONS, null]
      },
      motivo: { type: ["string", "null"] }
    }
  }
};
