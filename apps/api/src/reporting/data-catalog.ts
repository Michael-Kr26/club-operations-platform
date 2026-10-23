import type {
  CatalogEntry,
  CatalogLocation,
  CatalogStatus,
  DataCatalog,
  Dataset,
  ForecastImport,
  ReportOrganization,
  StoredImport,
  HealthplannerRow,
  FinanceRow,
} from '@cop/contracts';

type Definition = Omit<CatalogEntry, 'status' | 'locations'> & {
  fields: string[];
};
const definitions: Definition[] = [
  {
    id: 'visiting',
    category: 'Bezoek',
    title: 'Bezoekindicatoren Healthplanner',
    description: 'Bezoekend actieve en slapende leden volgens Healthplanner.',
    fields: ['Bezoekend actief', 'Slapend'],
    formats:
      'Healthplanner-managementmail (.eml) of standaard Healthplanner-CSV',
    needed: 'Dagrapport met club, datum en de beide aantallen.',
    note: 'Geen individuele check-ins. Bezoekend actief is geen actief Dewi-abonnement.',
    route: 'files',
  },
  {
    id: 'inactivity',
    category: 'Bezoek',
    title: '14 / 30 dagen niet geweest',
    description:
      'Inactiviteit op basis van Laatste bezoek in de aangeleverde Dewi-selectie.',
    fields: ['14 dagen', '30 dagen'],
    formats: 'Dewi leden-/contractenexport (.xlsx)',
    needed:
      'Werkbladen Leden en Contracten; bevestig club en werkelijke peildatum bij upload.',
    note: 'Alleen de selectie uit het bestand; onbekende bezoekdatums blijven een beperking.',
    route: 'files',
  },
  {
    id: 'checkins',
    category: 'Bezoek',
    title: 'Check-ins, piekuren en bezoekfrequentie',
    description: 'Individuele bezoeken per dag, uur en locatie.',
    fields: [],
    formats: 'Nog geen importadapter',
    needed: 'Voorbeeldexport met bezoek-ID, lid-ID, club en datum/tijd.',
    note: 'Een ledenexport met Laatste bezoek bevat geen complete check-inhistorie.',
    route: null,
  },
  {
    id: 'finance-pdf',
    category: 'Omzet',
    title: 'Omzetrapporten als PDF',
    description: 'PDF-bestanden in bijvoorbeeld imports/Omzet/Achterveld.',
    fields: [],
    formats: 'Nog geen PDF-importadapter',
    needed:
      'Eén voorbeeld-PDF om bedragen, btw, periode en clubvermelding betrouwbaar te herkennen.',
    note: 'Een gevonden PDF telt nog niet als geïmporteerde omzet. De inhoud is nog niet uitgelezen.',
    route: null,
  },
  {
    id: 'monthly-finance',
    category: 'Omzet',
    title: 'Dewi omzetrapport en productverdeling',
    description:
      'Kasstelselomzet inclusief/exclusief btw en aangeleverde productcategorieën.',
    fields: ['Omzetrapport'],
    formats: 'Dewi omzetrapport (.xlsx)',
    needed:
      'Artikelen, Winst&Verlies Kasstelsel, BTW en de bronperiode; bevestig de club.',
    note: 'Deze bedragen worden niet over weken verdeeld. Bankontvangsten en openstaande posten zijn andere cijfers.',
    route: 'files',
  },
  ...(['revenue', 'payment', 'outstanding', 'failed_debit'] as const).map(
    (kind): Definition => ({
      id: kind,
      category: 'Omzet',
      title: {
        revenue: 'Weekomzet / financiële gebeurtenissen',
        payment: 'Ontvangen betalingen',
        outstanding: 'Openstaande bedragen',
        failed_debit: 'Mislukte incasso’s',
      }[kind],
      description:
        'Afzonderlijke financiële gegevens per club en boekingsdatum.',
      fields: ['Financiële gegevens'],
      formats: 'Standaard financiële CSV via Rapportages',
      needed: `Kolommen eventId,locationId,date,kind,amountCents. Voor deze gegevens: kind=${kind}; bedragen in gehele centen.`,
      note: 'Voor een betrouwbaar weekrapport is volledige dekking van de afgesloten week nodig. Een willekeurige Dewi-CSV vraagt eerst een adapter.',
      route: 'csv',
    }),
  ),
  {
    id: 'members',
    category: 'Leden',
    title: 'Ledenbestand en bronstatus',
    description:
      'Unieke klantnummers en status Actief binnen de Dewi-exportselectie.',
    fields: ['Leden in selectie', 'Status Actief'],
    formats: 'Dewi leden-/contractenexport (.xlsx)',
    needed:
      'Leden en Contracten, met de verplichte bronkolommen; bevestig club en peildatum.',
    note: 'Geen bewijs van een volledig actief abonnementenbestand of unieke leden over alle clubs.',
    route: 'files',
  },
  {
    id: 'subscriptions',
    category: 'Leden',
    title: 'Abonnementshistorie, pauzes en churn',
    description:
      'Start/einde, aanvraagdatum opzegging en pauze- of bevriezingsperioden.',
    fields: ['Abonnementshistorie'],
    formats: 'Standaard abonnementen-CSV via Rapportages',
    needed:
      'subscriptionId,memberId,locationId,startDate,endDate,cancellationRequestedDate,pauseStart,pauseEnd,pauseKind. Bevestig periode en volledigheid.',
    note: 'Een ledenselectie of Dewi-forecast vervangt geen volledige historische abonnementendata. Churnregels moeten zijn goedgekeurd.',
    route: 'csv',
  },
  {
    id: 'forecast',
    category: 'Leden',
    title: 'Dewi ledenontwikkeling / forecast',
    description:
      'Opening, instroom, uitstroom en eindstand uit het Dewi-forecastbestand.',
    fields: ['Ledenontwikkeling'],
    formats: 'Dewi forecast (.xlsx)',
    needed:
      'Forecast KPI-werkblad, detailbladen en Omschrijving met club/exportdatum.',
    note: 'De brondefinitie en indicatieve churn blijven apart van de definitieve churnberekening.',
    route: 'files',
  },
  {
    id: 'hp-update',
    category: 'Leden',
    title: 'Healthplanner ledenupdates',
    description:
      'Totaal leden, zonder doel, zonder afspraak en zonder coach per club/week/maand.',
    fields: ['Totaal leden', 'Zonder doel', 'Zonder afspraak', 'Zonder coach'],
    formats: 'Healthplanner_leden_updates.xlsx',
    needed:
      'Wekelijkse update en Maandelijkse update met herkenbare clubkoppen.',
    note: 'Lege invoercellen zijn onbekend. Dit zijn Healthplanner-definities, geen Dewi-abonnementenstand.',
    route: 'files',
  },
  {
    id: 'appointments',
    category: 'Verkoop & afspraken',
    title: 'Afspraken en opvolging',
    description: 'Aantal afspraken en leden zonder toekomstige afspraak.',
    fields: ['Afspraken', 'Zonder afspraak'],
    formats:
      'Healthplanner-managementmail (.eml), updatetabel of standaard HP-CSV',
    needed:
      'Club, bronperiode en de betreffende aantallen. Een updatetabel levert alleen zonder-afspraak.',
    note: 'Tellingen zijn geen agenda met individuele afspraken of contactgegevens.',
    route: 'files',
  },
  {
    id: 'sales',
    category: 'Verkoop & afspraken',
    title: 'Leads en verkochte abonnementen',
    description:
      'Verkoopcijfers uit de dagelijkse Healthplanner-managementrapportage.',
    fields: ['Leads', 'Verkocht'],
    formats: 'Healthplanner-managementmail (.eml) of standaard HP-CSV',
    needed: 'Rapport met club, datum, leads en verkochte abonnementen.',
    note: 'Verkocht en geconverteerd zijn verschillende velden; geen percentages optellen.',
    route: 'files',
  },
  {
    id: 'cancellations',
    category: 'Verkoop & afspraken',
    title: 'Aangevraagde opzeggingen (HP)',
    description: 'Aantal opzegverzoeken in de bronrapportage.',
    fields: ['Opzegverzoeken'],
    formats: 'Healthplanner-managementmail (.eml) of standaard HP-CSV',
    needed: 'Club, rapportdatum en aangevraagde opzeggingen.',
    note: 'Een opzegverzoek is nog geen effectieve uitstroom; daarvoor is abonnementshistorie nodig.',
    route: 'files',
  },
  {
    id: 'classes',
    category: 'Lessen',
    title: 'Lessen, PT en deelname',
    description:
      'Geplande/gegeven lessen, boekingen, aanwezigheid en capaciteit.',
    fields: [],
    formats: 'Nog geen importadapter',
    needed:
      'Voorbeeldexport met les-ID, locatie, type, start/einde, capaciteit en deelname.',
    note: 'Een personeelsdienst met activiteit Les of PT is geen bewijs van lesdeelname.',
    route: null,
  },
  {
    id: 'roster',
    category: 'Team & planning',
    title: 'Excelrooster en afwezigheid',
    description: 'Diensten per medewerker/club en vakantie, ziekte en verlof.',
    fields: [],
    formats: 'Nog geen Excelrooster-importadapter',
    needed:
      'Actueel roosterbestand met namen/personeelsnummers en de afgesproken kleurlegenda.',
    note: 'Handmatig roosterbeheer in COP is beschikbaar. Dit overzicht gaat uitsluitend over geïmporteerde bronnen.',
    route: null,
  },
  {
    id: 'marketing',
    category: 'Marketing',
    title: 'Kanalen en advertentiekosten',
    description: 'Leads per kanaal, campagnekosten en cohortconversie.',
    fields: [],
    formats: 'Nog geen importadapter',
    needed:
      'Voorbeeldexport met kanaal/campagne, periode, kosten en aantallen.',
    note: 'Een totaal aantal leads in HP bewijst geen uitsplitsing naar marketingkanaal.',
    route: null,
  },
];
type Evidence = {
  locationId: string;
  fields: string[];
  filename: string;
  importedAt: string;
  period: string;
  complete: boolean;
};
const status = (locations: CatalogLocation[]): CatalogStatus =>
  !locations.length || locations.every((l) => l.status === 'missing')
    ? 'missing'
    : locations.every((l) => l.status === 'received')
      ? 'received'
      : 'partial';
