# Contrato de Dados — Simulador PACE

Este documento descreve o fluxo de dados entre os 5 agentes do simulador de vendas PACE (Criador, Cliente, Moderador, Intenção, Gerente) e garante que os JSONs produzidos por cada agente sejam consumíveis pelos demais. Use este documento como referência de integração entre frontend, backend e os prompts.

**Versão do contrato:** `2.1.1` — alinhada à versão `2.1.1` dos prompts.

## 1. Glossário

- **Sessão** — uma simulação de venda completa, do briefing até o encerramento.
- **Turno** — um par (mensagem do vendedor, resposta do cliente). Numerado a partir de `1` para a primeira fala do vendedor.
- **Gabarito** — o JSON do personagem produzido pelo Criador no início da sessão.
- **Thread** — histórico textual completo da conversa, usado pelo Gerente ao final. Cada fala deve incluir o número do turno.
- **Bloco dinâmico** — o `personagem_json` quando passado como entrada ao Cliente em cada turno.

## 2. Convenções globais

- **Idioma:** o Cliente acompanha o idioma do vendedor. Criador, Moderador, Intenção e Gerente emitem JSON sempre em PT-BR mas **detectam** conteúdo em qualquer idioma.
- **Notas:** sempre `number`. Ponto como separador decimal. Exemplo: `7.5`.
- **Preços:** string com formato canônico `"R$ X.XXX,XX/<unidade>"`. Unidades permitidas: `mês`, `ano`, `unidade`, `projeto`, `contrato`, `paciente`. Exemplo: `"R$ 2.800,00/mês"`. Quando não se aplica, use `""`.
- **Turnos:** `number` inteiro positivo, começando em `1`.
- **Confiança:** valor `"alta" | "media" | "baixa"` em campos `confianca` (Moderador, Intenção).
- **Arrays vazios:** sempre `[]`, nunca `null`.
- **Strings inaplicáveis:** sempre `""`, exceto onde explicitamente permitido (ex: campos do Moderador quando `violacao = false`).

## 3. Fluxo de execução

### 3.1 Início da sessão (executado uma vez)

1. Frontend coleta `briefing`, `username`, `userlevel`, opcionalmente `seed_diversidade`.
2. Backend consulta histórico de personagens deste vendedor e extrai `tracos_anteriores` (lista dos `traco_dominante` dos últimos N personagens — sugerido N=5).
3. Backend chama **Criador** com as entradas + `tracos_anteriores` → recebe `personagem_json`.
4. Backend persiste `personagem_json` na sessão (este é o gabarito).
5. Frontend renderiza a tela do simulador com `personagem.contexto_vendedor`, `personagem.nome`, `personagem.cargo`, `personagem.empresa`, `personagem.personalidade_pace`, e inicia a conversa na fase `preparar`.

### 3.2 Cada turno (executado N vezes)

1. Vendedor envia `input_vendedor`.
2. Backend chama **Moderador** com `input_vendedor` → recebe `moderador_output`.
3. **Backend anexa contexto da sessão ao output do Moderador** antes de persistir:

   ```
   violacao_persistida = {
     ...moderador_output,
     turno: <turno_atual>,
     fase: <fase_atual_persistida_na_sessao>
   }
   ```

   Esse enriquecimento é responsabilidade do backend, NÃO do LLM Moderador. O Moderador recebe apenas `input_vendedor` (ver §4.3).

4. Avaliação do `moderador_output`:
   - Se `violacao = true` E `acao_sugerida = "encerrar_sessao"` E `confianca = "alta"`: pular para 3.4 (encerramento por violação).
   - Se `violacao = true` E `acao_sugerida = "encerrar_sessao"` MAS `confianca != "alta"`: rebaixar para `avisar_vendedor` (a regra de proteção do prompt já faz isso, mas o backend valida).
   - Se `violacao = true` com severidade leve/moderada: persistir e seguir.
5. Backend chama **Cliente** com:
   - `bloco_dinamico = personagem_json`
   - `historico` = thread acumulada até aqui, com turnos numerados
   - `input_vendedor`
   - `fase_atual` = fase persistida da sessão
   - `sinal_moderador = moderador_output` se houve violação relevante
