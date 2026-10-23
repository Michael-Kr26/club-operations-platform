# Excel-dashboards in COP

Start lokaal met `pnpm.cmd dev:local`. De nieuwe, toegevoegde databasemigratie wordt door de Dockerloze starter automatisch uitgevoerd. Bestaande gegevens blijven bewaard. Bij een afzonderlijke PostgreSQL-installatie eerst `pnpm.cmd --filter @cop/db db:migrate` uitvoeren.

Open **http://localhost:5173/rapportages/excel**. Ook bereikbaar via **Rapportages → Excel-dashboard openen**. Organisatieroute: `/organisaties/:organizationSlug/rapportages/excel`.

## Gebruik

1. Bij `pnpm.cmd dev:local` opent het dashboard tijdelijk direct voor de lokale Sport Society-eigenaar. Bij de gewone API/Docker-start log je in op `/rapportages`; de voorbeeldrol in de zijbalk verleent geen API-toegang.
2. Kies werkelijke gegevens of de afzonderlijke DEMO-dataset.
3. Zet alle ondersteunde XLSX-bestanden en Healthplanner-mails (.eml) in één ZIP en upload die. Maximaal 20 MB ZIP, 50 bronbestanden, 5 MB per bestand en 50 MB uitgepakt. Losse XLSX/EML-upload blijft mogelijk. De inhoud bepaalt het formaat.
4. Klik **Bestanden controleren**. Dit bewaart nog geen imports. Bij een ledenexport of omzetrapport: kies de juiste club en bevestig die toewijzing. Bij een ledenexport ook de werkelijke peildatum invullen. COP raadt geen club uit woonadressen, bestandsnaam, e-mailontvanger of telefoonnummers.
5. Het gezamenlijke managementoverzicht wordt bijgewerkt: kies Wekelijks, Maandelijks of Dagelijks en de bronperiode. Het begint bij de laatste ingevulde periode, met alle toegestane clubs naast elkaar. Afzonderlijke bronweergaven blijven beschikbaar voor controle.
6. De controle toont het formaat, fouten, brondefinities en eventuele onthouden clubvoorstellen per bestand. Vul ontbrekende gegevens in en klik **Opnieuw controleren**. Na een gewijzigde toewijzing is een nieuwe controle nodig. Bevestig de getoonde clubs/peildatums en klik **Verwerk … geldige bestanden**. Reeds verwerkte bestanden worden herkend. Met **Bevestigde clubtoewijzingen onthouden** bewaart COP de juiste club voor hetzelfde formaat en dezelfde bestandsnaam/ZIP-pad (hoofdletterongevoelig). Peildatums worden nooit onthouden. Een voorstel moet bij iedere volgende import opnieuw bevestigd worden; afwijkende formaten nemen het voorstel niet over.
7. Een onveilig/beschadigd ZIP of niet ondersteund bestandstype in het ZIP wordt vóór import afgewezen. Een inhoudelijk ongeldige XLSX/EML blokkeert de andere geldige bronbestanden niet. Na herladen of een onderbroken verwerking upload je hetzelfde ZIP opnieuw om te hervatten.

De originelen blijven lokaal in `report_workbooks`, inclusief importmoment, inhoudshash en dataset. Exact dezelfde inhoud met dezelfde relevante importcontext wordt bij gelijktijdige import slechts eenmaal bewaard. Een anders toegewezen peildatum/club is een afzonderlijke expliciete import. Latere uploads worden niet bij eerdere snapshots opgeteld. Het ZIP-origineel wordt afzonderlijk gearchiveerd met een verwerkingssamenvatting; de bronbestanden hebben hun eigen historie en inhoudelijke fouten.

Het gezamenlijke Healthplanner-overzicht gebruikt per club en bronperiode de nieuwste import. Ontbrekende waarden daarin worden nooit stilzwijgend uit een ouder bestand aangevuld. Conflicterende oudere bronnen krijgen een melding. Organisatietotalen zijn sommen van clubregistraties, geen unieke leden: ontbreekt één waarde, dan blijft het totaal onbekend. Percentages worden opnieuw berekend uit de opgetelde aantallen. De trendtabel met balkjes toont leden zonder afspraak per club/periode. Dewi-ledenexport, forecast en omzet houden zichtbaar hun eigen bronperiodes. Er wordt geen periode-onafhankelijke omzet-per-lid berekend.

