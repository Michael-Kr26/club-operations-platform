import { mockShifts } from './mockPlanningData';

export function PlanningPage() {
  return (
    <section>
      <h1>Planning</h1>

      <ul>
        {mockShifts.map((shift) => (
          <li key={shift.id}>
            {shift.date} — {shift.locationSlug} — {shift.startTime} tot{' '}
            {shift.endTime}
          </li>
        ))}
      </ul>
    </section>
  );
}