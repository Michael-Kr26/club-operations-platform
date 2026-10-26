# Operationele werkruimte

Back-ups, herstel en Windows-opstartondersteuning: zie [Lokaal beheer](LOCAL-BEHEER.md).
Merchandise heeft een optioneel kleurveld bij toevoegen en wijzigen. Maak voor
aparte kleurvoorraden afzonderlijke artikelen aan; aantallen blijven per artikel.

Deze eerste versie verbindt vijf modules met de lokale COP-database. Er is geen betaalde dienst of AI nodig. Rapportage-import en ochtendmail blijven afzonderlijke onderdelen.

## Ophalen en starten op de werklaptop

Stop COP eerst met Ctrl+C. Voer uit in PowerShell:

```powershell
cd C:\dev\ClubOperationsPlatform
git pull --ff-only origin main
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:local
```

Migraties worden automatisch uitgevoerd. Verwijder de map `C:\Users\mssyt\.cop` niet: daarin staan de database, originele imports en lokale configuratie. Maak een backup wanneer COP netjes gestopt is. Raadpleeg bij een achtergebleven lock de lokale starthandleiding; wis geen lock terwijl een tweede COP-proces draait.

## Wat je kunt gebruiken

| Pagina                                     | Werking                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost:5173/locaties`           | Locaties met de nieuwste bevestigde Dewi-selectie, open taken en diensten van vandaag.                                       |
| `http://localhost:5173/locaties/barneveld` | Eigen Healthplanner-cijfers met bron en periode; een locatiesignaal omzetten naar een opvolgtaak.                            |
| `http://localhost:5173/leden`              | Dewi-leden zoeken, filteren op 14/30 dagen niet geweest, contactnotities bewaren en een opvolgtaak maken.                    |
| `http://localhost:5173/team`               | Medewerkers, personeelsnummers, inzetbare locaties, vaardigheden en contracturen vastleggen.                                 |
| `http://localhost:5173/planning`           | Alle toegankelijke locaties in één weekrooster; diensten aanmaken/bewerken, concept/definitief, open diensten en annulering. |
| `http://localhost:5173/taken`              | Toewijzen, prioriteit, deadline, voortgang, afronden, heropenen en annuleren.                                                |
| `http://localhost:5173/controles`          | Dagelijkse/wekelijkse/maandelijkse controlelijsten, afvinktaken, apparaten en onderhoudstaken.                               |

Dezelfde modules bestaan onder `/organisaties/:organizationSlug/…`. De server bepaalt de toegankelijke organisatie en locaties. De keuze Werkelijk/Demo houdt gegevens gescheiden. Een lege demo wordt niet automatisch met echte clubgegevens gevuld.

Begin met Team: voer medewerkers, inzetbare locaties en vaardigheden in. Maak daarna op Planning diensten. Zonder toegewezen medewerker blijft een dienst open. Voor een definitieve toegewezen dienst moet de benodigde vaardigheid zijn vastgelegd. Overlap wordt ook tussen locaties gecontroleerd, voor concepten én definitieve diensten; aansluitende diensten zijn toegestaan. Nachtdiensten moeten in twee dagen worden gesplitst. Reistijd wordt nog niet gecontroleerd.

## Bronnen en definities

Leden komen uitsluitend uit een geaccepteerde Dewi XLSX-ledenexport via Rapportages → Excel/ZIP, met bevestigde locatie en peildatum. Standaard wordt de nieuwste bronpeildatum per locatie gebruikt. Je kunt ook een oudere bron kiezen. Namen, e-mail en telefoon zijn alleen in het afgeschermde ledenoverzicht beschikbaar; grafiekgegevens blijven aggregaten. Onbekende bezoekdatums blijven onbekend. Niet-bezoeken telt vanaf de bronpeildatum en bewijst geen opzegging. Een exportselectie of status Actief bewijst geen volledig bestand met geldige, ongepauzeerde abonnementen.

Klantnummers krijgen een locatiesleutel. Namen/e-mailadressen worden niet gebruikt voor automatische ontdubbeling tussen clubs of koppeling met Healthplanner. Individuele afspraken/coach/doel uit Healthplanner zijn nog niet beschikbaar. Contactnotities blijven staan; voeg een correctie toe wanneer iets verkeerd is. Er wordt geen bericht naar het lid verstuurd.

Locatiepagina's houden Healthplanner en Dewi apart. Een ontbrekend broncijfer toont Onbekend. Bij een nieuw rapport blijft een bestaande taak voor hetzelfde signaal, dezelfde club en periode behouden, ook als de taak al is afgerond. Ledenopvolging dedupliceert per lid en bronimport. Een onderhoudstaak is een expliciet nieuw verzoek; een herhaald verzoek met dezelfde code wordt niet dubbel opgeslagen.

CSV-omzet hoort momenteel bij de oorspronkelijke rapportage-import met de kolommen `eventId,locationId,date,kind,amountCents`; voor omzet is `kind` gelijk aan `revenue` en het bedrag staat in gehele centen. De Excel/ZIP-route verwerkt XLSX/EML, geen willekeurige omzet-CSV. Een andere CSV-indeling vereist eerst inspectie en een passende adapter. Omzet, ontvangsten en openstaande bedragen zijn verschillende soorten gegevens.

## Controles, onderhoud en roosters

