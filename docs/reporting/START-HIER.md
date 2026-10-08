# COP rapportages: snel starten

## Zonder Docker (aanbevolen bij WSL-problemen)

Zie [de korte startinstructie](ZONDER-DOCKER.md). Met `pnpm.cmd dev:local` starten website, backend, database en migraties samen.

## Met Docker: ophalen en starten (PowerShell)

Stop een eventueel draaiende COP-terminal met Ctrl+C. Docker Desktop moet draaien.

```powershell
cd C:\dev\ClubOperationsPlatform
git fetch origin
git switch main
git pull --ff-only origin main
pnpm.cmd install --frozen-lockfile
docker compose up -d --wait
pnpm.cmd build:packages
pnpm.cmd --filter @cop/db db:migrate
pnpm.cmd dev
```

Open **http://localhost:5173/rapportages**. Laat de laatste terminal open.

## Eerste gebruik

1. Lees de eenmalige installatiecode in een tweede PowerShell-terminal:
   `Get-Content "$env:USERPROFILE\.cop\setup-token"`.
2. Maak via de rapportagepagina je lokale beheerder. Gebruik een eigen wachtwoord van minstens 12 tekens. Meld je daarna aan.
3. Kies **Demo** en **Demo voor deze maand laden**. Selecteer **Maandelijks & churn** om de maandtabel te bekijken. Demo is fictief en blijft gescheiden van echte cijfers.
4. Bekijk de ochtendmail. **Testmail naar lokale opvang** levert alleen af op **http://localhost:8025**. Chico krijgt geen mail.
5. Voor echte gegevens: gebruik de CSV-kopregels in `templates/`, of een XLSX met dezelfde kolommen. Geef bron, clubs, periode en volledigheid op. Bekijk daarna de importmeldingen.
6. Lees/controleer de definities voordat je ze goedkeurt. Ontvangers, tijd en planning zijn instelbaar; planning gebruikt standaard lokale testopvang. Echte Microsoft 365-verzending instellen: [handleiding](MICROSOFT365.md).

## Belangrijk

**Werkt:** dag-/maandrapporten, churn, clubs en totaal, CSV/XLSX-import, lokale opslag, mailvoorbeelden, testmailopvang, bron-/import-/runhistorie en serverrechten.

**Nog niet gekoppeld:** Dewi API, Healthplanner API/rapportagemail, automatische mailboxontvangst. Echte uitgaande mails vereisen de lokale Microsoft 365-configuratie en bevestigde beheerrechten. Nodig: originele managementmails, volledige abonnementhistorie incl. einddatums/thuisclubs, financiële exports en bevestigde API-/mailrechten. De huidige actieve-ledenlijst bewijst geen maandchurn.

**Laptop of COP uit:** geen automatische run. Gemiste laatste dag/maand wordt geregistreerd; geen stille inhaalmail na de startmarge van vijf minuten. Een lokale SMTP-fout blijft ‘onzeker’, zonder herverzending. Eén periode wordt slechts eenmaal geclaimd.

Stoppen: Ctrl+C. Gegevens blijven in lokale Docker-volumes en je `.cop`-map. Verwijder die niet. Uitgebreide definities, backup, beperkingen en vervolgstappen: [README](README.md) en [bronnen](sources.md).
