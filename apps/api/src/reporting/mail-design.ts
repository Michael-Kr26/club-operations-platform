import type {
  ForecastDashboard,
  ManagementReport,
  MailPreview,
  Metrics,
} from '@cop/contracts';
export interface MailDesignContext {
  greetingName?: string;
  dashboard?: ForecastDashboard;
  webUrl?: string;
}
const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const numeric = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const when = (v: string) =>
  new Date(v).toLocaleString('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    dateStyle: 'short',
    timeStyle: 'short',
  });
const number = (v: number | null) =>
  v === null ? 'Onbekend' : v.toLocaleString('nl-NL');
export function designedMail(
  report: ManagementReport,
  recipients: string[],
  delivery: MailPreview['delivery'],
  format: (key: keyof Metrics, v: number | null) => string,
  context: MailDesignContext = {},
): MailPreview {
  const weekly = report.kind === 'weekly',
    monthly = report.kind === 'monthly';
  const title = weekly
    ? 'Weekrapport · omzet'
    : monthly
      ? 'Maandrapport & churn'
      : 'De dagstart';
  const subject = `${report.dataset === 'demo' ? '[DEMO] ' : ''}${report.provisional ? '[VOORSTEL] ' : ''}${report.organization.name} · ${title} · ${report.from} t/m ${report.through}`;
  const dashboard =
    context.dashboard?.organization.id === report.organization.id &&
    context.dashboard.dataset === report.dataset
      ? context.dashboard
      : null;
  const imported =
    dashboard?.imports
      .filter((i) => i.status === 'accepted')
      .sort(
        (a, b) =>
          b.importedAt.localeCompare(a.importedAt) || b.id.localeCompare(a.id),
      ) ?? [];
  const supplementalSources: string[] = [];
  const clubs = report.clubs.map((c) => {
    const metrics = { ...c.metrics };
    let selection: number | null = null,
      selectionDate: string | null = null;
    if (!weekly && !monthly) {
      const hp = imported.find(
        (i) =>
          i.report?.kind === 'healthplanner' &&
          i.report.rows.some(
            (r) => r.locationId === c.id && r.period === report.from,
          ),
      );
      const row =
        hp?.report?.kind === 'healthplanner'
          ? hp.report.rows.find(
              (r) => r.locationId === c.id && r.period === report.from,
            )
          : null;
      if (row) {
        for (const [target, source] of [
          ['leads', 'leads'],
          ['soldMemberships', 'sold'],
          ['requestedCancellations', 'cancellations'],
          ['appointments', 'appointments'],
          ['visitingActive', 'active'],
          ['sleeping', 'sleeping'],
          ['withoutFutureAppointment', 'withoutAppointment'],
        ] as const)
          if (metrics[target] === null)
            metrics[target] = numeric(row.values[source]);
        supplementalSources.push(
          `${c.name} · Healthplanner · ${hp!.filename} · periode ${report.from} · import ${when(hp!.importedAt)}`,
        );
      }
      const snapshot = imported
        .filter(
          (i) =>
            i.locationId === c.id &&
            i.report?.kind === 'members' &&
            i.report.period <= report.through,
        )
        .sort((a, b) => {
          const ap = a.report?.kind === 'members' ? a.report.period : '',
            bp = b.report?.kind === 'members' ? b.report.period : '';
          return (
            bp.localeCompare(ap) || b.importedAt.localeCompare(a.importedAt)
          );
        })[0];
      if (snapshot?.report?.kind === 'members') {
        selection = numeric(
          snapshot.report.rows.find((r) => r.locationId === c.id)?.values.total,
        );
        selectionDate = snapshot.report.period;
        supplementalSources.push(
          `${c.name} · Dewi-selectie · ${snapshot.filename} · peildatum ${selectionDate} · import ${when(snapshot.importedAt)}`,
        );
      }
    }
    return { ...c, metrics, selection, selectionDate };
  });
  const sum = (key: keyof Metrics) =>
    clubs.length && clubs.every((c) => c.metrics[key] !== null)
      ? clubs.reduce((n, c) => n + c.metrics[key]!, 0)
      : null;
  const selectionSum =
    clubs.length && clubs.every((c) => c.selection !== null)
      ? clubs.reduce((n, c) => n + c.selection!, 0)
      : null;
  const sources = report.sources
    .filter((s) => clubs.some((c) => c.id === s.locationId))
    .filter((s) => !weekly || s.source === 'dewi-finance')
    .map(
      (s) =>
        `${report.organization.locations.find((l) => l.id === s.locationId)?.name ?? s.locationId} · ${{ 'dewi-members': 'Dewi-abonnementen', 'dewi-finance': 'Dewi-financieel', healthplanner: 'Healthplanner' }[s.source]} · ${{ ready: 'beschikbaar', missing: 'bron ontbreekt', partial: 'onvolledig', stale: 'verouderd', invalid: 'laatste import ongeldig' }[s.status]} · ${s.from ?? '?'} t/m ${s.through ?? '?'} · laatste import ${s.importedAt ? when(s.importedAt) : 'onbekend'}`,
    );
  const attention: string[] = [];
  if (!weekly)
    for (const c of clubs) {
      if ((c.metrics.withoutFutureAppointment ?? 0) > 0)
        attention.push(
          `${c.name} · ${number(c.metrics.withoutFutureAppointment)} leden zonder toekomstige afspraak. Controleer opvolging in COP.`,
        );
      if ((c.metrics.failedDebits ?? 0) > 0 || (c.metrics.outstanding ?? 0) > 0)
        attention.push(
          `${c.name} · Controleer mislukte incasso’s en openstaande posten.`,
        );
    }
  if (
    clubs.some((c) => c.metrics.paused === null || c.metrics.frozen === null) &&
    !weekly
  )
    attention.push(
      'Pauzes en bevriezingen: gegevens voor één of meer locaties ontbreken.',
    );
  if (weekly && clubs.some((c) => c.metrics.revenue === null))
    attention.push(
      'Omzet is voor één of meer clubs onbekend: lever financiële events aan met volledige weekdekking. Een maandexport wordt niet over weken verdeeld.',
    );
  if (!attention.length)
    attention.push(
      'Geen berekenbaar aandachtspunt in de beschikbare gegevens. Controleer ook de bronvolledigheid hieronder.',
    );
  const formatCell = (key: keyof Metrics, c: (typeof clubs)[number]) =>
    format(key, c.metrics[key]);
  const tables: {
    title: string;
    headers: string[];
    rows: string[][];
    note: string;
  }[] = [];
  if (weekly)
    tables.push({
      title: 'Omzet per locatie',
      headers: [
        'Locatie',
        'Omzet',
        'Ontvangen',
        'Openstaand',
        'Mislukte incasso’s',
      ],
      rows: clubs.map((c) => [
        c.name,
        ...(
          ['revenue', 'received', 'outstanding', 'failedDebits'] as const
        ).map((k) => formatCell(k, c)),
      ]),
      note: 'Kalenderweek maandag–zondag. Omzet en ontvangen betalingen zijn verschillende geldstromen; openstaand en mislukte incasso’s zijn snapshots op de einddatum.',
    });
  else {
    tables.push({
      title: monthly
        ? 'Maandelijkse churn per locatie'
        : 'Ledenontwikkeling per locatie',
      headers: monthly
        ? ['Locatie', 'Beginstand', 'Nieuw', 'Uitstroom', 'Churn']
        : [
            'Locatie',
            'Actief (Dewi)',
            'Nieuw',
            'Uitstroom',
            'Zonder afspraak (HP)',
          ],
      rows: clubs.map((c) => [
        c.name,
        ...(monthly
          ? (['opening', 'newMembers', 'exits', 'churn'] as const)
          : ([
              'active',
              'newMembers',
              'exits',
              'withoutFutureAppointment',
            ] as const)
        ).map((k) => formatCell(k, c)),
      ]),
      note: 'Actief telt unieke leden met een geldig, niet-gepauzeerd abonnement volgens de voorgestelde Dewi-definitie. Uitstroom gebruikt de effectieve einddatum. Churn = uitstroom / actieve beginstand.',
    });
    tables.push({
      title: 'Verkoop, afspraken & ledenbehoud',
      headers: [
        'Locatie',
        'Leads',
        'Verkocht',
        'Afgeronde afspraken',
        'Slapend (HP)',
      ],
      rows: clubs.map((c) => [
        c.name,
        ...(
          ['leads', 'soldMemberships', 'appointments', 'sleeping'] as const
        ).map((k) => formatCell(k, c)),
      ]),
      note: 'Verkochte lidmaatschappen zijn geen bewezen leadcohortconversie. Slapend en bezoekend actief volgen de Healthplanner-brondefinitie.',
    });
    tables.push({
      title: 'Pauzes & financiële opvolging',
      headers: [
        'Locatie',
        'Gepauzeerd',
        'Bevroren',
        'Mislukte incasso’s',
        'Openstaand',
      ],
      rows: clubs.map((c) => [
        c.name,
        ...(['paused', 'frozen', 'failedDebits', 'outstanding'] as const).map(
          (k) => formatCell(k, c),
        ),
      ]),
      note: 'Pauzes zijn geen opzeggingen. Openstaand is een saldo, geen omzet.',
    });
    if (clubs.some((c) => c.selection !== null))
      tables.push({
        title: 'Dewi-exportselectie · afzonderlijke bron',
        headers: ['Locatie', 'Leden in selectie', 'Peildatum'],
        rows: clubs.map((c) => [
          c.name,
          number(c.selection),
          c.selectionDate ?? 'Onbekend',
        ]),
        note: 'Deze selectie bewijst geen volledig actief abonnementenbestand en vervangt de actieve ledenstand hierboven niet.',
      });
  }
  const kpis = weekly
    ? [
        ['Omzet deze week', format('revenue', sum('revenue'))],
        ['Ontvangen betalingen', format('received', sum('received'))],
        ['Openstaand op einddatum', format('outstanding', sum('outstanding'))],
      ]
    : monthly
      ? [
          ['Actieve beginstand', format('opening', report.total.opening)],
          ['Effectieve uitstroom', format('exits', report.total.exits)],
          ['Churn', format('churn', report.total.churn)],
        ]
      : [
          [
            sum('active') !== null
              ? 'Actieve leden (Dewi)'
              : 'Leden in Dewi-selectie',
            sum('active') !== null
              ? number(sum('active'))
              : number(selectionSum),
          ],
          [
            'Nieuw / effectieve uitstroom',
            `${number(report.total.newMembers)} / ${number(report.total.exits)}`,
          ],
          ['Zonder afspraak (HP)', number(sum('withoutFutureAppointment'))],
        ];
  const notes = [
    ...report.warnings.filter(
      (w) =>
        (!/ · (dewi-members|dewi-finance|healthplanner):/.test(w) ||
          clubs.some((c) => w.startsWith(c.name + ' · '))) &&
        (!weekly ||
          !report.organization.locations.some(
            (l) =>
              w.startsWith(l.name + ' · dewi-members:') ||
              w.startsWith(l.name + ' · healthplanner:'),
          )),
    ),
    ...attention,
    'Dewi-abonnementen, exportselecties en Healthplanner-bezoek zijn verschillende definities. Som clubregistraties is geen unieke organisatiebrede telling.',
    'Onbekend betekent ontbrekend of onvoldoende gedekt; het is nooit automatisch nul.',
    delivery === 'local-test-only'
      ? 'Alleen lokale testmailopvang. Er wordt geen internetmail verstuurd.'
      : 'Verzending via Microsoft 365; acceptatie bevestigt geen aflevering in de inbox.',
  ];
  let origin = 'http://localhost:5173';
  try {
    const url = new URL(context.webUrl ?? origin);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      origin = url.origin;
  } catch {
    /* safe local fallback */
  }
  const url = `${origin}/organisaties/${encodeURIComponent(report.organization.id)}/rapportages/excel?dataset=${report.dataset}&view=${weekly ? 'finance' : 'hp'}&interval=${weekly ? 'week' : monthly ? 'month' : 'day'}&date=${report.through}`;
  const subtitle = weekly
    ? 'Jouw weekcijfers naast elkaar.'
    : monthly
      ? 'Ledenbehoud en effectieve uitstroom.'
      : 'Dit speelt er in jouw clubs.';
  const small =
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b';
  const th =
    'padding:10px 8px;text-align:right;border-bottom:1px solid #dbe4f0;font-size:13px';
  const text = [
    subject,
    ...kpis.map(([k, v]) => `${k}: ${v}`),
    ...tables.flatMap((t) => [
      t.title,
      t.headers.join(' | '),
      ...t.rows.map((r) => r.join(' | ')),
      t.note,
    ]),
    'Vandaag aandacht voor',
    ...attention,
    'Bronnen & volledigheid',
    ...sources,
    ...supplementalSources,
    ...notes,
    `Open overzicht in COP: ${url}`,
    ...(!weekly ? ['Omzet ontvang je uitsluitend in het weekrapport.'] : []),
  ].join('\n');
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>@media(max-width:600px){.mail-shell{width:100%!important}.mail-pad{padding:24px 14px!important}.mail-title{font-size:30px!important}.mail-data th,.mail-data td{font-size:11px!important;padding:8px 4px!important}.mail-kpi{font-size:25px!important}.mail-kpi-cell{display:block!important;width:auto!important;padding:14px!important}}</style></head><body style="margin:0;padding:24px 8px;background:#edf4ff;color:#0f172a;font-family:Georgia,'Times New Roman',serif"><div style="display:none;max-height:0;overflow:hidden">${esc(title)} · ${esc(report.from)} t/m ${esc(report.through)}</div><table role="presentation" class="mail-shell" width="760" align="center" style="max-width:100%;border-collapse:collapse;background:#ffffff"><tr><td class="mail-pad" style="padding:36px"><p style="${small};letter-spacing:2px;color:#17477d"><strong>COP</strong> / ${esc(report.organization.name.toUpperCase())}</p><p style="${small};color:#17477d">${esc(title.toUpperCase())} · ${report.dataset === 'demo' ? 'DEMO — FICTIEVE GEGEVENS' : report.provisional ? 'VOORLOPIGE DEFINITIES' : 'BRONRAPPORTAGE'}</p><h1 class="mail-title" style="font-size:42px;line-height:1.15;margin:24px 0 8px">${weekly ? 'Jouw weekoverzicht.' : monthly ? 'Jouw maandoverzicht.' : esc(context.greetingName?.trim() ? `Goedemorgen, ${context.greetingName.trim()}.` : 'Goedemorgen.')}</h1><p style="font-size:23px;margin:0 0 12px">${esc(subtitle)}</p><p style="${small}">Rapportage ${esc(report.from)} t/m ${esc(report.through)} · Europe/Amsterdam<br>Samengesteld ${esc(when(report.generatedAt))}</p><table role="presentation" width="100%" style="margin:24px 0;background:#edf4ff;border-collapse:collapse"><tr>${kpis.map(([label, value]) => `<td class="mail-kpi-cell" width="33%" valign="top" style="padding:20px 10px;text-align:center"><strong class="mail-kpi" style="font-size:29px;color:#17477d">${esc(value)}</strong><br><span style="font-size:14px">${esc(label)}</span></td>`).join('')}</tr></table><p style="${small}">Som clubregistraties; onbekende clubwaarden maken de som onbekend. Exportselecties zijn geen actieve abonnementen.</p>${tables.map((t) => `<h2 style="font-size:25px;margin:30px 0 12px">${esc(t.title)}</h2><table class="mail-data" width="100%" style="border-collapse:collapse"><thead><tr style="background:#edf4ff">${t.headers.map((h, i) => `<th scope="col" style="${th};${i === 0 ? 'text-align:left' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((v, i) => (i === 0 ? `<th scope="row" style="${th};text-align:left;font-weight:normal">${esc(v)}</th>` : `<td style="${th}">${esc(v)}</td>`)).join('')}</tr>`).join('')}</tbody></table><p style="${small}">${esc(t.note)}</p>`).join('')}<h2 style="font-size:25px;margin-top:30px">${weekly ? 'Aandacht voor de week' : 'Vandaag aandacht voor'}</h2><table role="presentation" width="100%" style="background:#fff0e3;border-collapse:collapse">${attention
    .slice(0, 6)
    .map(
      (a, i) =>
        `<tr><td width="45" valign="top" style="padding:12px;color:#c65a16;font-size:28px;border-bottom:1px solid #f2d3ba">${String(i + 1).padStart(2, '0')}</td><td style="padding:12px;border-bottom:1px solid #f2d3ba;line-height:1.5">${esc(a)}</td></tr>`,
    )
    .join(
      '',
    )}</table>${attention.length > 6 ? `<p style="${small}">Meer aandachtspunten staan in COP en in de tekstversie.</p>` : ''}<h2 style="font-size:25px;margin-top:30px">Bronnen & volledigheid</h2><div style="background:#edf4ff;padding:16px;${small}">${[...sources, ...supplementalSources].map((s) => `<p style="margin:6px 0">${esc(s)}</p>`).join('') || '<p>Geen bronstatus beschikbaar.</p>'}</div>${notes.length ? `<p style="${small}">${notes.slice(0, 6).map(esc).join('<br>')}${notes.length > 6 ? '<br>Overige meldingen staan in COP en de tekstversie.' : ''}</p>` : ''}<p style="text-align:center;margin:28px 0"><a href="${esc(url)}" style="display:inline-block;padding:15px 22px;background:#235ee8;color:white;text-decoration:none;font-weight:bold;border-radius:5px">Open ${weekly ? 'weekoverzicht' : monthly ? 'maandoverzicht' : 'dagoverzicht'} in COP →</a></p>${!weekly ? `<p style="${small};text-align:center">Omzet ontvang je uitsluitend in het weekrapport.</p>` : ''}<p style="${small};border-top:1px solid #dbe4f0;padding-top:16px">${esc(report.organization.name)} · COP · Europe/Amsterdam<br>${report.dataset === 'demo' ? 'Fictieve voorbeeldgegevens. ' : ''}Geen automatische koppeling van leden tussen systemen.</p></td></tr></table></body></html>`;
  return { subject, text, html, recipients, delivery };
}
