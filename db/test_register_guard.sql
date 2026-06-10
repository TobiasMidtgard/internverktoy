-- Regresjonstest for tasks_v15: register_account skal nekte claim av privilegerte rader.
-- Kjøres trygt mot prod: alt skjer i én transaksjon som rulles tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_register_guard.sql
begin;

insert into public.coworkers (tag,name,color,title,role)
values ('ZZT1','Test Privilegert','#004595','Butikksjef','manager'),
       ('ZZT2','Test Vanlig','#004595','Deltid','coworker');

do $$
begin
  -- 1) Claim av privilegert passordløs rad skal feile
  begin
    perform public.register_account('ZZT1','Angriper','Deltid','#000000','hack');
    raise exception 'FAIL: privilegert rad kunne claimes';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%aktiveres av IT%' then
      raise exception 'FAIL: uventet feilmelding ved privilegert claim: %', sqlerrm;
    end if;
  end;
  if exists (select 1 from public.coworkers where tag='ZZT1' and pass_hash is not null) then
    raise exception 'FAIL: ZZT1 fikk passord satt likevel';
  end if;

  -- 2) Claim av vanlig passordløs rad skal fortsatt virke (onboarding-flyten)
  perform public.register_account('ZZT2','Vanlig Ansatt','Deltid','#004595','test1234');
  if not exists (select 1 from public.coworkers where tag='ZZT2' and pass_hash is not null and role='coworker') then
    raise exception 'FAIL: vanlig claim virket ikke';
  end if;

  -- 3) Helt ny konto skal alltid bli coworker
  perform public.register_account('ZZT3','Ny Ansatt','Deltid','#004595','test1234');
  if not exists (select 1 from public.coworkers where tag='ZZT3' and role='coworker') then
    raise exception 'FAIL: ny konto fikk ikke rollen coworker';
  end if;

  raise notice 'OK: register_account-guard virker som forventet';
end $$;

rollback;
