-- Thansen Verktøykasse · Tasks v19 — ansattdata krever innlogging
-- Audit 2026-06-09, punkt 5 (P1): staff_status (sykdom/ferie/fravær) og coworkers_public
-- (navn/titler) var lesbare for hele internett via den offentlige anon-nøkkelen.
-- Nå hentes persondata via en innloggings-gated RPC. (tasks/planner_notes forblir
-- åpne for lesing slik at realtime-oppdatering av tavla fortsatt virker.)

-- 1. Steng direkte lesing
revoke select on public.coworkers_public from anon, authenticated;
drop policy if exists staff_status_read on public.staff_status;
revoke select on public.staff_status from anon, authenticated;

-- 2. Innloggings-gated lesing av ansatte + status (begrenset tidsvindu)
create or replace function public.get_people(p_auth_tag text, p_auth_pw text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å se ansatte'; end if;
  return jsonb_build_object(
    'coworkers', coalesce((select jsonb_agg(to_jsonb(c) order by c.tag) from public.coworkers_public c), '[]'::jsonb),
    'staff_status', coalesce((select jsonb_agg(to_jsonb(s))
                              from public.staff_status s
                              where s.day >= (now() at time zone 'Europe/Oslo')::date - 30), '[]'::jsonb)
  );
end $$;

grant execute on function public.get_people(text,text) to anon, authenticated;