## Vergelijken en aandachtspunten

Bij HP-kerncijfers verschijnen absolute en procentuele verschillen met de direct voorgaande kalenderdag, ISO-week of kalendermaand. Alleen afgesloten kalenderperiodes worden vergeleken; de datumgrens volgt Europe/Amsterdam, inclusief zomertijd. Ontbreekt de vorige periode, dan wordt geen oudere periode als vervanging gebruikt. Ontbrekende waarden blijven onbekend. Een vorige waarde van nul geeft wel een absoluut verschil, maar geen procentueel verschil. Percentuele veranderingen worden uit de onderliggende aantallen berekend, niet opgeteld tussen clubs.

Omzet wordt uitsluitend vergeleken met de vorige volledige kalendermaand van dezelfde club en hetzelfde kasstelselrapport. Een halve maand en een lopende maand krijgen geen volledige-maandvergelijking. Dewi-ledenexports vergelijken de laatste eerdere peildatum van dezelfde club: een snapshotverschil bewijst geen maandelijkse instroom, uitstroom of churn. De forecast blijft een afzonderlijke bronweergave.

**Dit vraagt aandacht** vermeldt ontbrekende clubbronnen/kerncijfers, conflicterende oudere bronnen, een hoog aandeel zonder afspraak en een sterke stijging zonder afspraak ten opzichte van de vorige afgesloten periode. Waar beschikbaar opent de knop de bronweergave. Bij dagelijkse HP-bezoekcijfers wordt geen afspraakpercentage verzonnen zonder bewezen passende ledennoemer.

Onder **Importmap, signaleringsgrenzen en clubtoewijzingen** kan een organisatiebeheerder grenzen instellen en een onthouden toewijzing vergeten. Voorstellen als startinstelling: aandeel zonder afspraak vanaf 30%, stijging zonder afspraak vanaf 20%, extra verversingsspeling 7 dagen. De verversingscontrole betreft de laatste ingevulde HP-periode per dag/week/maand; verwachte verversing is één broncadans plus de ingestelde speling na de periode-einddatum. Toekomstige kolommen veroorzaken geen verouderingsmelding en verbergen ook geen oude werkelijke bron. Dit zijn signalen, geen definitieve bedrijfsregels of automatische acties. Instellingen staan lokaal in `report_workbook_preferences`, gescheiden per organisatie en werkelijke/demo-dataset. Een locatiemanager kan uitsluitend eigen signalen/cijfers lezen en geen organisatievoorkeuren wijzigen.

## Vaste importmap

Bij `pnpm.cmd dev:local` is een optionele importmap beschikbaar. Schakel hem in onder de instellingen; daar staat het werkelijke pad. Standaard voor de echte Sport Society-bronnen: `%USERPROFILE%\.cop\inbox\sport-society\real`. De demo-map eindigt op `demo`; iedere organisatie heeft een afzonderlijke map. Buiten de Dockerloze lokale serverstand is de functie uitgeschakeld.

COP controleert de map ongeveer elke 30 seconden zolang het programma en de computer aan staan. De knop **Map nu controleren** voert ook een controle uit. Alleen reguliere ZIP/XLSX/EML-bestanden direct in die map worden gelezen; geen submappen of symbolische links. Een bestand moet minimaal drie seconden ongewijzigd zijn. Per scan maximaal drie gewijzigde bestanden, maximaal 500 bronbestanden in de map; normale ZIP/XLSX-groottegrenzen blijven gelden. Zet grote bestanden eerst buiten de map klaar en kopieer ze daarna naar de importmap. Bestanden worden niet verwijderd of verplaatst. Originele imports blijven daarnaast in de database. Een herstart verwerkt nog aanwezige bestanden veilig opnieuw via de bestaande duplicaatcontrole.

