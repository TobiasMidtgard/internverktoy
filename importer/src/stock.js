// Lager per Thansen-butikk → supabase import_thansen_bike(p.stock_stores) → automatisk
// plassering i Velodex (supabase/stores_v2.sql).
//
// Returnerer en liste med Thansen-butikknumre der produktet er på lager, eller null når
// treffet ikke sier noe om lager per butikk. null betyr «ingen endring i plassering» —
// importen oppfører seg da som før.
//
// TODO: Feltnavnet i Thansens søkeindeks er ikke bekreftet ennå (indeksen var ikke
// tilgjengelig fra utviklingsmiljøet). Når det er kjent, fyll inn utlesingen her og legg
// et ekte treff i test/fixtures — resten av kjeden er ferdig og testet.
export function stockStoresFromHit(hit){
  void hit;
  return null;
}
