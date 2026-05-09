# Inventario do Legado

## Objetivo

Este documento consolida o funcionamento atual do simulador da RNaves com base nos exports do Typebot e na inspecao das bases do NocoDB. A intencao e servir como referencia unica para a migracao do sistema atual para a nova arquitetura, mantendo o sistema legado ativo durante a validacao do novo simulador.

## Escopo Atual

O sistema atual funciona como um treinamento de vendas com IA, dividido em quatro fluxos principais no Typebot:

1. `IA R Naves - Treinamento de Vendas`
2. `Criador`
3. `Cliente`
4. `Gerente`

Ha tambem dependencias em:

- `NocoDB` como banco operacional principal
- `OpenAI` para criacao de cenarios, simulacao, moderacao, intencao e relatorio
- `Make` para apoio ao processamento de audio
- `Google Sheets` para log analitico auxiliar
- `SMTP` para envio de codigo de autenticacao por e-mail

## Mapa dos Fluxos

### 1. IA R Naves - Treinamento de Vendas

Funcao principal:

- faz a entrada do usuario no sistema
- coleta `email`
- consulta NocoDB para localizar o usuario
- valida se o usuario existe
- controla acesso temporario e quantidade de creditos
- gera e envia codigo de autenticacao por e-mail
- valida o codigo digitado
- chama o fluxo `Criador`

Dados usados:

- `usuarios.email`
- `usuarios.nome`
- `usuarios.nivel`
- `usuarios.empresa`
- `Temporario`
- `Qtd_temporario`

Integracoes:

- `NocoDB`
- `SMTP`
- `Typebot link` para `Criador`

### 2. Criador

Funcao principal:

- consulta NocoDB com base no `CNPJ` da empresa
- busca o briefing da empresa
- gera o `bloco_dinamico` com OpenAI
- extrai do JSON os campos centrais do cenario
- salva o cenario no NocoDB
- chama o fluxo `Cliente`

Entradas principais:

- `emp_cnpj`
- `username`
- `userlevel`
- `briefing`

Saidas principais:

- `bloco_dinamico`
- `contexto_vendedor`
- `contexto_gerente`
- `session_id`

Integracoes:

- `NocoDB`
- `OpenAI`
- `Typebot link` para `Cliente`

### 3. Cliente

Funcao principal:

- recebe a mensagem do vendedor por texto ou audio
- transcreve audio com OpenAI
- chama Make para calcular ou enriquecer dados do audio
- monta o historico da conversa em `thread_completa`
- roda moderacao da fala do vendedor
- gera a resposta do cliente simulado
- detecta intencao de encerramento
- se necessario, oferece `Continuar` ou `Encerrar`
- chama o fluxo `Gerente` ao final

Entradas principais:

- `bloco_dinamico`
- `contexto_vendedor`
- `input_vendedor`
- `thread_completa`
- `url_audio`

Saidas principais:

- `resposta_cliente`
- `resposta_moderador`
- `resposta_intencao`
- contadores de tokens
- tempo de audio

Integracoes:

- `OpenAI`
- `Make`
- `Typebot link` para `Gerente`

### 4. Gerente

Funcao principal:

- coleta avaliacoes do usuario sobre a simulacao
- gera analise final da negociacao com OpenAI
- calcula custo operacional por modelo e por etapa
- registra dados auxiliares em Google Sheets
- grava relatorios e indicadores no NocoDB
- informa que o usuario recebera o relatorio por e-mail

Entradas principais:

- `thread_completa`
- contadores de tokens do `Criador`, `Cliente`, `Moderador`, `Intencao` e `Gerente`
- `contador_tempo_audio`
- `username`
- `usermail`
- `nome_empresa`
- `userlevel`

Saidas principais:

- notas PACE
- relatorio final
- media final
- custos por etapa
- feedback do usuario

Integracoes:

- `OpenAI`
- `Google Sheets`
- `NocoDB`

## Inventario de Prompts OpenAI

### Prompt: Criador

Objetivo:

- gerar um personagem cliente B2B e o `bloco_dinamico`

Modelo atual:

- `gpt-4o`

Entradas dinamicas:

- `briefing`
- `username`
- `userlevel`

Saida esperada:

- JSON com:
  - `contexto_vendedor`
  - `contexto_gerente`
  - `personagem`

Observacoes:

- e a origem da logica de negociacao e do personagem
- o `bloco_dinamico` e salvo no NocoDB e usado pelo `Cliente`

### Prompt: Cliente

Objetivo:

- simular o cliente em uma negociacao B2B, conduzindo o vendedor por fases

Modelo atual:

- `gpt-4o`

Entradas dinamicas:

- `bloco_dinamico`
- `historico`
- `input_vendedor`

Saida esperada:

- resposta textual do cliente simulado

Observacoes:

- e o coracao da experiencia
- possui regras rigidas de fases de negociacao, objecoes, preco e fechamento

### Prompt: Moderador

Objetivo:

- detectar violacoes de conduta na fala do vendedor

Modelo atual:

- `gpt-4.1-mini`

Entradas dinamicas:

- `input_vendedor`

Saida esperada:

- JSON com:
  - `status_moderator`
  - `motivo`

Observacoes:

