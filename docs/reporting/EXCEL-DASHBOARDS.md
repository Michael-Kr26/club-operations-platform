# Excel-dashboards in COP

Start lokaal met `pnpm.cmd dev:local`. De nieuwe, toegevoegde databasemigratie wordt door de Dockerloze starter automatisch uitgevoerd. Bestaande gegevens blijven bewaard. Bij een afzonderlijke PostgreSQL-installatie eerst `pnpm.cmd --filter @cop/db db:migrate` uitvoeren.

Open **http://localhost:5173/rapportages/excel**. Ook bereikbaar via **Rapportages → Excel-dashboard openen**. Organisatieroute: `/organisaties/:organizationSlug/rapportages/excel`.

## Gebruik

1. Bij `pnpm.cmd dev:local` opent het dashboard tijdelijk direct voor de lokale Sport Society-eigenaar. Bij de gewone API/Docker-start log je in op `/rapportages`; de voorbeeldrol in de zijbalk verleent geen API-toegang.
2. Kies werkelijke gegevens of de afzonderlijke DEMO-dataset.
3. Zet alle ondersteunde XLSX-bestanden en Healthplanner-mails (.eml) in één ZIP en upload die. Maximaal 20 MB ZIP, 50 bronbestanden, 5 MB per bestand en 50 MB uitgepakt. Losse XLSX/EML-upload blijft mogelijk. De inhoud bepaalt het formaat.
4. Bij een ledenexport of omzetrapport: kies de juiste club en bevestig die toewijzing. Bij een ledenexport ook de werkelijke peildatum invullen. COP raadt geen club uit woonadressen, bestandsnaam, e-mailontvanger of telefoonnummers.
5. Het gezamenlijke managementoverzicht wordt bijgewerkt: kies Wekelijks, Maandelijks of Dagelijks en de bronperiode. Het begint bij de laatste ingevulde periode, met alle toegestane clubs naast elkaar. Afzonderlijke bronweergaven blijven beschikbaar voor controle.
6. Het ZIP-resultaat toont de status per bestand. Als clubinformatie ontbreekt, wijs ieder betrokken bestand onder het resultaat toe aan een club (ledenexport ook een peildatum). Bevestig de toewijzingen en klik opnieuw op Importeren. De standaardlocatie bovenaan geldt alleen wanneer je expliciet bevestigt dat alle niet afzonderlijk toegewezen bestanden zonder club daar thuishoren. Reeds verwerkte bestanden worden herkend.
7. Een onveilig/beschadigd ZIP of niet ondersteund bestandstype in het ZIP wordt vóór import afgewezen. Een inhoudelijk ongeldige XLSX/EML blokkeert de andere geldige bronbestanden niet. Na herladen of een onderbroken verwerking upload je hetzelfde ZIP opnieuw om te hervatten.

De originelen blijven lokaal in `report_workbooks`, inclusief importmoment, inhoudshash en dataset. Exact dezelfde inhoud met dezelfde relevante importcontext wordt bij gelijktijdige import slechts eenmaal bewaard. Een anders toegewezen peildatum/club is een afzonderlijke expliciete import. Latere uploads worden niet bij eerdere snapshots opgeteld. Het ZIP-origineel wordt afzonderlijk gearchiveerd met een verwerkingssamenvatting; de bronbestanden hebben hun eigen historie en inhoudelijke fouten.

Het gezamenlijke Healthplanner-overzicht gebruikt per club en bronperiode de nieuwste import. Ontbrekende waarden daarin worden nooit stilzwijgend uit een ouder bestand aangevuld. Conflicterende oudere bronnen krijgen een melding. Organisatietotalen zijn sommen van clubregistraties, geen unieke leden: ontbreekt één waarde, dan blijft het totaal onbekend. Percentages worden opnieuw berekend uit de opgetelde aantallen. Het verschil in leden betreft de vorige beschikbare ingevulde bronperiode (de kop toont welke), niet noodzakelijk de voorgaande kalenderweek/maand. De trendtabel met balkjes toont leden zonder afspraak per club/periode. Dewi-ledenexport, forecast en omzet houden zichtbaar hun eigen bronperiodes. Er wordt geen periode-onafhankelijke omzet-per-lid berekend.

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

Unit- en integratietests dekken de bronberekeningen, ontbrekende waarden, dubbele imports, bronorganisatie, tenant-/clubscope, demo-scheiding en behoud van originelen. De vijf werkelijk verstrekte bestanden zijn daarnaast via de lokale API geïmporteerd, gedownload en na afsluiten/herstart teruggelezen. Voor leden/omzet is in deze tijdelijke controle een testtoewijzing gebruikt; dat bevestigt niet de echte club van die bronbestanden.

De frontend heeft componenttests en een geslaagde productiebuild. Een echte browser/screenshotcontrole kon hier niet worden uitgevoerd doordat de browserdownload niet beschikbaar was; controleer de vormgeving op de werklaptop. Dit is geen bevestiging dat automatische mailtoegang is ingesteld.

ZIP-uitbreiding gecontroleerd op 18 oktober 2026: 91 tests (68 API, 23 web), TypeScript, lint, formattering en productiebuild geslaagd. De vijf aangeleverde bestanden zijn samen als een gecomprimeerd ZIP via Vite/Nest geïmporteerd. Eerst 3 verwerkt / 2 clubtoewijzing nodig, daarna alle 5 geaccepteerd met expliciete testcontext. Herhaling telt niet dubbel; ZIP-originelen zijn bytegelijk en het gezamenlijke overzicht (33 bronperiodes, inclusief onbekende toekomstige invoer) blijft na procesherstart behouden. De testtoewijzing van leden/omzet aan Barneveld bevestigt niet de echte herkomst. Geen echte e-mails verstuurd. Browser/screenshotcontrole blijft hier niet beschikbaar.