Controlelijsten maken taken voor de huidige kalenderdag, ISO-week (maandag–zondag) of kalendermaand in Europe/Amsterdam. Dat gebeurt bij opslaan, handmatig via de knop en tijdens de bestaande lokale planningscyclus. Een periode krijgt maximaal één taak per controlelijst. Afgeronde taken worden niet opnieuw geopend. Gewijzigde controlepunten gelden voor volgende taken; bestaande taken bewaren hun oorspronkelijke punten. Afronden kan pas wanneer alles is afgevinkt.

Als COP uitstaat, ontstaan geen taken. Bij opnieuw starten wordt de huidige periode aangemaakt; gemiste periodes worden niet achteraf als uitgevoerd gemarkeerd of ingevuld. Een niet meer inzetbare standaardmedewerker wordt bij nieuwe taken vervangen door Niet toegewezen. Bestaande taken behouden hun historie.

Apparaatstatus en onderhoudstaak worden apart opgeslagen. Een afgeronde taak maakt een defect apparaat niet automatisch inzetbaar: pas de apparaatstatus na controle aan. Onderhoudsdatums leiden nog niet automatisch tot onderhoudstaken.

Een definitief rooster staat in COP. Er zijn nog geen medewerkersportaal, notificaties, urenregistratie, verlofregistratie, automatische contract-/arbeidstijdencontrole of Excel-roosterimport. Contracturen zijn een weekreferentie. Vloeruren tellen alleen definitief toegewezen diensten met werkzaamheid Vloer; PT, lessen, intake en administratie tellen daar niet bij. Bezettingsnormen/capaciteit zijn niet bekend, dus COP beweert geen onderbezetting te kunnen berekenen.

## Toegang en opslag

Nieuwe serverrechten: `operations.read`, `operations.manage` en `members.read`. Organisatie- en locatiescope worden bij iedere serveractie gecontroleerd. Personeelsbeheer vereist organisatierechten; een locatiemanager kan eigen taken, diensten, controles en apparaten beheren. Personeelsnummers maken geen loginaccount en bepalen geen toegangsrol. De bestaande mockrol in de navigatie is geen serverautorisatie.

De migratie geeft bestaande accounts met `reports.manage` de nieuwe rechten. Accounts met uitsluitend rapportageleesrecht krijgen geen extra persoonsgegevensrechten. Andere rollen/toewijzingen moeten expliciet worden ingericht in de bestaande `report_access`-opslag; er is nog geen rollenbeheerinterface. De tijdelijke lokale Sport Society-eigenaar krijgt alle rechten wanneer de bestaande lokale toegangsmodus actief is. Andere organisaties en niet-lokale modus blijven aanmelding vereisen.

Updates gebruiken versienummers: wanneer twee schermen hetzelfde record veranderen, krijgt de tweede een melding om te vernieuwen. Roostercontroles en writes worden per organisatie en dataset in een databasetransactie beschermd. Importbestanden, persoonsgegevens en database horen niet in Git. Operationele auditregels bevatten record-id, soort, locatie, dataset en versie; geen volledige contactnotities.

## Verificatie

`pnpm.cmd verify` controleert formattering, lint, types, tests en builds. Integratietests gebruiken de echte lokale PostgreSQL-protocolopslag en controleren scopes, rechten, versies, bronverificatie, dubbele taken, gelijktijdige roosterconflicten, vaardigheden, datumgrenzen, terugkerende taken en contacthistorie. Componenttests controleren leesrechten, onbekende waarden, ledenfilters en checklistbediening. Een volledige lokale start/import/bewerking/herstart wordt daarnaast met HTTP gecontroleerd. Browseropmaak is niet met een geautomatiseerde visuele browsertest vastgesteld.

## Voorraadbeheer

Open `/voorraad` (of `/organisaties/:organizationSlug/voorraad`) via het zijmenu. Er zijn aparte overzichten **Werkkleding** en **Merchandise**; `/voorraad?view=merch` opent direct merchandise.

De centrale voorraad is alleen toegankelijk met organisatierechten (`locations=null`) en `operations.read`. Aanpassen vereist daarnaast `operations.manage`. Locatiemanagers krijgen geen toegang tot de centrale organisatievoorraad. Voorraad per club, uitgifte aan medewerkers en inkoop/verkoop zijn nog niet inbegrepen.

Sport Society start in Werkelijk met Werkshirts M=2, L=2 en XL=3. S en XXL zijn nog niet geteld. Vesten en truien hebben S/M/L/XL/XXL; tassen hebben één aantal. Niet opgegeven aantallen blijven onbekend, geen nul. Deze eenmalige starttelling wordt bij herstart niet over bestaande voorraad geschreven. Merchandise begint leeg, net als de voorraad van andere organisaties en de afzonderlijke demodataset.

Gebruik **Artikel toevoegen**, kies een naam, categorie en S t/m XXL of één totaal. Vul aantallen in en klik **Voorraad opslaan**. Toevoegen aan het overzicht alleen bewaart nog niet; de melding toont niet-opgeslagen wijzigingen. Wijzigingen gelden voor de hele voorraad, ook als een ander overzicht actief is. De telling staat in de lokale database, met datum en een auditregistratie. Conflicten bij gelijktijdig opslaan worden geweigerd; vernieuw dan bewust het overzicht. Er is voorlopig geen verwijderknop: bestaande artikelen blijven bewaard.

De lokale starter voert migratie `0006_inventory_stock` automatisch uit. Er zijn geen nieuwe pakketten of mailkoppelingen nodig.
