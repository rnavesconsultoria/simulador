export const moderatorJsonSchema = {
  name: "moderator_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["violacao", "motivo"],
    properties: {
      violacao: { type: "boolean" },
      motivo: { type: ["string", "null"] }
    }
  }
};
