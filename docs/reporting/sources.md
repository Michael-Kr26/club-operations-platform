# Gecontroleerde bronnen en ontbrekende toegang

Onderzocht op 7 oktober 2026: actuele Git-main en bestaande COP-paginaopzetbranch; COP-ADR’s voor Nest/Fastify, React, PostgreSQL/Drizzle, Better Auth, COP-permissions en tenantisolatie; de aangeleverde WhatsApp-export met Chico; `Leden.xlsx` en `actieve-leden.xlsx`. Persoonsgegevens en chatbijlagen zijn niet in de repo gekopieerd.

## Bewijs uit de beschikbare bestanden

- Chico, WhatsApp 7 oktober 2026 09:39–09:40: vraagt ochtendmail met vijf clubs, noemt de bestaande Healthplanner-managementmail en vraagt Dewi actieve leden/instroom/opzeggingen/omzet en maandchurn. Dit bewijst de wens en een bestaande rapportageroute, niet de API-specificatie of toestemming tot mailboxgebruik.
- `Leden.xlsx`: 559 gegevensrijen onder titel en kopregel; kolommen `Naam`, `Afsprakenstatus`, `Bezoekersfrequentie`. Dit is een leden-/bezoeksoverzicht, geen dagelijkse verkoop/leads/afsprakenrapportage. Geen bevestigde stabiele kruis-systeem-ID, historische aantallen, omzet of expliciete thuisclub.
- `actieve-leden.xlsx`: 516 gegevensrijen, 50 kolommen; o.a. `Klantnummer`, `Status`, `Abonnement`, `Inschrijfdatum`, `Laatste bezoek`, `Open vorderingen`, `Tijdelijke stop`. Geen expliciete clubkolom, unieke abonnement-ID of bevestigde effectieve abonnement-einddatum in deze export. Alleen actieve leden is geen volledige uitstroomhistorie. Open vorderingen en tijdelijke stop kunnen nuttige snapshots zijn, maar bedrag-/datumdefinities en volledigheid zijn niet bevestigd. Niet dezelfde betekenis toekennen aan `Inschrijfdatum` en ingangsdatum van een abonnement.
- De originele Healthplanner-XLSX heeft een stijl die openpyxl niet kon lezen. Kopregels zijn read-only uit de XLSX XML onderzocht; het origineel is niet gerepareerd of gewijzigd. De nieuwe importer vereist canonical bestanden en meldt format-/stijlproblemen als afwijzing.
- De eerder gemaakte churnwerkmap was niet beschikbaar als controleerbaar bestand. Vraag een voorbeeld op om presentatie en eerdere rekenregels te vergelijken.

## Publieke leverancierinformatie

De officiële Dewi-site noemt een open API: https://dewi.nl/waarom-dewi-online . Dit is geen bevestiging van endpoints, toegang voor Sport Society of beschikbare historie/financiën. Er zijn daarom geen Dewi-API-calls gebouwd.

Healthplanner beschrijft management/verkoop-/ledenfunctionaliteit: https://healthplanner.fitness/ . Een beschikbare dagelijkse rapportagemail volgt uit de chat; de exacte mailinhoud, bijlagen, periodes en automatiseringsrechten ontbreken nog.

## Nodig voor echte Dewi-verwerking

1. API-documentatie of een gecontroleerde export voor alle vijf clubs: auth-methode, scopes, toegangsrechten, tenant-/club-ID’s, endpoints, pagination, rate limits, historische dekking, correcties/verwijderingen en datums/tijdzone.
2. Uniek organisatiebreed lid-ID + uniek abonnement-ID, thuisclubhistorie, start, aanvraag opzegging, effectieve einddatum, pauze/bevriesintervallen en eventuele herinschrijvingen/verhuizingen.
3. Volledige historie inclusief beëindigde leden; verklaren wat ‘Actief’, ‘Tijdelijke stop’ en ‘Inschrijfdatum’ betekenen. Een snapshot met alleen huidige actieve leden is onvoldoende.
4. Financiële bronbestanden: geboekte omzet/creditnota’s incl. BTW-definitie, betalingen op ontvangstdatum, open saldi per factuur op peildatum, failed-debit-status en retry-ID. Scheid omzet van incasso en saldo.
5. Een geanonimiseerd representatief voorbeeld per bestandstype: nul-dag, dubbele abonnementen, pauze, verhuizing, stopaanvraag vóór maandgrens, einddatum erna en gecrediteerde/mislukte incasso.

## Nodig voor Healthplanner en automatische ontvangst

1. Een oorspronkelijke managementmail (`.eml` of echte bijlage CSV/XLSX), liefst twee opeenvolgende dagen van alle clubs en een nul-dag. Screenshots alleen zijn onvoldoende voor stabiele automatische parsing.
2. Definities: rapportageperiode, bronclub versus thuisclub, lead-/conversiecohort, afspraakstatus, actief/slapend en correcties. Stel nul versus afwezig expliciet vast.
3. Recht om rapporten automatisch te ontvangen: leverancier-API, lokale exportfolder of een expliciet toegestane mailboxroute. Een mailbox of login is niet uit de WhatsApp-accountgegevens overgenomen.
4. Pas na verificatie een adapter implementeren en testbestanden vastleggen (geanonimiseerd). Automatische verwerking van onbekende mailopmaak is niet ingebouwd.

## Vervolgplan

| Volgorde | Uitbreiding                                                  | Eerst benodigde bron/regel                                                             |
| -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1        | Bevestigde ochtendmail + maandchurn met echte gegevens       | Complete abonnement-/financiële historie, HP-mailvoorbeelden, definitiesreview         |
| 2        | API/mailboxontvangst + echte SMTP                            | Documentatie/rechten, veilige lokale secrets, herstelbeleid, altijd draaiende planning |
| 3        | Bezoekfrequentie, 14/30 dagen inactief, opzegredenen         | Unieke check-ins, thuisclub, retentie-definitie, redenclassificatie                    |
| 4        | Piekuren, check-ins, capaciteit                              | Bezoekmomenten, tijdzone, clubcapaciteit en telregels                                  |
| 5        | Omzet abonnement/PT/Pilates/lessen/verkoop, ARPM/verwachting | Productcategorieën, BTW-keuze, terugbetalingen, toekomstige verplichtingen             |
| 6        | Personeel vandaag/morgen, open diensten en ziek              | COP-rooster, inzetbaarheid, ziektebron, beperkte rechten                               |
| 7        | Lessen/PT gegeven/gepland, deelname/bezetting                | Agenda, annuleringen, presentie en capaciteit                                          |
| 8        | Storingen/onderhoud                                          | Taken-/assetregister en incidentstatus                                                 |
| 9        | Marketingkanalen, kosten en conversie                        | Leadattributie, spend-export, cohortvensters                                           |
| 10       | Reviews, klachten en open meldingen                          | Toegestane reviewbron en meldingenregistratie                                          |

Deze uitbreiding is een plan, geen reeds werkende synchronisatie.
