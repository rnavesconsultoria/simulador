# Contrato de Dados — Simulador PACE

Este documento descreve o fluxo de dados entre os 5 agentes do simulador de vendas PACE (Criador, Cliente, Moderador, Intenção, Gerente) e garante que os JSONs produzidos por cada agente sejam consumíveis pelos demais. Use este documento como referência de integração entre frontend, backend e os prompts.

**Versão do contrato:** `2.1.0` — alinhada à versão `2.1.0` dos prompts.

## 1. Glossário

- **Sessão** — uma simulação de venda completa, do briefing até o encerramento.
- **Turno** — um par (mensagem do vendedor, resposta do cliente). Numerado a partir de `1` para a primeira fala do vendedor.
- **Gabarito** — o JSON do personagem produzido pelo Criador no início da sessão. Funciona como referência objetiva para o Gerente avaliar.
- **Thread** — histórico textual completo da conversa, usado pelo Gerente ao final. Cada fala deve incluir o número do turno.
- **Bloco dinâmico** — o `personagem_json` quando passado como entrada ao Cliente em cada turno.

## 2. Convenções globais

Estas convenções valem para TODOS os agentes e payloads. Backend é responsável por validar/normalizar.

- **Idioma padrão:** PT-BR. O Cliente acompanha o idioma do vendedor; os demais agentes (Criador, Moderador, Intenção, Gerente) operam sempre em PT-BR.
- **Notas:** sempre `number`. Ponto como separador decimal. Sem aspas. Exemplo: `7.5`.
- **Preços:** string com formato canônico `"R$ X.XXX,XX/<unidade>"`. Unidades permitidas: `mês`, `ano`, `unidade`, `projeto`, `contrato`, `paciente`. Exemplo: `"R$ 2.800,00/mês"`. Quando não se aplica, use `""`.
- **Turnos:** `number` inteiro positivo, começando em `1`.
- **Confiança:** valor `"alta" | "media" | "baixa"` em campos `confianca` (Moderador, Intenção).
- **Arrays vazios:** sempre `[]`, nunca `null`.
- **Strings inaplicáveis:** sempre `""`, nunca `null`, exceto onde explicitamente permitido (ex: campos do Moderador quando `violacao = false`).

## 3. Fluxo de execução

### 3.1 Início da sessão (executado uma vez)

1. Frontend coleta `briefing`, `username`, `userlevel`, opcionalmente `seed_diversidade`.
2. Backend consulta histórico de personagens deste vendedor e extrai `tracos_anteriores` (lista dos `traco_dominante` dos últimos N personagens — sugerido N=5).
3. Backend chama **Criador** com todas as entradas + `tracos_anteriores` → recebe `personagem_json`.
4. Backend persiste `personagem_json` na sessão (este é o gabarito).
5. Frontend renderiza a tela do simulador com `personagem.contexto_vendedor`, `personagem.nome`, `personagem.cargo`, `personagem.empresa`, `personagem.personalidade_pace`, e inicia a conversa na fase `preparar`.

### 3.2 Cada turno (executado N vezes)

1. Vendedor envia `input_vendedor`.
2. Backend chama **Moderador** com `input_vendedor` E `fase_atual` (necessário para a regra mecânica de pilar penalizado do Gerente). Recebe `moderador_output`.
3. Avaliação do `moderador_output`:
   - Se `violacao = true` E `acao_sugerida = "encerrar_sessao"` E `confianca = "alta"`: pular para 3.4 (encerramento por violação).
   - Se `violacao = true` E `acao_sugerida = "encerrar_sessao"` MAS `confianca != "alta"`: rebaixar para `avisar_vendedor` (a regra de proteção do prompt já faz isso, mas o backend valida).
   - Se `violacao = true` com severidade leve/moderada: registrar e seguir.
4. Backend chama **Cliente** com:
   - `bloco_dinamico = personagem_json`
   - `historico` = thread acumulada até aqui, com turnos numerados
   - `input_vendedor`
   - `fase_atual` = fase persistida da sessão
   - `sinal_moderador = moderador_output` se houve violação relevante
