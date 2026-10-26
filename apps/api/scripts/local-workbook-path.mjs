import { posix, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('../../../', import.meta.url));

export function defaultImportFolder(
  platform = process.platform,
  project = projectDirectory,
) {
  return (platform === 'win32' ? win32 : posix).join(project, 'imports');
}

export function defaultHealthplannerFile(
  platform = process.platform,
  project = projectDirectory,
) {
  return (platform === 'win32' ? win32 : posix).join(
    defaultImportFolder(platform, project),
    'registratie',
    'Healthplanner_leden_updates.xlsx',
  );
}
