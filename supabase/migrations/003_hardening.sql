alter table public.access_codes
  add column if not exists attempts integer not null default 0;

create index if not exists access_codes_user_unused_idx
  on public.access_codes (user_id)
  where used_at is null;

alter table public.simulation_sessions
  add column if not exists current_phase text;

alter table public.simulation_sessions
  drop constraint if exists simulation_sessions_status_check;

alter table public.simulation_sessions
  add constraint simulation_sessions_status_check
  check (
    status in (
      'created',
      'scenario_ready',
      'in_progress',
      'completed',
      'failed'
    )
  );

alter table public.simulation_sessions
  drop constraint if exists simulation_sessions_current_phase_check;

alter table public.simulation_sessions
  add constraint simulation_sessions_current_phase_check
  check (
    current_phase is null or current_phase in (
      'abertura',
      'objecoes',
      'preco',
      'fechamento'
    )
  );
