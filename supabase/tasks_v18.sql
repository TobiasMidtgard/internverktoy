-- Thansen Verktøykasse · Tasks v18 — sesjonstokener i stedet for klartekst-passord i klienten
-- Audit 2026-06-09, punkt 4 (P1): klienten lagret {user, pw} i klartekst i sessionStorage og
-- sendte passordet med hver privilegerte RPC — alle ved den delte butikk-PC-en kunne lese det
-- i DevTools. Nå utsteder login/register et tilfeldig token (lagret hashet, 30 dagers levetid);
-- account_role godtar token ELLER passord, så alle eksisterende RPC-er virker uendret.

-- 1. Sesjonstabell — kun SECURITY DEFINER-funksjoner rører den
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  tag        text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_tag_idx on public.sessions (tag);
alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated;

-- 2. account_role: gyldig sesjonstoken ELLER passord
create or replace function public.account_role(p_tag text, p_password text)
returns text language sql security definer set search_path = public, extensions as $$
  select c.role from public.coworkers c
  where c.tag = upper(p_tag)
    and ( exists (select 1 from public.sessions s
                  where s.tag = c.tag
                    and s.token_hash = encode(digest(coalesce(p_password,''), 'sha256'), 'hex')
                    and s.expires_at > now())
          or (c.pass_hash is not null and c.pass_hash = crypt(p_password, c.pass_hash)) );
$$;

-- 3. Hjelper: opprett sesjon og returner {user, token}
create or replace function public._issue_session(p_tag text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; r public.coworkers_public;
begin
  delete from public.sessions where expires_at < now();             -- opportunistisk opprydding
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.sessions (tag, token_hash, expires_at)
  values (upper(p_tag), encode(digest(v_token,'sha256'),'hex'), now() + interval '30 days');
  select * into r from public.coworkers_public where tag = upper(p_tag);
  return jsonb_build_object('user', to_jsonb(r), 'token', v_token);
end $$;
revoke all on function public._issue_session(text) from public, anon, authenticated;

-- 4. login_account returnerer nå {user, token} (jsonb i stedet for coworkers_public)
drop function if exists public.login_account(text, text);
create or replace function public.login_account(p_tag text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.coworkers c
                 where c.tag = upper(p_tag) and c.pass_hash is not null
                   and c.pass_hash = crypt(p_password, c.pass_hash)) then
    raise exception 'Feil kode eller passord';
  end if;
  return public._issue_session(p_tag);
end $$;

-- 5. register_account: som v17, men returnerer {user, token} (auto-innlogging)
drop function if exists public.register_account(text, text, text, text, text, text);
create or replace function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text, p_invite text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ex public.coworkers;
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
  return public._issue_session(p_tag);
end $$;

-- 6. Utlogging invaliderer tokenet på serversiden
create or replace function public.logout_account(p_tag text, p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.sessions
  where tag = upper(p_tag)
    and token_hash = encode(digest(coalesce(p_token,''),'sha256'),'hex');
end $$;

-- 7. Passordbytte dreper alle aktive sesjoner for kontoen
create or replace function public.change_password(p_tag text, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.coworkers c
                 where c.tag = upper(p_tag) and c.pass_hash is not null
                   and c.pass_hash = crypt(p_old, c.pass_hash)) then
    raise exception 'Feil nåværende passord';
  end if;
  if length(coalesce(p_new,'')) < 4 then raise exception 'Nytt passord må ha minst 4 tegn'; end if;
  update public.coworkers set pass_hash = crypt(p_new, gen_salt('bf')) where tag = upper(p_tag);
  delete from public.sessions where tag = upper(p_tag);
end $$;

grant execute on function public.login_account(text,text)                          to anon, authenticated;
grant execute on function public.register_account(text,text,text,text,text,text)   to anon, authenticated;
grant execute on function public.logout_account(text,text)                         to anon, authenticated;
grant execute on function public.change_password(text,text,text)                   to anon, authenticated;