Het inschakelen staat expliciet toe dat bestaande bevestigde clubvoorstellen voor hetzelfde formaat automatisch gebruikt worden. Een ontbrekende club of peildatum wordt niet geraden. Gebruik voor zo'n export de uploadcontrole in het dashboard; andere geldige bestanden uit een ZIP worden al wel verwerkt. De mapstatus en importhistorie tonen welke bestanden aandacht nodig hebben. Wijzigingen worden in het open dashboard iedere 30 seconden opgehaald als mapimport is ingeschakeld. Bij een uitgeschakelde computer staat alles stil; na opnieuw starten worden aanwezige bestanden weer opgepakt. Internet is voor deze lokale map niet nodig.

Optioneel voor een geautomatiseerde export met ontbrekende metadata: zet naast `leden.xlsx` een klein bestand `leden.xlsx.cop.json` (maximaal 16 KB) met de expliciete broncontext, bijvoorbeeld:

```json
{
  "locationId": "barneveld",
  "asOf": "2026-10-18",
  "scopeConfirmed": true
}
```

Voor een ZIP heet dit bestand bijvoorbeeld `pakket.zip.cop.json` en kan het `fileContexts` bevatten met dezelfde structuur per exacte bestandsnaam/ZIP-pad. De exportautomatisering moet bij iedere nieuwe export de echte peildatum bijwerken. De JSON kan dataset, bestandsinhoud en tenant niet omleiden. Er horen geen wachtwoorden of mailgeheimen in. De server bewaart de effectieve locatie/peildatum in de import, maar gaat een oude datum nooit zelf vervangen door vandaag.

## Delen en downloaden

**Opslaan als PDF** opent het afdrukvenster van de browser. Kies daar **Opslaan als PDF**. Een A4-landschapsweergave toont het geselecteerde managementoverzicht, bronverwijzingen, aandachtspunten en de afzonderlijke Dewi-/omzetperiodes; navigatie, uploads, instellingen en de lange historische trendtabel worden weggelaten. De organisatie, gekozen periode en eventuele DEMO-markering staan bovenaan. De uiteindelijke paginering moet in het afdrukvoorbeeld op de werklaptop gecontroleerd worden.

**CSV voor Excel** downloadt de geselecteerde HP-periode met clubcijfers, absolute/procentuele verschillen, bronbestanden, importmomenten, signalen en het expliciet als clubregistraties gemarkeerde totaal. De CSV gebruikt puntkomma's, Nederlandse decimale komma's en UTF-8; onbekend blijft onbekend. Excel-formules in bijvoorbeeld bronbestandsnamen worden onschadelijk gemaakt. Dit is een CSV-bestand, geen opgemaakte XLSX-werkmap. Er wordt niets naar Chico of anderen verstuurd.

Er is geen betaalde SaaS of AI-model nodig voor de verwerking. Deze dashboards veranderen geen mailplanning en versturen geen e-mails. Automatische bronmailtoegang is nog steeds een afzonderlijke, geparkeerde koppeling.

## Ondersteunde bronnen en definities

### Dewi-forecast

Herkenning: één `Forecast KPI ...`-tabblad en `Omschrijving` met `Forecast <organisatie-id>-<locatie-id> DD-MM-YYYY`. Club en datum komen uit deze bronbeschrijving. Voor een andere organisatie moet de exportbeschrijving overeenkomen met de ingestelde COP-organisatie/locaties; geen automatische herroutering naar een andere tenant.

