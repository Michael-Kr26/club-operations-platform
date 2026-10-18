// Small, synthetic fixtures only. No original club workbooks or personal data.
import ExcelJS from 'exceljs';
export async function forecastFixture(
  options: { duplicate?: boolean; blank?: boolean; badFormula?: boolean } = {},
) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet('Forecast KPI Ja');
  s.addRow(['Naam', '202609', '202610']);
  const labels = [
    'Opening members',
    'Joiners',
    'Betermeldingen',
    'Movement IN',
    'Leavers',
    'Ziek meldingen',
    'Movement OUT',
    'Closing Members',
    'Nett Movement',
  ];
  const values = [2, 1, 0, 1, 1, 0, 1, 2, 0];
  labels.forEach((l, i) =>
    s.addRow([l, options.blank && i === 0 ? null : values[i], values[i]]),
  );
  s.getCell('B9').value = {
    formula: options.badFormula ? 'SUM(B2:B8)' : 'B2+B5-B8',
  };
  s.getCell('C9').value = { formula: 'C2+C5-C8' };
  s.getCell('B10').value = { formula: 'B9-B2' };
  s.getCell('C10').value = { formula: 'C9-C2' };
  for (const suffix of ['sep. 2026', 'okt. 2026'])
    for (const [prefix, n] of [
      ['Opening members', 2],
      ['Joiners', 1],
      ['Better', 0],
      ['Leavers', 1],
      ['Sick', 0],
    ] as const) {
      const t = w.addWorksheet(`${prefix} ${suffix}`);
      t.addRow(['Klantnummer', 'Naam']);
      for (let i = 1; i <= n; i++)
        t.addRow([
          {
            formula: `HYPERLINK("https://admin.dewi-online.nl/members/${options.duplicate ? 1 : i}/edit", ${i})`,
          },
          `Test ${i}`,
        ]);
    }
  w.addWorksheet('Omschrijving').addRows([
    ['Omschrijving'],
    ['Forecast sport-society-barneveld 12-10-2026'],
  ]);
  return Buffer.from(await w.xlsx.writeBuffer());
}
export async function membersFixture(duplicate = false) {
  const w = new ExcelJS.Workbook();
  w.addWorksheet('Leden').addRows([
    ['Klantnummer', 'Status', 'Laatste bezoek', 'Tijdelijke stop'],
    [1, 'Actief', '2026-09-01', null],
    [duplicate ? 1 : 2, 'Actief', null, null],
    [3, 'Inactief', '2026-08-01', null],
  ]);
  w.addWorksheet('Contracten').addRow(['Klantnummer']);
  return Buffer.from(await w.xlsx.writeBuffer());
}
export async function financeFixture(mismatch = false) {
  const w = new ExcelJS.Workbook();
  w.addWorksheet('Artikelen').addRows([
    [
      'Artikel',
      'Artikelgroep',
      'Aantal',
      'BTW %',
      'Excl BTW',
      'BTW',
      'Incl BTW',
      'Percentage',
    ],
    ['Test abonnement', 'Abonnementen', 1, 10, 100, 10, 110, null],
  ]);
  w.addWorksheet('Winst&Verlies Kasstelsel').addRows([
    [
      'Grootboeknummer',
      'Grootboek',
      'Hoofd verdichting',
      'Debet',
      'Credit',
      'Totaal',
    ],
    [8000, 'Omzet', 'Alle', null, mismatch ? 90 : 100, -100],
  ]);
  w.addWorksheet('BTW').addRows([
    ['Naam', 'Incl BTW', 'Excl BTW', 'BTW'],
    ['10%', 110, 100, 10],
  ]);
  w.addWorksheet('Omschrijving').addRows([
    ['Omschrijving'],
    ['Omzet - Periode 01-09-2026 tot en met 30-09-2026'],
  ]);
  return Buffer.from(await w.xlsx.writeBuffer());
}
export async function healthplannerFixture() {
  const w = new ExcelJS.Workbook();
  for (const name of ['Wekelijkse update', 'Maandelijkse update']) {
    const s = w.addWorksheet(name);
    s.getCell('A4').value = 'Sport Society totaal';
    let start = 15;
    for (const loc of [
      'Barneveld',
      'Voorthuizen',
      'Achterveld',
      'Wekerom',
      'Harskamp',
    ]) {
      s.getCell(start, 1).value = loc;
      s.getCell(start + 1, 1).value = 'Naam';
      s.getCell(start + 1, 2).value =
        name === 'Wekelijkse update' ? '2026W39' : '202609';
      for (const [offset, label, value] of [
        [2, 'Totaal leden', 10],
        [3, 'Leden zonder doel', 5],
        [5, 'Leden zonder afspraak', 2],
        [7, 'Leden zonder coach', null],
      ] as const) {
        s.getCell(start + offset, 1).value = label;
        s.getCell(start + offset, 2).value = value;
      }
      start += 11;
    }
  }
  return Buffer.from(await w.xlsx.writeBuffer());
}
