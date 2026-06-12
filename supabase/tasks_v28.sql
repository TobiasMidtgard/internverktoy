-- tasks_v28: bare MIDDELS-prioritet ruller videre til neste dag (eierbeslutning 2026-06-12).
-- Kritiske oppgaver er dagbundne (å gjøre dem dagen etter gir ikke mening i butikkdriften)
-- og blir stående på sin egen dato; lav prioritet bortfaller stille på samme måte.
-- Tidligere flyttet rollover_incomplete alt unntatt high frem til dagens dato.
-- Klienten (tasks.html) skjuler samtidig forfalte kritisk/lav fra «I dag»-visningene.

create or replace function public.rollover_incomplete()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int;
begin
  with upd as (
    update public.tasks set
      due_at = (((now() at time zone 'Europe/Oslo')::date
                 + (due_at at time zone 'Europe/Oslo')::time) at time zone 'Europe/Oslo')
    where recur_unit = 'none' and status <> 'done' and priority = 'medium' and due_at is not null
      and (due_at at time zone 'Europe/Oslo')::date < (now() at time zone 'Europe/Oslo')::date
    returning 1
  ) select count(*) into n from upd; return n;
end $function$;

notify pgrst, 'reload schema';