- Beginstand, Joiners, Betermeldingen, Leavers en Ziek meldingen per maand.
- Movement IN = Joiners + Betermeldingen; Movement OUT = Leavers + Ziek meldingen.
- Berekende eindstand = begin + IN − OUT; netto = IN − OUT.
- De bekende eenvoudige bronformules worden herkend en als gewone getallenberekening uitgevoerd. Geen algemene Excel-formule-evaluatie, externe links volgen of gecachte Excel-resultaten vertrouwen.
- Ledenbijlagen worden op unieke Dewi-klantidentiteit gecontroleerd; namen worden niet als dashboarddata opgeslagen. Afwijkende aantallen/dubbele klantidentiteiten geven meldingen; dan blijft de indicatieve uitstroomratio onbekend.
- Aansluiting: volgende beginstand minus berekende eindstand. Een afwijking blijft zichtbaar, zonder de bron automatisch te corrigeren.
- Indicatieve uitstroomratio = Leavers / Opening members. Bij nul/missende beginstand onbekend. Het bestand bewijst geen effectieve einddatum, onderscheid van verhuizingen of volledige abonnementsstatus: dit is **geen definitieve churn** en wordt niet in de officiële churnrapportage ingevoegd.
- Vóór de exportmaand: historisch bronbeeld. De exportmaand: lopend, mogelijk met ingeplande mutaties. Na de exportmaand: vooruitblik met bekende mutaties. Geen gegarandeerde toekomstcijfers en geen actuele ledenstand op exportdag.

Het onderzochte Gmail-bestand bevat Barneveld en 15 maanden (januari 2026 t/m maart 2027). Originele privébestanden worden niet in Git opgenomen.

### Dewi-ledenexport

Herkenning: `Leden` en `Contracten`. De aangeleverde variant vermeldt geen club/exportdatum. Deze twee gegevens moeten daarom expliciet door de gebruiker worden ingevuld/bevestigd.

Unieke klantnummers in de selectie, status `Actief`, actieve records met ≥14/≥30 dagen sinds `Laatste bezoek`, onbekende en toekomstige bezoekdatums. Ontbrekende bezoekdatums worden niet als slapen of niet-bezoeken geïnterpreteerd. Dit geldt alleen voor deze selectie, niet voor alle historische leden of alle geldige, niet-gepauzeerde abonnementen. De contracthistorie kan alleen de geselecteerde leden betreffen en vormt dus geen betrouwbare totale churnbron. `Bezoeken` bevat in deze export tegoeden/gebruiksstanden per periode, geen dagelijkse check-inhistorie: er wordt geen piekuren- of bezettingsgrafiek verzonnen.

Dashboarddata bevat geen namen, contactgegevens, IBAN of adressen. Het originele bestand bevat die gegevens mogelijk wel en is alleen downloadbaar met organisatiebrede beheerrechten.

### Dewi-omzetrapport

Herkenning: `Artikelen`, `Winst&Verlies Kasstelsel`, `BTW` en periode in `Omschrijving`. Clubtoewijzing expliciet door gebruiker; de bestandsnaam is geen bewijs.

Omzet volgens kasstelsel excl. BTW, BTW en incl. BTW plus artikelverdeling. Bedragen worden in gehele centen verwerkt en onafhankelijk aangesloten tussen artikelen, BTW en winst/verlies. Balansmutaties/debiteurenmutaties worden niet als extra omzet of openstaand saldo opgeteld. Dit is geen automatisch erkende omzet op factuurbasis, geen totaal ontvangen bankbedrag en geen omzet-per-lid. Artikelpercentages worden niet uit bronformules overgenomen.

### Healthplanner-updatetabel

Herkenning: `Wekelijkse update` en `Maandelijkse update`, met de organisatienaam en clubblokken. Alleen directe invoercellen voor totaal, zonder doel, zonder afspraak en zonder coach worden gebruikt. Percentages worden opnieuw berekend uit aantallen. Formules, gedeelde formules, cached resultaten en organisatietotalen worden niet als broninvoer gelezen. Lege/formuleafhankelijke maanden blijven onbekend. De aangeboden tabel is handmatig bijgehouden; geen live Healthplanner-koppeling. Geen optelling tot unieke organisatieleden, vanwege mogelijk cluboverschrijdend bezoek.

### Healthplanner-managementmail

De bestaande `.eml`-parser is ook beschikbaar via dit dashboard. Exacte afzender/onderwerp, HTML-datum en clubkoppen worden gecontroleerd; gisteren volgt uit de maildatum in Europe/Amsterdam. Leads, verkochte lidmaatschappen, gemelde opzeggingen, afgeronde afspraken en HP-bezoekstatus blijven afzonderlijke cijfers. De geïmporteerde dashboardmail wordt niet automatisch als volledige Dewi- of officiële churnbron aangemerkt.

