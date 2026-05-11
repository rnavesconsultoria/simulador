# Contrato de Dados — Simulador PACE

Este documento descreve o fluxo de dados entre os 5 agentes do simulador de vendas PACE (Criador, Cliente, Moderador, Intenção, Gerente) e garante que os JSONs produzidos por cada agente sejam consumíveis pelos demais. Use este documento como referência de integração entre frontend, backend e os prompts.

## 1. Glossário

- **Sessão** — uma simulação de venda completa, do briefing até o encerramento.
- **Turno** — um par (mensagem do vendedor, resposta do cliente).
- **Gabarito** — o JSON do personagem produzido pelo Criador no início da sessão. Funciona como referência objetiva para o Gerente avaliar.
- **Thread** — histórico textual completo da conversa, usado pelo Gerente ao final.
- **Bloco dinâmico** — o `personagem_json` quando passado como entrada ao Cliente em cada turno.

## 2. Fluxo de execução

### 2.1 Início da sessão (executado uma vez)

1. Frontend coleta `briefing`, `username`, `userlevel`, opcionalmente `seed_diversidade`.
2. Backend chama **Criador** → recebe `personagem_json`.
3. Backend persiste `personagem_json` na sessão (este é o gabarito).
4. Frontend renderiza a tela do simulador com `personagem.contexto_vendedor`, `personagem.nome`, `personagem.cargo`, `personagem.empresa`, `personagem.personalidade_pace`, e inicia a conversa na fase `preparar`.

### 2.2 Cada turno (executado N vezes)

1. Vendedor envia `input_vendedor`.
2. Backend chama **Moderador** com `input_vendedor` → recebe `moderador_output`.
3. Se `moderador_output.acao_sugerida == "encerrar_sessao"`, pular para 2.4 (encerramento forçado).
4. Backend chama **Cliente** com:
   - `bloco_dinamico = personagem_json`
   - `historico` = thread acumulada até aqui
   - `input_vendedor`
   - `fase_atual` = fase persistida da sessão
   - `sinal_moderador = moderador_output` se houver violação leve ou moderada
5. Cliente retorna `cliente_output` com `fase`, `fase_mudou`, `fala`.
6. Backend atualiza `fase_atual` da sessão com `cliente_output.fase`.
7. Backend chama **Intenção** com `input_vendedor` e `resposta_cliente = cliente_output.fala`.
8. Frontend exibe `cliente_output.fala`. Se `fase_mudou == true`, anima a transição visual da etapa PACE. Se houve violação, exibe aviso conforme `acao_sugerida`.
9. Backend persiste o turno completo (input + outputs dos 3 agentes) na thread.
10. Se `intencao_encerrar == true`:
    - Com `confianca == "alta"` → ir para 2.4.
    - Com `confianca == "media"` ou `"baixa"` → sistema confirma com o usuário antes (2.3).
11. Caso contrário, retornar ao passo 1 do próximo turno.

### 2.3 Encerramento por intenção

Sistema confirma com o usuário ("deseja encerrar a simulação?"). Se sim, vai para 2.4. Se não, retorna ao fluxo normal.

### 2.4 Encerramento e avaliação

1. Backend agrega todas as violações registradas na sessão em `violacoes_moderador`.
2. Backend formata `thread_completa` (formato sugerido: blocos rotulados por turno, com vendedor + cliente + flags do moderador).
3. Backend chama **Gerente** com `thread_completa`, `personagem_json` e `violacoes_moderador`.
4. Frontend renderiza tela de feedback com o output do Gerente: notas dos 4 pilares, gráfico de radar, justificativas, resumo e recomendações priorizadas.

## 3. Mapa de campos entre agentes

