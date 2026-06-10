-- Regresjonstest for tasks_v17: auth på tavle-skriving + invitasjonskode. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_authed_writes.sql
begin;

do $$
declare inv text; tid uuid; r public.tasks;
begin
  select value into inv from public.app_config where key='invite_code';

  -- 1) Registrering uten/med feil invitasjonskode skal feile
  begin
    perform public.register_account('ZZA1','Test','Deltid','#004595','test1234','feil-kode');
    raise exception 'FAIL: registrering uten gyldig invitasjonskode';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%invitasjonskode%' then raise exception 'FAIL: uventet feil: %', sqlerrm; end if;
  end;

  -- 2) Med riktig kode skal det virke
  perform public.register_account('ZZA1','Test','Deltid','#004595','test1234', inv);

  -- 3) set_status krever gyldig konto
  insert into public.tasks (title) values ('testoppgave-v17') returning id into tid;
  begin
    r := public.set_status('ZZA1','feilpassord', tid, 'done');
    raise exception 'FAIL: set_status med feil passord gikk gjennom';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  r := public.set_status('ZZA1','test1234', tid, 'done');
  if r.status <> 'done' or r.done <> true then raise exception 'FAIL: set_status satte ikke status'; end if;

  -- 4) toggle_check krever gyldig konto
  update public.tasks set notes = '- [ ] punkt en' where id = tid;
  r := public.toggle_check('ZZA1','test1234', tid, 0);
  if r.notes not like '%[x]%' then raise exception 'FAIL: toggle_check virket ikke'; end if;

  -- 5) De gamle åpne funksjonene skal være borte
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and (
               (p.proname='set_status'   and pg_get_function_identity_arguments(p.oid)='p_id uuid, p_status text') or
               (p.proname='toggle_check' and pg_get_function_identity_arguments(p.oid)='p_id uuid, p_ci integer') or
               p.proname='set_done' or
               (p.proname='complete_task' and pg_get_function_identity_arguments(p.oid) like 'p_passcode%'))) then
    raise exception 'FAIL: gamle åpne funksjoner finnes fortsatt';
  end if;

  raise notice 'OK: auth-gating og invitasjonskode virker';
end $$;

rollback;
