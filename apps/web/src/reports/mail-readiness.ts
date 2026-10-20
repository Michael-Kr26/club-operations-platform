import type { ManagementReport } from '@cop/contracts';
import { previousAmsterdamDate } from './dates';
// UI hint only: the server revalidates rules, recipients and source coverage.
export function blocksRealSend(
  report: ManagementReport | undefined,
  allowPartialDaily = false,
) {
  if (!report || report.provisional) return true;
  if (report.kind === 'weekly')
    return (
      report.through > previousAmsterdamDate() ||
      !report.clubs.length ||
      report.clubs.some(
        (c) =>
          c.metrics.revenue === null ||
          !report.sources.some(
            (s) =>
              s.locationId === c.id &&
              s.source === 'dewi-finance' &&
              s.status === 'ready',
          ),
      )
    );
  return (
    report.warnings.length > 0 &&
    !(report.kind === 'daily' && allowPartialDaily)
  );
}
