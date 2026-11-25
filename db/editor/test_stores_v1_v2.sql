-- Tilgangstestene etter stores_v1 + stores_v2. Rulles tilbake; skal ende med to «OK»-meldinger.
-- Regresjonstest for stores_v1: butikktilgang håndheves i databasen. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_stores.sql
-- Kontoer: ZZDV (dev), ZZM1 (butikksjef i A), ZZC1 (medarbeider i A). Butikker: zz-a, zz-b.
begin;

insert into public.stores (id, name, invite_code) values ('zz-a','Test A','zz-inv-a'), ('zz-b','Test B','zz-inv-b');
insert into public.coworkers (tag,name,role,pass_hash) values
  ('ZZDV','Test dev','dev',      extensions.crypt('pw-dev', extensions.gen_salt('bf'))),
  ('ZZM1','Test sjef','manager', extensions.crypt('pw-m1',  extensions.gen_salt('bf'))),
  ('ZZC1','Test ansatt','coworker', extensions.crypt('pw-c1', extensions.gen_salt('bf')));
insert into public.store_members (store_id, tag) values ('zz-a','ZZM1'), ('zz-a','ZZC1');

do $$
declare ta uuid; tb uuid; ba uuid; bb uuid; n int; r jsonb; s text;
begin
  -- 1) Butikkvelgeren: medlem ser sine butikker, dev ser alle, ikke-innlogget ser alle (kun visning)
  select count(*) into n from public.list_stores('ZZC1','pw-c1') where id like 'zz-%';
  if n <> 1 then raise exception 'FAIL: ZZC1 skulle se 1 testbutikk, så %', n; end if;
  select count(*) into n from public.list_stores('ZZDV','pw-dev') where id like 'zz-%';
  if n <> 2 then raise exception 'FAIL: dev skulle se begge testbutikkene, så %', n; end if;
  begin
    perform public.list_stores('ZZC1','feil');
    raise exception 'FAIL: list_stores med feil passord';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- 2) Oppgaver: sjef i A kan opprette i A, ikke i B. Dev kan begge.
  ta := (public.add_task('ZZM1','pw-m1','zz-a','{"title":"zz oppgave A"}'::jsonb)).id;
  begin
    perform public.add_task('ZZM1','pw-m1','zz-b','{"title":"zz oppgave B"}'::jsonb);
    raise exception 'FAIL: sjef i A opprettet oppgave i B';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%tilgang til denne butikken%' then raise exception 'FAIL: uventet feil: %', sqlerrm; end if;
  end;
  tb := (public.add_task('ZZDV','pw-dev','zz-b','{"title":"zz oppgave B"}'::jsonb)).id;
  if (select store_id from public.tasks where id = tb) <> 'zz-b' then raise exception 'FAIL: oppgave havnet i feil butikk'; end if;

  -- 3) Endring på eksisterende rader følger radens butikk, ikke noe klienten sender
  perform public.set_status('ZZC1','pw-c1', ta, 'done');
  begin
    perform public.set_status('ZZC1','pw-c1', tb, 'done');
    raise exception 'FAIL: ansatt i A endret status i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.update_task('ZZM1','pw-m1', tb, '{"title":"kapret"}'::jsonb);
    raise exception 'FAIL: sjef i A endret oppgave i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.toggle_check('ZZC1','pw-c1', tb, 0);
    raise exception 'FAIL: ansatt i A krysset av i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.set_day_assignees('ZZM1','pw-m1', tb, current_date, '["ZZM1"]'::jsonb);
    raise exception 'FAIL: sjef i A fordelte oppgave i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.delete_task('ZZM1','pw-m1', tb); exception when others then null; end;
  if not exists (select 1 from public.tasks where id = tb) then raise exception 'FAIL: sjef i A slettet oppgave i B'; end if;

  -- 4) Ansatte og fravær
  r := public.get_people('ZZC1','pw-c1','zz-a');
  if jsonb_array_length(r->'coworkers') <> 2 then raise exception 'FAIL: get_people A skulle gi 2 ansatte, ga %', jsonb_array_length(r->'coworkers'); end if;
  begin
    perform public.get_people('ZZM1','pw-m1','zz-b');
    raise exception 'FAIL: sjef i A leste ansatte i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.set_staff_status('ZZC1','pw-c1','zz-a','ZZC1','syk', current_date, null, null);
  begin
    perform public.set_staff_status('ZZC1','pw-c1','zz-b','ZZC1','syk', current_date, null, null);
    raise exception 'FAIL: ansatt i A satte status i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- 5) Forvaltning av ansatte er butikkavgrenset
  perform public.add_coworker('ZZDV','pw-dev','zz-b','ZZC2','Ansatt B','#004595','Deltid');
  begin
    perform public.reset_password('ZZM1','pw-m1','ZZC2','nytt-pw');
    raise exception 'FAIL: sjef i A nullstilte passord for ansatt i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.update_coworker('ZZM1','pw-m1','ZZC2','Kapret',null,null);
    raise exception 'FAIL: sjef i A endret ansatt i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.add_store_member('ZZM1','pw-m1','zz-b','ZZM1');
    raise exception 'FAIL: sjef i A meldte seg selv inn i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- dev legger sjefen til B → nå har sjefen B i velgeren og kan skrive der
  perform public.add_store_member('ZZDV','pw-dev','zz-b','ZZM1');
  select count(*) into n from public.list_stores('ZZM1','pw-m1') where id like 'zz-%';
  if n <> 2 then raise exception 'FAIL: sjefen skulle nå se 2 butikker, så %', n; end if;
  perform public.update_task('ZZM1','pw-m1', tb, '{"title":"ok nå"}'::jsonb);
  -- å fjerne en ansatt fra én butikk sletter ikke kontoen så lenge den står i en annen
  perform public.delete_coworker('ZZDV','pw-dev','zz-b','ZZM1');
  if not exists (select 1 from public.coworkers where tag = 'ZZM1') then raise exception 'FAIL: konto slettet selv om den står i A'; end if;
  perform public.delete_coworker('ZZDV','pw-dev','zz-b','ZZC2');
  if exists (select 1 from public.coworkers where tag = 'ZZC2') then raise exception 'FAIL: konto uten butikk ble ikke slettet'; end if;

  -- 6) Registrering med butikkens invitasjonskode gir medlemskap i akkurat den butikken
  perform public.register_account('ZZR1','Ny','Deltid','#004595','pw-r1','zz-inv-b');
  if not exists (select 1 from public.store_members where tag='ZZR1' and store_id='zz-b')
     or exists (select 1 from public.store_members where tag='ZZR1' and store_id<>'zz-b') then
    raise exception 'FAIL: registrering ga feil butikkmedlemskap';
  end if;
  begin
    perform public.set_invite_code('ZZM1','pw-m1','zz-b','zz-ny-kode');
    raise exception 'FAIL: sjef i A byttet invitasjonskode i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- 7) Velodex
  ba := (public.add_bike('ZZC1','pw-c1','zz-a','{"name":"zz sykkel A","frame":"1"}'::jsonb)).uid;
  bb := (public.add_bike('ZZDV','pw-dev','zz-b','{"name":"zz sykkel B","frame":"2"}'::jsonb)).uid;
  perform public.update_bike('ZZC1','pw-c1', ba, '{"x":10}'::jsonb);
  begin
    perform public.update_bike('ZZC1','pw-c1', bb, '{"x":10}'::jsonb);
    raise exception 'FAIL: ansatt i A flyttet sykkel i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.clone_bike('ZZC1','pw-c1', bb, 'x');
    raise exception 'FAIL: ansatt i A dupliserte sykkel i B';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.delete_bike('ZZC1','pw-c1', bb); exception when others then null; end;
  if not exists (select 1 from public.bikes where uid = bb) then raise exception 'FAIL: ansatt i A slettet sykkel i B'; end if;
  if (select store_id from public.bikes where uid = (public.clone_bike('ZZC1','pw-c1', ba, 'k')).uid) <> 'zz-a' then
    raise exception 'FAIL: kopi havnet i feil butikk';
  end if;
  if exists (select 1 from pg_proc where proname = 'verify_passcode' and pronamespace = 'public'::regnamespace) then
    raise exception 'FAIL: felles redigeringskode finnes fortsatt';
  end if;

  -- 8) Importen legger hvert Thansen-produkt inn én gang per butikk
  perform public.import_thansen_bike('{"source_id":"zz-999","name":"zz import","item_number":"1"}'::jsonb);
  select count(*) into n from public.bikes where source='thansen' and source_id='zz-999' and store_id in ('zz-a','zz-b');
  if n <> 2 then raise exception 'FAIL: import skulle gi én rad per testbutikk, ga %', n; end if;
  perform public.import_thansen_bike('{"source_id":"zz-999","name":"zz import v2","item_number":"1"}'::jsonb);
  select count(*) into n from public.bikes where source_id='zz-999';
  if n <> (select count(*) from public.stores) then raise exception 'FAIL: re-import duplisert (% rader)', n; end if;

  -- 9) Ingen gammel (butikkløs) signatur ligger igjen som bakdør
  select string_agg(p.oid::regprocedure::text, ', ') into s from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.oid::regprocedure::text in (
       'add_task(text,text,jsonb)', 'get_people(text,text)', 'add_planner_note(text,text,integer,text,text)',
       'set_staff_status(text,text,text,text,date,integer,integer)', 'set_staff_status_range(text,text,text,text,date,date)',
       'add_coworker(text,text,text,text,text,text)', 'delete_coworker(text,text,text)', 'set_invite_code(text,text,text)',
       'add_bike(text,jsonb)', 'update_bike(text,uuid,jsonb)', 'delete_bike(text,uuid)', 'clone_bike(text,uuid,text)');
  if s is not null then raise exception 'FAIL: gamle signaturer finnes fortsatt: %', s; end if;

  raise notice 'OK: butikktilgang håndheves (stores_v1)';
