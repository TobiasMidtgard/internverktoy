-- Thansen Verktøykasse · Tasks v26 — heldagsfravær over flere dager
-- Syk/ferie/fri måtte registreres én dag om gangen (set_staff_status tar én dato).
-- Ny RPC tar en fra/til-periode og registrerer hver dag i den (inkl. helg), med
-- samme erstatningsregel og auth-gate (egen status, eller butikksjef/dev for andre)
-- som set_staff_status. Tidsstatuser (pause/lunsj/ærend/kurs) forblir én dag.

create or replace function public.set_staff_status_range(
  p_auth_tag text, p_auth_pw text, p_tag text, p_kind text, p_from date, p_to date)
returns setof public.staff_status
language plpgsql security definer set search_path = public as $$
declare role text; d date;
begin
  role := public.account_role(p_auth_tag, p_auth_pw);
  if role is null then raise exception 'Logg inn for å sette status'; end if;
  if upper(p_tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun Butikksjef kan sette status for andre'; end if;
  if p_kind not in ('syk','ferie','fri') then
    raise exception 'Kun heldagsfravær (syk/ferie/fri) kan registreres over flere dager'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Ugyldig datoperiode'; end if;
  if p_to - p_from + 1 > 60 then raise exception 'Maks 60 dager om gangen'; end if;
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    -- samme erstatningsregel som set_staff_status: heldagsstatus rydder dagen
    delete from public.staff_status where tag = upper(p_tag) and day = d;
    return query insert into public.staff_status (tag, kind, day, all_day, author)
      values (upper(p_tag), p_kind, d, true, upper(p_auth_tag)) returning *;
  end loop;
end $$;

grant execute on function public.set_staff_status_range(text,text,text,text,date,date) to anon, authenticated;
