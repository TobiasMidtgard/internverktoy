-- Thansen Verktøykasse · Tasks v16 — server-side validering av farger og ansattkoder
-- Audit 2026-06-09, punkt 2 (P0): coworker-/notatfarger lagres uvalidert og interpoleres
-- i style-attributter i tasks.html. En «farge» som #fff"><img onerror=...> ga lagret XSS
-- for alle som åpnet siden. Klienten saniterer nå (col()-helper), og her stoppes det
-- ved kilden: farger må være gyldig hex, ansattkoder må være 4 tegn A-Å/0-9.

-- Hjelper: returner fargen hvis gyldig hex, ellers p_default (kan være null)
create or replace function public._clean_color(p text, p_default text)
returns text language sql immutable as $$
  select case when p ~ '^#[0-9a-fA-F]{3,8}$' then p else p_default end
$$;

-- register_account: beholder v15-guarden (privilegerte rader kan ikke claimes),
-- nå med farge- og kodevalidering
create or replace function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text)
returns public.coworkers_public language plpgsql security definer set search_path = public, extensions as $$
declare r public.coworkers_public; ex public.coworkers;
begin
  if upper(p_tag) !~ '^[A-ZÆØÅ0-9]{4}$' then raise exception 'Koden må være 4 tegn (A-Å eller 0-9)'; end if;
  if length(coalesce(p_password,'')) < 4 then raise exception 'Passord må ha minst 4 tegn'; end if;
  select * into ex from public.coworkers where tag = upper(p_tag);
  if found then
    if ex.pass_hash is not null then raise exception 'Det finnes allerede en konto for denne koden'; end if;
    if coalesce(ex.role,'coworker') <> 'coworker' then
      raise exception 'Denne kontoen må aktiveres av IT (TMID)';
    end if;
    update public.coworkers set pass_hash = crypt(p_password, gen_salt('bf')),
      name  = coalesce(nullif(trim(p_name),''), name),
      title = coalesce(nullif(p_title,''), title),
      color = coalesce(public._clean_color(nullif(p_color,''), null), color)
    where tag = upper(p_tag);
  else
    insert into public.coworkers (tag,name,color,title,role,pass_hash)
    values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'),
            coalesce(public._clean_color(nullif(p_color,''), null), '#004595'),
            coalesce(nullif(p_title,''),'Butikkmedarbeider'), 'coworker', crypt(p_password, gen_salt('bf')));
  end if;
  select * into r from public.coworkers_public where tag = upper(p_tag); return r;
end $$;

create or replace function public.add_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
returns public.coworkers_public language plpgsql security definer set search_path = public as $$
declare r public.coworkers_public;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if upper(p_tag) !~ '^[A-ZÆØÅ0-9]{4}$' then raise exception 'Koden må være 4 tegn (A-Å eller 0-9)'; end if;
  insert into public.coworkers (tag,name,color,title)
  values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'),
          coalesce(public._clean_color(nullif(p_color,''), null), '#004595'),
          coalesce(nullif(p_title,''),'Butikkmedarbeider'));
  select * into r from public.coworkers_public where tag=upper(p_tag); return r;
end $$;

create or replace function public.update_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
returns public.coworkers_public language plpgsql security definer set search_path = public as $$
declare r public.coworkers_public;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.coworkers set name=coalesce(nullif(trim(p_name),''),name),
    color=coalesce(public._clean_color(nullif(p_color,''), null), color),
    title=coalesce(nullif(p_title,''),title)
  where tag=upper(p_tag);
  if not found then raise exception 'Coworker not found'; end if;
  select * into r from public.coworkers_public where tag=upper(p_tag); return r;
end $$;

create or replace function public.add_planner_note(p_auth_tag text, p_auth_pw text, p_weekday integer, p_body text, p_color text)
returns public.planner_notes language plpgsql security definer set search_path = public as $$
declare r public.planner_notes;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å legge igjen notat'; end if;
  insert into public.planner_notes (weekday, body, color, author)
  values (p_weekday, coalesce(nullif(trim(p_body),''),'…'),
          coalesce(public._clean_color(nullif(p_color,''), null), '#ffd400'), upper(p_auth_tag))
  returning * into r; return r;
end $$;

-- Rens eksisterende rader som måtte ha ugyldige verdier
update public.coworkers     set color = '#004595' where color is null or color !~ '^#[0-9a-fA-F]{3,8}$';
update public.planner_notes set color = '#ffd400' where color is null or color !~ '^#[0-9a-fA-F]{3,8}$';
