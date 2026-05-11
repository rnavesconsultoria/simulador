const scoreSchema = {
  type: "number",
  minimum: 0,
  maximum: 10,
  multipleOf: 0.5
};

export const reportJsonSchema = {
  name: "manager_report_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "P",
      "A",
      "C",
      "E",
      "Media",
      "Preparacao",
      "Analise",
      "Cocriacao",
      "Engajamento",
      "Resumo",
      "Recomendacoes"
    ],
    properties: {
      P: scoreSchema,
      A: scoreSchema,
      C: scoreSchema,
      E: scoreSchema,
      Media: scoreSchema,
      Preparacao: { type: "string" },
      Analise: { type: "string" },
      Cocriacao: { type: "string" },
      Engajamento: { type: "string" },
      Resumo: { type: "string" },
      Recomendacoes: { type: "string" }
    }
  }
};
