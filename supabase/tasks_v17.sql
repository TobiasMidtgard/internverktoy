-- Thansen Verktøykasse · Tasks v17 — innlogging kreves for tavle-skriving; invitasjonskode for registrering
-- Audit 2026-06-09, punkt 3 (P1): set_status/toggle_check/set_done var SECURITY DEFINER
-- uten auth og gitt til anon — hvem som helst på nettet kunne endre tavla og forfalske
-- fullføringshistorikk. Nå kreves innlogget konto (alle roller). register_account krever
-- i tillegg invitasjonskode (app_config: invite_code), så fremmede ikke kan opprette kontoer.
-- (rollover_* flyttes til pg_cron i v18 — de er harmløse re-dateringer enn så lenge.)

-- 1. Autentisert set_status (samme semantikk som før, + auth-sjekk)
create or replace function public.set_status(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å endre status'; end if;
  if p_status not in ('todo','progress','done') then raise exception 'bad status'; end if;
  update public.tasks set
    status = p_status, done = (p_status = 'done'),
    last_done_at = case when p_status = 'done' then now() else last_done_at end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $$;

-- 2. Autentisert toggle_check
create or replace function public.toggle_check(p_auth_tag text, p_auth_pw text, p_id uuid, p_ci integer)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare r public.tasks; lines text[]; i int; cnt int := -1;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å bruke sjekklista'; end if;
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;
  if r.notes is null then return r; end if;
  lines := string_to_array(r.notes, E'\n');
  for i in 1 .. coalesce(array_length(lines, 1), 0) loop
    if lines[i] ~ '^\s*[-*]\s+\[[ xX]\]\s+' then
      cnt := cnt + 1;
      if cnt = p_ci then
        if lines[i] ~ '\[[xX]\]' then lines[i] := regexp_replace(lines[i], '\[[xX]\]', '[ ]');
        else lines[i] := regexp_replace(lines[i], '\[ \]', '[x]'); end if;
      end if;
    end if;
  end loop;
  update public.tasks set notes = array_to_string(lines, E'\n') where id = p_id returning * into r;
  return r;
end $$;

-- 3. Fjern de åpne/utdaterte skrivefunksjonene
drop function if exists public.set_status(uuid, text);
drop function if exists public.toggle_check(uuid, integer);
drop function if exists public.set_done(uuid, boolean);          -- utdatert pre-v8-semantikk
drop function if exists public.complete_task(text, uuid);        -- gammel passcode-variant

-- 4. Invitasjonskode for registrering (butikksjef deler koden muntlig)
insert into public.app_config(key, value)
select 'invite_code', 'Fredrikstad1661'
where not exists (select 1 from public.app_config where key = 'invite_code');

drop function if exists public.register_account(text, text, text, text, text);
create or replace function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text, p_invite text)
returns public.coworkers_public language plpgsql security definer set search_path = public, extensions as $$
declare r public.coworkers_public; ex public.coworkers;
begin
  if not exists (select 1 from public.app_config where key='invite_code' and value = coalesce(p_invite,'')) then
    raise exception 'Feil invitasjonskode — spør butikksjefen';
  end if;
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

-- 5. Butikksjef kan bytte invitasjonskoden
create or replace function public.set_invite_code(p_auth_tag text, p_auth_pw text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if length(coalesce(trim(p_new),'')) < 4 then raise exception 'Koden må ha minst 4 tegn'; end if;
  insert into public.app_config(key,value) values ('invite_code', trim(p_new))
  on conflict (key) do update set value = excluded.value;
end $$;

grant execute on function public.set_status(text,text,uuid,text)                       to anon, authenticated;
grant execute on function public.toggle_check(text,text,uuid,integer)                  to anon, authenticated;
grant execute on function public.register_account(text,text,text,text,text,text)       to anon, authenticated;
grant execute on function public.set_invite_code(text,text,text)                       to anon, authenticated;
