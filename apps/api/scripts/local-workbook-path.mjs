import { homedir } from 'node:os';
import { win32 } from 'node:path';

export function defaultHealthplannerFile(
  platform = process.platform,
  home = homedir(),
) {
  return platform === 'win32'
    ? win32.join(
        home,
        'OneDrive',
        'Documenten',
        'Werkdocumenten',
        'SportSociety',
        'Taken',
        'AOM Taken',
        'Healthplanner_leden_updates.xlsx',
      )
    : '';
}

export function defaultImportFolder(
  platform = process.platform,
  home = homedir(),
) {
  const file = defaultHealthplannerFile(platform, home);
  return file ? win32.join(win32.dirname(file), 'COP imports') : '';
}
