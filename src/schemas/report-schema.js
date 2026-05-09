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
      "Preparacao",
      "Analise",
      "Cocriacao",
      "Engajamento",
      "Resumo",
      "Transcricao",
      "Media",
      "Recomendacoes"
    ],
    properties: {
      P: { type: "string" },
      A: { type: "string" },
      C: { type: "string" },
      E: { type: "string" },
      Preparacao: { type: "string" },
      Analise: { type: "string" },
      Cocriacao: { type: "string" },
      Engajamento: { type: "string" },
      Resumo: { type: "string" },
      Transcricao: { type: "string" },
      Media: { type: "string" },
      Recomendacoes: { type: "string" }
    }
  }
};
