-- Thansen Verktøykasse · Tasks v24 — opprydding av gamle data (1000-raders-taket)
-- Audit 2026-06-09, punkt 12 (P1): alle henting skjer uten limit og PostgREST kutter
-- stille på 1000 rader — etter et år med ferdige oppgaver ville tavla «mistet» oppgaver
-- uten feilmelding. Klienten paginerer nå (fetchAll), og serveren rydder:
-- ferdige engangsoppgaver og staff_status eldre enn 60 dager + utløpte sesjoner.

create or replace function public.prune_old_data()
returns integer language plpgsql security definer set search_path = public as $$
declare n int := 0; m int;
begin
  -- ferdige engangsoppgaver eldre enn 60 dager (gjentakende beholdes alltid)
  delete from public.tasks
   where recur_unit = 'none' and status = 'done'
     and coalesce(last_done_at, created_at) < now() - interval '60 days';
  get diagnostics m = row_count; n := n + m;

  -- vaktstatus eldre enn 60 dager
  delete from public.staff_status
   where day < (now() at time zone 'Europe/Oslo')::date - 60;
  get diagnostics m = row_count; n := n + m;

  -- utløpte sesjoner
  delete from public.sessions where expires_at < now();
  get diagnostics m = row_count; n := n + m;

  return n;
end $$;

do $$ begin perform cron.unschedule('prune-old-data'); exception when others then null; end $$;
select cron.schedule('prune-old-data', '15 2 * * *', 'select public.prune_old_data();');
