export async function operationsApi<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    credentials: 'same-origin',
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error(
      'Backend niet bereikbaar. Start COP met pnpm.cmd dev:local.',
    );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : `Aanvraag mislukt (${response.status}).`,
    );
  return data;
}
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const activityLabels = {
  floor: 'Vloer',
  class: 'Groepsles',
  pt: 'PT',
  intake: 'Intake',
  admin: 'Administratie',
  training: 'Opleiding',
};
export const shiftTypeLabels = {
  allround: 'Allround',
  host: 'Gastheer',
  clubmanager: 'Clubmanager',
  internship: 'Stage',
};
export const recordLabels = {
  task: 'Taak',
  employee: 'Medewerker',
  shift: 'Dienst',
  checklist: 'Controlelijst',
  asset: 'Apparaat',
  contact: 'Contactnotitie',
};