- hoje faz controle de comportamento inadequado, flerte, agressividade e manipulacao

### Prompt: Intencao

Objetivo:

- detectar se o vendedor quer encerrar a conversa

Modelo atual:

- `gpt-4.1-mini`

Entradas dinamicas:

- `input_vendedor`
- `resposta_cliente`

Saida esperada:

- `intention_true` ou `intention_false`

Observacoes:

- controla o desvio para a etapa `Continuar` ou `Encerrar`

### Prompt: Gerente

Objetivo:

- avaliar a performance do vendedor e gerar relatorio final com metodologia PACE

Modelo atual:

- `gpt-5-mini`

Entradas dinamicas:

- `thread_completa`
- contexto da simulacao
- possiveis documentos auxiliares

Saida esperada:

- JSON valido com notas, justificativas, resumo e transcricao

Observacoes:

- e a peca principal do relatorio final
- abastece notas e relatorios persistidos no banco

## Estrutura de Dados Atual

### Tabela: `usuarios`

Campos observados:

- `usuarios.nome`
- `usuarios.nivel`
- `usuarios.email`
- `usuarios.empresa`
- `Temporario`
- `Qtd_temporario`

Papel:

- controle de acesso
- nivel do usuario
- empresa associada
- creditos temporarios

### Tabela: `Empresas-Briefing`

Campos observados:

- `emp-fantasia`
- `razao-social`
- `CNPJ`
- `Numero-Usuarios`
- `Briefing`

Papel:

- cadastro de empresas
- briefing base para gerar os cenarios

### Tabela: `Blocos Dinamicos`

Campos observados:

- `ID Session`
- `Id`
- `CreatedAt`
- `UpdatedAt`
- `Bloco Dinamico`
- `Email`

Papel:

- persistencia do cenario gerado pelo `Criador`
- associacao entre sessao, usuario e JSON do cenario

### Tabela: `Cliente-Interacoes`

Campos observados:

- `cliente.name`
- `user.mail`
- `cliente.prompt`
- `cliente.nota`
- `Created time`

Papel atual mais provavel:

- historico auxiliar de clientes ou prompts de simulacao
- precisa de confirmacao adicional para saber se e operacao viva ou legado de apoio

### Tabela: `Gerente-Relatorios`

Campos observados:

- `usuarios.email`
- `CreatedAt`
- `UpdatedAt`
- `nota.perguntas`
- `nota.analise`
- `nota.criatividade`
- `nota.engajamento`
- `nota.media`
- `gerente.relatorio`

Papel:

- persistencia do resultado final da simulacao
- notas consolidadas
- link para relatorio externo

### Tabela: `Feedbacks-Conversas`

Campos observados:

- `email`
- `nota.Realismo`
- `nota.Desafio`
- `nota.QualidadeInte`
- `nota.UtilidadeFed`
- `nota.ImpactoApre`
- `transcricao`
- `feedback.usuario`

Papel:

- avaliacao subjetiva do usuario sobre a experiencia

### Tabelas vistas mas ainda nao detalhadas

- `Ticket`
- `Custos-Openai`

## Integracoes Externas

### NocoDB

Uso atual:

- usuarios
- briefings
- cenarios gerados
- relatorios
- feedbacks

### OpenAI

Uso atual:

- transcricao
- criacao de personagem
- simulacao de cliente
- moderacao
- deteccao de intencao
- avaliacao do gerente

### Make

Uso atual observado:

- webhook chamado pelo fluxo `Cliente`
- recebe `url_audio`
- devolve `duracao_audio`

Observacao:

- aparentemente e uma dependencia secundaria no recorte atual

### Google Sheets

Uso atual observado:

- log auxiliar de tokens e custos por modelo/etapa

### SMTP

Uso atual observado:

- envio de codigo de autenticacao por e-mail

## Regras de Negocio Ja Confirmadas

- o sistema atual precisa autenticar o usuario por e-mail e codigo
- o usuario pertence a uma empresa
- a empresa define o briefing base do cenario
- o nivel do usuario influencia a complexidade do personagem
- cada simulacao gera um `bloco_dinamico`
- a simulacao possui moderacao
- a simulacao pode aceitar audio
- ao fim da simulacao existe um relatorio do gerente
- o usuario avalia a experiencia
- ha controle de custos de IA

## Riscos e Pontos de Atencao

- parte da logica hoje esta espalhada entre Typebot, NocoDB, Make e Google Sheets
- ha prompts longos e sensiveis que precisam ser versionados sem perda de comportamento
- o `bloco_dinamico` e uma dependencia critica
- a tabela `Cliente-Interacoes` ainda precisa de confirmacao funcional
- a tabela `Custos-Openai` ainda precisa de confirmacao estrutural
- o link de webhook do Make ja foi exposto e deve ser rotacionado em momento apropriado

## Decisao de Migracao

Estrutura aprovada:

- manter o simulador atual em producao
- construir um simulador novo em paralelo
- validar completamente o novo simulador antes de desligar o legado

## Proximo Passo

Desenhar a arquitetura do simulador novo com base neste inventario:

- modelo de dados no Supabase
- servicos do backend
- organizacao dos prompts no repositorio
- ordem de migracao por fases