end $$;

rollback;

-- Regresjonstest for stores_v2: automatisk plassering av sykler på lager. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_auto_place.sql
begin;

insert into public.stores (id, name, thansen_store_id) values ('zz-auto','Test auto','T900'), ('zz-man','Test manuell', null);
insert into public.coworkers (tag,name,role,pass_hash) values
  ('ZZM9','Test sjef','manager', extensions.crypt('pw-m9', extensions.gen_salt('bf'))),
  ('ZZC9','Test ansatt','coworker', extensions.crypt('pw-c9', extensions.gen_salt('bf')));
insert into public.store_members (store_id, tag) values ('zz-auto','ZZM9'), ('zz-auto','ZZC9');

do $$
declare b public.bikes; n int; r record;
begin
  -- 1) På lager i T900 → lagt ut i zz-auto, men ikke i zz-man (ingen butikknummer)
  perform public.import_thansen_bike('{"source_id":"zz-a1","name":"A1","item_number":"1","stock_stores":["T900","T901"]}'::jsonb);
  select * into b from public.bikes where store_id='zz-auto' and source_id='zz-a1';
  if b.display_status <> 'on_display' or b.auto_placed_at is null then raise exception 'FAIL: A1 ble ikke lagt ut i zz-auto'; end if;
  if (b.x, b.y) <> (140::double precision, 140::double precision) then raise exception 'FAIL: A1 skulle i første rute, fikk %,%', b.x, b.y; end if;
  if (select display_status from public.bikes where store_id='zz-man' and source_id='zz-a1') <> 'non_display' then
    raise exception 'FAIL: A1 ble lagt ut i butikk uten automatisk plassering';
  end if;

  -- 2) Neste sykkel på lager får neste ledige rute, ikke oppå den første
  perform public.import_thansen_bike('{"source_id":"zz-a2","name":"A2","item_number":"2","stock_stores":["T900"]}'::jsonb);
  select * into b from public.bikes where store_id='zz-auto' and source_id='zz-a2';
  if (b.x, b.y) <> (480::double precision, 140::double precision) then raise exception 'FAIL: A2 skulle i rute 2, fikk %,%', b.x, b.y; end if;

  -- 3) Ikke på lager i T900 → blir i arkivet
  perform public.import_thansen_bike('{"source_id":"zz-a3","name":"A3","item_number":"3","stock_stores":["T901"]}'::jsonb);
  if (select display_status from public.bikes where store_id='zz-auto' and source_id='zz-a3') <> 'non_display' then
    raise exception 'FAIL: A3 lagt ut selv om den ikke er på lager';
  end if;

  -- 4) Fjernet fra utstilling av en ansatt → legges ikke ut igjen neste natt
  select * into b from public.bikes where store_id='zz-auto' and source_id='zz-a1';
  perform public.update_bike('ZZC9','pw-c9', b.uid, '{"display_status":"non_display"}'::jsonb);
  perform public.import_thansen_bike('{"source_id":"zz-a1","name":"A1","item_number":"1","stock_stores":["T900"]}'::jsonb);
  if (select display_status from public.bikes where uid = b.uid) <> 'non_display' then
    raise exception 'FAIL: A1 ble lagt ut igjen etter at den ble fjernet';
  end if;

  -- 5) Utsolgt → importen fjerner ikke kortet
  perform public.import_thansen_bike('{"source_id":"zz-a2","name":"A2","item_number":"2","stock_stores":[]}'::jsonb);
  if (select display_status from public.bikes where store_id='zz-auto' and source_id='zz-a2') <> 'on_display' then
    raise exception 'FAIL: importen fjernet et kort fra utstillingen';
  end if;

  -- 6) Uten stock_stores endres ingen plassering
  perform public.import_thansen_bike('{"source_id":"zz-a4","name":"A4","item_number":"4"}'::jsonb);
  if (select auto_placed_at from public.bikes where store_id='zz-auto' and source_id='zz-a4') is not null then
    raise exception 'FAIL: plassering uten lagerdata';
  end if;

  -- 7) Kun butikksjef i butikken kan sette butikknummeret
  begin
    perform public.set_store_thansen('ZZC9','pw-c9','zz-auto','T999', true);
    raise exception 'FAIL: medarbeider endret Thansen-butikknummer';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.set_store_thansen('ZZM9','pw-m9','zz-man','T999', true);
    raise exception 'FAIL: sjef endret butikknummer i annen butikk';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  select * into r from public.set_store_thansen('ZZM9','pw-m9','zz-auto','T950', false);
  if r.thansen_store_id <> 'T950' or r.auto_place then raise exception 'FAIL: set_store_thansen lagret ikke'; end if;
  select count(*) into n from public.auto_place_stores() where id = 'zz-auto';
  if n <> 0 then raise exception 'FAIL: avslått butikk står fortsatt i auto_place_stores'; end if;

  raise notice 'OK: automatisk plassering (stores_v2)';
end $$;

rollback;
