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

const recommendationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "descricao", "prioritaria"],
  properties: {
    titulo: { type: "string" },
    descricao: { type: "string" },
    prioritaria: { type: "boolean" }
  }
};

const discoverySchema = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "turno", "citacao_vendedor"],
  properties: {
    nome: { type: "string" },
    turno: { type: "integer", minimum: 1 },
    citacao_vendedor: { type: "string" }
  }
};

const violacaoSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "turno",
    "fase",
    "categoria",
    "severidade",
    "motivo",
    "pilar_penalizado",
    "reducao_aplicada"
  ],
  properties: {
    turno: { type: "integer", minimum: 1 },
    fase: {
      type: "string",
      enum: ["preparar", "analisar", "cocriar", "engajar"]
    },
    categoria: {
      type: "string",
      enum: [
        "linguagem_agressiva",
        "assedio",
        "discriminacao",
        "ameaca",
        "jailbreak",
        "fuga_de_contexto"
      ]
    },
    severidade: {
      type: "string",
      enum: ["leve", "moderada", "grave"]
    },
    motivo: { type: "string" },
    pilar_penalizado: {
      type: "string",
      enum: ["P", "A", "C", "E"]
    },
    reducao_aplicada: { type: "number", minimum: 0 }
  }
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
      "Recomendacoes",
      "Resultado",
      "Preco_final",
      "Compromissos_obtidos",
      "Beneficios_ocultos_descobertos",
      "Objecoes_profundas_descobertas",
      "Violacoes"
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
      Recomendacoes: {
        type: "array",
        items: recommendationSchema
      },
      Resultado: {
        type: "string",
        enum: REPORT_RESULTS
      },
      Preco_final: { type: "string" },
      Compromissos_obtidos: { type: "string" },
      Beneficios_ocultos_descobertos: {
        type: "array",
        items: discoverySchema
      },
      Objecoes_profundas_descobertas: {
        type: "array",
        items: discoverySchema
      },
      Violacoes: {
        type: "array",
        items: violacaoSchema
      }
    }
  }
};
