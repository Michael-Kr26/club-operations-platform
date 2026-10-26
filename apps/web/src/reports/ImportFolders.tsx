export function ImportFolders({ root }: { root: string | null }) {
  const folder = (name: string) =>
    root
      ? `${root.replace(/[\\/]$/, '')}${root.includes('\\') ? '\\' : '/'}${name}`
      : `imports/${name}`;
  return (
    <ul>
      <li>
        <code>{folder('omzet')}</code> — PAY.-PDF’s, eventueel per club.
      </li>
      <li>
        <code>{folder('registratie')}</code> — Dewi Leden/Contracten en
        Healthplanner_leden_updates.xlsx.
      </li>
      <li>
        <code>{folder('statusrapporten')}</code> — wekelijks vijf
        Dewi-statusrapporten, bijvoorbeeld forecast-Bveld-2644.xlsx.
      </li>
    </ul>
  );
}
