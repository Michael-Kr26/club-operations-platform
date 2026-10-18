import { describe, expect, it } from 'vitest';
import { parseWorkbook } from './workbook-source.js';
import { sportSociety } from './store.js';
import {
  forecastFixture,
  membersFixture,
  financeFixture,
  healthplannerFixture,
} from './workbook-fixtures.js';
const context = {
  filename: 'source.xlsx',
  locationId: 'barneveld',
  scopeConfirmed: true,
  asOf: '2026-10-01',
};
describe('bronbestanden voor Excel-dashboard', () => {
  it('berekent bekende formules zonder gecachte uitkomst en controleert unieke klanten', async () => {
    const r = await parseWorkbook(await forecastFixture(), sportSociety, {});
    expect(r.kind).toBe('forecast');
    if (r.kind !== 'forecast') throw new Error('Verkeerd formaat');
    expect(r.months).toHaveLength(2);
    expect(r.months[0]).toMatchObject({
      opening: 2,
      joiners: 1,
      leavers: 1,
      closing: 2,
      net: 0,
      indicativeChurn: 0.5,
      nextOpeningDifference: 0,
    });
  });
  it('weigert onbekende formules en een bron voor een andere tenant', async () => {
    await expect(
      parseWorkbook(
        await forecastFixture({ badFormula: true }),
        sportSociety,
        {},
      ),
    ).rejects.toThrow('Onbekende formule');
    await expect(
      parseWorkbook(
        await forecastFixture(),
        { ...sportSociety, id: 'other' },
        {},
      ),
    ).rejects.toThrow('organisatie');
  });
  it('toont ontbrekende aantallen als onbekend en markeert dubbele klantnummers', async () => {
    const blank = await parseWorkbook(
      await forecastFixture({ blank: true }),
      sportSociety,
      {},
    );
    if (blank.kind !== 'forecast') throw new Error('formaat');
    expect(blank.months[0]?.closing).toBeNull();
    expect(blank.months[0]?.indicativeChurn).toBeNull();
    const dupe = await parseWorkbook(
      await forecastFixture({ duplicate: true }),
      sportSociety,
      {},
    );
    if (dupe.kind !== 'forecast') throw new Error('formaat');
    expect(dupe.months[0]?.indicativeChurn).toBeNull();
    expect(dupe.months[0]?.warnings.join()).toContain('dubbele');
  });
  it('vereist een bevestigde club en peildatum voor een losse ledenexport', async () => {
    const b = await membersFixture();
    await expect(parseWorkbook(b, sportSociety, {})).rejects.toThrow(
      'bevestig',
    );
    await expect(
      parseWorkbook(b, sportSociety, { ...context, asOf: undefined }),
    ).rejects.toThrow('peildatum');
    const r = await parseWorkbook(b, sportSociety, context);
    if (r.kind !== 'members') throw new Error('formaat');
    expect(r.rows[0]?.values).toMatchObject({
      total: 3,
      active: 2,
      inactive14: 1,
      inactive30: 1,
      unknownVisit: 1,
    });
    expect(JSON.stringify(r)).not.toContain('IBAN');
    await expect(
      parseWorkbook(await membersFixture(true), sportSociety, context),
    ).rejects.toThrow('Dubbele klantnummers');
  });
  it('sluit omzet, BTW en grootboek aan zonder balansmutaties of percentages mee te tellen', async () => {
    const r = await parseWorkbook(
      await financeFixture(),
      sportSociety,
      context,
    );
    if (r.kind !== 'finance') throw new Error('formaat');
    expect(r.cards.map((c) => c.value)).toEqual([10000, 1000, 11000]);
    await expect(
      parseWorkbook(await financeFixture(true), sportSociety, context),
    ).rejects.toThrow('sluiten niet');
  });
  it('leest Healthplanner-invoer en houdt ontbrekende coachaantallen onbekend', async () => {
    const r = await parseWorkbook(
      await healthplannerFixture(),
      sportSociety,
      {},
    );
    if (r.kind !== 'healthplanner') throw new Error('formaat');
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0]?.values).toMatchObject({
      total: 10,
      withoutAppointment: 2,
      withoutAppointmentRatio: 0.2,
      withoutCoach: null,
      withoutCoachRatio: null,
    });
    expect(r.cards).toHaveLength(0);
  });
});
