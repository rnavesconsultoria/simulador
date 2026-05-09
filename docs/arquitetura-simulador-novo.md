# Arquitetura do Simulador Novo

## Objetivo

Construir um novo simulador da RNaves em paralelo ao sistema legado, mantendo o fluxo atual em operacao ate que a nova versao esteja totalmente validada.

O novo sistema deve substituir gradualmente:

- `Typebot`
- `NocoDB`
- `Make`
- partes auxiliares em `Google Sheets`

Mantendo:

- `OpenAI` como motor de IA
- `GitHub` como fonte de verdade do projeto
- `Looker` como camada analitica inicial, se necessario

## Principios de Arquitetura

1. O simulador atual continua ativo durante toda a construcao do novo.
2. O novo simulador tera banco, backend, frontend e logs separados do legado.
3. Toda chamada de IA sai do frontend e passa por backend proprio.
4. Prompts serao versionados no repositorio.
5. Cada sessao deve ser rastreavel do inicio ao fim.
6. O novo sistema deve permitir comparacao entre legado e nova versao.

## Estrutura Alvo

```text
Frontend Web
Vercel
-> autenticacao por e-mail
-> inicio da simulacao
-> chat da negociacao
-> tela de relatorio
-> tela de feedback

Backend
API/Functions
-> autenticacao por codigo
-> criacao de sessao
-> geracao de cenario
-> transcricao de audio
-> moderacao
-> resposta do cliente
-> deteccao de intencao
-> geracao de relatorio
-> calculo de custos
-> envio de e-mail

Banco
Supabase
-> dados operacionais
-> historico das sessoes
-> cenarios
-> relatorios
-> feedbacks
-> custos
-> logs
```

## Componentes

### Frontend

Responsabilidades:

- identificar usuario
- validar codigo enviado por e-mail
- iniciar nova sessao
- renderizar chat
- aceitar texto e audio
- exibir encerramento, relatorio e feedback

Tecnologia sugerida:

- `Next.js` na `Vercel`

Observacao:

- o frontend nao deve conhecer prompts nem chaves de API

### Backend

Responsabilidades:

- aplicar regras do negocio
- montar contexto para os prompts
- chamar OpenAI
- persistir todas as etapas no banco
- controlar creditos do usuario
- enviar e-mail de autenticacao
- calcular custos operacionais

Tecnologia sugerida:

- `Next.js Route Handlers` ou `Supabase Edge Functions`

Escolha recomendada:

- usar `Next.js` para a API principal
- usar `Supabase` para persistencia e tarefas orientadas a banco

### Banco de Dados

Responsabilidades:

- guardar usuarios, empresas, briefings e sessoes
- guardar cenarios gerados e relatorios finais
- armazenar feedbacks e custos
- permitir auditoria e analise posterior

Tecnologia sugerida:

- `Supabase Postgres`

## Modelo de Dados

### `companies`

Representa as empresas contratantes.

Campos:

- `id`
- `trade_name`
- `legal_name`
- `cnpj`
- `user_limit`
- `briefing_markdown`
- `created_at`
- `updated_at`

Origem no legado:

- `Empresas-Briefing`

### `users`

Representa os usuarios autorizados a usar o simulador.

Campos:

- `id`
- `company_id`
- `name`
- `email`
- `level`
- `temporary_access`
- `temporary_credits`
- `is_active`
- `created_at`
- `updated_at`

Origem no legado:

- `usuarios`

### `access_codes`

Representa os codigos de autenticacao enviados por e-mail.

Campos:

- `id`
- `user_id`
- `code_hash`
- `expires_at`
- `used_at`
- `created_at`

Observacao:

- esta tabela nao existe explicitamente no legado, mas passa a existir no novo desenho

### `scenarios`

Representa o cenario gerado pelo antigo `Criador`.

Campos:

- `id`
- `session_key`
- `user_id`
- `company_id`
- `seller_context`
- `manager_context`
- `dynamic_block_json`
- `prompt_version`
- `created_at`
- `updated_at`

Origem no legado:

- `Blocos Dinamicos`

### `simulation_sessions`

Representa a sessao operacional da simulacao.

Campos:

- `id`
- `session_key`
- `user_id`
- `company_id`
- `scenario_id`
- `status`
- `started_at`
- `finished_at`
- `legacy_reference`
- `created_at`
- `updated_at`

Status sugeridos:

- `created`
- `authenticated`
- `scenario_ready`
- `in_progress`
- `completed`
- `failed`

### `session_messages`

Representa cada mensagem ou evento da conversa.

Campos:

- `id`
- `session_id`
- `role`
- `actor`
- `message_type`
- `content`
- `audio_url`
- `audio_duration_seconds`
- `transcript`
- `moderation_flag`
- `moderation_reason`
- `intent_result`
- `created_at`

Observacao:

- no novo sistema esta tabela passa a ser a trilha oficial da simulacao

### `reports`

Representa o relatorio final do gerente.

Campos:

- `id`
- `session_id`
- `user_id`
- `questions_score`
- `analysis_score`
- `creativity_score`
- `engagement_score`
- `average_score`
- `report_json`
- `report_url`
- `prompt_version`
- `created_at`
- `updated_at`

