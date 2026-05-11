const objectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["descricao", "minimo_aceitavel", "ideal"],
  properties: {
    descricao: { type: "string" },
    minimo_aceitavel: { type: "string" },
    ideal: { type: "string" }
  }
};

const deepObjectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["descricao", "gatilho_revelacao", "minimo_aceitavel", "ideal"],
  properties: {
    descricao: { type: "string" },
    gatilho_revelacao: { type: "string" },
    minimo_aceitavel: { type: "string" },
    ideal: { type: "string" }
  }
};

const hiddenBenefitSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "categoria", "prova_esperada", "gatilho_descoberta", "peso"],
  properties: {
    nome: { type: "string" },
    categoria: { type: "string" },
    prova_esperada: { type: "string" },
    gatilho_descoberta: { type: "string" },
    peso: { type: "number" }
  }
};

const validScenarioSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "nota_corte_objecao", "nota_corte_preco"],
  properties: {
    nome: { type: "string" },
    nota_corte_objecao: { type: "number" },
    nota_corte_preco: { type: "number" }
  }
};

export const scenarioJsonSchema = {
  name: "scenario_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["contexto_vendedor", "contexto_gerente", "personagem"],
    properties: {
      contexto_vendedor: { type: "string" },
      contexto_gerente: { type: "string" },
      personagem: {
        type: "object",
        additionalProperties: false,
        required: [
          "nome",
          "cargo",
          "empresa",
          "cidade",
          "personalidade_pace",
          "traco_dominante",
          "tom_linguagem",
          "historia",
          "personalidade_nivel",
          "negociacao"
        ],
        properties: {
          nome: { type: "string" },
          cargo: { type: "string" },
          empresa: { type: "string" },
          cidade: { type: "string" },
          personalidade_pace: { type: "string" },
          traco_dominante: { type: "string" },
          tom_linguagem: { type: "string" },
          historia: { type: "string" },
          personalidade_nivel: {
            type: "object",
            additionalProperties: false,
            required: [
              "nivel",
              "descricao",
              "nota_corte_objecao",
              "nota_corte_preco",
              "cenarios_validos",
              "regra_avaliacao"
            ],
            properties: {
              nivel: { type: "string" },
              descricao: { type: "string" },
              nota_corte_objecao: { type: "number" },
              nota_corte_preco: { type: "number" },
              cenarios_validos: {
                type: "array",
                items: validScenarioSchema
              },
              regra_avaliacao: { type: "string" }
            }
          },
          negociacao: {
            type: "object",
            additionalProperties: false,
            required: [
              "nome_vendedor",
              "objecoes",
              "objecoes_profundas",
              "beneficios_ocultos",
              "preco",
              "notas_cortes"
            ],
            properties: {
              nome_vendedor: { type: "string" },
              objecoes: {
                type: "array",
                minItems: 1,
                items: objectionSchema
              },
              objecoes_profundas: {
                type: "array",
                items: deepObjectionSchema
              },
              beneficios_ocultos: {
                type: "array",
                minItems: 1,
                items: hiddenBenefitSchema
              },
              preco: {
                type: "object",
                additionalProperties: false,
                required: ["minimo_aceitavel", "ideal"],
                properties: {
                  minimo_aceitavel: { type: "string" },
                  ideal: { type: "string" }
                }
              },
              notas_cortes: {
                type: "object",
                additionalProperties: false,
                required: ["negociacao_objecoes", "negociacao_preco"],
                properties: {
                  negociacao_objecoes: { type: "number" },
                  negociacao_preco: { type: "number" }
                }
              }
            }
          }
        }
      }
    }
  }
};
