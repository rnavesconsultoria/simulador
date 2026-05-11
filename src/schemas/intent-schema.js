export const intentJsonSchema = {
  name: "intent_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intencao_encerrar"],
    properties: {
      intencao_encerrar: { type: "boolean" }
    }
  }
};
