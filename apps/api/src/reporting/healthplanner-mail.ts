import { simpleParser } from 'mailparser';
import { load } from 'cheerio';
import type { HealthplannerRow, ReportOrganization } from '@cop/contracts';
import { localClock, shiftDate } from './calculation.js';

export const HP_SUBJECT = 'Health Planner: Dagelijkse managementrapportage';
export const HP_SENDER = 'noreply@healthplanner.nl';
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const months = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];
export async function parseHealthplannerMail(
  bytes: Buffer,
  org: ReportOrganization,
) {
  if (!bytes.length || bytes.length > 5_000_000)
    throw new Error('Mail moet 1 byte tot 5 MB zijn.');
  const mail = await simpleParser(bytes, {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
  });
  if (
    mail.subject !== HP_SUBJECT ||
    mail.from?.value.length !== 1 ||
    mail.from.value[0]?.address?.toLowerCase() !== HP_SENDER
  )
    throw new Error(
      'Afzender of onderwerp komt niet overeen met de Healthplanner-managementmail.',
    );
  if (!mail.date || !Number.isFinite(mail.date.getTime()) || !mail.html)
    throw new Error('Maildatum of HTML-rapport ontbreekt.');
  const reportDate = localClock(mail.date).date;
  const $ = load(mail.html);
  const heading = normalize($('h2').first().text());
  const parts = heading.match(/^(\w+) (\d{1,2}) (\w+)$/);
  const expected = new Date(`${reportDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    timeZone: 'Europe/Amsterdam',
  }).format(expected);
  if (
    !parts ||
    parts[1] !== weekday ||
    Number(parts[2]) !== Number(reportDate.slice(-2)) ||
    months.indexOf(parts[3]!) + 1 !== Number(reportDate.slice(5, 7))
  )
    throw new Error(
      'Datum in de rapportage wijkt af van de maildatum; import handmatig controleren.',
    );
  const date = shiftDate(reportDate, -1);
  const values = new Map<
    string,
    Record<string, { yesterday: string; month: string }>
  >();
  let tables = 0;
  const sections = new Set<string>();
  $('table').each((_, table) => {
    const trs = $(table).find('tr');
    const headers = trs.first().children('th').toArray().slice(1);
    if (!headers.length) return;
    tables++;
    const locations = headers.map((h) => {
      if ($(h).attr('colspan') !== '2')
        throw new Error('Onbekende clubkolom-indeling.');
      const title = normalize($(h).text());
      const matches = org.locations.filter(
        (l) => title === normalize(`${org.name} ${l.name}`),
      );
      if (matches.length !== 1)
        throw new Error('Clubkop hoort niet bij deze organisatie.');
      return matches[0]!.id;
    });
    if (
      new Set(locations).size !== locations.length ||
      locations.length !== org.locations.length
    )
      throw new Error('Ontbrekende of dubbele clubs.');
    const section = normalize(trs.eq(1).children('td').first().text());
    if (!['verkoop', 'ledenbehoud'].includes(section))
      throw new Error('Rapportagesectie ontbreekt.');
    sections.add(section);
    const periods = trs
      .eq(1)
      .children('td')
      .toArray()
      .slice(1)
      .map((c) => normalize($(c).text()));
    if (
      periods.length !== locations.length * 2 ||
      periods.some((p, i) => p !== (i % 2 ? 'maand' : 'gisteren'))
    )
      throw new Error('Onbekende rapportageperioden.');
    trs.slice(2).each((_, tr) => {
      const cells = $(tr).children('td').toArray();
      if (cells.length === 0) {
        const repeated = $(tr).children('th').toArray().slice(1);
        if (
          repeated.length !== locations.length ||
          repeated.some(
            (h, i) =>
              $(h).attr('colspan') !== '2' ||
              normalize($(h).text()) !==
                normalize(
                  `${org.name} ${org.locations.find((l) => l.id === locations[i])!.name}`,
                ),
          )
        )
          throw new Error('Onbekende herhaalde clubkop.');
        return;
      }
      if (cells.length === 1) return;
      if (cells.length !== 1 + locations.length * 2)
        throw new Error('Beschadigde rapportagerij.');
      const label = normalize($(cells[0]!).text());
      if (['verkoop', 'ledenbehoud'].includes(label)) {
        if (
          cells
            .slice(1)
            .some(
              (c, i) =>
                normalize($(c).text()) !== (i % 2 ? 'maand' : 'gisteren'),
            )
        )
          throw new Error('Onbekende rapportageperioden.');
        sections.add(label);
        return;
      }
      locations.forEach((id, i) => {
        const metrics = values.get(id) ?? Object.create(null);
        if (Object.hasOwn(metrics, label))
          throw new Error('Dubbele rapportageregel.');
        metrics[label] = {
          yesterday: $(cells[1 + i * 2]!)
            .text()
            .trim(),
          month: $(cells[2 + i * 2]!)
            .text()
            .trim(),
        };
        values.set(id, metrics);
      });
    });
  });
  if (![1, 2].includes(tables) || sections.size !== 2)
    throw new Error('Verkoop- of ledenbehoudtabel ontbreekt.');
  const rows: HealthplannerRow[] = org.locations.map((l) => {
    const raw = values.get(l.id)!;
    const number = (label: string) => {
      const v = raw[normalize(label)]?.yesterday;
      if (v === undefined)
        throw new Error(`Verplichte regel ontbreekt: ${label}.`);
      if (v === '' || v === '-' || normalize(v) === 'onbekend') return null;
      if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)))
        throw new Error(`Ongeldig aantal: ${label}.`);
      return Number(v);
    };
    return {
      locationId: l.id,
      date,
      leads: number('Totaal aantal potentiële klanten'),
      converted: null,
      appointments: number('Aantal afgeronde afspraken'),
      visitingActive: number('Actieve leden'),
      sleeping: number('Slapende leden'),
      soldMemberships: number('Aantal verkochte lidmaatschappen'),
      requestedCancellations: number('Aantal opzeggingen'),
      withoutFutureAppointment: number(
        'Aantal leden zonder een afspraak in de toekomst',
      ),
      managementMail: { reportDate, monthPeriodUnconfirmed: true, values: raw },
    };
  });
  return {
    rows,
    meta: {
      source: 'healthplanner' as const,
      dataset: 'real' as const,
      from: date,
      through: date,
      locations: org.locations.map((l) => l.id),
      complete: true,
    },
  };
}
