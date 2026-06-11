-- ============================================================================
-- GENERERT SNAPSHOT av public-skjemaet — IKKE rediger for hånd.
-- Regenerer med: node --env-file=db/.env db/snapshot.mjs
-- Komplett gjenoppretting gjøres fra pg_dump-backupen (db/README.md);
-- dette snapshotet er referanse + nødhjelp for å gjenskape skjemaet fra repoet.
-- ============================================================================

-- ---------- utvidelser ----------
create extension if not exists "pg_cron" with schema extensions;
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "supabase_vault" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------- tabeller ----------
create table if not exists public.app_config (
  key text not null,
  value text not null,
  constraint app_config_pkey PRIMARY KEY (key)
);
alter table public.app_config enable row level security;

create table if not exists public.bikes (
  uid uuid not null default gen_random_uuid(),
  name text not null,
  wheel_size text not null default ''::text,
  color text not null default '#f4b942'::text,
  color_name text not null default '—'::text,
  price integer not null default 0,
  frame text not null,
  descr text not null default 'No description provided.'::text,
  items jsonb not null default '[]'::jsonb,
  x double precision not null default 0,
  y double precision not null default 0,
  updated_at timestamp with time zone not null default now(),
  source text,
  source_id text,
  source_url text,
  image_url text,
  availability text,
  outlet boolean not null default false,
  hidden boolean not null default false,
  discontinued boolean not null default false,
  last_synced timestamp with time zone,
  specs jsonb,
  spare_parts jsonb not null default '[]'::jsonb,
  display_status text not null default 'on_display'::text,
  item_number text not null default ''::text,
  constraint bikes_pkey PRIMARY KEY (uid)
);
alter table public.bikes enable row level security;

create table if not exists public.coworkers (
  tag text not null,
  name text not null,
  color text not null default '#004595'::text,
  role text not null default 'coworker'::text,
  created_at timestamp with time zone not null default now(),
  title text not null default 'Butikkmedarbeider'::text,
  pass_hash text,
  constraint coworkers_pkey PRIMARY KEY (tag)
);
alter table public.coworkers enable row level security;

create table if not exists public.planner_notes (
  id uuid not null default gen_random_uuid(),
  weekday integer not null,
  body text not null,
  color text not null default '#ffd400'::text,
  author text,
  created_at timestamp with time zone not null default now(),
  constraint planner_notes_pkey PRIMARY KEY (id),
  constraint planner_notes_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);
alter table public.planner_notes enable row level security;

create table if not exists public.schema_migrations (
  name text not null,
  applied_at timestamp with time zone not null default now(),
  constraint schema_migrations_pkey PRIMARY KEY (name)
);
alter table public.schema_migrations enable row level security;

create table if not exists public.sessions (
  id uuid not null default gen_random_uuid(),
  tag text not null,
  token_hash text not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  constraint sessions_pkey PRIMARY KEY (id)
);
alter table public.sessions enable row level security;

create table if not exists public.staff_status (
  id uuid not null default gen_random_uuid(),
  tag text not null,
  kind text not null,
  day date not null,
  start_min integer,
  dur_min integer,
  all_day boolean not null default false,
  author text,
  created_at timestamp with time zone not null default now(),
  constraint staff_status_pkey PRIMARY KEY (id),
  constraint staff_status_kind_check CHECK ((kind = ANY (ARRAY['pause'::text, 'lunsj'::text, 'arend'::text, 'kurs'::text, 'syk'::text, 'ferie'::text, 'fri'::text])))
);
alter table public.staff_status enable row level security;

create table if not exists public.tasks (
  id uuid not null default gen_random_uuid(),
  title text not null,
  notes text,
  recur_unit text not null default 'none'::text,
  recur_n integer not null default 1,
  due_date date,
  done boolean not null default false,
  last_done_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  due_at timestamp with time zone,
  assignee text,
  status text not null default 'todo'::text,
  priority text not null default 'medium'::text,
  assignees text[] not null default '{}'::text[],
  duration_min integer not null default 30,
  day_assignees jsonb not null default '{}'::jsonb,
  constraint tasks_pkey PRIMARY KEY (id),
  constraint tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
  constraint tasks_recur_n_check CHECK ((recur_n >= 1)),
  constraint tasks_recur_unit_check CHECK ((recur_unit = ANY (ARRAY['none'::text, 'hour'::text, 'day'::text, 'week'::text, 'month'::text]))),
  constraint tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'progress'::text, 'done'::text])))
);
alter table public.tasks enable row level security;

create table if not exists public.wiki_articles (
  id uuid not null default gen_random_uuid(),
  title text not null,
  category text not null default 'Generelt'::text,
  tags text[] not null default '{}'::text[],
  body text not null default ''::text,
  sources jsonb not null default '[]'::jsonb,
  updated_by text,
  updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  tsv tsvector,
  constraint wiki_articles_pkey PRIMARY KEY (id)
);
alter table public.wiki_articles enable row level security;