6. Cliente retorna `cliente_output` com `fase`, `fase_mudou`, `fala`.
7. Backend atualiza `fase_atual` da sessão com `cliente_output.fase`.
8. Backend chama **Intenção** com `input_vendedor` e `resposta_cliente = cliente_output.fala`.
9. Frontend exibe `cliente_output.fala`. Se `fase_mudou == true`, anima a transição visual da etapa PACE. Se houve violação, exibe aviso conforme `acao_sugerida` e `confianca`.
10. Backend persiste o turno completo (input do vendedor + outputs dos 3 agentes + `fase_atual` daquele turno) na thread.
11. Se `intencao_encerrar == true`:
    - Com `confianca == "alta"` → ir para 3.3.
    - Com `confianca == "media"` ou `"baixa"` → sistema confirma com o usuário antes (3.3 só após confirmação).
12. Caso contrário, retornar ao passo 1 do próximo turno.

### 3.3 Encerramento por intenção

Sistema confirma com o usuário ("deseja encerrar a simulação?"). Se sim, vai para 3.5. Se não, retorna ao fluxo normal.

### 3.4 Encerramento por violação grave

Sessão é interrompida imediatamente. **Não chama o Gerente** — sessão interrompida por violação não recebe avaliação PACE. Frontend renderiza a tela de "sessão encerrada" (não a tela de feedback normal).

Backend persiste a violação no histórico do vendedor com flag `sessao_invalidada = true`.

### 3.5 Encerramento e avaliação

1. Backend agrega todas as violações persistidas durante a sessão em `violacoes_moderador`. **Cada item já vem etiquetado** com `turno` e `fase` (pelo passo 3.2.3). Estrutura:

   ```json
   [
     {
       "turno": 4,
       "fase": "analisar",
       "violacao": true,
       "categoria": "linguagem_agressiva",
       "severidade": "leve",
       "acao_sugerida": "registrar_e_seguir",
       "confianca": "alta",
       "motivo": "..."
     }
   ]
   ```

2. Backend formata `thread_completa` com numeração de turnos explícita:

   ```
   Turno 1
   Vendedor: "..."
   Cliente: "..." (fase: preparar)

   Turno 2
   Vendedor: "..."
   Cliente: "..." (fase: preparar)
   ```

3. Backend chama **Gerente** com `thread_completa`, `personagem_json` e `violacoes_moderador`.
4. Backend valida o output do Gerente contra limites de caracteres (ver §5). Se estourar, registra alerta de qualidade e trunca antes de persistir.
5. Frontend renderiza tela de feedback: notas dos 4 pilares, gráfico de radar, justificativas, descobertas (com turno e citação), resumo, recomendações priorizadas e card de violações (se houver). Se for a primeira simulação do vendedor, omite a comparação com sessão anterior.

## 4. Mapa de campos entre agentes

### 4.1 Criador
- **Entradas:** `briefing`, `username`, `userlevel`, opcionalmente `seed_diversidade`, opcionalmente `tracos_anteriores`.
- **Saída crítica:** `personagem_json` completo, consumido pelo Cliente (`bloco_dinamico`), Gerente (`personagem_json`), Frontend (campos públicos como `contexto_vendedor`).
- **Para evolução:** `personagem.traco_dominante` → backend compõe `tracos_anteriores` para próximas sessões.

### 4.2 Cliente
- **Entradas:** `bloco_dinamico`, `historico`, `input_vendedor`, `fase_atual`, opcionalmente `sinal_moderador`.
- **Saídas:** `fase` (controle de estado), `fase_mudou` (UI de transição), `fala` (chat).
- **Comportamento pós-engajar:** mantém a fase em `engajar` até a sessão ser encerrada. Não retorna estado "encerrada" — esse controle é do agente Intenção + backend.

### 4.3 Moderador
- **Entradas:** apenas `input_vendedor`. **NÃO recebe `fase_atual`** — o enriquecimento com fase/turno é responsabilidade do backend, após a chamada (ver §3.2.3).
- **Saídas:** `violacao`, `categoria`, `severidade`, `acao_sugerida`, `confianca`, `motivo`.
- **Detecção é multi-idioma:** o vendedor pode escrever em qualquer idioma; o JSON volta sempre em PT-BR.

### 4.4 Intenção
- **Entradas:** `input_vendedor` (principal) e `resposta_cliente` (desambiguação).
- **Saídas:** `intencao_encerrar`, `confianca`.
- **Detecção é multi-idioma:** mesmo critério do Moderador.

