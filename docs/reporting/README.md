# Managementrapportages lokaal gebruiken

Deze eerste versie draait in COP op localhost. Geen betaalde dienst of AI/API-credits nodig. Bewaren gebeurt in je lokale PostgreSQL-volume; mailopvang in het lokale Mailpit-volume. Dit is een **werkende import- en testmailversie**, geen live koppeling en nog geen echte ochtendmail naar Chico.

## Starten op je werklaptop

Docker Desktop moet draaien. Gebruik PowerShell in je bestaande COP-map:

```powershell
cd C:\dev\ClubOperationsPlatform
pnpm.cmd install --frozen-lockfile
docker compose up -d --wait
pnpm.cmd build:packages
pnpm.cmd --filter @cop/db db:migrate
pnpm.cmd dev
```

Laat de laatste terminal open. Open http://localhost:5173/rapportages of http://localhost:5173/organisaties/sport-society/rapportages. Mailopvang: http://localhost:8025.

1. Bij de eerste start: lees de lokale installatiecode met `Get-Content "$env:USERPROFILE\.cop\setup-token"`. De pagina toont het precieze pad als `COP_DATA_DIR` anders is ingesteld.
2. Maak je lokale beheerder met een eigen wachtwoord van minimaal 12 tekens. De code wordt verwijderd. Meld je daarna aan op de rapportagepagina.
3. Kies **Demo**, klik **Demo voor deze maand laden**, kies dagelijks of maandelijks. Dit zijn fictieve cijfers; je echte dataset blijft leeg.
4. Bekijk de HTML-mail en stuur hoogstens een **Testmail naar lokale opvang**. Ingevulde ontvangers zijn alleen voor het voorbeeld: het SMTP-envelope gaat uitsluitend naar `opvang@localhost.invalid`, op `127.0.0.1:1025`.
5. Voor echte cijfers: vul de canonical sjablonen aan vanuit gecontroleerde exports. Selecteer bron, clubs, gedekte periode en volledigheid. Controleer importhistorie en bronnen vóór gebruik.
6. Lees de voorgestelde definities. Keur versie `proposal-1` alleen goed nadat Chico de interpretaties heeft gecontroleerd. Planning staat standaard uit. Aanzetten betekent nog steeds **alleen automatische lokale testopvang**.

Stoppen: Ctrl+C voor COP. `docker compose stop` stopt opslag en mailopvang, zonder gegevens te verwijderen. Gebruik **geen** `docker compose down -v` als je gegevens wilt bewaren.

Node 24 en pnpm 10.17.1 passen bij de bestaande projectconfiguratie. De `.cmd`-commando’s vermijden de PowerShell script-policyproblemen die eerder optraden. Bij de eerste installatie is internet nodig om packages en Docker-images op te halen; verwerking van bestaande bestanden werkt daarna zonder internet.

## Wat werkt

- Dagrapport, maandrapport/churn, vijf clubs naast elkaar en organisatietotaal.
- Unieke leden, effectieve datums, pauze/bevriezing, herinschrijving en clubverhuizingen volgens zichtbare **voorstellen**.
- Omzet, ontvangen betalingen, openstaand en mislukte incasso afzonderlijk; gewogen leadconversie.
- CSV (komma of puntkomma) en Excel XLSX met één werkblad, exacte canonical kolomnamen en kalenderdatums. Maximaal 5 MB gecomprimeerd, 30 MB uitgepakt en 50.000 rijen. Geen formules/macro’s.
- Originele bestanden, importmoment, volledigheid, periode, clubscope, importvingerafdruk en fouten blijven lokaal bewaard. Een afgewezen import verandert geen cijfers. Identieke bytes én metadata geven geen tweede import.
- Better Auth-sessies in HttpOnly/SameSite cookies; COP-rechten `reports.read` en `reports.manage`, per organisatie en eventueel locaties. De huidige frontend-testrol bepaalt deze rechten niet.
- Lokale SMTP-opvang, opgeslagen mailvoorbeelden, unieke databaseclaims en runhistorie over herstarts heen.

## Wat ontbreekt nog

Geen Dewi API-adapter, Healthplanner API-adapter, mailbox-uitlezer of echte SMTP-verzending. Er zijn geen verzonnen vendor-endpoints in de code. De eerdere churnwerkmap was niet beschikbaar als gecontroleerde bron; de tabel gebruikt daarom de expliciete formule uit deze opdracht.

De eerste installatie maakt één beheerder voor Sport Society. Andere organisaties en lokale gebruikersrechten zijn technisch tenant-onafhankelijk opgeslagen, maar een gebruikers-/organisatiebeheerinterface ontbreekt. Voeg organisaties en assignments alleen serverzijdig toe via gereviewde databasebeheerprocedure; een nieuwe frontend-slug geeft geen toegang. De rest van COP blijft een pagina-/rolvoorbeeld en wordt hiermee geen volledig beveiligd product.

