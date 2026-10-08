# Dagelijkse Healthplanner-mail uit Outlook

De bron is de werkelijk aangeleverde HTML-managementmail van 7 oktober 2026, afzender `noreply@healthplanner.nl`, onderwerp `Health Planner: Dagelijkse managementrapportage`. Geen verzonnen Healthplanner-API.

## Wat werkt lokaal

- CSV/Excel-import accepteert nu ook `.eml` wanneer Healthplanner is gekozen. COP bepaalt datum en clubscope uit de mail: `Gisteren` = kalenderdag vóór de maildatum in Europe/Amsterdam. De HTML-datum en weekdag moeten overeenkomen. De koppen bepalen clubmapping, onafhankelijk van de volgorde.
- MIME/base64/quoted-printable en HTML-tabellen worden serverzijdig gelezen. Originele bytes, importdatum, SHA256 en afwijzingen blijven lokaal in de database. Een herhaalde identieke import telt niet opnieuw mee. Een gewijzigde mail voor dezelfde dag is een vervangende import, geen optelling.
- Afgeronde ledenafspraken, leads, HP-bezoekend actieve/slapende leden, verkochte lidmaatschappen, gemelde opzeggingen en leden zonder toekomstige afspraak verschijnen apart. Organisatietotalen voor bezoekende/slapende leden en leden zonder afspraak blijven onbekend: HP bewijst geen unieke identiteit tussen clubs.
- Alle ruwe gisteren/maandwaarden blijven in de opgeslagen importregels. Maandkolommen en percentages worden nog niet gebruikt als officiële maandtotalen: hun exacte periode/denominator moet Healthplanner bevestigen. Afgekorte tijdswaarden worden niet aangevuld. Volledige dagelijkse imports kunnen een kalendermaand dekken; één ontbrekende dag maakt die maand onbekend.
- Verkochte lidmaatschappen zijn geen leadcohortconversies; gemelde opzeggingen zijn geen effectieve uitstroom. Churn blijft afhankelijk van Dewi-einddatums en beginledenbestand.
- Een zakelijke Microsoft 365-bronadapter leest de geselecteerde map via Microsoft Graph. Geen markeren-als-gelezen, wijzigen of verwijderen. Alleen berichten met exact onderwerp en afzender krijgen een MIME-download. Headercontrole is geen bewijs van DKIM/authenticiteit; beheer de bronmap en mailboxrechten zorgvuldig.

## Dagritme (Europe/Amsterdam)

Normale ontvangst 08:33. Ophalen vanaf 08:35. Alleen bij ontbrekende actuele mail of fouten opnieuw vanaf 08:38, 08:41 en 08:44. Geen mailboxverzoeken buiten 08:35–08:45. De lokale planner controleert zijn klok elke 30 seconden, dus pogingen/verzending kunnen circa 30 seconden later beginnen. Na een succesvolle actuele import geen verdere mailboxpogingen die dag, ook na herstart; auditrecords en een database-lock beschermen meerdere processen. Langzame netwerkpogingen kunnen de planning vertragen; maximaal 10 pagina's/1000 mapberichten in zeven dagen worden bekeken. Gebruik bij een drukke mailbox een aparte rapportagemap.

Start de laptop en COP vóór 08:35 en laat slaapstand uit. Met computer/COP uit wordt niets opgehaald of verstuurd. Internet-/autorisatiefouten verschijnen bij de bronstatus. Na 08:45 geen nieuwe bronpoging; na vijf minuten verzendmarge wordt de verzending als gemist geregistreerd. Geen stille inhaalmail. De volgende ochtend kan de adapter binnen een terugblik van zeven dagen oudere bronmails alsnog bewaren; ouder dan zeven dagen via handmatige EML-import. Dit is geen permanente Windows-service of automatische starttaak.

## Nog benodigde Microsoft 365-toegang

Outlook als app bewijst niet dat een mailbox Microsoft 365 gebruikt. Deze versie ondersteunt zakelijke Microsoft 365 met Entra-app en serverzijdige client credentials; een persoonlijke Outlook.com-mailbox vereist een andere aanmeldroute.

Bronmailbox voor Sport Society is door Michael bevestigd als `barneveld@sport-society.nl`.

1. Laat de Microsoft 365-beheerder een Entra-app inrichten voor Microsoft Graph-lezen van berichten/MIME, met passende `Mail.Read`-toegang en admin consent waar vereist.
2. Beperk de app in Exchange tot de bedoelde mailbox, via een gecontroleerde mailbox-scope (Application RBAC of toepasselijk application access policy). Controleer ook eventuele al toegekende brede Entra-permissies: scopes kunnen anders ruimer zijn dan bedoeld. SMTP-verzendrechten zijn geen Graph-leesrechten.
3. Bewaar de configuratie uitsluitend lokaal in `%USERPROFILE%\.cop\sources\sport-society.json` (of COP_DATA_DIR). Beperk Windows-bestandsrechten tot de eigen gebruiker; dit bestand bevat een geheim in leesbare vorm. Deel het niet in chat, browser, logs of Git. Houd rekening met verloop/rotatie van secrets.

Voorbeeld zonder werkende geheimen:

```json
{
  "organizationId": "sport-society",
  "enabled": false,
  "tenantId": "TENANT-GUID",
  "clientId": "APP-GUID",
  "clientSecret": "ALLEEN-LOKAAL-INVULLEN",
  "mailbox": "barneveld@sport-society.nl",
  "folderId": "inbox"
}
```

Gebruik de werkelijke map-ID als een Outlook-regel rapportages naar een aparte map verplaatst. Instellingen staan per organisatie en worden niet via de browser verstrekt. Na geldige rechten/configuratie `enabled` op true. De rapportagepagina toont configuratiestatus en de laatste poging; netwerktoegang is pas bevestigd na een geslaagde echte ophaalpoging. De huidige implementatie is met nagebootste Graph-responses getest, niet met deze werkelijke mailbox.

## Ochtendmail om 08:45

In Rapportages → instellingen:

- Zet verzendtijd op **08:45**. Nieuwe organisaties krijgen deze standaard; bestaande ingestelde tijden worden niet automatisch overschreven.
- Stel de werkelijke ontvangers in, keur de reviewbare regels (nieuwe versie proposal-2) opnieuw goed en schakel automatische verzending in.
- Optioneel expliciet aanvinken: ochtendmail toestaan met volledige actuele HP-cijfers en ontbrekende Dewi-bronnen als onbekend. Zonder deze keuze blijft de mail bij ontbrekende bronnen geblokkeerd. Ongeldige/onvolledige/verouderde HP of aanwezige maar onbruikbare Dewi-imports blijven blokkeren. Maandelijkse churn wordt hiermee nooit vrijgegeven.
- Echte verzending vereist daarnaast de afzonderlijke lokale Microsoft 365-verzendconfiguratie en bevestigde ontvangers op de allowlist; zie [MICROSOFT365.md](MICROSOFT365.md). Zonder configuratie alleen lokale SMTP-testopvang; de Dockerloze starter start Mailpit niet.

Verzending heeft een unieke claim per organisatie/dataset/soort/periode. SMTP-acceptatie is geen gegarandeerde inboxaflevering. Geen automatische verzendretry bij onzekere acceptatie. Er zijn in de ontwikkeling geen echte mails verzonden.

## Documentatie

- https://learn.microsoft.com/en-us/graph/api/message-get
- https://learn.microsoft.com/en-us/graph/api/user-list-messages
- https://learn.microsoft.com/en-us/graph/outlook-get-mime-message
- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