### 4.5 Gerente
- **Entradas:** `thread_completa`, `personagem_json`, `violacoes_moderador` (cada item já etiquetado com turno e fase pelo backend).
- **Saídas:** P/A/C/E/Media, Preparacao/Analise/Cocriacao/Engajamento, Resumo, Recomendacoes[], Resultado, Preco_final, Compromissos_obtidos, Beneficios_ocultos_descobertos[], Objecoes_profundas_descobertas[], **Violacoes[]** (estruturado, com pilar penalizado e redução aplicada).

## 5. Limites de caracteres (responsabilidade do Gerente)

O backend valida e trunca silenciosamente quando ultrapassado, registrando alerta de qualidade.

| Campo | Limite |
|---|---|
| `Preparacao`, `Analise`, `Cocriacao`, `Engajamento` | 280 chars cada |
| `Resumo` | 500 chars |
| `Recomendacoes[].titulo` | 60 chars |
| `Recomendacoes[].descricao` | 250 chars |
| `Compromissos_obtidos` | 300 chars |
| `Violacoes[].motivo` | 250 chars |
| `cliente_output.fala` | 400 chars |

## 6. Sistema de penalidades por violação (regra unificada)

A partir desta versão, **todas as severidades reduzem nota do PILAR** correspondente à fase em que a violação ocorreu. Sem mais redução direta na `Media`.

### 6.1 Tabela de redução

| Severidade | Redução no pilar |
|------------|------------------|
| `leve`     | `0.5`            |
| `moderada` | `1.5`            |
| `grave`    | `2.5`            |

### 6.2 Mapeamento fase → pilar

| Fase da violação | Pilar penalizado |
|------------------|------------------|
| `preparar`       | P                |
| `analisar`       | A                |
| `cocriar`        | C                |
| `engajar`        | E                |
| (não informada)  | E                |

### 6.3 Cumulatividade e piso

- Penalidades são cumulativas. Se houver 2 violações leves na fase `analisar`, o pilar A sofre redução total de `1.0`.
- **Piso absoluto:** nenhum pilar pode ficar abaixo de `0.5`.
- O campo `reducao_aplicada` em `Violacoes[]` reflete a redução REAL, considerando o piso. Pode ser menor que o valor da tabela em casos extremos.

### 6.4 Cálculo da Media

`Media` = média aritmética de P, A, C, E **após** aplicar todas as penalidades, arredondada ao múltiplo de `0.5` mais próximo. Em caso de empate (ex: `6.75`), arredonda para cima (`7.0`). Mínimo absoluto: `0.5`.

## 7. Camada PACE transversal

A metodologia PACE é a coluna vertebral do sistema. Cada agente tem responsabilidade dentro dela.

- **Criador** — gera personagem com gabarito que recompensa execução PACE. Objeções profundas e benefícios ocultos premiam especificamente a etapa Analisar.
- **Cliente** — opera nas 4 fases PACE, controla o avanço por gatilhos observáveis. Personalidade DISC orienta como reage em cada fase. Pulo de fases pelo vendedor é tratado com redirecionamento no estilo do personagem. `fase_mudou` é fórmula mecânica: `(fase de output) != (fase_atual de entrada)`.
- **Moderador** — não avalia PACE diretamente. Backend etiqueta cada violação com a fase corrente da sessão (no momento da detecção).
- **Intenção** — distingue encerramento de SESSÃO de fechamento de VENDA (etapa Engajar do PACE).
- **Gerente** — avalia execução PACE com rubrica calibrada, contra o gabarito do Criador. Aplica penalidades via regra mecânica unificada (fase → pilar). Reporta descobertas com turno + citação. Estrutura violações em `Violacoes[]` para a UI poder renderizar cards individuais.

## 8. Mudanças vs. v2.1.0

### 8.1 Breaking changes

#### No Gerente

