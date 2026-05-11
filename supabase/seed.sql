begin;

insert into public.companies (
  trade_name,
  legal_name,
  cnpj,
  user_limit,
  briefing_markdown,
  is_active
)
values
  (
    'RNaves',
    'R Naves Consultoria',
    '56149613000140',
    10,
    '# Briefing RNaves\n\nBriefing inicial pendente de revisao e importacao completa do legado.',
    true
  ),
  (
    'Acaia',
    'Acaia Saude Ambiental',
    '06317642000103',
    10,
    '# Briefing Acaia\n\nBriefing inicial pendente de revisao e importacao completa do legado.',
    true
  ),
  (
    'Brinks',
    'Brinks - Carros Fortes',
    '60860087001251',
    10,
    '# Briefing Brinks\n\nBriefing inicial pendente de revisao e importacao completa do legado.',
    true
  ),
  (
    'FMC',
    'FMC',
    '00000000000000',
    10,
    '# Briefing FMC\n\nBriefing inicial pendente de revisao e importacao completa do legado.',
    true
  )
on conflict (cnpj) do update
set
  trade_name = excluded.trade_name,
  legal_name = excluded.legal_name,
  user_limit = excluded.user_limit,
  briefing_markdown = excluded.briefing_markdown,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.users (
  company_id,
  name,
  email,
  level,
  temporary_access,
  temporary_credits,
  is_active
)
values
  (
    (select id from public.companies where cnpj = '56149613000140'),
    'RNaves Junior',
    'rnaves_junior@rnavesconsultoria.com.br',
    1,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '56149613000140'),
    'RNaves Pleno',
    'rnaves_pleno@rnavesconsultoria.com.br',
    2,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '56149613000140'),
    'RNaves Senior',
    'rnaves_senior@rnavesconsultoria.com.br',
    3,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '06317642000103'),
    'Acaia Junior',
    'acaia_junior@rnavesconsultoria.com.br',
    1,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '06317642000103'),
    'Acaia Pleno',
    'acaia_pleno@rnavesconsultoria.com.br',
    2,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '06317642000103'),
    'Acaia Senior',
    'acaia_senior@rnavesconsultoria.com.br',
    3,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '60860087001251'),
    'Brinks Junior',
    'brinks_junior@rnavesconsultoria.com.br',
    1,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '60860087001251'),
    'Brinks Pleno',
    'brinks_pleno@rnavesconsultoria.com.br',
    2,
    false,
    10,
    true
  ),
  (
    (select id from public.companies where cnpj = '60860087001251'),
    'Brinks Senior',
    'brinks_senior@rnavesconsultoria.com.br',
    3,
    false,
    10,
    true
  )
on conflict (email) do update
set
  company_id = excluded.company_id,
  name = excluded.name,
  level = excluded.level,
  temporary_access = excluded.temporary_access,
  temporary_credits = excluded.temporary_credits,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.prompt_versions (
  prompt_name,
  version,
  model,
  expected_output,
  source_path,
  is_active
)
values
  (
    'criador',
    '2.1.0',
    'gpt-5.4-2026-03-05',
    'json',
    'prompts/criador.md',
    true
  ),
  (
    'cliente',
    '2.1.0',
    'gpt-5.4-2026-03-05',
    'text',
    'prompts/cliente.md',
    true
  ),
  (
    'moderador',
    '2.1.0',
    'gpt-5.4-mini-2026-03-17',
    'json',
    'prompts/moderador.md',
    true
  ),
  (
    'intencao',
    '2.1.0',
    'gpt-5.4-mini-2026-03-17',
    'text',
    'prompts/intencao.md',
    true
  ),
  (
    'gerente',
    '2.1.0',
    'gpt-5.4-2026-03-05',
    'json',
    'prompts/gerente.md',
    true
  )
on conflict (prompt_name, version) do update
set
  model = excluded.model,
  expected_output = excluded.expected_output,
  source_path = excluded.source_path,
  is_active = excluded.is_active;

commit;
