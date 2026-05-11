create table if not exists public.api_rate_limits (
  key text primary key,
  count integer not null,
  window_started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits(updated_at);

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_row public.api_rate_limits%rowtype;
begin
  loop
    select *
      into v_row
      from public.api_rate_limits
     where key = p_key
     for update;

    if not found then
      begin
        insert into public.api_rate_limits (key, count, window_started_at, updated_at)
        values (p_key, 1, v_now, v_now);

        return query
        select true, greatest(p_limit - 1, 0), v_now + v_window;
        return;
      exception
        when unique_violation then
          null;
      end;
    elsif v_row.window_started_at + v_window <= v_now then
      update public.api_rate_limits
         set count = 1,
             window_started_at = v_now,
             updated_at = v_now
       where key = p_key;

      return query
      select true, greatest(p_limit - 1, 0), v_now + v_window;
      return;
    elsif v_row.count >= p_limit then
      return query
      select false, 0, v_row.window_started_at + v_window;
      return;
    else
      update public.api_rate_limits
         set count = v_row.count + 1,
             updated_at = v_now
       where key = p_key;

      return query
      select true, greatest(p_limit - (v_row.count + 1), 0), v_row.window_started_at + v_window;
      return;
    end if;
  end loop;
end;
$$;
