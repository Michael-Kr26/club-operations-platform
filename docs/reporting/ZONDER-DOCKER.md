# COP lokaal starten zonder Docker

Gebruik deze startoptie als Docker/WSL op je Windows-laptop niet werkt. Website, backend, lokale accounts, imports, rapportages en mailvoorbeelden draaien dan met een ingebedde PostgreSQL-engine (PGlite). Geen extra systeeminstallatie of betaalde dienst nodig; de benodigde pakketten zitten al in de development dependencies.

Stop eventuele COP/front-end-terminals met Ctrl+C. Voer uit:

```powershell
cd C:\dev\ClubOperationsPlatform
git pull --ff-only origin main
pnpm.cmd dev:local
```

Dit bouwt de gedeelde pakketten en API, start de lokale database, voert migraties uit en start backend en frontend. Open na **COP klaar**: http://localhost:5173/rapportages. Laat de terminal open. De frontend ververst bij wijzigingen; na backendwijzigingen stop en herstart je dev:local om de API opnieuw te bouwen.

## Eerste gebruik

Lees in een tweede terminal de eenmalige installatiecode:

```powershell
Get-Content "$env:USERPROFILE\.cop\setup-token"
```

Maak via de rapportagepagina je lokale beheerder en log in. Kies **Demo**, klik **Demo voor deze maand laden** en kies **Maandelijks & churn**. De vijf clubs, organisatietotaal, broninformatie en het mailvoorbeeld worden getoond met duidelijk fictieve data. Echte imports blijven gescheiden. Voor echte imports zijn de bestaande canonieke CSV/XLSX-sjablonen en bedrijfsregelreview van toepassing.

## Opslag en beperkingen

Gegevens staan op je apparaat in `%USERPROFILE%\.cop\postgres-local`, of in `postgres-local` onder COP_DATA_DIR. Auth-secret en setup-token staan in dezelfde bovenliggende COP-map. Ctrl+C stopt de processen en sluit de database; gegevens blijven bewaard. Maak een backup terwijl COP gestopt is. Deze database is **apart van een eventuele Docker-database**; bestaande Docker-gegevens worden niet automatisch overgezet of verwijderd.

Databasepoort is alleen `127.0.0.1:5433`; API 3000 en website 5173 zijn ook loopback. Laat maar één dev:local-proces per gegevensmap draaien. PGlite is bedoeld voor deze lokale ontwikkel-/pilotomgeving, niet voor de commerciële multi-userproductieomgeving. De socketadapter verwerkt queries via één ingebedde database en heeft andere concurrency-eigenschappen dan een zelfstandige PostgreSQL-server. Voor productie blijven zelfstandige PostgreSQL, backups en operationele controles nodig.

Mailvoorbeelden werken zonder SMTP. Mailpit draait niet met dit command; daarom wordt de lokale testmailknop verborgen. Echte Microsoft 365-verzending vereist nog steeds de beschermde lokale OAuth-configuratie, mailboxrechten en toegestane ontvangers uit [MICROSOFT365.md](MICROSOFT365.md). Deze startoptie activeert geen mailaccount en verstuurt geen demo naar echte adressen. Voor ontbrekende/ongeldige bronnen en gemiste/onzékere runs blijven dezelfde blokkades gelden.

Na een harde crash kan `pglite-local.lock` achterblijven. Sluit eerst alle COP-processen. Controleer de PID in dat bestand en dat het betreffende proces niet meer draait voordat je uitsluitend het lockbestand verwijdert. Verwijder nooit `postgres-local` om een lockfout op te lossen.

Deze startoptie is getest met migraties, echte Better Auth-login, vijfclubdemo, mailvoorbeeld en persistentie na procesherstart. Een fysieke Windows-laptoptest moet nog door de gebruiker worden uitgevoerd.
