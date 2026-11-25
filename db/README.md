# Direkte SQL-kjøring mot Supabase

Lar migreringer i `supabase/*.sql` kjøres direkte, uten copy-paste i SQL-editoren.

## Engangs-oppsett (du gjør dette)

1. Supabase → **Project Settings → Database → Connection string** → velg **Session pooler** (port `5432`), URI-format.
2. Kopier strengen og bytt `[YOUR-PASSWORD]` med database-passordet ditt.
3. Lag fila `db/.env` (den er gitignorert — pushes aldri) med innholdet:

   ```
   DATABASE_URL=postgresql://postgres.tfjvgvrqngevsiuueixf:DITT_PASSORD@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

Det er alt. Strengen gir tilgang kun til denne databasen, og du kan rotere
passordet (Settings → Database → Reset database password) når som helst.

## Kjøre en migrering

```bash
cd db && npm install        # én gang (henter pg)
node --env-file=db/.env db/run.mjs supabase/tasks_v7.sql
```

(Claude kjører disse kommandoene for deg når `db/.env` finnes.)

## Ad-hoc spørringer og lokal backup

```bash
node --env-file=db/.env db/query.mjs "select count(*) from tasks"
node --env-file=db/.env db/backup.mjs        # full datadump til db/backups/<tid>/ (gitignorert)
```

## Nattlige backuper (GitHub Actions)

Workflowen `.github/workflows/backup-db.yml` kjører `pg_dump` hver natt kl. 03:30 UTC,
krypterer dumpen og laster den opp som artifakt (30 dagers oppbevaring). Feiler den,
opprettes et issue i repoet automatisk.

**Gjenopprette:**

1. Last ned artifakten fra Actions → «Backup database» → siste kjøring.
2. Dekrypter (passordfrasen ligger som `BACKUP_PASSPHRASE` i `db/.env` og i repo-secrets):

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -in backup-ÅÅÅÅ-MM-DD.pgdump.enc -out dump.pgdump -pass env:BACKUP_PASSPHRASE
   pg_restore --clean --if-exists --no-owner -d "postgresql://…" dump.pgdump
   ```


## Flere butikker (stores_v1)

`supabase/stores_v1.sql` innfører butikker og butikkmedlemskap. Den endrer signaturen på
flere RPC-er, så migreringen og sidene må ut **samtidig**: gamle sider mot ny database
(eller omvendt) får feil ved lagring.

```bash
node --env-file=db/.env db/backup.mjs                       # 1. backup
node --env-file=db/.env db/run.mjs supabase/stores_v1.sql   # 2. migrering
node --env-file=db/.env db/run.mjs db/test_stores.sql       # 3. tilgangstest (rulles tilbake)
node --env-file=db/.env db/run.mjs supabase/stores_v2.sql   #    automatisk plassering (kan kjøres sammen med v1)
node --env-file=db/.env db/run.mjs db/test_auto_place.sql   #    test (rulles tilbake)
# 4. merge PR-en til main (GitHub Pages publiserer sidene)
node --env-file=db/.env db/snapshot.mjs                     # 5. oppdater skjema-snapshot
```

- All eksisterende data havner i butikken `fredrikstad`, og alle eksisterende ansatte blir medlem der.
- Kontoer med rollen `dev` (TMID) har tilgang til alle butikker uten medlemskap, og kan opprette
  nye butikker fra butikkvelgeren («+ Ny butikk…»).
- Butikksjefer legger til ansatte i sin butikk med «Ny ansatt» (en eksisterende kode legges til
  butikken i stedet for å opprettes på nytt) og setter butikkens invitasjonskode med nøkkelknappen.
- Velodex bruker nå innlogging i stedet for den felles redigeringskoden.
- Automatisk plassering (stores_v2): butikksjefen setter Thansen-butikknummeret med
  «Auto-plassering» i Velodex (redigeringsmodus). Nattlig import legger da ut sykler som er på
  lager i den butikken, én gang per sykkel. Importen må vite lager per butikk:
  `importer/src/stock.js` returnerer `null` til feltet i Thansens søkeindeks er bekreftet,
  og da endres ingen plassering.
