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