## Toegang en controle

Alle API-routes staan onder `/api/v1/organizations/:organizationId/reports/workbooks`. Buiten de expliciete lokale eengebruikersmodus gelden bestaande serverzijdige sessies en `reports.read` / `reports.manage`. Zie [ZONDER-DOCKER.md](ZONDER-DOCKER.md) voor deze tijdelijke lokale eigenaarstoegang en het herstellen van verplichte aanmelding. Uploaden en origineel downloaden vereisen organisatiebrede beheerrechten. Een locatiemanager ziet uitsluitend eigen bronrecords; bij organisatiebrede HP-bestanden worden andere clubs en eventuele globale kaarten verwijderd. Werkelijke en demo-datasets blijven gescheiden; gegevens worden altijd met tenantvoorwaarde gelezen.

Validatie omvat o.a. bestandsgrootte/uitgepakte XLSX-grootte, verwachte kopregels, aaneengesloten maanden, niet-negatieve gehele aantallen, formulevorm, bronorganisatie, financiële aansluiting en dubbele klantnummers. Onbekende formaten worden met uitleg afgewezen en niet stilzwijgend aan een willekeurige bron gekoppeld.

## Verificatie

Gemaksfuncties gecontroleerd op 18 oktober 2026: alle 102 tests (77 API, 25 web), lint, formattering, TypeScript en productiebuild geslaagd. Extra scenario's: vooraf controleren zonder import, onthouden/vergeten clubtoewijzingen zonder een oude peildatum te hergebruiken, formaatwijzigingen, gescheiden voorkeuren per tenant/dataset, kalender-/jaar-/zomertijdgrenzen, nulnoemer, ontbrekende vorige periode, gedeeltelijke omzetmaanden, signaalgrenzen, mapimport met symbolische links/aanvullende metadata, gelijktijdige scans/herstart en veilige CSV-cellen. Een aanvullende lokale HTTP-controle gebruikte de vijf echte bestanden, controleerde voorkeuren na herstart en importeerde een echt HP-werkboek via de afzonderlijke demo-importmap. Bestanden in die map bleven bytegelijk; herhaald scannen telde niets dubbel. PDF-paginering is niet visueel bevestigd; controleer het afdrukvoorbeeld op de werklaptop.

Unit- en integratietests dekken de bronberekeningen, ontbrekende waarden, dubbele imports, bronorganisatie, tenant-/clubscope, demo-scheiding en behoud van originelen. De vijf werkelijk verstrekte bestanden zijn daarnaast via de lokale API geïmporteerd, gedownload en na afsluiten/herstart teruggelezen. Voor leden/omzet is in deze tijdelijke controle een testtoewijzing gebruikt; dat bevestigt niet de echte club van die bronbestanden.

De frontend heeft componenttests en een geslaagde productiebuild. Een echte browser/screenshotcontrole kon hier niet worden uitgevoerd doordat de browserdownload niet beschikbaar was; controleer de vormgeving op de werklaptop. Dit is geen bevestiging dat automatische mailtoegang is ingesteld.

ZIP-uitbreiding gecontroleerd op 18 oktober 2026: 91 tests (68 API, 23 web), TypeScript, lint, formattering en productiebuild geslaagd. De vijf aangeleverde bestanden zijn samen als een gecomprimeerd ZIP via Vite/Nest geïmporteerd. Eerst 3 verwerkt / 2 clubtoewijzing nodig, daarna alle 5 geaccepteerd met expliciete testcontext. Herhaling telt niet dubbel; ZIP-originelen zijn bytegelijk en het gezamenlijke overzicht (33 bronperiodes, inclusief onbekende toekomstige invoer) blijft na procesherstart behouden. De testtoewijzing van leden/omzet aan Barneveld bevestigt niet de echte herkomst. Geen echte e-mails verstuurd. Browser/screenshotcontrole blijft hier niet beschikbaar.

## Vaste bestanden en gedownloade rapportages (lokale Windows-start)

Bij `pnpm.cmd dev:local` gebruikt Sport Society standaard het bestand:

