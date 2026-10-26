# Lokaal beheer

Instellingen → **Back-ups en lokaal opstarten** toont de back-uplocatie,
recente kopieën en **Nu back-up maken**. Alleen de lokale apparaateigenaar
in de Dockerloze start kan dit gebruiken. De beheerroute werkt niet voor
andere organisatiegebruikers of in de productiestart.

## Back-ups

De lokale starter maakt bij opstarten een back-up als de laatste automatische
kopie minstens 24 uur oud is. Tijdens het draaien controleert COP dit elk uur.
De laatste 14 automatische kopieën blijven bewaard; handmatige kopieën blijven
staan. Standaardlocatie: de map `backups` in de lokale COP-gegevensmap
(`%USERPROFILE%\.cop`). `COP_BACKUP_DIR` kan een andere locatie aanwijzen.
Een kopie op dezelfde schijf beschermt niet tegen verlies van die schijf.

Het archief bevat de volledige lokale database van alle organisaties:
rapportages, geïmporteerde originelen, voorraad, taken, roosters en accounts.
Nog niet geïmporteerde bestanden, mail-/bronconfiguratie met toegangssleutels
en projectcode zitten er niet in. De bestanden zijn niet versleuteld; bewaar
ze op een afgeschermde locatie. Het controlegetal detecteert beschadiging,
maar bewijst niet van wie een archief afkomstig is.

Handmatig zonder geopende COP, vanuit de projectmap:

```powershell
pnpm.cmd backup:local
pnpm.cmd backup:list
```

Een tweede start wordt door het bestaande databaselock geweigerd. Verwijder
een lock niet zolang COP draait. In de geopende COP gebruik je de back-upknop.

## Herstellen

Herstel gebruikt uitsluitend een vertrouwde COP-back-up. Het controleert het
bestand en opent de database in een **nieuwe** gegevensmap. Een bestaande map
wordt geweigerd; de oorspronkelijke gegevens worden nooit overschreven.

```powershell
pnpm.cmd backup:restore "C:\pad\naar\kopie.copbackup" "C:\dev\COP-herstel-2026-10-26"
```

Controleer het resultaat voordat je overschakelt. Stop de huidige COP, stel
`COP_DATA_DIR` in op de nieuwe map en start opnieuw. Mail- en bronkoppelingen
zijn in de nieuwe gegevensmap niet geconfigureerd. Beoordeel die afzonderlijk
voordat echte verzending weer wordt ingeschakeld. Als herstel faalt blijft
de nieuwe map voor onderzoek staan; kies bij een nieuwe poging een andere map.

## Windows-start en stop

De hulpscripts zijn beschikbaar, maar de start bij aanmelden is niet vanzelf
ingeschakeld. Vanuit de projectmap:

```powershell
.\scripts\start-local.ps1
```

De start gebruikt dezelfde installatie, migraties en back-ups als `dev:local`.
Diagnostiek gaat naar `startup.log` in de gegevensmap. Stop in een andere
PowerShell met `.\scripts\stop-local.ps1`. Dit sluit de website, API en database.

Optioneel bij Windows-aanmelding activeren:

```powershell
.\scripts\install-local-autostart.ps1
```

Uitschakelen: `.\scripts\install-local-autostart.ps1 -Remove`.
De hulp maakt een snelkoppeling voor de eigen Windows-gebruiker; geen
beheerrechten, permanente service of wijziging van uitvoeringsbeleid.
Windows kan scripts blokkeren volgens het geldende uitvoeringsbeleid.
Node en pnpm moeten geïnstalleerd blijven. De laptop moet aanstaan en
slaapstand onderbreekt de uitvoering. Deze functie wijzigt geen mailplanning.