5. Cliente retorna `cliente_output` com `fase`, `fase_mudou`, `fala`.
6. Backend atualiza `fase_atual` da sessão com `cliente_output.fase`.
7. Backend chama **Intenção** com `input_vendedor` e `resposta_cliente = cliente_output.fala`.
8. Frontend exibe `cliente_output.fala`. Se `fase_mudou == true`, anima a transição visual da etapa PACE. Se houve violação, exibe aviso conforme `acao_sugerida` e `confianca`.
9. Backend persiste o turno completo (input do vendedor + outputs dos 3 agentes + `fase_atual` daquele turno) na thread.
10. Se `intencao_encerrar == true`:
    - Com `confianca == "alta"` → ir para 3.3.
    - Com `confianca == "media"` ou `"baixa"` → sistema confirma com o usuário antes (3.3 só após confirmação).
11. Caso contrário, retornar ao passo 1 do próximo turno.

### 3.3 Encerramento por intenção

Sistema confirma com o usuário ("deseja encerrar a simulação?"). Se sim, vai para 3.5. Se não, retorna ao fluxo normal.

### 3.4 Encerramento por violação grave

Sessão é interrompida imediatamente. **Não chama o Gerente** — sessão interrompida por violação não recebe avaliação PACE. Frontend renderiza a tela de "sessão encerrada" (não a tela de feedback normal).

Backend persiste a violação no histórico do vendedor com flag `sessao_invalidada = true`.

### 3.5 Encerramento e avaliação

1. Backend agrega todas as violações registradas na sessão em `violacoes_moderador`. Cada entrada DEVE incluir o campo `fase` (capturado no passo 3.2.2) para que o Gerente possa aplicar a regra mecânica de penalização.
2. Backend formata `thread_completa` com numeração de turnos explícita. Formato sugerido:

```
Turno 1
Vendedor: "..."
Cliente: "..." (fase: preparar)

Turno 2
Vendedor: "..."
Cliente: "..." (fase: preparar)
[...]
```

3. Backend chama **Gerente** com `thread_completa`, `personagem_json` e `violacoes_moderador`.
4. Backend valida o output do Gerente contra limites de caracteres (ver §5). Se estourar, registra alerta de qualidade e trunca antes de persistir.
5. Frontend renderiza tela de feedback com o output do Gerente: notas dos 4 pilares, gráfico de radar, justificativas, descobertas (com turno e citação), resumo e recomendações priorizadas. Se for a primeira simulação do vendedor, omite a comparação com sessão anterior.

## 4. Mapa de campos entre agentes

| Campo produzido | Por quem | Consumido por |
|---|---|---|
| `personagem_json` (completo) | Criador | Cliente (como `bloco_dinamico`), Gerente (como `personagem_json`), Frontend (campos públicos) |
| `personagem.traco_dominante` | Criador | Backend (compõe `tracos_anteriores` para próximas sessões) |
| `cliente_output.fase` | Cliente | Backend (controle de estado), Frontend (UI da fase atual) |
| `cliente_output.fase_mudou` | Cliente | Frontend (microinteração de transição) |
| `cliente_output.fala` | Cliente | Frontend (chat), Intenção (como `resposta_cliente`), Gerente (via thread) |
| `moderador_output.violacao` | Moderador | Backend (controle de fluxo), Cliente (como `sinal_moderador`), Gerente (via violações agregadas) |
| `moderador_output.categoria` | Moderador | Backend (analytics), Gerente (justificar penalidade) |
| `moderador_output.severidade` | Moderador | Backend (decisão de ação), Gerente (calcular penalidade conforme regra mecânica) |
| `moderador_output.acao_sugerida` | Moderador | Backend (fluxo), Frontend (UI de aviso) |
| `moderador_output.confianca` | Moderador | Backend (rebaixa `encerrar_sessao` quando confiança não é alta) |
| `fase_atual` (no momento da violação) | Backend (não vem do LLM) | Anexado a cada violação no `violacoes_moderador`, lido pelo Gerente para regra de pilar |
| `intencao_output.intencao_encerrar` | Intenção | Backend (controle de fluxo) |
| `intencao_output.confianca` | Intenção | Backend (decide se confirma com usuário antes de encerrar) |
| `gerente_output.P/A/C/E/Media` | Gerente | Frontend (notas, radar, comparativo histórico) |
| `gerente_output.Recomendacoes[]` | Gerente | Frontend (cards de ação, com destaque para `prioritaria = true`) |
| `gerente_output.Beneficios_ocultos_descobertos[]` | Gerente | Frontend (seção "Você descobriu" com turno e citação) |
| `gerente_output.Objecoes_profundas_descobertas[]` | Gerente | Frontend (mesma seção, opcional) |
| `gerente_output.Resultado` | Gerente | Frontend (pílula "Fechou no ideal / aceitável / não fechou") |
| `gerente_output.Preco_final` | Gerente | Frontend (linha "Preço final" no header) |

