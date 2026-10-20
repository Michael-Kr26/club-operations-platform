# Vastgesteld ontwerp: ochtendmail en COP-overzicht

Status: ontwerprichting goedgekeurd door Michael op 20 oktober 2026. De HTML-mail en grafieken zijn inmiddels uitgewerkt; zie de [implementatiehandleiding](MAIL-EN-GRAFIEKEN.md). Ontwerpgoedkeuring wijzigt geen verzendinstellingen of bedrijfsdefinities.

## Visuele keuze

De gekozen referentie is de laatste blauwe versie van de uitgebreide ochtendmail: de lichte indeling van voorstel 2, de redactionele seriftypografie van voorstel 3 en oranje accenten bij **Vandaag aandacht voor**. De groene uitvoering is daarmee vervangen.

| Onderdeel                  | Richting                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Hoofdkleur                 | Blauw; diepblauwe KPI-cijfers en een helderblauwe hoofdknop.                                                         |
| Achtergrond                | Zeer lichtblauw rondom een witte mail.                                                                               |
| KPI-vlakken en tabelkoppen | Subtiele lichtblauwe vlakken, rustige scheidingslijnen.                                                              |
| Aandachtspunten            | Zacht oranje achtergrond met donkeroranje nummering en accenten.                                                     |
| Typografie                 | De elegante, goed leesbare serifstijl van voorstel 3; kleine bronlabels mogen een rustige sans-serif gebruiken.      |
| Statusindicatoren          | Groen voor beschikbare bronnen, oranje voor ontbrekende/verouderde gegevens; betekenis blijft ook in tekst leesbaar. |
| Dichtheid                  | Meer bruikbare cijfers, met duidelijke secties en voldoende witruimte.                                               |

Kleurstartpunten voor implementatie: hoofdkleur `#235ee8`, donkerblauw `#17477d`, lichtblauw `#edf4ff`, aandachtvlak `#fff0e3`, aandachtaccent `#c65a16` en hoofdtekst `#0f172a`. Controleer de uiteindelijke combinaties op leesbaarheid. De gegenereerde referentie bepaalt de stijl; een exacte fontnaam is daar niet uit vastgesteld. Gebruik bij HTML-mail een betrouwbare serif-fallback, bijvoorbeeld Georgia/Times, en beoordeel het resultaat in Outlook voordat de template definitief wordt.

## Dagelijkse mail

1. COP/Sport Society-afzenderstijl, begroeting, verzenddatum en expliciete rapportageperiode.
2. Kerncijfers: ledenbestand volgens de beschikbare Dewi-bron, nieuwe leden, effectieve uitstroom en leden zonder afspraak volgens Healthplanner.
3. Ledenontwikkeling per locatie: Achterveld, Barneveld, Voorthuizen, Harskamp en Wekerom naast elkaar.
4. Verkoop, afspraken en ledenbehoud: leads, verkochte lidmaatschappen, afspraken en slapende leden, voor zover de bron deze werkelijk bevat.
5. **Vandaag aandacht voor**: korte, concrete aandachtspunten met locatie en aanleiding.
6. Bronnen en volledigheid: bron, peildatum/periode, laatste geslaagde import en ontbrekende gegevens.
7. Knop naar het bijbehorende overzicht in COP.

Gebruik voor andere organisaties de eigen naam en toegankelijke locaties uit de configuratie, geen vaste Sport Society-data in het mailtemplate.

**Omzet staat niet in de dagelijkse mail. Omzet wordt wekelijks gerapporteerd.** Eventueel mag de dagelijkse footer daarnaar verwijzen. De precieze weekdag, tijd, weekafbakening en eventuele vergelijking met de vorige week moeten nog worden afgesproken. Een maandexport mag nooit worden verdeeld over fictieve weken om een weekgrafiek te vullen.

De gewenste dagelijkse ontvangst van de Healthplanner-bron is circa 08:33; de gewenste verzendtijd is 08:45 in Europe/Amsterdam. Dit zijn gewenste tijden, geen bevestiging dat mailboxontvangst of verzending al operationeel is.

