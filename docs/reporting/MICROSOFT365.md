# Echte verzending via Microsoft 365

Sport Society-afzender: **barneveld@sport-society.nl**. Echte verzending blijft uit totdat een lokale configuratie met `enabled: true` bestaat. Deze versie gebruikt OAuth client credentials en SMTP STARTTLS, geen mailboxwachtwoord en geen extra betaalde maildienst. Een bestaande geschikte Microsoft 365-mailbox en beheerderstoegang zijn nodig.

## Microsoft 365-beheerder

Volg de actuele Microsoft-documentatie: https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth en https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/smtp-app-rbac-onboarding.

Registreer een single-tenant Entra-app en geef deze uitsluitend toegang tot de bedoelde mailbox. De beheerder moet de Exchange service principal en mailboxscope instellen, via de gedocumenteerde SMTP.SendAsApp-permissionroute of Application RBAC-route. Deze routes hebben verschillende stappen: volg één volledige route. Controleer of SMTP AUTH voor deze mailbox toegestaan is; wijzig organisatiebeveiliging niet zonder beoordeling door de beheerder. COP vraagt een token met scope `https://outlook.office365.com/.default` en gebruikt `smtp.office365.com:587` met verplichte TLS.

Benodigd: tenant-ID, application/client-ID, client-secretwaarde, de beperkte mailboxtoestemming en de gekozen ontvangers. Stuur geen geheimen via chat, GitHub of e-mail. Een verlopen client secret blokkeert verzending; roteer lokaal vóór de vervaldatum.

## Lokaal instellen

Maak buiten de repository `%USERPROFILE%\.cop\mail\sport-society.json` (bij COP_DATA_DIR staat de mailmap daar). Vul lokaal in:

```json
{
  "organizationId": "sport-society",
  "enabled": false,
  "tenantId": "TENANT-GUID",
  "clientId": "APPLICATION-GUID",
  "clientSecret": "ALLEEN-LOKAAL-INVULLEN",
  "mailbox": "barneveld@sport-society.nl",
  "allowedRecipients": ["HIER-EEN-BEVESTIGDE-ONTVANGER"]
}
```

Beperk de Windows-bestandsrechten tot jouw account en eventueel beheerders. De client secret staat lokaal in platte tekst, beschermd door bestandsrechten; COP versleutelt het bestand niet. Zet `enabled` pas op `true` als toestemming en ontvangers kloppen. De server leest de configuratie opnieuw per aanvraag/run. Alleen organisatiebeheerders zien afzender/verzendstatus; geheimen worden nooit naar de browser gestuurd. Andere organisaties hebben een eigen bestand, `organizationId` en toegestane ontvangers.

Stel in COP exact dezelfde ontvangers in als in allowedRecipients. Demo wordt nooit echt verzonden. Handmatige echte verzending vereist complete geldige bronnen en goedgekeurde bedrijfsregels; klik daarna op **Echt versturen naar ingestelde ontvangers**. Planning gebruikt echte mail zodra deze configuratie geldig en ingeschakeld is én planning in COP aanstaat. Met ontbrekend/uitgeschakeld bestand blijft planning lokaal testmail gebruiken. Bij een ongeldig ingeschakeld bestand wordt de run geblokkeerd.

De lokale testmailknop blijft uitsluitend naar Mailpit sturen. Een periode heeft één runclaim: een eerder lokaal opgevangen, geblokkeerde of onzekere run kan niet opnieuw als echte mail worden verzonden. Gebruik een nog niet geregistreerde periode. Er is nog geen inhaal-/herverzendfunctie.

`sent` betekent dat Microsoft 365 alle ontvangers via SMTP heeft geaccepteerd; inboxaflevering/bounces worden niet automatisch gecontroleerd. OAuth-, netwerk-, SMTP-fouten of gedeeltelijke acceptatie worden als onzeker opgeslagen, zonder automatisch opnieuw te proberen. De computer moet aanstaan, COP moet draaien en internet moet beschikbaar zijn. Gemiste tijden worden niet stil ingehaald.

## Bijwerken

Stop COP, pull main, voer `pnpm.cmd build:packages` en `pnpm.cmd --filter @cop/db db:migrate` uit en start `pnpm.cmd dev`. De nieuwe migratie voegt de verzendstatus toe. Bewaar bestaande volumes en migratiehistorie.

Er is tijdens de ontwikkeling geen verbinding met jouw Microsoft 365-tenant gemaakt en geen echte mail verstuurd. OAuth/SMTP wordt in tests volledig vervangen door fixtures. Een live acceptatietest vereist de lokale configuratie en een expliciet gekozen ontvanger.