Origem no legado:

- `Gerente-Relatorios`

### `feedbacks`

Representa a avaliacao do usuario sobre a experiencia.

Campos:

- `id`
- `session_id`
- `user_id`
- `realism_score`
- `challenge_score`
- `interaction_quality_score`
- `feedback_utility_score`
- `learning_impact_score`
- `transcript_snapshot`
- `user_feedback`
- `created_at`

Origem no legado:

- `Feedbacks-Conversas`

### `openai_costs`

Representa o custo operacional por etapa da simulacao.

Campos:

- `id`
- `session_id`
- `stage`
- `model`
- `input_tokens`
- `output_tokens`
- `input_cost`
- `output_cost`
- `total_cost`
- `created_at`

Origem no legado:

- `Custos-Openai`
- registros auxiliares no `Google Sheets`

### `support_tickets`

Representa solicitacoes de suporte ou incidentes.

Campos:

- `id`
- `user_id`
- `session_id`
- `subject`
- `status`
- `details`
- `created_at`
- `updated_at`

Origem provavel no legado:

- `Ticket`

## Servicos de Backend

### 1. Autenticacao

Responsabilidades:

- localizar usuario por e-mail
- verificar se esta ativo
- checar creditos temporarios
- gerar codigo
- enviar codigo por e-mail
- validar codigo

Entradas:

- `email`
- `code`

Saidas:

- sessao autenticada

### 2. Geracao de Cenario

Responsabilidades:

- buscar empresa do usuario
- carregar briefing
- executar prompt `Criador`
- validar JSON retornado
- salvar `scenario`

Entradas:

- `user_id`
- `company_id`
- `level`

Saidas:

- `scenario_id`
- `dynamic_block_json`

### 3. Chat da Simulacao

Responsabilidades:

- receber texto ou audio
- transcrever audio
- registrar mensagem do vendedor
- rodar moderacao
- gerar resposta do cliente
- detectar intencao
- salvar todos os eventos

Entradas:

- `session_id`
- `message`
- `audio`

Saidas:

- resposta do cliente
- sinalizacao de encerramento

### 4. Geracao de Relatorio

Responsabilidades:

- consolidar `thread`
- executar prompt `Gerente`
- validar JSON retornado
- salvar relatorio
- armazenar link externo se existir

Entradas:

- `session_id`

Saidas:

- relatorio final
- notas consolidadas

### 5. Custos e Telemetria

Responsabilidades:

- registrar tokens por chamada
- calcular custo por modelo
- calcular custo total da sessao

Entradas:

- dados de uso retornados pela OpenAI

Saidas:

- registros em `openai_costs`

### 6. Feedback Final

Responsabilidades:

- receber notas finais do usuario
- salvar feedback textual

Entradas:

- formulario de feedback

Saidas:

- registro em `feedbacks`

## Organizacao de Prompts

Estrutura sugerida:

```text
prompts/
  criador.md
  cliente.md
  moderador.md
  intencao.md
  gerente.md
```

Cada prompt deve ter:

- objetivo
- modelo sugerido
- entradas dinamicas
- contrato de saida
- versao

Campos minimos de controle:

- `prompt_name`
- `prompt_version`
- `model`
- `expected_output`

## Contratos de API

### `POST /api/auth/request-code`

Funcao:

- recebe e-mail
- valida usuario
- envia codigo

### `POST /api/auth/verify-code`

Funcao:

- valida codigo
- cria sessao autenticada

### `POST /api/simulations`

Funcao:

- cria nova simulacao
- gera scenario

### `POST /api/simulations/:id/messages`

Funcao:

- recebe mensagem do vendedor
- processa chat completo

### `POST /api/simulations/:id/report`

Funcao:

- gera relatorio final

### `POST /api/simulations/:id/feedback`

Funcao:

- grava feedback do usuario

### `GET /api/simulations/:id`

Funcao:

- consulta status e resumo da simulacao

## Estrategia de Migracao

### Fase 1. Fundacao

- criar repositorio do novo simulador
- criar projeto Supabase
- criar projeto Vercel
- modelar banco
- extrair prompts do legado

### Fase 2. Nucleo

- implementar autenticacao por e-mail
- implementar geracao de scenario
- implementar chat com `Cliente`, `Moderador` e `Intencao`

### Fase 3. Encerramento

- implementar relatorio `Gerente`
- implementar calculo de custos
- implementar feedback final

### Fase 4. Validacao Paralela

- liberar o novo simulador para uso interno
- comparar resultados com o legado
- ajustar prompts, modelos e regras

### Fase 5. Virada Controlada

- liberar para grupo piloto
- acompanhar qualidade
- migrar trafego gradualmente
- desligar legado apenas apos aceite final

## Criterios de Validacao

O novo simulador sera considerado apto quando:

- autenticar usuarios corretamente
- gerar cenarios equivalentes ou melhores
- manter a qualidade da conversa
- moderar corretamente
- detectar encerramento corretamente
- gerar relatorio final coerente
- registrar custos por sessao
- coletar feedback sem perda de dados

## Proximo Passo

Criar o schema inicial do Supabase com base neste documento.