function periodEnd(period: string) {
  if (/^\d{4}W\d{2}$/.test(period)) {
    const year = Number(period.slice(0, 4)),
      week = Number(period.slice(5));
    const jan4 = new Date(Date.UTC(year, 0, 4));
    return Date.UTC(
      year,
      0,
      4 - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7 + 6,
    );
  }
  if (/^\d{6}$/.test(period))
    return Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4)), 0);
  return Date.parse(period.slice(-10)) || Date.parse(period) || 0;
}
export function dataCatalog(
  org: ReportOrganization,
  dataset: Dataset,
  workbooks: ForecastImport[],
  canonical: StoredImport[],
  now = new Date(),
): DataCatalog {
  const evidence = new Map<string, Evidence[]>();
  const add = (id: string, fact: Evidence) => {
    if (org.locations.some((l) => l.id === fact.locationId))
      evidence.set(id, [...(evidence.get(id) ?? []), fact]);
  };
  for (const source of workbooks) {
    if (
      source.dataset !== dataset ||
      source.status !== 'accepted' ||
      !source.report
    )
      continue;
    const report = source.report;
    const fact = (
      locationId: string,
      period: string,
      fields: string[],
    ): Evidence => ({
      locationId,
      period,
      fields,
      filename: source.filename,
      importedAt: source.importedAt,
      complete: true,
    });
    if (report.kind === 'forecast') {
      for (const month of report.months)
        add(
          'forecast',
          fact(
            report.locationId,
            month.month,
            month.opening !== null || month.closing !== null
              ? ['Ledenontwikkeling']
              : [],
          ),
        );
      continue;
    }
    if (report.kind === 'finance') {
      for (const loc of report.locationIds)
        add(
          'monthly-finance',
          fact(
            loc,
            report.period,
            report.cards.some(
              (card) => card.value !== null && Number.isFinite(card.value),
            )
              ? ['Omzetrapport']
              : [],
          ),
        );
      continue;
    }
    for (const row of report.rows) {
      const fields = (pairs: [string, string][]) =>
        pairs
          .filter(
            ([key]) =>
              typeof row.values[key] === 'number' &&
              Number.isFinite(row.values[key]),
          )
          .map(([, label]) => label);
      if (report.kind === 'members') {
        add(
          'members',
          fact(
            row.locationId,
            row.period,
            fields([
              ['total', 'Leden in selectie'],
              ['active', 'Status Actief'],
            ]),
          ),
        );
        add(
          'inactivity',
          fact(
            row.locationId,
            row.period,
            fields([
              ['inactive14', '14 dagen'],
              ['inactive30', '30 dagen'],
            ]),
          ),
        );
      }
      if (report.kind === 'healthplanner') {
        for (const [id, pairs] of Object.entries({
          'hp-update': [
            ['total', 'Totaal leden'],
            ['withoutGoal', 'Zonder doel'],
            ['withoutAppointment', 'Zonder afspraak'],
            ['withoutCoach', 'Zonder coach'],
          ],
          visiting: [
            ['active', 'Bezoekend actief'],
            ['sleeping', 'Slapend'],
          ],
          appointments: [
            ['appointments', 'Afspraken'],
            ['withoutAppointment', 'Zonder afspraak'],
          ],
          sales: [
            ['leads', 'Leads'],
            ['sold', 'Verkocht'],
          ],
          cancellations: [['cancellations', 'Opzegverzoeken']],
        })) {
          const daily = /^\d{4}-\d{2}-\d{2}$/.test(row.period);
          if (
            daily
              ? id === 'hp-update'
              : !['hp-update', 'appointments'].includes(id)
          )
            continue;
          add(
            id,
            fact(
              row.locationId,
              row.period,
              fields(pairs as [string, string][]),
            ),
          );
        }
      }
    }
  }
  for (const source of canonical) {
    if (source.dataset !== dataset || source.status !== 'accepted') continue;
    const fact = (
      locationId: string,
      period: string,
      fields: string[],
    ): Evidence => ({
      locationId,
      period,
      fields,
      filename: source.filename,
      importedAt: source.importedAt,
      complete: source.complete,
    });
    if (source.source === 'dewi-members')
      for (const loc of source.locations)
        add(
          'subscriptions',
          fact(
            loc,
            `${source.from} t/m ${source.through}`,
            source.rows.some((row) => row.locationId === loc)
              ? ['Abonnementshistorie']
              : [],
          ),
        );
    if (source.source === 'dewi-finance')
      for (const row of source.rows as FinanceRow[])
        add(
          row.kind,
          fact(row.locationId, `${source.from} t/m ${source.through}`, [
            'Financiële gegevens',
          ]),
        );
    if (source.source === 'healthplanner')
      for (const row of source.rows as HealthplannerRow[]) {
        const fields = (pairs: [keyof HealthplannerRow, string][]) =>
          pairs
            .filter(
              ([key]) =>
                typeof row[key] === 'number' && Number.isFinite(row[key]),
            )
            .map(([, label]) => label);
        for (const [id, pairs] of Object.entries({
          visiting: [
            ['visitingActive', 'Bezoekend actief'],
            ['sleeping', 'Slapend'],
          ],
          appointments: [
            ['appointments', 'Afspraken'],
            ['withoutFutureAppointment', 'Zonder afspraak'],
          ],
          sales: [
            ['leads', 'Leads'],
            ['soldMemberships', 'Verkocht'],
          ],
          cancellations: [['requestedCancellations', 'Opzegverzoeken']],
        }))
          add(
            id,
            fact(
              row.locationId,
              row.date,
              fields(pairs as [keyof HealthplannerRow, string][]),
            ),
          );
      }
  }
  return {
    organization: org,
    dataset,
    checkedAt: now.toISOString(),
    entries: definitions.map(({ fields, ...definition }) => {
      const locations: CatalogLocation[] = org.locations.map((loc) => {
        const facts = (evidence.get(definition.id) ?? [])
          .filter((f) => f.locationId === loc.id)
          .sort(
            (a, b) =>
              b.importedAt.localeCompare(a.importedAt) ||
              periodEnd(b.period) - periodEnd(a.period),
          );
        const latestTime = facts[0]?.importedAt;
        // Within the newest import choose its latest populated period, never fill missing fields from older files.
        const selected =
          facts
            .filter((f) => f.importedAt === latestTime)
            .find((f) => f.fields.length > 0) ?? facts[0];
        const availableFields = fields.filter((field) =>
          selected?.fields.includes(field),
        );
        const missingFields = fields.filter(
          (field) => !availableFields.includes(field),
        );
        return {
          ...loc,
          status:
            definition.route === null
              ? 'planned'
              : !availableFields.length
                ? 'missing'
                : missingFields.length || !selected?.complete
                  ? 'partial'
                  : 'received',
          availableFields,
          missingFields,
          source: selected
            ? {
                filename: selected.filename,
                importedAt: selected.importedAt,
                period: selected.period,
                complete: selected.complete,
              }
            : null,
        };
      });
      return {
        ...definition,
        status: definition.route === null ? 'planned' : status(locations),
        locations,
      };
    }),
  };
}
