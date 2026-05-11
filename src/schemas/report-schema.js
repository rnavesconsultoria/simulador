const scoreSchema = {
  type: "number",
  minimum: 0,
  maximum: 10,
  multipleOf: 0.5
};

export const REPORT_RESULTS = [
  "fechou_ideal",
  "fechou_aceitavel",
  "nao_fechou",
  "inconclusivo"
];

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
      "Recomendacoes",
      "Resultado",
      "Preco_final",
      "Compromissos_obtidos",
      "Beneficios_ocultos_descobertos",
      "Objecoes_profundas_descobertas",
      "Violacoes_registradas"
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
      Recomendacoes: { type: "string" },
      Resultado: {
        type: "string",
        enum: REPORT_RESULTS
      },
      Preco_final: { type: "string" },
      Compromissos_obtidos: { type: "string" },
      Beneficios_ocultos_descobertos: {
        type: "array",
        items: { type: "string" }
      },
      Objecoes_profundas_descobertas: {
        type: "array",
        items: { type: "string" }
      },
      Violacoes_registradas: { type: "string" }
    }
  }
};
