export const clientJsonSchema = {
  name: "client_turn_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fase", "fala"],
    properties: {
      fase: {
        type: "string",
        enum: ["abertura", "objecoes", "preco", "fechamento"]
      },
      fala: { type: "string" }
    }
  }
};
