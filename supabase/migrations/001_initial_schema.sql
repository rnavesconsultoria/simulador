create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  trade_name text not null,
  legal_name text,
  cnpj text not null unique,
  user_limit integer,
  briefing_markdown text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  email text not null unique,
  level smallint not null check (level between 1 and 3),
  temporary_access boolean not null default false,
  temporary_credits integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_name text not null,
  version text not null,
  model text not null,
  expected_output text,
  source_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (prompt_name, version)
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  seller_context text,
  manager_context text,
  dynamic_block_json jsonb not null,
  prompt_version_id uuid references public.prompt_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  status text not null check (
    status in (
      'created',
      'authenticated',
      'scenario_ready',
      'in_progress',
      'completed',
      'failed'
    )
  ),
  legacy_reference text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  role text not null check (role in ('system', 'assistant', 'user', 'tool')),
  actor text not null check (
    actor in (
      'vendor',
      'client',
      'moderator',
      'intent',
      'manager',
      'system'
    )
  ),
  message_type text not null check (message_type in ('text', 'audio', 'event')),
  content text,
  audio_url text,
  audio_duration_seconds numeric(10, 2),
  transcript text,
  moderation_flag boolean,
  moderation_reason text,
  intent_result text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.simulation_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  questions_score numeric(4, 2),
  analysis_score numeric(4, 2),
  creativity_score numeric(4, 2),
  engagement_score numeric(4, 2),
  average_score numeric(4, 2),
  report_json jsonb,
  report_summary text,
  report_url text,
  prompt_version_id uuid references public.prompt_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.simulation_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  realism_score smallint check (realism_score between 1 and 5),
  challenge_score smallint check (challenge_score between 1 and 5),
  interaction_quality_score smallint check (interaction_quality_score between 1 and 5),
  feedback_utility_score smallint check (feedback_utility_score between 1 and 5),
  learning_impact_score smallint check (learning_impact_score between 1 and 5),
  transcript_snapshot text,
  user_feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.openai_costs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  stage text not null check (
    stage in (
      'transcription',
      'creator',
      'moderator',
      'client',
      'intent',
      'manager'
    )
  ),
  model text not null,
  input_tokens integer,
  output_tokens integer,
  input_cost numeric(12, 6),
  output_cost numeric(12, 6),
  total_cost numeric(12, 6),
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  session_id uuid references public.simulation_sessions(id) on delete set null,
  subject text not null,
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'resolved', 'closed')
  ),
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

drop trigger if exists simulation_sessions_set_updated_at on public.simulation_sessions;
create trigger simulation_sessions_set_updated_at
before update on public.simulation_sessions
for each row execute function public.set_updated_at();

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

create index if not exists companies_cnpj_idx on public.companies(cnpj);
create index if not exists users_company_id_idx on public.users(company_id);
create index if not exists users_email_idx on public.users(email);
create index if not exists access_codes_user_id_idx on public.access_codes(user_id);
create index if not exists access_codes_expires_at_idx on public.access_codes(expires_at);
create index if not exists scenarios_user_id_idx on public.scenarios(user_id);
create index if not exists scenarios_company_id_idx on public.scenarios(company_id);
create index if not exists simulation_sessions_user_id_idx on public.simulation_sessions(user_id);
create index if not exists simulation_sessions_company_id_idx on public.simulation_sessions(company_id);
create index if not exists simulation_sessions_status_idx on public.simulation_sessions(status);
create index if not exists session_messages_session_id_idx on public.session_messages(session_id);
create index if not exists session_messages_actor_idx on public.session_messages(actor);
create index if not exists reports_user_id_idx on public.reports(user_id);
create index if not exists feedbacks_user_id_idx on public.feedbacks(user_id);
create index if not exists openai_costs_session_id_idx on public.openai_costs(session_id);
create index if not exists openai_costs_stage_idx on public.openai_costs(stage);
create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
