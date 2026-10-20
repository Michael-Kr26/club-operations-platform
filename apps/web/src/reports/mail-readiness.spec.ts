import { it, expect } from 'vitest';
import type { ManagementReport } from '@cop/contracts';
import { blocksRealSend } from './mail-readiness';
it('laat volledige financiële weekrapporten toe ondanks ontbrekende niet-financiële bronnen', () => {
  const report = {
    kind: 'weekly',
    through: '2026-01-04',
    provisional: false,
    warnings: ['Healthplanner ontbreekt'],
    clubs: [{ id: 'a', metrics: { revenue: 100 } }],
    sources: [{ locationId: 'a', source: 'dewi-finance', status: 'ready' }],
  } as ManagementReport;
  expect(blocksRealSend(report)).toBe(false);
  report.clubs[0]!.metrics.revenue = null;
  expect(blocksRealSend(report)).toBe(true);
});
it('behoudt de bestaande dag-/maandcontroles en blokkeert open weken', () => {
  const r = {
    kind: 'daily',
    provisional: false,
    warnings: ['bron ontbreekt'],
  } as ManagementReport;
  expect(blocksRealSend(r)).toBe(true);
  expect(blocksRealSend(r, true)).toBe(false);
  r.kind = 'monthly';
  expect(blocksRealSend(r, true)).toBe(true);
  expect(blocksRealSend({ ...r, kind: 'weekly', through: '2999-01-01' })).toBe(
    true,
  );
});
