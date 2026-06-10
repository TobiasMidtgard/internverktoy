-- Thansen Verktøykasse · Tasks v25 — butikksjef kan nullstille glemte passord
-- Audit 2026-06-09, punkt 16 (P2): change_password fantes men hadde ingen UI, og et
-- glemt passord var permanent utestengelse (register nekter eksisterende konto; eneste
-- utvei var SQL-tilgang). Nå kan butikksjef/dev sette nytt passord fra ansatt-editoren.

create or replace function public.reset_password(p_auth_tag text, p_auth_pw text, p_target text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare target_role text;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if length(coalesce(p_new,'')) < 4 then raise exception 'Nytt passord må ha minst 4 tegn'; end if;
  select role into target_role from public.coworkers where tag = upper(p_target);
  if not found then raise exception 'Ukjent ansattkode'; end if;
  -- en manager skal ikke kunne overta dev-kontoen via passord-nullstilling
  if target_role = 'dev' and public.account_role(p_auth_tag,p_auth_pw) <> 'dev' then
    raise exception 'Kun IT (dev) kan nullstille dev-kontoer';
  end if;
  update public.coworkers set pass_hash = crypt(p_new, gen_salt('bf')) where tag = upper(p_target);
  delete from public.sessions where tag = upper(p_target);   -- logg ut alle enheter
end $$;

grant execute on function public.reset_password(text,text,text,text) to anon, authenticated;