## Importafspraken

Sjablonen in `templates/` bevatten alleen kopregels, **geen echte ledengegevens**. Maak een kopie; werk niet in de originele export.

### Dewi abonnementhistorie

`subscriptionId, memberId, locationId, startDate, endDate, cancellationRequestedDate, pauseStart, pauseEnd, pauseKind`

- `memberId` moet binnen de organisatie dezelfde persoon identificeren over clubs en abonnementen heen. Een clubgebonden klantnummer moet eerst via een gecontroleerde ID-koppeltabel worden omgezet. Geen automatische koppeling op naam of e-mailadres.
- `subscriptionId` is organisatiebreed uniek. Eén rij per abonnementsperiode. Ook beëindigde en toekomstige abonnementen opnemen; het bestand moet de eerdere historie bevatten om nieuw/herinschrijving te onderscheiden.
- ISO kalenderdatums `YYYY-MM-DD`, geen tijdstempels. Ingang inclusief; einddatum is **eerste dag zonder abonnement**, dus exclusief. Controleer of de vendor juist een laatste geldige dag exporteert en converteer dan expliciet één dag.
- Aanvraagdatum en effectieve einddatum afzonderlijk. Een aanvraag zonder bevestigde einddatum wordt niet als uitstroom verwerkt.
- Eén pauze-interval per abonnementsperiode in deze versie; `pauseKind` = `paused` of `frozen`. Voor meerdere pauze-intervallen moet de adapter/het model eerst worden uitgebreid. Niet stilzwijgend oude pauzes weglaten.
- Geen beëindiging wegens pauze. Aansluitende clubwisseling is verhuizing; een later nieuw abonnement na een gat is herinschrijving. Uitstroom en verhuis-events tellen elk unieke leden per periode, geen aantal administratieve mutaties.
- Actief per club kan bij meerdere echte thuisclubabonnementen dezelfde persoon in twee clubs tellen. Het organisatietotaal telt deze persoon eenmaal. Healthplanner bezoekers komen niet in dit Dewi-aantal terecht.
- Volledigheid is een expliciete verklaring van de importeur, geen bewijs dat de leverancier alles aanleverde. Zonder complete historie van alle clubs blijven nieuw, uitstroom, verhuizingen en churn onbekend.

### Dewi financiën

`eventId, locationId, date, kind, amountCents`

`kind` = `revenue` (geboekte omzet), `payment` (ontvangen betaling), `outstanding` (open saldosnapshot) of `failed_debit` (op dat moment mislukte/onopgeloste incasso). Bedragen zijn gehele eurocenten, geen komma-eurobedragen. Omzet en betalingen worden over de periode opgeteld; saldi en mislukte incasso’s uitsluitend op de laatste dag. De complete verklaring omvat ook einddagsnapshots en expliciete afwezigheid van events. Een lege complete import verklaart nul; een ontbrekende import is onbekend. Geef elke financiële bronmutatie een stabiel eventId. Eén mislukte vordering niet meerdere keren opnemen als dezelfde incasso opnieuw wordt geprobeerd.

### Healthplanner dagrapport

`locationId, date, leads, converted, appointments, visitingActive, sleeping`

Eén rij per club per dag, inclusief nul-dagen. Lege cellen betekenen onbekend. `leads` en `converted` moeten dezelfde instroomcohort en periode gebruiken; anders geen conversie. Bezoekend actief/slapend zijn einddagsnapshots volgens HP-definitie en worden niet opgeteld over dagen. Organisatietotalen voor deze twee blijven onbekend omdat dit geaggregeerde rapport geen unieke personen over clubs bewijst.

## Planning, fouten en gemiste runs

Europe/Amsterdam inclusief zomer-/wintertijd. Dagelijks op ingestelde tijd: de vorige kalenderdag. Op de eerste dag van iedere maand ook de vorige **kalendermaand**. De API controleert elke 30 seconden. Beheerder moet ontvangers invullen, voorstellen goedkeuren en planning aanzetten. Alleen `real` wordt gepland; `demo` nooit automatisch.

Bij ontbrekende/onvolledige/verouderde bronnen wordt een run geblokkeerd. Een import is voor een actueel dagrapport verouderd na 36 uur; historische maandbestanden worden op gedekte periode beoordeeld. Ontbrekende waarden blijven onbekend. Handmatige testmailvoorbeelden mogen onbekende/voorlopige cijfers tonen, met waarschuwingen.