## 5. Limites de caracteres (responsabilidade do Gerente)

O backend valida e trunca silenciosamente quando ultrapassado, registrando alerta de qualidade.

| Campo | Limite |
|---|---|
| `Preparacao`, `Analise`, `Cocriacao`, `Engajamento` | 280 chars cada |
| `Resumo` | 500 chars |
| `Recomendacoes[].titulo` | 60 chars |
| `Recomendacoes[].descricao` | 250 chars |
| `Compromissos_obtidos` | 300 chars |
| `Violacoes_registradas` | 400 chars |
| `cliente_output.fala` | 400 chars (truncamento imediato, ver prompt do Cliente) |

## 6. Camada PACE transversal

A metodologia PACE é a coluna vertebral do sistema. Cada agente tem responsabilidade dentro dela.

- **Criador** — gera personagem com gabarito que recompensa execução PACE. Objeções profundas e benefícios ocultos premiam especificamente a etapa Analisar.
- **Cliente** — opera nas 4 fases PACE (`preparar`, `analisar`, `cocriar`, `engajar`), controla o avanço por gatilhos observáveis, NÃO permite saltos de etapa. Personalidade DISC orienta como o cliente reage em cada fase. `fase_mudou` é fórmula mecânica: `(fase de output) != (fase_atual de entrada)`.
- **Moderador** — não avalia PACE diretamente, mas precisa de `fase_atual` para que a violação seja "etiquetada" pelo backend antes de chegar ao Gerente. Violações graves penalizam a média final via regra mecânica.
- **Intenção** — distingue encerramento de SESSÃO (PACE termina) de fechamento de VENDA (etapa Engajar do PACE). Essa distinção é crítica para não interromper conversas em pleno engajamento.
- **Gerente** — avalia execução PACE com rubrica calibrada, contra o gabarito do Criador. Mapeia violações a pilares pela regra mecânica (fase → pilar). Reporta descobertas com turno + citação para a UI poder mostrar "no turno 4 você perguntou X e descobriu Y".

## 7. Mudanças vs. v2.0.0

### 7.1 Breaking changes

Esta versão tem mudanças não-compatíveis com a 2.0.0. Aplique a sequência de deploy sugerida na §7.3.

#### Em todos os outputs

- **Notas como `number`, não string.** `0.5` em vez de `"0.5"`. Backend não deve mais aplicar `parseFloat`.
- **Preços com formato canônico.** `"R$ 2.800,00/mês"` em vez de strings livres como `"2800 mensais"`. Backend valida o formato e rejeita payload mal-formado.

#### No Gerente

- **`Recomendacoes` virou array de objetos.** Antes era string. Backend que esperava string precisa ser atualizado:

  ```json
  // Antes (v2.0.0):
  "Recomendacoes": "1. Cave mais fundo... 2. Adapte ao DISC..."

  // Agora (v2.1.0):
  "Recomendacoes": [
    { "titulo": "Cave mais fundo no diagnóstico", "descricao": "...", "prioritaria": true },
    { "titulo": "Adapte ao perfil DISC", "descricao": "...", "prioritaria": false }
  ]
  ```

- **`Beneficios_ocultos_descobertos` e `Objecoes_profundas_descobertas` viraram array de objetos:**

  ```json
  // Antes (v2.0.0):
  "Beneficios_ocultos_descobertos": ["Adesão dos idosos"]

  // Agora (v2.1.0):
  "Beneficios_ocultos_descobertos": [
    { "nome": "Adesão dos idosos", "turno": 4, "citacao_vendedor": "Como tem sido a adesão dos pacientes mais velhos?" }
  ]
  ```

- **Regra mecânica de pilar penalizado.** Antes o LLM decidia qual pilar penalizar; agora a regra é determinística (fase da violação → pilar). Backend deve **anexar `fase`** a cada item de `violacoes_moderador` antes de mandar para o Gerente.

#### No Moderador

- **Novo campo `confianca`.** Obrigatório. Valores: `"alta" | "media" | "baixa"`.
- **Regra de proteção:** `encerrar_sessao` só com `confianca = alta`. O prompt já implementa isso, mas o backend deve validar como segunda linha de defesa (caso o LLM ignore a regra).
- **Nova categoria comportamental: metaroleplay.** Não é uma categoria nova no enum (continua sendo `jailbreak`), mas o prompt agora reconhece "atue como outro cliente", "para ficar mais realista, finja que..." como jailbreak. Backend não precisa fazer nada — só estar ciente nos logs.

