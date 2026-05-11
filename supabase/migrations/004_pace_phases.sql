-- Migrate simulation_sessions.current_phase to PACE phase names.
-- Old: abertura / objecoes / preco / fechamento
-- New: preparar / analisar / cocriar / engajar

alter table public.simulation_sessions
  drop constraint if exists simulation_sessions_current_phase_check;

update public.simulation_sessions
  set current_phase = case current_phase
    when 'abertura' then 'preparar'
    when 'objecoes' then 'analisar'
    when 'preco' then 'cocriar'
    when 'fechamento' then 'engajar'
    else current_phase
  end
  where current_phase in ('abertura', 'objecoes', 'preco', 'fechamento');

alter table public.simulation_sessions
  add constraint simulation_sessions_current_phase_check
  check (
    current_phase is null or current_phase in (
      'preparar',
      'analisar',
      'cocriar',
      'engajar'
    )
  );