| Campo produzido | Por quem | Consumido por |
|---|---|---|
| `personagem_json` (completo) | Criador | Cliente (como `bloco_dinamico`), Gerente (como `personagem_json`), Frontend (campos públicos) |
| `cliente_output.fase` | Cliente | Backend (controle de estado), Frontend (UI da fase atual) |
| `cliente_output.fase_mudou` | Cliente | Frontend (microinteração de transição) |
| `cliente_output.fala` | Cliente | Frontend (chat), Intenção (como `resposta_cliente`), Gerente (via thread) |
| `moderador_output.violacao` | Moderador | Backend (controle de fluxo), Cliente (como `sinal_moderador`), Gerente (via violações agregadas) |
| `moderador_output.categoria` | Moderador | Backend (analytics), Gerente (justificar penalidade) |
| `moderador_output.severidade` | Moderador | Backend (decisão de ação), Gerente (calcular penalidade) |
| `moderador_output.acao_sugerida` | Moderador | Backend (fluxo), Frontend (UI de aviso) |
| `intencao_output.intencao_encerrar` | Intenção | Backend (controle de fluxo) |
| `intencao_output.confianca` | Intenção | Backend (decide se confirma com usuário antes de encerrar) |
| `gerente_output.*` | Gerente | Frontend (tela de feedback) |

## 4. Camada PACE transversal

A metodologia PACE é a coluna vertebral do sistema. Cada agente tem responsabilidade dentro dela.

- **Criador** — gera personagem com gabarito que recompensa execução PACE. Objeções profundas e benefícios ocultos premiam especificamente a etapa Analisar.
- **Cliente** — opera nas 4 fases PACE (`preparar`, `analisar`, `cocriar`, `engajar`), controla o avanço por gatilhos observáveis, NÃO permite saltos de etapa. Personalidade DISC orienta como o cliente reage em cada fase.
- **Moderador** — não avalia PACE diretamente, mas garante que a conduta do vendedor não invalide a avaliação. Violações graves penalizam a média final.
- **Intenção** — distingue encerramento de SESSÃO (PACE termina) de fechamento de VENDA (etapa Engajar do PACE). Essa distinção é crítica para não interromper conversas em pleno engajamento.
- **Gerente** — avalia execução PACE com rubrica calibrada (bandas de notas definidas), contra o gabarito do Criador. Calcula descoberta de benefícios ocultos e objeções profundas como prova de qualidade da Análise.

## 5. Compatibilidade com versão anterior

Esta versão dos prompts MANTÉM compatibilidade estrutural com a versão original. Todos os campos originais foram preservados. Os novos campos são opcionais do ponto de vista de consumo (backend pode ignorá-los enquanto não estiver pronto para usá-los), mas DEVEM ser preenchidos pelos agentes.

### Mudança que requer atenção do backend

As fases do Cliente foram renomeadas para alinhar com PACE:

| Versão anterior | Versão atual |
|---|---|
| `abertura` | `preparar` |
| `objecoes` | (parte de) `analisar` + `cocriar` |
| `preco` | (parte de) `cocriar` |
| `fechamento` | `engajar` |

Se o backend ainda lê os nomes antigos, é necessário adicionar uma camada de tradução OU migrar o estado da sessão para os novos nomes. Recomenda-se migrar — os nomes PACE são parte da identidade do produto.

### Campos novos por agente

- **Criador**:
  - `personagem.traco_dominante`
  - `personagem.negociacao.objecoes_profundas[]`
  - `personagem.negociacao.beneficios_ocultos[].gatilho_descoberta`
  - `personagem.negociacao.objecoes_profundas[].gatilho_revelacao`
- **Cliente**:
  - `fase_mudou`
  - Aceita entrada opcional `sinal_moderador`
- **Gerente**:
  - `Resultado`
  - `Preco_final`
  - `Compromissos_obtidos`
  - `Beneficios_ocultos_descobertos[]`
  - `Objecoes_profundas_descobertas[]`
  - `Violacoes_registradas`
  - Aceita entradas `personagem_json` e `violacoes_moderador`
- **Intenção**:
  - `confianca`
- **Moderador**:
  - `categoria`
  - `severidade`
  - `acao_sugerida`

## 6. Loop futuro de aprendizado (não implementado nesta versão)

Sugestão para evolução futura:

- Persistir histórico de avaliações por vendedor (`historico_avaliacoes[]`) no banco.
- Passar esse histórico como entrada opcional ao **Criador** (`{{historico_avaliacoes}}`), que pode então gerar personagens que forcem pilares fracos do vendedor. Exemplo: se Análise está consistentemente baixa, criar personagens com benefícios ocultos muito ricos para forçar diagnóstico profundo.
- Persistir histórico de cenários jogados (`personagens_anteriores[]`) para evitar repetição e garantir diversidade percebida.
- Painel de progresso temporal para o vendedor e para o gestor humano (gerente real, não o agente).