#### No Cliente

- **`fase_mudou` agora é mecânico.** Backend pode validar: se `output.fase != input.fase_atual`, então `fase_mudou` DEVE ser `true`. Caso contrário, `false`. Rejeite payloads inconsistentes.

#### No Criador

- **Nova entrada opcional `{{tracos_anteriores}}`.** Backend pode passar lista vazia até ter implementado o histórico — comportamento permanece igual à v2.0.0 nesse caso.
- **`peso` dos benefícios ocultos varia entre 0.20 e 0.40.** Antes tendia a sempre vir 0.35. Backend não precisa fazer nada, é só ciência de mudança de comportamento.

### 7.2 Novas entradas do Moderador

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `input_vendedor` | string | Sim | Já existia |
| `fase_atual` | string | Sim (novo) | Para que a violação seja etiquetada e o Gerente aplique a regra mecânica |

### 7.3 Sequência de deploy sugerida

A ordem importa para evitar quebra em produção:

1. **Deploy do backend primeiro**, com suporte aos DOIS formatos (v2.0.0 e v2.1.0). Detecta o formato pelo tipo de campo (`typeof Recomendacoes === "string"` vs. `Array.isArray`).
2. **Atualizar o frontend** para consumir o novo formato (cards de recomendação, descobertas com turno).
3. **Atualizar o Moderador** primeiro (mais simples, só adiciona `confianca` e o backend precisa passar `fase_atual`).
4. **Atualizar o Criador** (sem breaking se backend passar `tracos_anteriores = []`).
5. **Atualizar o Cliente** (`fase_mudou` mecânico — backend pode validar com fallback se o LLM errar).
6. **Atualizar o Gerente por último** — é a mudança mais arriscada, faça com canary (10% → 50% → 100%).
7. **Após 2 semanas estáveis**, remover suporte ao formato v2.0.0 do backend.

### 7.4 Compatibilidade preservada

Estes campos NÃO mudaram e continuam compatíveis:

- Estrutura geral do `personagem_json` (todos os campos antigos existem)
- Nomes das 4 fases PACE (`preparar`, `analisar`, `cocriar`, `engajar`) — já alinhadas desde a 2.0.0
- Enum de `Resultado` do Gerente (`fechou_ideal | fechou_aceitavel | nao_fechou | inconclusivo`)
- Enum de categorias do Moderador (`linguagem_agressiva | assedio | discriminacao | ameaca | jailbreak | fuga_de_contexto`)
- Enum de severidade e ação sugerida do Moderador

## 8. Loop futuro de aprendizado (não implementado nesta versão)

Sugestão para evolução futura, descrita aqui para alinhar visão:

- Persistir histórico de avaliações por vendedor (`historico_avaliacoes[]`) no banco, indexado por pilar PACE.
- Passar esse histórico como entrada opcional ao **Criador** (`{{historico_avaliacoes}}`), que poderá gerar personagens que forcem pilares fracos do vendedor. Exemplo: se Análise está consistentemente baixa, o Criador gera personagens com benefícios ocultos muito ricos para forçar diagnóstico profundo.
- A entrada `{{tracos_anteriores}}` já preparada nesta v2.1.0 é o primeiro passo dessa direção.
- Painel de progresso temporal para o vendedor e para o gestor humano (gerente real, não o agente Gerente).
- Citação real do diálogo aparecendo nas justificativas dos pilares (campo `citacao_dialogo` no output do Gerente) — aterra o feedback no comportamento concreto.

## 9. Pontos abertos (para discussão futura)

- **Telemetria de qualidade dos prompts.** Como medir drift dos modelos ao longo do tempo? Sugestão: amostrar 5% das sessões para review humana mensal.
- **Idioma além de PT-BR.** O Cliente acompanha o idioma do vendedor, mas o Gerente sempre produz feedback em PT-BR. Para vendedores em outros mercados, isso precisará ser revisto.
- **Personagens recorrentes.** Hoje cada sessão tem personagem novo. Vale, no futuro, ter personagens recorrentes que "lembram" do vendedor entre sessões — útil para treinar gestão de relacionamento de longo prazo.
- **Multi-decisor.** Toda simulação tem 1 cliente. Vendas reais frequentemente têm comitê. Vale considerar simulações com 2-3 personagens simultaneamente — mudança grande de arquitetura.
