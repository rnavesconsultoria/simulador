export const moderatorJsonSchema = {
  name: "moderator_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["status_moderator", "motivo"],
    properties: {
      status_moderator: {
        type: "string"
      },
      motivo: {
        type: "string"
      }
    }
  }
};