Computer uit, slaapstand of COP gestopt: geen verwerking of mail. Er is geen service die buiten COP doorloopt. Vijf minuten startmarge na de ingestelde tijd; daarna wordt ook de huidige run gemist genoemd, zonder late inhaalmail. Bij terugkeer wordt de laatste gemiste dag en de vorige gemiste maand zichtbaar geregistreerd; oudere niet uitgevoerde perioden zijn gaten in de historie. Een geplande tijd in het overgeslagen zomertijd-uur wordt ook gemist, niet stilzwijgend verplaatst. Zolang bronontvangst handmatig is, moet je ook dagelijks actuele bestanden aanleveren.

Zonder internet blijven bestanden, berekeningen en lokale testopvang werken. Een latere API-/mailboxadapter zal bij netwerkuitval bronfouten moeten registreren; zo’n adapter is er nu nog niet. Bij falende lokale SMTP wordt status **onzeker**, omdat een server het bericht kan hebben ontvangen voordat een bevestiging verloren ging. Geen automatische retry. Een claim die meer dan tien minuten blijft staan wordt ook onzeker.

Unieke sleutel: organisatie + dataset + rapportsoort + periodebegin. Twee processen/herstarts kunnen niet elk hetzelfde rapport claimen. Periodeblokkades en gemiste/onzekere runs worden in v1 niet opnieuw verstuurd, ook niet via de testknop. Dit is een bewuste beperking: exacte-once levering via algemene SMTP kan niet worden gegarandeerd. Voor echte verzending zijn een gereviewde retry-/herstelprocedure en afleveringcontrole nodig.

## Lokale opslag en geheimen

PostgreSQL- en Mailpit-volumes blijven op je apparaat. Auth-secret en eenmalige installatiecode staan buiten de repo in `%USERPROFILE%\.cop` (of `COP_DATA_DIR`). Gebruik je eigen Windows-gebruiker en beperk de maprechten; Unix gebruikt 0700/0600. Maak geen cloud-sync van deze map zonder bewuste keuze. Geen browser-localStorage met auth-/SMTP-geheimen. Er zijn in v1 **geen SMTP-wachtwoorden** omdat er alleen lokale opvang is. API en Dockerpoorten zijn loopback; dit ontwerp is niet bedoeld om op je netwerk/internet te publiceren.

Backup: stop COP, maak een PostgreSQL `pg_dump` en bewaar ook je `.cop`-map veilig. Het Docker-volume alleen is geen backup. Mailpit bevat opgeslagen testmails met rapportcijfers; maak ook daarvan een backup als je ze wilt bewaren. Geheimen en originele ledenbestanden niet committen. De database bewaart importoriginelen incl. eventuele persoonsgegevens; voeg een bewaartermijn/verwijderprocedure toe voordat meer gebruikers hiermee werken.

## Echt automatisch ontvangen en verzenden

Zie `sources.md` voor de exacte ontbrekende bronnen. Volgorde: bevestigde API-documentatie en rechten, anders automatisch aangeleverde rapporten, anders handmatige exports. Ontvangstadapters krijgen hetzelfde canonical model en slaan originelen/importmomenten op.

Voor echte uitgaande mails: SMTP-host/poort, TLS, afzender-/send-as-rechten, toegestane ontvangers en een lokaal beschermde serverconfiguratie (Windows Credential Manager of een serversecretfile met ACL). Geen browservelden voor wachtwoorden. Vervang pas na test/review de vaste `LocalTestMailer`, voeg expliciete real-delivery configuratie en herstelcontrole toe. Een apart altijd draaiend apparaat/service is nodig voor betrouwbare ochtendmails als je laptop ’s nachts uitstaat. Geen OpenAI nodig.

## Architectuur en verificatie

- `apps/api/src/reporting/adapters.ts`: ophalen/normaliseren/valideren.
- `calculation.ts`: pure berekeningen; `store.ts`: parameterized PostgreSQL; `delivery.ts`: claims/planning; `mail.ts`: vaste tekst/HTML/lokale SMTP.
- `service.ts` en `controller.ts`: sessions, permissions, scope en orchestration.
- `apps/web/src/reports`: scherm zonder opslag-/mailgeheimen.
- `packages/contracts/src/reports.ts`: gedeelde types en reviewbare definities.
- Drizzle-schema en expliciete SQL-migration in `packages/db`. Geen schema-push.

```powershell
pnpm.cmd verify
```

Databasetests gebruiken PGlite (PostgreSQL in WebAssembly) met echt PostgreSQL wire protocol. Docker-PostgreSQL/Mailpit moeten daarnaast bij de lokale start op je laptop worden gecontroleerd. De tests bevatten tenant-/clubscope, sessies, dubbele imports, ontbrekende bronnen, maand-/jaar-/DST-grenzen, churn, verhuizing, pauze, gewogen conversie en dubbele/onzékere verzending.
