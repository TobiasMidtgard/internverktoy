-- Thansen Verktøykasse · Tasks v15 — lukk konto-kapring av privilegerte rader
-- Audit 2026-06-09, punkt 1 (P0): register_account lot hvem som helst med anon-nøkkelen
-- «claime» en passordløs rad UTEN å røre rollen. En seedet/forhåndspromotert
-- manager/dev-rad kunne dermed overtas av en fremmed og gi full fjernkontroll
-- (dev kan kalle set_role). Nå nektes claim av rader med forhøyet rolle —
-- slike kontoer provisjoneres av IT med passord satt på forhånd.

create or replace function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text)
returns public.coworkers_public language plpgsql security definer set search_path = public, extensions as $$
declare r public.coworkers_public; ex public.coworkers;
begin
  if char_length(upper(p_tag)) <> 4 then raise exception 'Koden må være 4 tegn'; end if;
  if length(coalesce(p_password,'')) < 4 then raise exception 'Passord må ha minst 4 tegn'; end if;
  select * into ex from public.coworkers where tag = upper(p_tag);
  if found then
    if ex.pass_hash is not null then raise exception 'Det finnes allerede en konto for denne koden'; end if;
    -- NYTT (v15): en passordløs rad med forhøyet rolle kan IKKE claimes anonymt
    if coalesce(ex.role,'coworker') <> 'coworker' then
      raise exception 'Denne kontoen må aktiveres av IT (TMID)';
    end if;
    update public.coworkers set pass_hash = crypt(p_password, gen_salt('bf')),
      name  = coalesce(nullif(trim(p_name),''), name),
      title = coalesce(nullif(p_title,''), title),
      color = coalesce(nullif(p_color,''), color)
    where tag = upper(p_tag);
  else
    insert into public.coworkers (tag,name,color,title,role,pass_hash)
    values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'), coalesce(nullif(p_color,''),'#004595'),
            coalesce(nullif(p_title,''),'Butikkmedarbeider'), 'coworker', crypt(p_password, gen_salt('bf')));
  end if;
  select * into r from public.coworkers_public where tag = upper(p_tag); return r;
end $$;
