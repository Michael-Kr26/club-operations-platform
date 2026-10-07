import { expect, it } from 'vitest';
import { previousAmsterdamDate } from './dates';
it('kiest de vorige kalenderdag rond zomertijd en nieuwjaar', () => {
  expect(previousAmsterdamDate(new Date('2026-03-29T22:30:00Z'))).toBe(
    '2026-03-29',
  );
  expect(previousAmsterdamDate(new Date('2026-10-25T23:30:00Z'))).toBe(
    '2026-10-25',
  );
  expect(previousAmsterdamDate(new Date('2025-12-31T23:30:00Z'))).toBe(
    '2025-12-31',
  );
});