create table if not exists public.wiki_links (
  id uuid not null default gen_random_uuid(),
  title text not null,
  kind text not null default 'url'::text,
  url text,
  command text,
  description text not null default ''::text,
  category text not null default 'Generelt'::text,
  sort_order integer not null default 0,
  updated_by text,
  updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint wiki_links_pkey PRIMARY KEY (id),
  constraint wiki_links_check CHECK (((kind <> 'url'::text) OR (url IS NOT NULL))),
  constraint wiki_links_check1 CHECK (((kind <> 'xal'::text) OR (command IS NOT NULL))),
  constraint wiki_links_kind_check CHECK ((kind = ANY (ARRAY['url'::text, 'xal'::text])))
);
alter table public.wiki_links enable row level security;

create table if not exists public.wiki_suggestions (
  id uuid not null default gen_random_uuid(),
  article_id uuid,
  article_title text,
  body text not null,
  author text,
  status text not null default 'open'::text,
  created_at timestamp with time zone not null default now(),
  constraint wiki_suggestions_pkey PRIMARY KEY (id),
  constraint wiki_suggestions_article_id_fkey FOREIGN KEY (article_id) REFERENCES wiki_articles(id) ON DELETE SET NULL,
  constraint wiki_suggestions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'applied'::text, 'dismissed'::text])))
);
alter table public.wiki_suggestions enable row level security;

-- ---------- indekser ----------
CREATE UNIQUE INDEX bikes_source_uidx ON public.bikes USING btree (source, source_id) WHERE (source IS NOT NULL);
CREATE INDEX sessions_tag_idx ON public.sessions USING btree (tag);
CREATE INDEX staff_status_day_idx ON public.staff_status USING btree (day);
CREATE INDEX wiki_title_trgm_idx ON public.wiki_articles USING gin (title gin_trgm_ops);
CREATE INDEX wiki_tsv_idx ON public.wiki_articles USING gin (tsv);

-- ---------- views ----------
create or replace view public.coworkers_public as
 SELECT tag,
    name,
    color,
    title,
    role,
    created_at,
    (pass_hash IS NOT NULL) AS has_account
   FROM coworkers;

