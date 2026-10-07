export type LocationSlug =
  'barneveld' | 'achterveld' | 'wekerom' | 'harskamp' | 'voorthuizen';

export type AbsenceType =
  'sick' | 'paid_leave' | 'parental_leave' | 'time_off_in_lieu';

export type Shift = {
  id: string;
  employeeNumber: string;
  locationSlug: LocationSlug;
  date: string;
  startTime: string;
  endTime: string;
};

export type Absence = {
  id: string;
  employeeNumber: string;
  date: string;
  type: AbsenceType;
  hours?: number;
};
