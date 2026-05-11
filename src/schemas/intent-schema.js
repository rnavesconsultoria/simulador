export const INTENT_CONFIDENCES = ["alta", "media", "baixa"];

export const intentJsonSchema = {
  name: "intent_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intencao_encerrar", "confianca"],
    properties: {
      intencao_encerrar: { type: "boolean" },
      confianca: {
        type: "string",
        enum: INTENT_CONFIDENCES
      }
    }
  }
};