-- ---------- funksjoner ----------
CREATE OR REPLACE FUNCTION public._clean_color(p text, p_default text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p ~ '^#[0-9a-fA-F]{3,8}$' then p else p_default end
$function$
;

CREATE OR REPLACE FUNCTION public._issue_session(p_tag text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text; r public.coworkers_public;
begin
  delete from public.sessions where expires_at < now();             -- opportunistisk opprydding
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.sessions (tag, token_hash, expires_at)
  values (upper(p_tag), encode(digest(v_token,'sha256'),'hex'), now() + interval '30 days');
  select * into r from public.coworkers_public where tag = upper(p_tag);
  return jsonb_build_object('user', to_jsonb(r), 'token', v_token);
end $function$
;

CREATE OR REPLACE FUNCTION public._require_manager(p_auth_tag text, p_auth_pw text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.account_role(p_auth_tag,p_auth_pw),'') not in ('manager','dev') then raise exception 'Krever butikksjef-tilgang'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.account_role(p_tag text, p_password text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select c.role from public.coworkers c
  where c.tag = upper(p_tag)
    and ( exists (select 1 from public.sessions s
                  where s.tag = c.tag
                    and s.token_hash = encode(digest(coalesce(p_password,''), 'sha256'), 'hex')
                    and s.expires_at > now())
          or (c.pass_hash is not null and c.pass_hash = crypt(p_password, c.pass_hash)) );
$function$
;

CREATE OR REPLACE FUNCTION public.add_article(p_auth_tag text, p_auth_pw text, p_article jsonb)
 RETURNS wiki_articles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wiki_articles;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.wiki_articles (title, category, tags, body, sources, updated_by)
  values (coalesce(nullif(trim(p_article->>'title'),''),'Uten tittel'),
          coalesce(nullif(p_article->>'category',''),'Generelt'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_article->'tags','[]'::jsonb)) as x),'{}'),
          coalesce(p_article->>'body',''),
          coalesce(p_article->'sources','[]'::jsonb),
          upper(p_auth_tag))
  returning * into r; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_bike(p_passcode text, p_data jsonb)
 RETURNS bikes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.add_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
 RETURNS coworkers_public
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.coworkers_public;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if upper(p_tag) !~ '^[A-ZÆØÅ0-9]{4}$' then raise exception 'Koden må være 4 tegn (A-Å eller 0-9)'; end if;
  insert into public.coworkers (tag,name,color,title)
  values (upper(p_tag), coalesce(nullif(trim(p_name),''),'Ansatt'),
          coalesce(public._clean_color(nullif(p_color,''), null), '#004595'),
          coalesce(nullif(p_title,''),'Butikkmedarbeider'));
  select * into r from public.coworkers_public where tag=upper(p_tag); return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_manager(p_auth_tag, p_auth_pw);
  if not exists (select 1 from public.coworkers where tag = upper(p_tag)) then
    raise exception 'Ukjent ansattkode: %', upper(p_tag);
  end if;
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )
    || jsonb_build_object(k,
         (select jsonb_agg(distinct v) from (
            select jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) as v
            union select upper(p_tag)) s))
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_link(p_auth_tag text, p_auth_pw text, p_link jsonb)
 RETURNS wiki_links
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wiki_links;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.wiki_links (title, kind, url, command, description, category, sort_order, updated_by)
  values (coalesce(nullif(trim(p_link->>'title'),''),'Uten tittel'),
          coalesce(nullif(p_link->>'kind',''),'url'),
          nullif(trim(coalesce(p_link->>'url','')),''),
          nullif(trim(coalesce(p_link->>'command','')),''),
          coalesce(p_link->>'description',''),
          coalesce(nullif(p_link->>'category',''),'Generelt'),
          coalesce((p_link->>'sort_order')::int,0),
          upper(p_auth_tag))
  returning * into r; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_planner_note(p_auth_tag text, p_auth_pw text, p_weekday integer, p_body text, p_color text)
 RETURNS planner_notes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.planner_notes;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å legge igjen notat'; end if;
  insert into public.planner_notes (weekday, body, color, author)
  values (p_weekday, coalesce(nullif(trim(p_body),''),'…'),
          coalesce(public._clean_color(nullif(p_color,''), null), '#ffd400'), upper(p_auth_tag))
  returning * into r; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_suggestion(p_auth_tag text, p_auth_pw text, p_article_id uuid, p_article_title text, p_body text)
 RETURNS wiki_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wiki_suggestions;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å foreslå'; end if;
  insert into public.wiki_suggestions (article_id, article_title, body, author)
  values (p_article_id, nullif(trim(p_article_title),''), coalesce(nullif(trim(p_body),''),'…'), upper(p_auth_tag))
  returning * into r; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_task(p_auth_tag text, p_auth_pw text, p_task jsonb)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  insert into public.tasks (title, notes, assignees, recur_unit, recur_n, due_at, status, priority, done, duration_min)
  values (coalesce(nullif(trim(p_task->>'title'),''),'Untitled'), nullif(p_task->>'notes',''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_task->'assignees','[]'::jsonb)) as x),'{}'),
    coalesce(p_task->>'recur_unit','none'), coalesce((p_task->>'recur_n')::int,1), (p_task->>'due_at')::timestamptz,
    coalesce(p_task->>'status','todo'), coalesce(p_task->>'priority','medium'), coalesce(p_task->>'status','todo')='done',
    coalesce((p_task->>'duration_min')::int, 30))
  returning * into r; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.change_password(p_tag text, p_old text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not exists (select 1 from public.coworkers c
                 where c.tag = upper(p_tag) and c.pass_hash is not null
                   and c.pass_hash = crypt(p_old, c.pass_hash)) then
    raise exception 'Feil nåværende passord';
  end if;
  if length(coalesce(p_new,'')) < 4 then raise exception 'Nytt passord må ha minst 4 tegn'; end if;
  update public.coworkers set pass_hash = crypt(p_new, gen_salt('bf')) where tag = upper(p_tag);
  delete from public.sessions where tag = upper(p_tag);
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_article(p_auth_tag text, p_auth_pw text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.wiki_articles where id = p_id; end $function$
;

CREATE OR REPLACE FUNCTION public.delete_bike(p_passcode text, p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.verify_passcode(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  delete from public.bikes where uid = p_uid;
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_coworker(p_auth_tag text, p_auth_pw text, p_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.coworkers where tag=upper(p_tag); end $function$
;

CREATE OR REPLACE FUNCTION public.delete_link(p_auth_tag text, p_auth_pw text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.wiki_links where id = p_id; end $function$
;

CREATE OR REPLACE FUNCTION public.delete_planner_note(p_auth_tag text, p_auth_pw text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare role text; note public.planner_notes;
begin
  role := public.account_role(p_auth_tag,p_auth_pw);
  if role is null then raise exception 'Logg inn'; end if;
  select * into note from public.planner_notes where id=p_id;
  if not found then return; end if;
  if note.author <> upper(p_auth_tag) and role not in ('manager','dev') then raise exception 'Kun forfatter eller leder kan slette'; end if;
  delete from public.planner_notes where id=p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_staff_status(p_auth_tag text, p_auth_pw text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare role text; rec public.staff_status;
begin
  role := public.account_role(p_auth_tag, p_auth_pw);
  if role is null then raise exception 'Logg inn'; end if;
  select * into rec from public.staff_status where id = p_id;
  if not found then return; end if;
  if upper(rec.tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun egen status eller Butikksjef kan fjerne'; end if;
  delete from public.staff_status where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_task(p_auth_tag text, p_auth_pw text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform public._require_manager(p_auth_tag,p_auth_pw); delete from public.tasks where id=p_id; end $function$
;

CREATE OR REPLACE FUNCTION public.get_article(p_auth_tag text, p_auth_pw text, p_id uuid)
 RETURNS wiki_articles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wiki_articles;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å lese kunnskapsbasen'; end if;
  select * into r from public.wiki_articles where id = p_id;
  if not found then raise exception 'Artikkel ikke funnet'; end if;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_links(p_auth_tag text, p_auth_pw text)
 RETURNS SETOF wiki_links
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å se snarveier'; end if;
  return query select * from public.wiki_links order by category, sort_order, title;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_people(p_auth_tag text, p_auth_pw text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å se ansatte'; end if;
  return jsonb_build_object(
    'coworkers', coalesce((select jsonb_agg(to_jsonb(c) order by c.tag) from public.coworkers_public c), '[]'::jsonb),
    'staff_status', coalesce((select jsonb_agg(to_jsonb(s))
                              from public.staff_status s
                              where s.day >= (now() at time zone 'Europe/Oslo')::date - 30), '[]'::jsonb)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.get_suggestions(p_auth_tag text, p_auth_pw text, p_status text DEFAULT 'open'::text)
 RETURNS SETOF wiki_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  return query select * from public.wiki_suggestions
    where (p_status is null or status = p_status) order by created_at desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.import_thansen_bike(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.login_account(p_tag text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not exists (select 1 from public.coworkers c
                 where c.tag = upper(p_tag) and c.pass_hash is not null
                   and c.pass_hash = crypt(p_password, c.pass_hash)) then
    raise exception 'Feil kode eller passord';
  end if;
  return public._issue_session(p_tag);
end $function$
;

CREATE OR REPLACE FUNCTION public.logout_account(p_tag text, p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  delete from public.sessions
  where tag = upper(p_tag)
    and token_hash = encode(digest(coalesce(p_token,''),'sha256'),'hex');
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_thansen_discontinued(p_seen jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare n int;
  begin
    if jsonb_array_length(coalesce(p_seen,'[]'::jsonb)) = 0 then return 0; end if;
    update public.bikes set discontinued = true
     where source='thansen' and source_id not in (select jsonb_array_elements_text(p_seen))
       and discontinued = false;
    get diagnostics n = row_count; return n;
  end; $function$
;

CREATE OR REPLACE FUNCTION public.prune_old_data()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int := 0; m int;
begin
  -- ferdige engangsoppgaver eldre enn 60 dager (gjentakende beholdes alltid)
  delete from public.tasks
   where recur_unit = 'none' and status = 'done'
     and coalesce(last_done_at, created_at) < now() - interval '60 days';
  get diagnostics m = row_count; n := n + m;

  -- vaktstatus eldre enn 60 dager
  delete from public.staff_status
   where day < (now() at time zone 'Europe/Oslo')::date - 60;
  get diagnostics m = row_count; n := n + m;

  -- utløpte sesjoner
  delete from public.sessions where expires_at < now();
  get diagnostics m = row_count; n := n + m;

  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text, p_invite text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.remove_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_manager(p_auth_tag, p_auth_pw);
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )
    || case when exists (select 1 from jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) v
                         where v <> upper(p_tag))
            then jsonb_build_object(k,
                   (select jsonb_agg(v) from jsonb_array_elements_text(coalesce(t.day_assignees->k, '[]'::jsonb)) v
                    where v <> upper(p_tag)))
            else '{}'::jsonb end
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_password(p_auth_tag text, p_auth_pw text, p_target text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.resolve_suggestion(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if p_status not in ('applied','dismissed','open') then raise exception 'Ugyldig status'; end if;
  update public.wiki_suggestions set status = p_status where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.rollover_incomplete()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  with upd as (
    update public.tasks set
      due_at = (((now() at time zone 'Europe/Oslo')::date
                 + (due_at at time zone 'Europe/Oslo')::time) at time zone 'Europe/Oslo')
    where recur_unit = 'none' and status <> 'done' and priority <> 'high' and due_at is not null
      and (due_at at time zone 'Europe/Oslo')::date < (now() at time zone 'Europe/Oslo')::date
    returning 1
  ) select count(*) into n from upd; return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.rollover_recurring()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int := 0;
  r record;
  step interval;
  nd timestamptz;
begin
  for r in
    select id, due_at, recur_n, recur_unit
    from public.tasks
    where recur_unit <> 'none' and status = 'done' and last_done_at is not null and (
         (recur_unit = 'day'   and (last_done_at at time zone 'Europe/Oslo')::date < (now() at time zone 'Europe/Oslo')::date)
      or (recur_unit = 'week'  and date_trunc('week',  last_done_at at time zone 'Europe/Oslo') < date_trunc('week',  now() at time zone 'Europe/Oslo'))
      or (recur_unit = 'month' and date_trunc('month', last_done_at at time zone 'Europe/Oslo') < date_trunc('month', now() at time zone 'Europe/Oslo'))
      or (recur_unit = 'hour'  and last_done_at < now() - interval '1 hour')
    )
  loop
    step := (r.recur_n || ' ' || r.recur_unit)::interval;
    nd   := coalesce(r.due_at, now()) + step;          -- én syklus frem, behold justeringen
    if step > interval '0' then
      if r.recur_unit = 'hour' then
        while nd <= now() loop nd := nd + step; end loop;                      -- neste ledige time-slot
      else
        while ((nd + step) at time zone 'Europe/Oslo')::date <= (now() at time zone 'Europe/Oslo')::date loop
          nd := nd + step;                                                     -- siste tapte dags-slot
        end loop;
      end if;
    end if;
    update public.tasks
      set status = 'todo', done = false, due_at = nd,
          notes = regexp_replace(notes, '([-*]\s+)\[[xX]\]', '\1[ ]', 'g')     -- nullstill sjekklista
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_assignees jsonb)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.tasks;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.tasks set assignees=coalesce((select array_agg(x) from jsonb_array_elements_text(p_assignees) as x),'{}') where id=p_id returning * into r;
  if not found then raise exception 'Task not found'; end if; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_day_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tags jsonb)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.tasks;
  k      text := to_char(p_day, 'YYYY-MM-DD');
  arr    jsonb := coalesce(p_tags, '[]'::jsonb);
  cutoff text := to_char((now() at time zone 'Europe/Oslo')::date - 60, 'YYYY-MM-DD');
begin
  perform public._require_manager(p_auth_tag, p_auth_pw);
  update public.tasks t set day_assignees =
    ( select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(coalesce(t.day_assignees, '{}'::jsonb)) e
        where e.key <> k and e.key >= cutoff )                 -- keep other recent days
    || case when jsonb_array_length(arr) > 0
            then jsonb_build_object(k, arr) else '{}'::jsonb end  -- set/remove this day
  where t.id = p_id
  returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_invite_code(p_auth_tag text, p_auth_pw text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  if length(coalesce(trim(p_new),'')) < 4 then raise exception 'Koden må ha minst 4 tegn'; end if;
  insert into public.app_config(key,value) values ('invite_code', trim(p_new))
  on conflict (key) do update set value = excluded.value;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_role(p_auth_tag text, p_auth_pw text, p_target text, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.account_role(p_auth_tag,p_auth_pw) <> 'dev' then raise exception 'Krever IT-tilgang'; end if;
  if p_role not in ('coworker','manager','dev') then raise exception 'Ugyldig rolle'; end if;
  update public.coworkers set role = p_role where tag = upper(p_target);
end $function$
;

CREATE OR REPLACE FUNCTION public.set_staff_status(p_auth_tag text, p_auth_pw text, p_tag text, p_kind text, p_day date, p_start_min integer, p_dur_min integer)
 RETURNS staff_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare role text; rec public.staff_status;
begin
  role := public.account_role(p_auth_tag, p_auth_pw);
  if role is null then raise exception 'Logg inn for å sette status'; end if;
  if upper(p_tag) <> upper(p_auth_tag) and role not in ('manager','dev') then
    raise exception 'Kun Butikksjef kan sette status for andre'; end if;
  if p_kind not in ('pause','lunsj','arend','kurs','syk','ferie','fri') then raise exception 'Ugyldig status'; end if;
  if p_kind in ('syk','ferie','fri') then
    delete from public.staff_status where tag = upper(p_tag) and day = p_day;
    insert into public.staff_status (tag, kind, day, all_day, author)
      values (upper(p_tag), p_kind, p_day, true, upper(p_auth_tag)) returning * into rec;
  else
    insert into public.staff_status (tag, kind, day, start_min, dur_min, all_day, author)
      values (upper(p_tag), p_kind, p_day, greatest(0, least(1439, coalesce(p_start_min,0))),
              least(1440, greatest(5, coalesce(p_dur_min,15))), false, upper(p_auth_tag)) returning * into rec;
  end if;
  return rec;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_staff_status_range(p_auth_tag text, p_auth_pw text, p_tag text, p_kind text, p_from date, p_to date)
 RETURNS SETOF staff_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.set_status(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.tasks;
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å endre status'; end if;
  if p_status not in ('todo','progress','done') then raise exception 'bad status'; end if;
  update public.tasks set
    status = p_status, done = (p_status = 'done'),
    last_done_at = case when p_status = 'done' then now() else last_done_at end,
    notes = case when p_status <> 'done' and status = 'done' and recur_unit <> 'none'
                 then regexp_replace(notes, '([-*]\s+)\[[xX]\]', '\1[ ]', 'g')
                 else notes end
  where id = p_id returning * into r;
  if not found then raise exception 'Task not found'; end if;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.toggle_check(p_auth_tag text, p_auth_pw text, p_id uuid, p_ci integer)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.update_article(p_auth_tag text, p_auth_pw text, p_id uuid, p_article jsonb)
 RETURNS wiki_articles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wiki_articles;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.wiki_articles set
    title    = coalesce(nullif(trim(p_article->>'title'),''), title),
    category = coalesce(nullif(p_article->>'category',''), category),
    tags     = case when p_article ? 'tags'    then coalesce((select array_agg(x) from jsonb_array_elements_text(p_article->'tags') as x),'{}') else tags end,
    body     = case when p_article ? 'body'     then p_article->>'body' else body end,
    sources  = case when p_article ? 'sources'  then p_article->'sources' else sources end,
    updated_by = upper(p_auth_tag), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'Artikkel ikke funnet'; end if; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_bike(p_passcode text, p_uid uuid, p_data jsonb)
 RETURNS bikes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.update_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text)
 RETURNS coworkers_public
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.coworkers_public;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.coworkers set name=coalesce(nullif(trim(p_name),''),name),
    color=coalesce(public._clean_color(nullif(p_color,''), null), color),
    title=coalesce(nullif(p_title,''),title)
  where tag=upper(p_tag);
  if not found then raise exception 'Coworker not found'; end if;
  select * into r from public.coworkers_public where tag=upper(p_tag); return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_link(p_auth_tag text, p_auth_pw text, p_id uuid, p_link jsonb)
 RETURNS wiki_links
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wiki_links;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  update public.wiki_links set
    title       = coalesce(nullif(trim(p_link->>'title'),''), title),
    kind        = coalesce(nullif(p_link->>'kind',''), kind),
    url         = case when p_link ? 'url'         then nullif(trim(coalesce(p_link->>'url','')),'') else url end,
    command     = case when p_link ? 'command'     then nullif(trim(coalesce(p_link->>'command','')),'') else command end,
    description = case when p_link ? 'description' then coalesce(p_link->>'description','') else description end,
    category    = coalesce(nullif(p_link->>'category',''), category),
    sort_order  = coalesce((p_link->>'sort_order')::int, sort_order),
    updated_by  = upper(p_auth_tag), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'Snarvei ikke funnet'; end if; return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_task(p_auth_tag text, p_auth_pw text, p_id uuid, p_task jsonb)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.tasks; old_key text; new_key text; merged jsonb;
begin
  perform public._require_manager(p_auth_tag,p_auth_pw);
  select * into r from public.tasks where id = p_id;
  if not found then raise exception 'Task not found'; end if;

  if (p_task ? 'due_at') and r.recur_unit = 'none' and r.due_at is not null
     and nullif(p_task->>'due_at','') is not null then
    old_key := to_char(r.due_at at time zone 'Europe/Oslo', 'YYYY-MM-DD');
    new_key := to_char((p_task->>'due_at')::timestamptz at time zone 'Europe/Oslo', 'YYYY-MM-DD');
    if old_key <> new_key and (coalesce(r.day_assignees,'{}'::jsonb) ? old_key) then
      merged := coalesce(r.day_assignees,'{}'::jsonb);
      merged := jsonb_set(merged, array[new_key],
                  coalesce((select jsonb_agg(distinct x)
                            from jsonb_array_elements(coalesce(merged->new_key,'[]'::jsonb) || (merged->old_key)) as x),
                           '[]'::jsonb)) - old_key;
      update public.tasks set day_assignees = merged where id = p_id;
    end if;
  end if;

  update public.tasks set
    title=coalesce(nullif(trim(p_task->>'title'),''),title),
    notes=case when p_task ? 'notes' then nullif(p_task->>'notes','') else notes end,
    assignees=case when p_task ? 'assignees' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_task->'assignees') as x),'{}') else assignees end,
    recur_unit=coalesce(p_task->>'recur_unit',recur_unit), recur_n=coalesce((p_task->>'recur_n')::int,recur_n),
    due_at=case when p_task ? 'due_at' then (p_task->>'due_at')::timestamptz else due_at end,
    status=coalesce(p_task->>'status',status), priority=coalesce(p_task->>'priority',priority),
    done=case when p_task ? 'status' then (p_task->>'status')='done' else done end,
    duration_min=case when p_task ? 'duration_min' then (p_task->>'duration_min')::int else duration_min end
  where id=p_id returning * into r;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.verify_passcode(p_passcode text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.app_config
                 where key = 'edit_passcode' and value = p_passcode);
$function$
;

CREATE OR REPLACE FUNCTION public.wiki_search(p_auth_tag text, p_auth_pw text, p_q text, p_category text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, category text, snippet text, rank real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if public.account_role(p_auth_tag,p_auth_pw) is null then raise exception 'Logg inn for å lese kunnskapsbasen'; end if;
  return query
  with q as (
    select websearch_to_tsquery('norwegian', coalesce(nullif(trim(p_q),''),'')) as ts,
           coalesce(nullif(trim(p_q),''),'') as raw)
  select a.id, a.title, a.category,
    left(regexp_replace(coalesce(a.body,''), E'\\s+', ' ', 'g'), 220) as snippet,
    (ts_rank(a.tsv, q.ts) + coalesce(similarity(a.title, q.raw),0))::real as rank
  from public.wiki_articles a, q
  where (p_category is null or p_category = '' or a.category = p_category)
    and (q.raw = '' or a.tsv @@ q.ts or a.title % q.raw or a.body ilike '%'||q.raw||'%')
  order by (q.raw = '') desc, rank desc, a.updated_at desc
  limit 60;
end $function$
;

CREATE OR REPLACE FUNCTION public.wiki_tsv_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.tsv := to_tsvector('norwegian',
    coalesce(new.title,'') || ' ' || coalesce(new.body,'') || ' ' || array_to_string(coalesce(new.tags,'{}'),' '));
  return new;
end $function$
;

-- ---------- triggere ----------
CREATE TRIGGER wiki_tsv_trg BEFORE INSERT OR UPDATE ON public.wiki_articles FOR EACH ROW EXECUTE FUNCTION wiki_tsv_update();

-- ---------- RLS-policies ----------
create policy public read bikes on public.bikes for select using (true);
create policy coworkers_read on public.coworkers for select using (true);
create policy planner_notes_read on public.planner_notes for select using (true);
create policy tasks_public_read on public.tasks for select using (true);

-- ---------- tabell-grants (anon/authenticated/service_role) ----------
-- NB: nye tabeller får ofte default-grants i Supabase; revoke eksplisitt der det trengs.
grant delete, insert, references, select, trigger, truncate, update on public.app_config to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.bikes to anon;
grant delete, insert, references, select, trigger, truncate, update on public.bikes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.bikes to service_role;
grant delete, insert, references, trigger, truncate, update on public.coworkers to anon;
grant delete, insert, references, trigger, truncate, update on public.coworkers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.coworkers to service_role;
grant delete, insert, references, trigger, truncate, update on public.coworkers_public to anon;
grant delete, insert, references, trigger, truncate, update on public.coworkers_public to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.coworkers_public to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.planner_notes to anon;
grant delete, insert, references, select, trigger, truncate, update on public.planner_notes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.planner_notes to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.schema_migrations to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.sessions to service_role;
grant delete, insert, references, trigger, truncate, update on public.staff_status to anon;
grant delete, insert, references, trigger, truncate, update on public.staff_status to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.staff_status to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.tasks to anon;
grant delete, insert, references, select, trigger, truncate, update on public.tasks to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.tasks to service_role;
grant delete, insert, references, trigger, truncate, update on public.wiki_articles to anon;
grant delete, insert, references, trigger, truncate, update on public.wiki_articles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.wiki_articles to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.wiki_links to anon;
grant delete, insert, references, select, trigger, truncate, update on public.wiki_links to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.wiki_links to service_role;
grant delete, insert, references, trigger, truncate, update on public.wiki_suggestions to anon;
grant delete, insert, references, trigger, truncate, update on public.wiki_suggestions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.wiki_suggestions to service_role;

-- ---------- funksjons-grants ----------
-- (funksjoner uten linje her er kun for postgres/service_role)
grant execute on function public._clean_color(p text, p_default text) to anon, authenticated;
grant execute on function public._require_manager(p_auth_tag text, p_auth_pw text) to anon, authenticated;
grant execute on function public.account_role(p_tag text, p_password text) to anon, authenticated;
grant execute on function public.add_article(p_auth_tag text, p_auth_pw text, p_article jsonb) to anon, authenticated;
grant execute on function public.add_bike(p_passcode text, p_data jsonb) to anon, authenticated;
grant execute on function public.add_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text) to anon, authenticated;
grant execute on function public.add_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text) to anon, authenticated;
grant execute on function public.add_link(p_auth_tag text, p_auth_pw text, p_link jsonb) to anon, authenticated;
grant execute on function public.add_planner_note(p_auth_tag text, p_auth_pw text, p_weekday integer, p_body text, p_color text) to anon, authenticated;
grant execute on function public.add_suggestion(p_auth_tag text, p_auth_pw text, p_article_id uuid, p_article_title text, p_body text) to anon, authenticated;
grant execute on function public.add_task(p_auth_tag text, p_auth_pw text, p_task jsonb) to anon, authenticated;
grant execute on function public.change_password(p_tag text, p_old text, p_new text) to anon, authenticated;
grant execute on function public.delete_article(p_auth_tag text, p_auth_pw text, p_id uuid) to anon, authenticated;
grant execute on function public.delete_bike(p_passcode text, p_uid uuid) to anon, authenticated;
grant execute on function public.delete_coworker(p_auth_tag text, p_auth_pw text, p_tag text) to anon, authenticated;
grant execute on function public.delete_link(p_auth_tag text, p_auth_pw text, p_id uuid) to anon, authenticated;
grant execute on function public.delete_planner_note(p_auth_tag text, p_auth_pw text, p_id uuid) to anon, authenticated;
grant execute on function public.delete_staff_status(p_auth_tag text, p_auth_pw text, p_id uuid) to anon, authenticated;
grant execute on function public.delete_task(p_auth_tag text, p_auth_pw text, p_id uuid) to anon, authenticated;
grant execute on function public.get_article(p_auth_tag text, p_auth_pw text, p_id uuid) to anon, authenticated;
grant execute on function public.get_links(p_auth_tag text, p_auth_pw text) to anon, authenticated;
grant execute on function public.get_people(p_auth_tag text, p_auth_pw text) to anon, authenticated;
grant execute on function public.get_suggestions(p_auth_tag text, p_auth_pw text, p_status text) to anon, authenticated;
grant execute on function public.login_account(p_tag text, p_password text) to anon, authenticated;
grant execute on function public.logout_account(p_tag text, p_token text) to anon, authenticated;
grant execute on function public.prune_old_data() to anon, authenticated;
grant execute on function public.register_account(p_tag text, p_name text, p_title text, p_color text, p_password text, p_invite text) to anon, authenticated;
grant execute on function public.remove_day_assignee(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tag text) to anon, authenticated;
grant execute on function public.reset_password(p_auth_tag text, p_auth_pw text, p_target text, p_new text) to anon, authenticated;
grant execute on function public.resolve_suggestion(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text) to anon, authenticated;
grant execute on function public.set_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_assignees jsonb) to anon, authenticated;
grant execute on function public.set_day_assignees(p_auth_tag text, p_auth_pw text, p_id uuid, p_day date, p_tags jsonb) to anon, authenticated;
grant execute on function public.set_invite_code(p_auth_tag text, p_auth_pw text, p_new text) to anon, authenticated;
grant execute on function public.set_role(p_auth_tag text, p_auth_pw text, p_target text, p_role text) to anon, authenticated;
grant execute on function public.set_staff_status(p_auth_tag text, p_auth_pw text, p_tag text, p_kind text, p_day date, p_start_min integer, p_dur_min integer) to anon, authenticated;
grant execute on function public.set_staff_status_range(p_auth_tag text, p_auth_pw text, p_tag text, p_kind text, p_from date, p_to date) to anon, authenticated;
grant execute on function public.set_status(p_auth_tag text, p_auth_pw text, p_id uuid, p_status text) to anon, authenticated;
grant execute on function public.toggle_check(p_auth_tag text, p_auth_pw text, p_id uuid, p_ci integer) to anon, authenticated;
grant execute on function public.update_article(p_auth_tag text, p_auth_pw text, p_id uuid, p_article jsonb) to anon, authenticated;
grant execute on function public.update_bike(p_passcode text, p_uid uuid, p_data jsonb) to anon, authenticated;
grant execute on function public.update_coworker(p_auth_tag text, p_auth_pw text, p_tag text, p_name text, p_color text, p_title text) to anon, authenticated;
grant execute on function public.update_link(p_auth_tag text, p_auth_pw text, p_id uuid, p_link jsonb) to anon, authenticated;
grant execute on function public.update_task(p_auth_tag text, p_auth_pw text, p_id uuid, p_task jsonb) to anon, authenticated;
grant execute on function public.verify_passcode(p_passcode text) to anon, authenticated;
grant execute on function public.wiki_search(p_auth_tag text, p_auth_pw text, p_q text, p_category text) to anon, authenticated;
grant execute on function public.wiki_tsv_update() to anon, authenticated;

-- ---------- realtime-publikasjon ----------
-- alter publication supabase_realtime add table public.bikes;
-- alter publication supabase_realtime add table public.coworkers;
-- alter publication supabase_realtime add table public.planner_notes;
-- alter publication supabase_realtime add table public.staff_status;
-- alter publication supabase_realtime add table public.tasks;
-- alter publication supabase_realtime add table public.wiki_articles;
-- alter publication supabase_realtime add table public.wiki_suggestions;
