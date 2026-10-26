# Rooster: ontwerpvoorstellen

Datum: 26 oktober 2026. Status: interactieve voorstellen; nog geen gekozen of geïmplementeerde vervanging van `/planning`.

De bijbehorende `rooster-voorstellen.fragment.html` bevat drie originele COP-ontwerpen met fictieve voorbeeldgegevens. De ontwerpen zijn bedoeld voor de inline ontwerpviewer van Codex (variantcarousel). Ze doen geen netwerkverzoeken en wijzigen geen COP-gegevens. Een gewone browserpagina zonder de viewer toont alleen het eerste ontwerp; de viewer voegt de keuzeknop voor de drie varianten toe.

## Richtingen

| Ontwerp       | Planner op desktop                                                                                                                                    | Medewerker op mobiel                                                         | Inspiratie                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Weekoverzicht | Medewerkers als rijen, zeven dagen als kolommen, contracturen en een beschikbare medewerkerslijst. Klik of sleep om een dienst met tijden te plannen. | Een verticale agenda met eigen diensten op alle gekoppelde locaties.         | Planday: medewerkersweergave, weekrooster, contracturen en diensten verslepen.                |
| Dienstkaarten | Ruime dagkolommen met dienstkaarten, toegewezen medewerkers en zichtbare open diensten.                                                               | De eerstvolgende dienst staat groot bovenaan, daarna de overige diensten.    | Deputy: mobiele dienstinformatie, open diensten en dienstwissels.                             |
| Bezetting     | Eén dag per locatie, gegroepeerd per functie. Ingevulde en open diensten staan naast de benodigde bezetting.                                          | Een dagkiezer met eigen diensten en een directe ingang naar beschikbaarheid. | Papershift: plannen vanuit benodigde diensten en functies, met beschikbare medewerkers erbij. |

Voorkeur: het Weekoverzicht voor de planner, gecombineerd met de mobiele startpagina van Dienstkaarten. De keuze staat nog open. Blauw blijft de hoofdkleur; oranje markeert open diensten. Licht en donker volgen de weergave van de gebruiker.

## Mobiele functies

De voorstellen demonstreren eigen diensten openen, beschikbaarheid per dag wijzigen, interesse in een open dienst doorgeven en een wissel aanvragen. Elke actie werkt met tikken; slepen is optioneel voor de planner. In de voorbeelden blijven aanvragen in behandeling totdat de planner bevestigt. Bij kleine schermen verschijnt automatisch de medewerkersweergave. Op de smalste schermen breekt de dagkiezer over meerdere regels af.

De definitieve medewerkersomgeving moet daarnaast aan deze eisen voldoen:

- Een echte, persoonlijke login is gekoppeld aan precies de juiste medewerker binnen de organisatie. Een rolkeuze in de interface is geen toegangscontrole.
- De server retourneert voor medewerkers uitsluitend hun eigen gepubliceerde diensten; concepten, andere personeelsdossiers en loongegevens blijven buiten deze weergave.
- De medewerker ziet de eigen diensten over alle toegewezen locaties. Open diensten zijn beperkt tot toegestane locaties en passende functies/vaardigheden.
- Beschikbaarheid wordt duurzaam opgeslagen en is zichtbaar voor de planner. Een wijziging verwijdert of wijzigt geen bestaande dienst automatisch.
- Interesse en wissels maken een aanvraag aan; de planner bevestigt de wijziging. De server controleert locatie, actieve status, vaardigheden en overlappende diensten opnieuw.
- Een bestaande dienst blijft staan zolang een wissel niet is goedgekeurd. Gelijktijdige aanvragen mogen geen dubbele toewijzing veroorzaken.
- De mobiele omgeving werkt vanaf 320 pixels zonder horizontaal rooster, met leesbare tekst, bereikbare knoppen en duidelijke bevestigingen en foutmeldingen.
- Publiceren en wijzigingen daarna krijgen een duidelijke status en wijzigingshistorie. Echte e-mail/pushmeldingen volgen de bestaande prioritering en zijn geen voorwaarde voor het eerste mobiele rooster.

## Grenzen van dit prototype

De voorbeeldacties bewaren alleen lokale ontwerpstatus. De getoonde personen, contracturen, roosters, benodigde bezetting en bevestigingen zijn fictief. De manager- en medewerkersweergaven zijn losse voorbeelden, geen gekoppelde live planning. Authentificatie, rechten, beschikbaarheidsopslag, aanvragen en publicatiecommunicatie moeten nog worden gebouwd. De huidige COP-planning blijft ongewijzigd.

## Onderzoek en controle

Officiële bronnen:

- [Planday: Scheduling explained](https://help.planday.com/en/articles/30153-scheduling-explained)
- [Planday: Move, copy, delete or approve shifts](https://help.planday.com/en/articles/30398-move-copy-delete-or-approve-shifts)
- [Planday: app FAQ voor medewerkers](https://help.planday.com/en/articles/90116-planday-app-faqs-and-troubleshooting-for-employees)
- [Deputy: mobiele app](https://www.deputy.com/mobile)
- [Papershift: employee scheduling](https://www.papershift.com/en/use-case/schedule)

Gecontroleerd: JavaScript-syntaxis, variantwisseling, dienstformulier en lokale toewijzing, mobiele dienstdetails en wisselaanvraag, beschikbaarheid wijzigen, behoud van ontwerpstatus na herladen en weergave in een frame van 320 pixels. Er zijn geen COP-gegevens aangepast en geen nieuwe productieafhankelijkheden toegevoegd.