- **Sistema de penalidades unificado.** Antes leve/moderada reduziam pilar e grave reduzia `Media`. Agora TODAS reduzem o pilar, com piso de `0.5`. Backend que dependia da redução direta em `Media` precisa ser ajustado.
- **`Violacoes_registradas` (string) virou `Violacoes` (array estruturado).**

  ```json
  // Antes (v2.1.0):
  "Violacoes_registradas": "Violação leve no turno 4: linguagem rude."

  // Agora (v2.1.1):
  "Violacoes": [
    {
      "turno": 4,
      "fase": "analisar",
      "categoria": "linguagem_agressiva",
      "severidade": "leve",
      "motivo": "Linguagem rude na fala...",
      "pilar_penalizado": "A",
      "reducao_aplicada": 0.5
    }
  ]
  ```

- **`Resumo` não menciona mais violações.** Volta a ser puramente coaching. Frontend que dependia disso para mostrar violações precisa migrar para o card de `Violacoes[]`.
- **Renomeação:** `Violacoes_registradas` → `Violacoes`.

#### No Criador

- **`notas_cortes` do Nível 3 agora explicitamente definidas:** `negociacao_objecoes = 2.5`, `negociacao_preco = 1.0`. Antes ausentes; LLM improvisava.
- **`historia` agora tem rubrica explícita** (3 a 5 frases sobre trajetória profissional, foco em motivação para o comportamento de negociação).

### 8.2 Mudanças no contrato sem efeito no payload

- **Moderador não recebe mais `fase_atual`.** Simplificação. O backend já conhece a fase e enriquece o output do Moderador depois da chamada. Reduz acoplamento, economiza tokens. Backend que estava passando `fase_atual` ao Moderador deve parar de passar — a chamada agora tem apenas 1 parâmetro.

### 8.3 Mudanças comportamentais (mesmo payload, comportamento diferente)

- **Cliente:** após decisão em `engajar`, mantém a fase e continua respondendo no estilo. Não tenta "encerrar a conversa" — isso é responsabilidade do Intenção.
- **Cliente:** pulo de fases pelo vendedor é tratado com redirecionamento explícito no estilo DISC (não com entrega da informação futura).
- **Moderador e Intenção:** agora declaram explicitamente que detectam violação/intenção em qualquer idioma. Comportamento desejado já era esse, mas só agora está documentado.
- **Criador:** pesos dos benefícios ocultos devem variar (`0.20` a `0.40`), não fixar em `0.30`.

### 8.4 Sequência de deploy sugerida

1. **Backend primeiro**, com suporte aos formatos v2.1.0 e v2.1.1 (detecta pelo tipo de `Violacoes_registradas` vs `Violacoes`).
2. **Frontend** atualizado para consumir `Violacoes[]` estruturado.
3. **Moderador e Intenção** (mudanças puramente declarativas, baixo risco).
4. **Cliente** (mudanças comportamentais — teste em canary com casos pós-engajar e pulo de fases).
5. **Criador** (Nível 3 ganha `notas_cortes` definidas; pesos variados).
6. **Gerente por último** (mudança mais arriscada por causa do novo sistema de penalidades). Faça canary: 10% → 50% → 100%.
7. **Após 2 semanas estáveis**, remover suporte v2.1.0 do backend.

## 9. Loop futuro de aprendizado (não implementado nesta versão)

- Persistir histórico de avaliações por vendedor (`historico_avaliacoes[]`), indexado por pilar PACE.
- Passar histórico como entrada opcional ao **Criador** (`{{historico_avaliacoes}}`), gerando personagens que forcem pilares fracos.
- A entrada `{{tracos_anteriores}}` já preparada é o primeiro passo dessa direção.
- Painel de progresso temporal para vendedor e gestor humano.
- Citação real do diálogo aparecendo nas justificativas dos pilares (campo `citacao_dialogo` no output do Gerente).

## 10. Pontos abertos

- **Telemetria de qualidade dos prompts.** Como medir drift dos modelos ao longo do tempo? Sugestão: amostrar 5% das sessões para review humana mensal.
- **Idioma além de PT-BR para feedback.** O Cliente acompanha o idioma do vendedor; o Gerente sempre produz feedback em PT-BR. Para vendedores em outros mercados, isso precisará ser revisto.
- **Personagens recorrentes.** Hoje cada sessão tem personagem novo. No futuro, vale ter personagens recorrentes que "lembram" do vendedor entre sessões.
- **Multi-decisor.** Toda simulação tem 1 cliente. Vendas reais frequentemente têm comitê. Vale considerar simulações com 2-3 personagens simultaneamente — mudança grande de arquitetura.
