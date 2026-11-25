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
