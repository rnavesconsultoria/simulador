# Deploy na Vercel

## Objetivo

Publicar o novo simulador em um ambiente separado do site institucional, mantendo o legado ativo durante a validacao.

Sequencia recomendada:

1. publicar primeiro no dominio da Vercel
2. validar internamente
3. apontar o subdominio oficial
4. trocar o botao do site so depois da aprovacao final

## Projeto sugerido

- nome do projeto: `simulador-rnaves`
- dominio temporario: `simulador-rnaves.vercel.app`
- subdominio final sugerido: `simulador.rnavesconsultoria.com.br`

## Comando local

```bash
npm run build
```

Se o build passar localmente, a base do deploy esta pronta.

## Variaveis de ambiente

Cadastrar na Vercel:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
OPENAI_API_KEY=
OPENAI_MODEL_CRIADOR=gpt-5.4-2026-03-05
OPENAI_MODEL_CLIENTE=gpt-4o
OPENAI_MODEL_MODERADOR=gpt-4.1-mini
OPENAI_MODEL_INTENCAO=gpt-4.1-mini
OPENAI_MODEL_GERENTE=gpt-5-mini
APP_SESSION_SECRET=
APP_SESSION_TTL_HOURS=24
AUTH_CODE_TTL_MINUTES=15
APP_BASE_URL=https://simulador-rnaves.vercel.app
```

Depois que o subdominio oficial estiver ativo, atualizar:

```env
APP_BASE_URL=https://simulador.rnavesconsultoria.com.br
```

## Checklist antes do deploy

- `npm install` executado com sucesso
- `npm run dev` abrindo a interface
- fluxo completo validado:
  - pedir codigo
  - validar codigo
  - criar simulacao
  - enviar mensagem
  - gerar relatorio
  - salvar feedback
- migrations do Supabase aplicadas

## Checklist depois do deploy

- homepage carregando normalmente
- `GET /api/health` retornando `ok: true`
- login por email funcionando
- criacao de simulacao persistindo no Supabase
- conversa respondendo com OpenAI
- relatorio sendo salvo
- feedback sendo salvo

## Rollout sugerido

1. uso interno pela equipe RNaves
2. grupo pequeno de validacao
3. ajustes de UX e regras
4. troca gradual do acesso principal

