-- Thansen Verktøykasse · Bikes v2 — eget varenummer-felt (item_number)
-- (Første sykkel-migrering i ledgeren; grunnskjemaet ligger i schema-snapshot.sql.)
-- Importen la Thansen-varenummeret i frame (rammenummer), som er semantisk feil og
-- gjorde at nattlig sync overskrev manuelt redigerte rammenummer. Nå:
--   1) bikes får item_number; eksisterende thansen-rader backfylles fra frame
--      (alle er 9-sifrede varenumre — frame beholdes som skannbar verdi).
--   2) add_bike/update_bike/import_thansen_bike kan skrive item_number.
--   3) import-upsert slutter å overskrive frame — feltet er brukerens eget.

alter table public.bikes add column if not exists item_number text not null default '';

update public.bikes set item_number = frame
 where source = 'thansen' and item_number = '' and frame ~ '^[0-9]{6,}$';

create or replace function public.add_bike(p_passcode text, p_data jsonb)
returns bikes language plpgsql security definer set search_path = public as $$
declare rec public.bikes;
begin
  if not public.verify_passcode(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  insert into public.bikes (name,wheel_size,color,color_name,price,frame,item_number,descr,items,x,y)
  values (
    coalesce(p_data->>'name',''),
    coalesce(p_data->>'wheel_size',''),
    coalesce(p_data->>'color','#f4b942'),
    coalesce(p_data->>'color_name','—'),
    coalesce((p_data->>'price')::int,0),
    coalesce(p_data->>'frame',''),
    coalesce(p_data->>'item_number',''),
    coalesce(p_data->>'descr','No description provided.'),
    coalesce(p_data->'items','[]'::jsonb),
    coalesce((p_data->>'x')::double precision,0),
    coalesce((p_data->>'y')::double precision,0)
  ) returning * into rec;
  return rec;
end; $$;

create or replace function public.update_bike(p_passcode text, p_uid uuid, p_data jsonb)
returns bikes language plpgsql security definer set search_path = public as $$
declare rec public.bikes;
begin
  if not public.verify_passcode(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  update public.bikes set
    name=coalesce(p_data->>'name',name), wheel_size=coalesce(p_data->>'wheel_size',wheel_size),
    color=coalesce(p_data->>'color',color), color_name=coalesce(p_data->>'color_name',color_name),
    price=coalesce((p_data->>'price')::int,price), frame=coalesce(p_data->>'frame',frame),
    item_number=coalesce(p_data->>'item_number',item_number),
    descr=coalesce(p_data->>'descr',descr), items=coalesce(p_data->'items',items),
    hidden=coalesce((p_data->>'hidden')::boolean,hidden),
    display_status=coalesce(p_data->>'display_status',display_status),
    x=coalesce((p_data->>'x')::double precision,x), y=coalesce((p_data->>'y')::double precision,y),
    updated_at=now()
  where uid=p_uid returning * into rec;
  return rec;
end; $$;

create or replace function public.import_thansen_bike(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.bikes (
    source, source_id, name, price, frame, item_number, availability, image_url, source_url, outlet,
    specs, spare_parts,
    wheel_size, color, color_name, descr, items,
    display_status, x, y, hidden, discontinued, last_synced
  ) values (
    'thansen', p->>'source_id', coalesce(p->>'name',''), coalesce((p->>'price')::int,0),
    coalesce(p->>'frame',''), coalesce(p->>'item_number',''),
    p->>'availability', p->>'image_url', p->>'source_url',
    coalesce((p->>'outlet')::boolean,false),
    coalesce(p->'specs','{}'::jsonb), coalesce(p->'spare_parts','[]'::jsonb),
    coalesce(p->>'wheel_size',''), coalesce(p->>'color','#3fb6a8'), coalesce(p->>'color_name','—'),
    coalesce(p->>'descr',''), '[]'::jsonb, 'on_display',
    coalesce((p->>'x')::double precision,0), coalesce((p->>'y')::double precision,0),
    coalesce((p->>'outlet')::boolean,false), false, now()
  )
  -- frame er bevisst IKKE med i upserten lenger: rammenummeret redigeres av bruker
  on conflict (source, source_id) where source is not null do update set
    name=excluded.name, price=excluded.price, item_number=excluded.item_number,
    availability=excluded.availability, image_url=excluded.image_url,
    source_url=excluded.source_url, outlet=excluded.outlet,
    specs=excluded.specs, spare_parts=excluded.spare_parts,
    discontinued=false, last_synced=now();
end; $$;

-- funksjonene returnerer bikes-typen som nettopp fikk ny kolonne
notify pgrst, 'reload schema';
