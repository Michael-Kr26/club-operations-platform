# Nieuwe ochtendmail en grafisch managementoverzicht

Het vastgestelde ontwerp is in HTML en COP-componenten uitgewerkt: blauw als hoofdkleur, oranje aandachtspunten en Georgia/Times als betrouwbare serif-fallback. De mail bevat echte tekst en tabellen, geen grote afbeelding. Er zijn dag-, week- en maandvoorbeelden. Implementatie verandert geen ontvangers en schakelt geen verzending in.

## Ophalen en starten

Stop COP met Ctrl+C en voer uit in PowerShell:

```powershell
cd C:\dev\ClubOperationsPlatform
git pull --ff-only origin main
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:local
```

De lokale starter voert ook de nieuwe migratie voor weekrapporten uit. De bestaande database blijft behouden.

## Mailvoorbeelden

Open `http://localhost:5173/rapportages`. Kies Werkelijk of Demo, het rapporttype en de rapportdatum. Onder **Mailvoorbeeld** staat de nieuwe HTML-mail, met de tekstversie eronder. De voorbeeldweergave kan scrollen. Omzet staat uitsluitend in **Wekelijks · omzet**; het dag- en maandvoorbeeld bevatten geen omzetbedragen. Maandelijkse churn blijft beschikbaar.

Dagelijks: kerncijfers, ledenontwikkeling, verkoop/afgeronde afspraken/ledenbehoud, pauzes en financiële opvolging, aandachtspunten en bronvolledigheid. Een Dewi-exportselectie krijgt een afzonderlijk blok met peildatum en wordt nooit gebruikt als bewijs van actieve abonnementen. Ontbrekende dagvelden kunnen uit een geaccepteerd Healthplanner-werkboek/EML worden aangevuld, uitsluitend voor precies dezelfde club en dag. Bestaande berekende dagwaarden blijven leidend. De bron staat erbij; zo'n aanvulling is geen goedkeuring van ontbrekende canonieke brondekking voor verzending.

Via **Aanhefnaam (optioneel)** kun je bijvoorbeeld Chico instellen voor **Goedemorgen, Chico.** Zonder naam blijft de begroeting algemeen. Het template werkt zo voor meerdere organisaties en ontvangers. Fictieve ontwerpcijfers zijn niet als echte data opgeslagen.

De knop in een echte mail opent het grafische COP-overzicht met organisatie, dataset en rapportage-einddatum. Het adres gebruikt de bestaande serverconfiguratie `WEB_URL` (standaard `http://localhost:5173`). Een localhost-link werkt op het apparaat waarop COP draait. Een aanmelding/toegangscontrole blijft van toepassing. De ingebedde mailpreview heeft bewust een strikte sandbox; gebruik de normale COP-navigatie om vanuit de preview naar het dashboard te gaan.

## Grafieken

Open `http://localhost:5173/rapportages/excel`. Bovenaan staat **Jouw clubs in beeld**, met een lijngrafiek met meetpunten en een staafdiagram per locatie.

- Kies gegevensbron, meetwaarde, locatie, interval, einddatum en 6/12/16 perioden.
- Healthplanner: dag/week/maand volgens de aanwezige bronperioden; brondefinities blijven apart. Dagpunten kunnen ook uit de oorspronkelijke rapportage-import komen. Bij overlap wint de nieuwste volledige bron per club/dag, inclusief onbekende velden; er wordt niet teruggevuld uit oudere bestanden.
- Dewi-ledenexport: snapshots op de bevestigde peildatums; status Actief bewijst geen actief abonnement.
- Dewi-forecast: historisch/lopend bronbeeld tot de exportmaand, inclusief de bijbehorende onzekerheid.
- Omzet: alleen afgesloten kalenderweken uit de financiële rapportage-import. Ontvangen betalingen en openstaand saldo zijn afzonderlijk te kiezen.
- Aanwijzen of Tab gebruiken op een meetpunt/staaf toont waarde, periode en bron. De uitklapbare tabel bevat alle exacte waarden en broninformatie.

Ontbrekende metingen onderbreken lijnen. Een nul blijft nul; een onbekende waarde krijgt geen staaf. Eén meetpunt vormt geen trend. Het overzicht verzint geen tussenliggende punten en telt percentages niet bij elkaar op. Een som van clubregistraties is geen bewezen unieke organisatietelling. Alleen toegankelijke locaties worden geladen/getoond.

De staafvergelijking hoort bij de laatste geselecteerde periode, niet stilzwijgend bij een oudere periode met toevallig beschikbare cijfers. Kies een andere einddatum wanneer je een eerdere bronperiode wilt vergelijken. De omzetweergave gebruikt automatisch de laatste zondag op/vóór de gekozen einddatum, zodat alleen gesloten weken worden vergeleken.

## Omzet en weekplanning

Een kalenderweek loopt van maandag tot en met zondag. De weekmail gebruikt de **vorige volledige kalenderweek** ten opzichte van de gekozen verzenddag. In de rapportage-instellingen kun je **Weekrapport op** kiezen. Standaard staat dit uit; een bestaande planning krijgt dus niet vanzelf extra weekmails. De weekmail gebruikt dezelfde verzendtijd en dezelfde algemene planningsschakelaar als de bestaande planning. Regels, ontvangers en de bestaande mailproviderconfiguratie blijven vereist.

Voor echte weekomzet zijn financiële events met volledige weekdekking nodig. De bestaande CSV-import vereist `eventId,locationId,date,kind,amountCents`, met `kind=revenue` voor omzet, gehele centen en unieke event-id's. `payment`, `outstanding` en `failed_debit` blijven afzonderlijke soorten gegevens. Markeer volledigheid alleen wanneer de bron de gekozen periode daadwerkelijk dekt. Een andere CSV-indeling vereist een passende adapter.

Een maandelijkse Dewi-omzet-XLSX blijft als afzonderlijke bronweergave beschikbaar, maar wordt nooit naar weekbedragen omgerekend. Als alleen die maandexport aanwezig is, blijven de weekgrafiek en weekmail onbekend. Dit is geen importfout.

Automatische weekverzending vereist goedgekeurde regels, ontvangers, een afgesloten week en geldige, complete financiële dekking voor alle toegankelijke clubs. Ontbrekende Healthplanner-/ledenbronnen blokkeren een financieel weekrapport niet, maar worden daarmee niet als compleet beschouwd. Voor dag-/maandverzending blijven de bestaande strengere broncontroles gelden.

Dubbele verzending wordt in de database voorkomen per organisatie, dataset, rapporttype en periode. Bij een gemiste verzendtijd registreert COP een gemiste run; er is geen stille inhaalmail na de bestaande vijfminutenmarge. Bij onzekere mailacceptatie is er geen automatische retry. Laptop/COP uit betekent geen uitvoering. Dit implementeert geen nieuwe automatische Outlook- of Dewi-API-koppeling.

## Controle en beperkingen

Tests controleren kleuren/HTML-escaping, onbekende waarden, scope, bronaanvulling, dagelijkse versus wekelijkse omzet, ISO-/jaargrenzen, wintertijd, weekplanning, meetgaten, nulwaarden, toetsenbordbediening en bronvermelding. De lokale HTTP-proef controleert ook de nieuwe migratie en dubbele weekclaims zonder echte mail te sturen.

De mail is opgebouwd voor gangbare HTML-mailclients, met inline stijlen, tabellen, systeemfonts en een mobiele mediaregel. De exacte weergave in jouw Outlook-installatie moet nog visueel worden beoordeeld. De grafieken zijn geen prognose en de geaccepteerde ontwerpafbeelding is geen bewijs dat er al live bronontvangst is.
