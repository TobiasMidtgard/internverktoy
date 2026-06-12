-- bikes_v3: clone_bike — to fysiske sykler av samme modell (samme varenummer, ulikt
-- rammenummer) skal kunne stå på utstilling samtidig. Kopien tar med ALT innhold
-- (bilde, spesifikasjoner, reservedeler, tilbehør), men er frikoblet fra Thansen-synken
-- (source/source_id = null) så den unike indeksen bikes_source_uidx ikke kolliderer;
-- pris/lager oppdateres derfor kun på originalen av den nattlige importen.

create or replace function public.clone_bike(p_passcode text, p_uid uuid, p_frame text)
 returns bikes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare rec public.bikes;
begin
  if not public.verify_passcode(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  insert into public.bikes (name, wheel_size, color, color_name, price, frame, item_number,
                            descr, items, x, y, image_url, specs, spare_parts, source_url,
                            availability, outlet, hidden, discontinued, display_status)
  select name, wheel_size, color, color_name, price, coalesce(p_frame, ''), item_number,
         descr, items, x + 48, y + 48, image_url, specs, spare_parts, source_url,
         availability, outlet, false, discontinued, 'on_display'
  from public.bikes where uid = p_uid
  returning * into rec;
  if rec.uid is null then
    raise exception 'bike not found';
  end if;
  return rec;
end $function$;

grant execute on function public.clone_bike(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
