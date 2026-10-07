import { describe, expect, it } from 'vitest';
import type { MembershipRow, StoredImport } from '@cop/contracts';
import {
  calculateReport,
  dateOnly,
  localClock,
  reportPeriod,
} from './calculation.js';
import { defaultSettings } from './store.js';
import { CanonicalFileAdapter } from './adapters.js';
import { dueRuns } from './delivery.js';
import { previewMail } from './mail.js';

const org = {
  id: 'org-a',
  name: 'Testclub',
  locations: [
    { id: 'a', name: 'Club A' },
    { id: 'b', name: 'Club B' },
  ],
};
const now = new Date('2026-10-01T06:00:00Z');
function row(
  id: string,
  locationId = 'a',
  startDate = '2026-01-01',
  endDate: string | null = null,
): MembershipRow {
  return {
    subscriptionId: id,
    memberId: id,
    locationId,
    startDate,
    endDate,
    cancellationRequestedDate: endDate ? '2026-08-20' : null,
    pauseStart: null,
    pauseEnd: null,
    pauseKind: null,
  };
}
function file(rows: MembershipRow[]): StoredImport {
  return {
    id: 'import-a',
    source: 'dewi-members',
    dataset: 'real',
    from: '2026-09-01',
    through: '2026-09-30',
    locations: ['a', 'b'],
    complete: true,
    rows,
    filename: 'members.csv',
    hash: 'hash',
    status: 'accepted',
    error: null,
    importedAt: now.toISOString(),
  };
}
function report(rows: MembershipRow[]) {
  return calculateReport(
    org,
    [file(rows)],
    'real',
    'monthly',
    '2026-09-10',
    defaultSettings,
    now,
  );
}
describe('controleerbare ledenberekeningen', () => {
  it('berekent uitstroom op effectieve einddatum en ontdubbelt abonnementen', () => {
    const a = row('m1', 'a', '2026-01-01', '2026-09-15'),
      b = row('m2');
    const duplicate = { ...b, subscriptionId: 'extra' };
    const r = report([a, b, duplicate]);
    expect(r.clubs[0]?.metrics).toMatchObject({
      opening: 2,
      active: 1,
      exits: 1,
      churn: 0.5,
      newMembers: 0,
    });
    expect(r.total.active).toBe(1);
    expect(r.total.exits).toBe(1);
  });
  it('onderscheidt pauze, verhuizing, herinschrijving en werkelijk nieuw', () => {
    const moving = row('moving', 'a', '2026-01-01', '2026-09-10');
    const arrived = {
      ...row('new-sub', 'b', '2026-09-10'),
      memberId: 'moving',
    };
    const pause = {
      ...row('paused'),
      pauseStart: '2026-09-01',
      pauseEnd: null,
      pauseKind: 'paused' as const,
    };
    const old = row('return', 'a', '2026-01-01', '2026-08-01');
    const returning = {
      ...row('return2', 'a', '2026-09-20'),
      memberId: 'return',
    };
    const r = report([
      moving,
      arrived,
      pause,
      old,
      returning,
      row('brandnew', 'a', '2026-09-12'),
    ]);
    expect(r.clubs[0]?.metrics).toMatchObject({
      paused: 1,
      exits: 0,
      transfersOut: 1,
      rejoined: 1,
      newMembers: 1,
    });
    expect(r.clubs[1]?.metrics.transfersIn).toBe(1);
    expect(r.total.transfersIn).toBe(0);
    expect(r.total.exits).toBe(0);
  });
  it('telt een extra abonnement niet als nieuwe instroom of verhuizing', () => {
    const existing = row('m', 'a');
    const other = { ...row('m-extra', 'b'), memberId: 'm' };
    const added = { ...row('m-new', 'a', '2026-09-12'), memberId: 'm' };
    const r = report([existing, other, added]);
    expect(r.clubs[0]?.metrics.newMembers).toBe(0);
    expect(r.clubs[0]?.metrics.transfersIn).toBe(0);
    expect(r.total.active).toBe(1);
  });
  it('scheidt demo en echt; ontbrekend en niet gedekt blijven onbekend', () => {
    const demo = { ...file([row('m')]), dataset: 'demo' as const };
    const r = calculateReport(
      org,
      [demo],
      'real',
      'monthly',
      '2026-09-01',
      defaultSettings,
      now,
    );
    expect(r.total.active).toBeNull();
    expect(r.total.revenue).toBeNull();
    expect(r.sources[0]?.status).toBe('missing');
    const partial = { ...file([row('m')]), through: '2026-09-15' };
    expect(
      calculateReport(
        org,
        [partial],
        'real',
        'monthly',
        '2026-09-01',
        defaultSettings,
        now,
      ).total.active,
    ).toBeNull();
  });
  it('vraagt volledige clubhistorie voordat instroom of uitstroom wordt gesteld', () => {
    const one = { ...file([row('m')]), locations: ['a'] };
    const r = calculateReport(
      org,
      [one],
      'real',
      'monthly',
      '2026-09-01',
      defaultSettings,
      now,
    );
    expect(r.clubs[0]?.metrics.active).toBe(1);
    expect(r.clubs[0]?.metrics.exits).toBeNull();
    expect(r.total.exits).toBeNull();
    expect(r.total.churn).toBeNull();
  });
  it('houdt churn onbekend bij nul beginbestand en merkt nieuwe regels als voorstel', () => {
    expect(report([]).total.churn).toBeNull();
    expect(report([]).provisional).toBe(true);
    const r = calculateReport(
      org,
      [file([])],
      'real',
      'monthly',
      '2026-09-01',
      { ...defaultSettings, rulesApproved: true, rulesVersion: 'old' },
      now,
    );
    expect(r.provisional).toBe(true);
  });
  it('sommeert omzet/betalingen maar gebruikt alleen einddagsaldo; conversie gewogen', () => {
    const finance: StoredImport = {
      ...file([]),
      source: 'dewi-finance',
      rows: [
        {
          eventId: 'r',
          locationId: 'a',
          date: '2026-09-15',
          kind: 'revenue',
          amountCents: 12345,
        },
        {
          eventId: 'p',
          locationId: 'a',
          date: '2026-09-20',
          kind: 'payment',
          amountCents: 10000,
        },
        {
          eventId: 'b1',
          locationId: 'a',
          date: '2026-09-01',
          kind: 'outstanding',
          amountCents: 2345,
        },
        {
          eventId: 'b2',
          locationId: 'a',
          date: '2026-09-30',
          kind: 'outstanding',
          amountCents: 1500,
        },
      ],
    };
    const hp: StoredImport = {
      ...file([]),
      source: 'healthplanner',
      rows: [
        {
          locationId: 'a',
          date: '2026-09-30',
          leads: 2,
          converted: 1,
          appointments: 2,
          visitingActive: 1,
          sleeping: 0,
        },
        {
          locationId: 'b',
          date: '2026-09-30',
          leads: 8,
          converted: 2,
          appointments: 3,
          visitingActive: 1,
          sleeping: 0,
        },
      ],
    };
    const r = calculateReport(
      org,
      [finance, hp],
      'real',
      'monthly',
      '2026-09-01',
      defaultSettings,
      now,
    );
    expect(r.total).toMatchObject({
      revenue: 12345,
      received: 10000,
      outstanding: 1500,
      conversion: 0.3,
      visitingActive: null,
      sleeping: null,
    });
  });
  it('markeert een oude import voor een actueel dagrapport als verouderd', () => {
    const old = { ...file([row('m')]), importedAt: '2026-09-27T00:00:00Z' };
    expect(
      calculateReport(
        org,
        [old],
        'real',
        'daily',
        '2026-09-30',
        defaultSettings,
        now,
      ).sources[0]?.status,
    ).toBe('stale');
  });
});
describe('datumgrenzen en veilige mail', () => {
  it('registreert een late start als gemist en dedupliceerbare runs tijdens wintertijd', () => {
    expect(dueRuns(new Date('2026-10-07T10:00:00Z'), '07:00')).toContainEqual({
      kind: 'daily',
      date: '2026-10-06',
      missed: true,
    });
    const first = dueRuns(new Date('2026-10-25T00:30:00Z'), '02:30');
    const second = dueRuns(new Date('2026-10-25T01:30:00Z'), '02:30');
    expect(first).toEqual(second);
  });
  it('valideert kalenderdatums inclusief schrikkeljaar', () => {
    expect(() => dateOnly('2026-02-29')).toThrow();
    expect(reportPeriod('monthly', '2028-02-12')).toEqual({
      from: '2028-02-01',
      through: '2028-02-29',
    });
    expect(reportPeriod('monthly', '2026-12-12')).toEqual({
      from: '2026-12-01',
      through: '2026-12-31',
    });
  });
  it('gebruikt Amsterdam met zomer/wintertijd, en vorige maand op 1 januari', () => {
    expect(localClock(new Date('2026-07-01T05:00:00Z')).time).toBe('07:00');
    expect(localClock(new Date('2026-01-01T06:00:00Z')).time).toBe('07:00');
    expect(dueRuns(new Date('2026-01-01T06:00:00Z'), '07:00')).toContainEqual({
      kind: 'monthly',
      date: '2025-12-01',
      missed: false,
    });
    expect(
      dueRuns(new Date('2026-01-01T05:59:00Z'), '07:00').some(
        (r) => r.kind === 'monthly',
      ),
    ).toBe(false);
  });
  it('escaped organisatienamen en toont onbekend expliciet in mail', () => {
    const r = {
      ...report([]),
      organization: { ...org, name: '<script>test</script>' },
    };
    const mail = previewMail(r, ['test@example.invalid']);
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('onbekend');
    expect(mail.delivery).toBe('local-test-only');
  });
});
describe('canonical CSV adapter', () => {
  const adapter = new CanonicalFileAdapter();
  const meta = {
    source: 'dewi-members' as const,
    dataset: 'real' as const,
    from: '2026-09-01',
    through: '2026-09-30',
    locations: ['a'],
    complete: true,
  };
  const header =
    'subscriptionId,memberId,locationId,startDate,endDate,cancellationRequestedDate,pauseStart,pauseEnd,pauseKind\n';
  it('accepteert einddatum en aanvraagdatum afzonderlijk', async () => {
    const r = await adapter.parse(
      Buffer.from(header + 's1,m1,a,2026-01-01,2026-09-20,2026-08-01,,,\n'),
      'test.csv',
      meta,
    );
    expect(r[0]).toMatchObject({
      endDate: '2026-09-20',
      cancellationRequestedDate: '2026-08-01',
    });
  });
  it('bewaart een stopaanvraag zonder effectieve einddatum zonder uitstroom te verzinnen', async () => {
    const r = await adapter.parse(
      Buffer.from(header + 's1,m1,a,2026-01-01,,2026-09-02,,,\n'),
      'test.csv',
      meta,
    );
    expect(r[0]).toMatchObject({
      endDate: null,
      cancellationRequestedDate: '2026-09-02',
    });
    const result = report(r as MembershipRow[]);
    expect(result.total.exits).toBe(0);
  });
  it('weigert vreemde locaties, dubbele abonnementen, invalid datums en ruwe ledenlijst', async () => {
    await expect(
      adapter.parse(
        Buffer.from(header + 's1,m1,b,2026-01-01,,,,,\n'),
        'test.csv',
        meta,
      ),
    ).rejects.toThrow('scope');
    await expect(
      adapter.parse(
        Buffer.from(
          header + 's1,m1,a,2026-01-01,,,,,\ns1,m1,a,2026-01-01,,,,,\n',
        ),
        'test.csv',
        meta,
      ),
    ).rejects.toThrow('Dubbel');
    await expect(
      adapter.parse(
        Buffer.from(header + 's1,m1,a,2026-02-30,,,,,\n'),
        'test.csv',
        meta,
      ),
    ).rejects.toThrow('Datum');
    await expect(
      adapter.parse(
        Buffer.from('Klantnummer,Status\n1,Actief'),
        'test.csv',
        meta,
      ),
    ).rejects.toThrow('Verwachte kolommen');
  });
  it('onvolledige HP kalenderdagen worden niet als volledig geaccepteerd', async () => {
    await expect(
      adapter.parse(
        Buffer.from(
          'locationId,date,leads,converted,appointments,visitingActive,sleeping\na,2026-09-01,1,0,2,3,4',
        ),
        'hp.csv',
        { ...meta, source: 'healthplanner' },
      ),
    ).rejects.toThrow('rij per club per dag');
  });
});