```text
C:\dev\ClubOperationsPlatform\imports\Healthplanner_leden_updates.xlsx
```

Het pad wordt opgebouwd vanuit de projectmap, onafhankelijk van de huidige terminalmap. Op Michaels laptop is de projectmap `C:\dev\ClubOperationsPlatform`. Kopieer de bestaande Healthplanner-updatetabel eenmalig naar `imports\Healthplanner_leden_updates.xlsx`; er worden geen bestaande bestanden verplaatst of verwijderd. COP controleert dit alleen lokaal, bij opstart en daarna maximaal eenmaal per minuut. Gewijzigde inhoud wordt als Werkelijk geïmporteerd, met de club- en week-/maandperioden uit de bestaande Healthplanner-updatetabel. Het download- of wijzigingsmoment wordt nooit als rapportageperiode gebruikt. Dezelfde inhoud wordt ook na herstart niet dubbel opgeslagen. Een ontbrekend, vergrendeld, nog geschreven of ongeldig bestand vervangt geen eerder geldige gegevens. De bronstatus en **Nu ophalen** staan boven het grafische dashboard (`/rapportages/excel`), zichtbaar voor organisatiebeheerders. De standaardmap staat lokaal buiten OneDrive.

Voor andere gedownloade Dewi- en Healthplanner-rapportages staat de standaard importmap naast dat bestand:

```text
C:\dev\ClubOperationsPlatform\imports
```

Bewaar downloads zelf in die map (bijvoorbeeld met **Opslaan als** in de browser). COP opent de websites of mailboxen niet zelf. De map wordt lokaal aangemaakt bij de eerste controle en ongeveer iedere 30 seconden bekeken, maximaal drie gewijzigde bestanden per scan. ZIP/XLSX/EML wordt volgens de bestaande adapters verwerkt; onvoltooide downloads en Excel-lockbestanden worden niet geïmporteerd. Originelen blijven staan. Er wordt geen algemene Downloads-map doorzocht.

De lokale start schakelt de mapimport voor de geconfigureerde organisatie en Werkelijk de eerste keer in. Een eerdere expliciete uitschakeling wordt behouden. Je kunt deze keuze wijzigen onder **Importinstellingen en bestandsstatus** op het dashboard. Per organisatie en dataset blijven imports gescheiden.

Healthplanner-EML, Healthplanner-updatetabellen en herkenbare Dewi-forecasts kunnen met hun eigen club-/periodegegevens automatisch door. Een Dewi-ledenexport zonder club of peildatum en een omzetexport zonder club vragen nog om bevestiging via de bestaande uploadcontrole; automatisch downloaden maakt deze ontbrekende informatie niet betrouwbaar. CSV-bestanden in deze map, oude `.xls`-bestanden en niet-ondersteunde exportindelingen worden nog niet verwerkt. Dit verandert niets aan de afzonderlijke bestaande CSV-rapportage-import.

Het Healthplanner-bronpad en de importmap kunnen serverzijdig worden overschreven met `COP_HEALTHPLANNER_FILE` en `COP_IMPORT_FOLDER`. Voor een andere organisatie zijn er `COP_HEALTHPLANNER_ORGANIZATION` en `COP_IMPORT_ORGANIZATION`. Een lege `COP_HEALTHPLANNER_FILE` schakelt de vaste bron uit; de map kan via het dashboard worden uitgeschakeld. Buiten de lokale PGlite-start op loopback blijven beide lokale bronnen uit. Padkeuzes kunnen niet via een browserverzoek worden opgegeven.

COP moet draaien om op te halen. Bestanden die tijdens uitgeschakelde COP zijn opgeslagen, worden bij de volgende start gecontroleerd. Er wordt hiermee geen echte mailverzending ingeschakeld. Deze bronroutes zijn getest met synthetische bestanden; De lokale kopie van Michaels bestand wordt pas op zijn laptop gelezen na ophalen en starten van deze versie.

De lokale map `/imports/` is uitgesloten van Git zodat rapportages en persoonsgegevens niet worden meegecommit. Bewaar back-ups van deze map samen met de lokale COP-database.
