export const PACE_PHASES = ["preparar", "analisar", "cocriar", "engajar"];

export const clientJsonSchema = {
  name: "client_turn_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fase", "fase_mudou", "fala"],
    properties: {
      fase: {
        type: "string",
        enum: PACE_PHASES
      },
      fase_mudou: { type: "boolean" },
      fala: { type: "string" }
    }
  }
};
