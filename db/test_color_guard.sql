-- Regresjonstest for tasks_v16: farge- og kodevalidering. Rulles alltid tilbake.
-- Bruk: node --env-file=db/.env db/run.mjs db/test_color_guard.sql
begin;

do $$
declare v text;
begin
  -- _clean_color
  if public._clean_color('#abc', 'x') <> '#abc' then raise exception 'FAIL: #abc avvist'; end if;
  if public._clean_color('#aabbcc', 'x') <> '#aabbcc' then raise exception 'FAIL: #aabbcc avvist'; end if;
  if public._clean_color('#fff"><img src=x onerror=alert(1)>', 'x') <> 'x' then raise exception 'FAIL: XSS-farge slapp gjennom'; end if;
  if public._clean_color(null, 'x') <> 'x' then raise exception 'FAIL: null ga ikke default'; end if;

  -- register_account: ond farge skal coerces til default, ikke lagres
  perform public.register_account('ZZC1','Test','Deltid','#fff"><script>1</script>','test1234');
  select color into v from public.coworkers where tag='ZZC1';
  if v <> '#004595' then raise exception 'FAIL: ond farge lagret: %', v; end if;

  -- register_account: ond/ugyldig kode skal avvises
  begin
    perform public.register_account('"><i','Test','Deltid','#004595','test1234');
    raise exception 'FAIL: ugyldig kode akseptert';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  raise notice 'OK: farge- og kodevalidering virker';
end $$;

rollback;
