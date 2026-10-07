# Verificatie van de eerste lokale versie

7 oktober 2026. `pnpm verify` controleert formattering, lint, TypeScript, Vitest en productiebuilds. Betekenisvolle tests controleren unieke leden/churn, aanvragen versus effectieve datums, pauze/herinschrijving/verhuizing, ontbrekende bronnen, nulbeginbestand, maand-/jaar-/DST-grenzen, leadconversie en financiële saldosnapshots.

Opslag-/HTTP-tests voeren de gecommitteerde SQL-migration uit op PGlite, bereikbaar via het PostgreSQL wire protocol en de normale `pg` driver. Ze testen Better Auth-sessies, HttpOnly cookies, afwijzing van publieke signup, tenant-/clubscope, geweigerde import-/mailrechten, originele importbytes, metadata-onafhankelijke duplicaatdetectie, gescheiden demo/real, gelijktijdige runclaims, herstarts en onzekere SMTP-aflevering.

Aanvullende werkelijke TCP-smokecheck uitgevoerd met: Vite-proxy → Nest/Fastify → Better Auth → PostgreSQL wire/PGlite → lokale SMTP-testserver. Met uitsluitend fictieve data voor vijf clubs:

- Aanmelden en drie demo-imports succesvol.
- Maandtabel bevat vijf clubs; fictief uniek actief totaal 75.
- HTML-/tekstvoorbeelden aangemaakt; uitsluitend `local-test-only`.
- Werkelijke Nodemailer SMTP-transactie naar `opvang@localhost.invalid` op loopback; lokaal opgevangen.
- Tweede identieke maandverzending geweigerd als duplicaat.

De tests vervangen geen leverancieracceptatie. De Docker CLI is niet aanwezig in deze uitvoeromgeving; daarom is Docker-PostgreSQL 18 en het Mailpit-image hier niet gestart. Een cloudbrowser kon de localhost van deze uitvoeromgeving niet bereiken; browserbeelden/visuele QA zijn niet geclaimd. De lokale start op de Windows-laptop en de gecontroleerde echte exports vormen de volgende acceptatiestap. Er zijn geen echte mails of persoonsgegevens voor deze test gebruikt.