Pauzes, bevriezingen, mislukte incasso's en openstaande posten blijven onderdeel van de gewenste gegevensdekking. Ontbreekt daarvoor een bevestigde bron, toon dan Onbekend/bron ontbreekt. Dagelijkse incasso-opvolging is iets anders dan omzetrapportage. De gekozen voorbeelden bevestigen geen bedragen of incassostatussen.

## Grafieken bij openen in COP

Gebruik dezelfde blauwe basis, oranje aandachtspunten en gekozen typografische stijl in het managementoverzicht.

| Grafiek                       | Gebruik                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lijn met zichtbare meetpunten | Ontwikkeling van leden, slapende leden en leden zonder afspraak door de tijd.                                                                          |
| Staafdiagram                  | Locaties vergelijken op nieuwe leden, effectieve uitstroom, leads, verkoop en afspraken.                                                               |
| Omzet per week                | Afzonderlijke financiële weergave met echte weekperioden; lijn met meetpunten voor ontwikkeling en staven voor vergelijking waar de data dat toelaten. |

Bediening: locatie(s), rapportageperiode en meetwaarde selecteren; waarden opvragen met muis én toetsenbord; legenda en een toegankelijke tabel met dezelfde cijfers aanbieden. Periode, bron en definitie moeten zichtbaar blijven.

Ontbrekende metingen zijn geen nul. Laat een onderbreking in een lijn en markeer ontbrekende staafwaarden. Gebruik geen verzonnen tussenpunten, gladgestreken trends of extrapolatie bij één beschikbare bron. Vergelijk alleen overeenkomstige, voldoende gedekte perioden. Toon een melding als er onvoldoende meetpunten zijn.

## Gegevensvoorwaarden

- Alle cijfers, datums en bronstatussen in de ontwerpafbeeldingen zijn fictieve voorbeelden. Ze mogen niet als echte clubgegevens, imports of operationele bronstatussen worden geladen.
- Een Dewi-exportselectie is geen bewezen aantal actieve, ongepauzeerde abonnementen. Gebruik alleen een preciezere KPI-naam wanneer de aangeleverde bron dat ondersteunt.
- Healthplanner-bezoek, slapende leden, afspraken en Dewi-abonnementen hebben afzonderlijke definities. Verifieer onder meer of afspraken gepland of afgerond zijn; de voorbeeldtekst is geen bedrijfsregel.
- Bewaar aanvraagdatum en effectieve einddatum afzonderlijk; de voorgestelde uitstroom gebruikt de effectieve einddatum en blijft onderdeel van de bestaande bedrijfsregelreview.
- Een som van clubregistraties bewijst geen unieke organisatiebrede ledenstand. Geen automatische koppeling tussen systemen op naam/e-mail.
- Conversiepercentages worden berekend uit onderliggende aantallen, niet opgeteld.
- Behoud de bestaande tenant-/locatierechten en de scheiding tussen werkelijke gegevens en demo.

## Implementatievolgorde

1. Maak een echte HTML-mail en lokale preview op basis van deze vastgelegde stijl. Voeg geen afbeeldingsmail toe: tekst en tabellen moeten echte inhoud blijven.
2. Maak een rapportagemodel dat de juiste bronperiode, ontbrekende velden en huidige KPI-definities doorgeeft. Sluit de preview daarop aan.
3. Bouw het COP-overzicht met lijnen/meetsymbolen, staven, filters, exacte waarden en brontoelichting.
4. Sluit de omzetimport aan op een aparte weekrapportage nadat bronindeling en weekafbakening zijn bevestigd.
5. Controleer de HTML-mail op desktop en mobiel, inclusief Outlook, en het dashboard op bediening en leesbaarheid. Voeg betekenisvolle tests toe voor ontbrekende waarden, perioden, locaties en dagelijks/wekelijks gescheiden omzet.
6. Verbind daarna pas de automatische bronontvangst en planning met de bestaande verzendvoorziening. Behoud dubbele-verzendpreventie en zichtbaarheid van gemiste runs.

Ontwerpgoedkeuring op zichzelf verstuurt geen mail, schakelt geen planning in en bevestigt geen nieuwe koppeling.
