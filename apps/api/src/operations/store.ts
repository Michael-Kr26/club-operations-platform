import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  Activity,
  Dataset,
  OperationKind,
  OperationRecord,
  Principal,
  ReportOrganization,
  TaskData,
  EmployeeData,
  ShiftData,
  ChecklistData,
  AssetData,
  ContactData,
  OperationData,
  RosterTemplateEntry,
  RosterTemplateSummary,
  RosterCopyResult,
  RosterWeek,
} from '@cop/contracts';
import { dateOnly } from '../reporting/calculation.js';

const kinds: OperationKind[] = [
  'task',
  'employee',
  'shift',
  'checklist',
  'asset',
  'contact',
];
const activities: Activity[] = [
  'floor',
  'class',
  'pt',
  'intake',
  'admin',
  'training',
];
export const todayAmsterdam = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
function text(value: unknown, max = 200, required = false) {
  if (typeof value !== 'string') {
    if (required)
      throw new BadRequestException('Verplicht tekstveld ontbreekt.');
    return '';
  }
  if (value.length > max || (required && !value.trim()))
    throw new BadRequestException('Tekst ontbreekt of is te lang.');
  return value.trim();
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T))
    throw new BadRequestException('Ongeldige keuze.');
  return value as T;
}
function date(value: unknown, required = false) {
  if (value == null || value === '') {
    if (required) throw new BadRequestException('Datum ontbreekt.');
    return null;
  }
  try {
    return dateOnly(value);
  } catch {
    throw new BadRequestException('Gebruik een geldige datum.');
  }
}
function identifier(value: unknown) {
  return value == null || value === '' ? null : text(value, 200, true);
}
export function operationScope(
  principal: Principal,
  org: string,
  write = false,
) {
  if (
    principal.organizationId !== org ||
    !principal.permissions.includes(
      write ? 'operations.manage' : 'operations.read',
    )
  )
    throw new ForbiddenException('Geen toegang tot deze werkruimte of actie.');
  return principal;
}
function locationScope(
  principal: Principal,
  org: ReportOrganization,
  location: string,
) {
  if (
    !org.locations.some((l) => l.id === location) ||
    (principal.locations !== null && !principal.locations.includes(location))
  )
    throw new ForbiddenException('Geen toegang tot deze locatie.');
}
function record(row: Record<string, unknown>): OperationRecord {
  return {
    id: row.id as string,
    kind: row.kind as OperationKind,
    dataset: row.dataset as Dataset,
    locationId: row.location_id as string,
    data: row.data as OperationData,
    version: row.version as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    updatedBy: row.updated_by as string,
  };
}

export class OperationsStore {
  constructor(readonly pool: Pool) {}
  async rosterTemplates(
    org: ReportOrganization,
    principal: Principal,
    dataset: Dataset,
  ): Promise<RosterTemplateSummary[]> {
    operationScope(principal, org.id);
    choice(dataset, ['real', 'demo']);
    const rows = await this.pool.query(
      'SELECT id,location_id,slot,version,source_week,jsonb_array_length(entries) AS shift_count,updated_at FROM operation_roster_templates WHERE organization_id=$1 AND dataset=$2 AND ($3::text[] IS NULL OR location_id=ANY($3)) ORDER BY location_id,slot',
      [org.id, dataset, principal.locations],
    );
    return rows.rows
      .filter((row) => org.locations.some((l) => l.id === row.location_id))
      .map((row) => ({
        id: row.id,
        locationId: row.location_id,
        slot: row.slot,
        version: row.version,
        sourceWeek: row.source_week,
        shiftCount: row.shift_count,
        updatedAt: row.updated_at.toISOString(),
      }));
  }
  private rosterWeek(value: unknown) {
    const result = date(value, true)!;
    if (new Date(result + 'T00:00:00Z').getUTCDay() !== 1)
      throw new BadRequestException('Kies de maandag van de week.');
    return result;
  }
  private addDays(value: string, days: number) {
    return new Date(Date.parse(value + 'T00:00:00Z') + days * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  private async rosterTransaction<T>(
    org: ReportOrganization,
    principal: Principal,
    dataset: Dataset,
    action: (client: PoolClient) => Promise<T>,
  ) {
    operationScope(principal, org.id, true);
    choice(dataset, ['real', 'demo']);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        org.id + ':' + dataset + ':operations',
      ]);
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async insertRosterShift(
    client: PoolClient,
    org: ReportOrganization,
    principal: Principal,
    dataset: Dataset,
    locationId: string,
    data: ShiftData,
    key: string,
  ): Promise<boolean> {
    locationScope(principal, org, locationId);
    const previous = await client.query(
      "SELECT id FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind='shift' AND source_key=$3",
      [org.id, dataset, key],
    );
    if (previous.rows.length) return false;
    const cleaned = await this.validate(client, org, principal, {
      kind: 'shift',
      dataset,
      locationId,
      data: { ...data, status: 'draft' },
    });
    const id = randomUUID();
    await client.query(
      "INSERT INTO operation_records(id,organization_id,dataset,location_id,kind,data,source_key,updated_by) VALUES($1,$2,$3,$4,'shift',$5,$6,$7)",
      [
        id,
        org.id,
        dataset,
        locationId,
        JSON.stringify(cleaned),
        key,
        principal.userId,
      ],
    );
    await client.query(
      'INSERT INTO report_audit(id,organization_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
      [
        randomUUID(),
        org.id,
        principal.userId,
        'operations.shift-copied',
        JSON.stringify({ recordId: id, locationId, dataset }),
      ],
    );
    return true;
  }
  async copyShift(
    org: ReportOrganization,
    principal: Principal,
    body: { dataset: Dataset; id: string; version: number; date: string },
  ): Promise<RosterCopyResult> {
    if (!body) throw new BadRequestException('Kopieergegevens ontbreken.');
    const target = date(body.date, true)!;
    return this.rosterTransaction(
      org,
      principal,
      body.dataset,
      async (client) => {
        const source = await client.query(
          "SELECT * FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind='shift' AND id=$3",
          [org.id, body.dataset, text(body.id, 200, true)],
        );
        if (!source.rows[0])
          throw new NotFoundException('Dienst niet gevonden.');
        const original = record(source.rows[0]);
        locationScope(principal, org, original.locationId);
        if (original.version !== body.version)
          throw new ConflictException(
            'De dienst is gewijzigd. Vernieuw het rooster voordat je kopieert.',
          );
        const data = original.data as ShiftData;
        if (data.status === 'cancelled')
          throw new BadRequestException(
            'Een geannuleerde dienst kan niet worden gekopieerd.',
          );
        if (data.date === target)
          throw new BadRequestException(
            'Kies een andere dag dan de oorspronkelijke dienst.',
          );
        const added = await this.insertRosterShift(
          client,
          org,
          principal,
          body.dataset,
          original.locationId,
          { ...data, date: target, status: 'draft' },
          `copy:${original.id}:${target}`,
        );
        return { created: added ? 1 : 0, skipped: added ? 0 : 1 };
      },
    );
  }
  async saveRosterTemplate(
    org: ReportOrganization,
    principal: Principal,
    body: {
      dataset: Dataset;
      locationId: string;
      from: string;
      version: number;
      slot?: RosterWeek;
    },
  ) {
    if (!body) throw new BadRequestException('Basisrooster ontbreekt.');
    const from = this.rosterWeek(body.from);
    const slot = choice(body.slot === undefined ? 'A' : body.slot, ['A', 'B']);
    locationScope(principal, org, body.locationId);
    if (!Number.isInteger(body.version) || body.version < 0)
      throw new BadRequestException('Versienummer ontbreekt.');
    return this.rosterTransaction(
      org,
      principal,
      body.dataset,
      async (client) => {
        const previous = await client.query(
          'SELECT id,version FROM operation_roster_templates WHERE organization_id=$1 AND dataset=$2 AND location_id=$3 AND slot=$4 FOR UPDATE',
          [org.id, body.dataset, body.locationId, slot],
        );
        if ((previous.rows[0]?.version ?? 0) !== body.version)
          throw new ConflictException(
            'Het basisrooster is gewijzigd. Vernieuw het overzicht.',
          );
        const rows = await client.query(
          "SELECT * FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND location_id=$3 AND kind='shift' AND data->>'date'>=$4 AND data->>'date'<=$5 AND data->>'status'<>'cancelled' ORDER BY data->>'date',data->>'start',id",
          [org.id, body.dataset, body.locationId, from, this.addDays(from, 6)],
        );
        if (!rows.rows.length || rows.rows.length > 500)
          throw new BadRequestException(
            'Bewaar een week met 1 tot 500 diensten als basisrooster.',
          );
        const entries: RosterTemplateEntry[] = rows.rows.map((row) => {
          const source = record(row),
            data = source.data as ShiftData;
          return {
            sourceId: source.id,
            day: Math.round(
              (Date.parse(data.date) - Date.parse(from)) / 86400000,
            ),
            employeeId: data.employeeId,
            start: data.start,
            end: data.end,
            shiftType: data.shiftType ?? 'allround',
            activity: data.activity,
            notes: data.notes,
          };
        });
        const id = previous.rows[0]?.id ?? randomUUID();
        await client.query(
          'INSERT INTO operation_roster_templates(id,organization_id,dataset,location_id,source_week,entries,updated_by,slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,dataset,location_id,slot) DO UPDATE SET source_week=excluded.source_week,entries=excluded.entries,version=operation_roster_templates.version+1,updated_at=now(),updated_by=excluded.updated_by',
          [
            id,
            org.id,
            body.dataset,
            body.locationId,
            from,
            JSON.stringify(entries),
            principal.userId,
            slot,
          ],
        );
        await client.query(
          'INSERT INTO report_audit(id,organization_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
          [
            randomUUID(),
            org.id,
            principal.userId,
            'operations.roster-template-saved',
            JSON.stringify({
              templateId: id,
              locationId: body.locationId,
              dataset: body.dataset,
              version: body.version + 1,
              shiftCount: entries.length,
              slot,
            }),
          ],
        );
        return { shiftCount: entries.length, version: body.version + 1, slot };
      },
    );
  }
  async applyRosterTemplate(
    org: ReportOrganization,
    principal: Principal,
    body: {
      dataset: Dataset;
      locationId: string;
      weekStart: string;
      weeks: number;
      version: number;
      slot?: RosterWeek;
      alternate?: boolean;
      otherVersion?: number;
    },
  ): Promise<RosterCopyResult> {
    if (!body) throw new BadRequestException('Basisrooster ontbreekt.');
    const start = this.rosterWeek(body.weekStart);
    const firstSlot = choice(body.slot === undefined ? 'A' : body.slot, [
      'A',
      'B',
    ]);
    if (body.alternate !== undefined && typeof body.alternate !== 'boolean')
      throw new BadRequestException('Kies of de basisweken afwisselen.');
    locationScope(principal, org, body.locationId);
    if (!Number.isInteger(body.weeks) || body.weeks < 1 || body.weeks > 12)
      throw new BadRequestException('Kies 1 tot 12 weken vooruit.');
    return this.rosterTransaction(
      org,
      principal,
      body.dataset,
      async (client) => {
        const found = await client.query(
          'SELECT id,slot,version,entries FROM operation_roster_templates WHERE organization_id=$1 AND dataset=$2 AND location_id=$3',
          [org.id, body.dataset, body.locationId],
        );
        const otherSlot = firstSlot === 'A' ? 'B' : 'A';
        const requiredSlots = body.alternate
          ? [firstSlot, otherSlot]
          : [firstSlot];
        for (const slot of requiredSlots) {
          const template = found.rows.find((row) => row.slot === slot);
          if (!template)
            throw new NotFoundException(
              `Bewaar eerst basisweek ${slot} voor deze locatie.`,
            );
          const expected =
            slot === firstSlot ? body.version : body.otherVersion;
          if (template.version !== expected)
            throw new ConflictException(
              `Basisweek ${slot} is gewijzigd. Vernieuw het overzicht.`,
            );
        }
        const result = { created: 0, skipped: 0 };
        for (let week = 0; week < body.weeks; week++) {
          const slot = body.alternate && week % 2 === 1 ? otherSlot : firstSlot;
          const template = found.rows.find((row) => row.slot === slot)!;
          const entries = template.entries as RosterTemplateEntry[];
          const from = this.addDays(start, week * 7);
          const slots = entries.map((entry) => ({
            entry,
            date: this.addDays(from, entry.day),
            key: `template:${template.id}:${entry.sourceId}:${this.addDays(from, entry.day)}`,
          }));
          const existing = await client.query(
            "SELECT source_key,data FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND location_id=$3 AND kind='shift' AND data->>'date'>=$4 AND data->>'date'<=$5",
            [
              org.id,
              body.dataset,
              body.locationId,
              from,
              this.addDays(from, 6),
            ],
          );
          const keys = new Set(existing.rows.map((row) => row.source_key));
          if (slots.every((slot) => keys.has(slot.key))) {
            result.skipped += slots.length;
            continue;
          }
          if (existing.rows.some((row) => row.data.status !== 'cancelled'))
            throw new ConflictException(
              `De week van ${from} bevat al diensten. Pas die week handmatig aan of kies een lege week. Er is niets toegevoegd.`,
            );
          for (const slot of slots) {
            const added = await this.insertRosterShift(
              client,
              org,
              principal,
              body.dataset,
              body.locationId,
              {
                employeeId: slot.entry.employeeId,
                date: slot.date,
                start: slot.entry.start,
                end: slot.entry.end,
                activity: slot.entry.activity,
                shiftType: slot.entry.shiftType,
                notes: slot.entry.notes,
                status: 'draft',
              },
              slot.key,
            );
            result[added ? 'created' : 'skipped']++;
          }
        }
        return result;
      },
    );
  }
  async list(
    principal: Principal,
    dataset: Dataset,
  ): Promise<OperationRecord[]> {
    operationScope(principal, principal.organizationId);
    choice(dataset, ['real', 'demo']);
    const rows = await this.pool.query(
      "SELECT * FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND ($3::text[] IS NULL OR location_id=ANY($3) OR (kind='employee' AND (data->'locationIds') ?| $3)) AND (kind<>'contact' OR $4) AND (kind<>'task' OR data->'source'->>'type' IS DISTINCT FROM 'member' OR $4) ORDER BY created_at DESC,id",
      [
        principal.organizationId,
        dataset,
        principal.locations,
        principal.permissions.includes('members.read'),
      ],
    );
    return rows.rows.map((row) => {
      const result = record(row);
      if (result.kind === 'employee' && principal.locations !== null) {
        const data = result.data as EmployeeData;
        result.data = {
          ...data,
          locationIds: data.locationIds.filter((id) =>
            principal.locations!.includes(id),
          ),
        };
      }
      return result;
    });
  }
  async save(
    org: ReportOrganization,
    principal: Principal,
    body: {
      dataset: Dataset;
      kind: OperationKind;
      locationId: string;
      data: unknown;
      id?: string;
      version?: number;
    },
    trusted?: { source: TaskData['source']; key: string },
  ) {
    operationScope(principal, org.id, true);
    choice(body.dataset, ['real', 'demo']);
    choice(body.kind, kinds);
    locationScope(principal, org, body.locationId);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
      throw new BadRequestException('Gegevens ontbreken.');
    if (body.kind === 'employee' && principal.locations !== null)
      throw new ForbiddenException(
        'Personeelsbeheer vereist organisatierechten.',
      );
    if (
      body.kind === 'contact' &&
      !principal.permissions.includes('members.read')
    )
      throw new ForbiddenException('Geen toegang tot ledenopvolging.');
    if (body.id && (!Number.isInteger(body.version) || body.version! < 1))
      throw new BadRequestException('Versienummer ontbreekt.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serializes cross-location employee/shift checks as well as optimistic
      // writes. No notification or mail is sent from an operations transaction.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        org.id + ':' + body.dataset + ':operations',
      ]);
      let existing: OperationRecord | undefined;
      if (body.id) {
        const found = await client.query(
          'SELECT * FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND id=$3 FOR UPDATE',
          [org.id, body.dataset, body.id],
        );
        if (!found.rows[0])
          throw new NotFoundException('Record niet gevonden.');
        existing = record(found.rows[0]);
        locationScope(principal, org, existing.locationId);
        if (existing.kind !== body.kind)
          throw new BadRequestException('Type kan niet worden gewijzigd.');
        if (existing.version !== body.version)
          throw new ConflictException(
            'Dit record is gewijzigd. Vernieuw het overzicht en probeer opnieuw.',
          );
        if (body.kind === 'contact')
          throw new BadRequestException(
            'Contacthistorie is blijvend. Voeg een nieuwe notitie/correctie toe.',
          );
        if (
          existing.kind === 'task' &&
          (existing.data as TaskData).source?.type === 'member' &&
          !principal.permissions.includes('members.read')
        )
          throw new ForbiddenException('Geen toegang tot ledenopvolging.');
        if (
          existing.kind === 'task' &&
          (existing.data as TaskData).source &&
          existing.locationId !== body.locationId
        )
          throw new BadRequestException(
            'Een brontaak blijft gekoppeld aan de oorspronkelijke locatie.',
          );
      }
      if (!existing && trusted?.key) {
        const prior = await client.query(
          'SELECT * FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind=$3 AND source_key=$4',
          [org.id, body.dataset, body.kind, trusted.key],
        );
        if (prior.rows[0]) {
          await client.query('COMMIT');
          return { record: record(prior.rows[0]), duplicate: true };
        }
      }
      const data = await this.validate(
        client,
        org,
        principal,
        body,
        existing,
        trusted,
      );
      let key = trusted?.key ?? null;
      if (body.kind === 'employee')
        key = 'number:' + (data as EmployeeData).number.toLowerCase();
      let result;
      if (existing)
        result = await client.query(
          'UPDATE operation_records SET location_id=$1,data=$2,version=version+1,updated_at=now(),updated_by=$3,source_key=COALESCE($4,source_key) WHERE organization_id=$5 AND dataset=$6 AND id=$7 AND version=$8 RETURNING *',
          [
            body.locationId,
            JSON.stringify(data),
            principal.userId,
            key,
            org.id,
            body.dataset,
            existing.id,
            existing.version,
          ],
        );
      else
        result = await client.query(
          'INSERT INTO operation_records(id,organization_id,dataset,location_id,kind,data,source_key,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,dataset,kind,source_key) DO NOTHING RETURNING *',
          [
            randomUUID(),
            org.id,
            body.dataset,
            body.locationId,
            body.kind,
            JSON.stringify(data),
            key,
            principal.userId,
          ],
        );
      if (!result.rows[0]) {
        if (body.kind === 'employee')
          throw new ConflictException('Dit personeelsnummer bestaat al.');
        const found = await client.query(
          'SELECT * FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind=$3 AND source_key=$4',
          [org.id, body.dataset, body.kind, key],
        );
        await client.query('COMMIT');
        return { record: record(found.rows[0]), duplicate: true };
      }
      const saved = record(result.rows[0]);
      await client.query(
        'INSERT INTO report_audit(id,organization_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          org.id,
          principal.userId,
          'operations.' + (existing ? 'updated' : 'created'),
          JSON.stringify({
            recordId: saved.id,
            kind: body.kind,
            locationId: body.locationId,
            dataset: body.dataset,
            version: saved.version,
          }),
        ],
      );
      await client.query('COMMIT');
      return { record: saved, duplicate: false };
    } catch (e) {
      await client.query('ROLLBACK');
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException('Dit personeelsnummer bestaat al.');
      throw e;
    } finally {
      client.release();
    }
  }
  private async validate(
    client: PoolClient,
    org: ReportOrganization,
    principal: Principal,
    body: {
      dataset: Dataset;
      kind: OperationKind;
      locationId: string;
      data: unknown;
      id?: string;
    },
    existing?: OperationRecord,
    trusted?: { source: TaskData['source']; key: string },
  ): Promise<OperationData> {
    const v = body.data as Record<string, unknown>;
    const employee = async (id: string | null) => {
      if (!id) return null;
      const result = await client.query(
        "SELECT data FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind='employee' AND id=$3",
        [org.id, body.dataset, id],
      );
      const data = result.rows[0]?.data as EmployeeData | undefined;
      if (!data || !data.active || !data.locationIds.includes(body.locationId))
        throw new BadRequestException(
          'Kies een actieve medewerker die bij deze locatie mag werken.',
        );
      return data;
    };
    switch (body.kind) {
      case 'task': {
        const status = choice(v.status, [
            'open',
            'in-progress',
            'done',
            'cancelled',
          ] as const),
          assigneeId = identifier(v.assigneeId);
        const prior = existing?.data as TaskData | undefined;
        if (assigneeId !== prior?.assigneeId) await employee(assigneeId);
        const source = prior?.source ?? trusted?.source;
        let checks: TaskData['checks'];
        if (source?.type === 'checklist') {
          const supplied = v.checks;
          const original = prior?.checks ?? (v.checks as TaskData['checks']);
          if (
            !Array.isArray(supplied) ||
            !original?.length ||
            original.length !== supplied.length ||
            supplied.some(
              (c) => !c || typeof c !== 'object' || typeof c.done !== 'boolean',
            )
          )
            throw new BadRequestException(
              'De checklistonderdelen moeten behouden blijven.',
            );
          checks = original.map((c, i) => ({
            label: c.label,
            done: (supplied[i] as { done?: unknown }).done === true,
          }));
          if (status === 'done' && checks.some((c) => !c.done))
            throw new BadRequestException('Vink eerst alle controlepunten af.');
        }
        return {
          title: text(v.title, 200, true),
          description: text(v.description, 3000),
          assigneeId,
          dueDate: date(v.dueDate),
          priority: choice(v.priority, ['normal', 'high'] as const),
          status,
          ...(source ? { source } : {}),
          ...(checks ? { checks } : {}),
          completedAt:
            status === 'done'
              ? (prior?.completedAt ?? new Date().toISOString())
              : null,
        } satisfies TaskData;
      }
      case 'employee': {
        if (
          !Array.isArray(v.locationIds) ||
          !v.locationIds.length ||
          v.locationIds.length > 50 ||
          !Array.isArray(v.skills) ||
          v.skills.length > activities.length ||
          typeof v.active !== 'boolean'
        )
          throw new BadRequestException(
            'Locaties, vaardigheden en actieve status zijn verplicht.',
          );
        const locationIds = [
          ...new Set(v.locationIds.map((id) => text(id, 120, true))),
        ];
        locationIds.forEach((id) => locationScope(principal, org, id));
        if (!locationIds.includes(body.locationId))
          throw new BadRequestException(
            'De thuislocatie moet in de inzetbare locaties staan.',
          );
        if (
          v.contractMinutes != null &&
          (!Number.isInteger(v.contractMinutes) ||
            Number(v.contractMinutes) < 0 ||
            Number(v.contractMinutes) > 10080)
        )
          throw new BadRequestException(
            'Gebruik geldige contractminuten per week of onbekend.',
          );
        if (existing) {
          const shifts = await client.query(
            "SELECT location_id,data FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind='shift' AND data->>'employeeId'=$3 AND data->>'date'>=$4 AND data->>'status'<>'cancelled'",
            [org.id, body.dataset, existing.id, todayAmsterdam()],
          );
          if (
            shifts.rows.some(
              (r) =>
                !v.active ||
                !locationIds.includes(r.location_id) ||
                (r.data.status === 'published' &&
                  !(v.skills as unknown[]).includes(r.data.activity)),
            )
          )
            throw new ConflictException(
              'Pas eerst de toekomstige diensten van deze medewerker aan.',
            );
        }
        return {
          name: text(v.name, 120, true),
          number: text(v.number, 60, true),
          locationIds,
          skills: [...new Set(v.skills.map((s) => choice(s, activities)))],
          contractMinutes:
            v.contractMinutes == null ? null : Number(v.contractMinutes),
          active: v.active,
        } satisfies EmployeeData;
      }
      case 'shift': {
        const shift: ShiftData = {
          shiftType: choice(
            v.shiftType ??
              (existing?.data as ShiftData | undefined)?.shiftType ??
              'allround',
            ['allround', 'host', 'clubmanager', 'internship'] as const,
          ),
          employeeId: identifier(v.employeeId),
          date: date(v.date, true)!,
          start: text(v.start, 5, true),
          end: text(v.end, 5, true),
          activity: choice(v.activity, activities),
          status: choice(v.status, [
            'draft',
            'published',
            'cancelled',
          ] as const),
          notes: text(v.notes, 1000),
        };
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end) ||
          shift.end <= shift.start
        )
          throw new BadRequestException(
            'Gebruik een eindtijd na de begintijd, op dezelfde dag. Splits nachtdiensten per dag.',
          );
        const person =
          shift.status === 'cancelled' &&
          existing &&
          shift.employeeId === (existing.data as ShiftData).employeeId
            ? null
            : await employee(shift.employeeId);
        if (shift.status !== 'cancelled' && shift.employeeId) {
          const overlaps = await client.query(
            "SELECT id FROM operation_records WHERE organization_id=$1 AND dataset=$2 AND kind='shift' AND data->>'employeeId'=$3 AND data->>'date'=$4 AND data->>'status'<>'cancelled' AND data->>'start'<$5 AND data->>'end'>$6 AND id<>$7",
            [
              org.id,
              body.dataset,
              shift.employeeId,
              shift.date,
              shift.end,
              shift.start,
              body.id ?? '',
            ],
          );
          if (overlaps.rows.length)
            throw new ConflictException(
              'Deze medewerker heeft al een overlappende dienst, mogelijk op een andere locatie.',
            );
          if (
            shift.status === 'published' &&
            !person?.skills.includes(shift.activity)
          )
            throw new BadRequestException(
              'De benodigde vaardigheid is niet vastgelegd bij deze medewerker.',
            );
        }
        return shift;
      }
      case 'checklist': {
        if (
          !Array.isArray(v.items) ||
          !v.items.length ||
          v.items.length > 40 ||
          typeof v.active !== 'boolean'
        )
          throw new BadRequestException(
            'Gebruik 1–40 controlepunten en een actieve status.',
          );
        const assigneeId = identifier(v.assigneeId);
        await employee(assigneeId);
        return {
          title: text(v.title, 200, true),
          items: v.items.map((i) => text(i, 300, true)),
          cadence: choice(v.cadence, ['daily', 'weekly', 'monthly'] as const),
          startDate: date(v.startDate, true)!,
          assigneeId,
          active: v.active,
        } satisfies ChecklistData;
      }
      case 'asset':
        return {
          name: text(v.name, 200, true),
          serial: text(v.serial, 120),
          status: choice(v.status, [
            'operational',
            'maintenance',
            'out-of-service',
          ] as const),
          nextMaintenance: date(v.nextMaintenance),
          notes: text(v.notes, 3000),
        } satisfies AssetData;
      case 'contact':
        return {
          memberKey: text(v.memberKey, 200, true),
          sourceId: text(v.sourceId, 200, true),
          note: text(v.note, 3000, true),
          nextContact: date(v.nextContact),
        } satisfies ContactData;
    }
  }
  async generateChecklists(
    org: ReportOrganization,
    principal: Principal,
    dataset: Dataset,
    asOf = todayAmsterdam(),
  ) {
    const day = date(asOf, true)!;
    const records = await this.list(principal, dataset);
    const templates = records.filter((r) => r.kind === 'checklist');
    const generated = [];
    for (const template of templates) {
      const c = template.data as ChecklistData;
      if (!c.active || c.startDate > day) continue;
      let from = day,
        due = day;
      if (c.cadence === 'weekly') {
        const time = Date.parse(day),
          weekday = new Date(time).getUTCDay() || 7;
        from = new Date(time - (weekday - 1) * 86400000)
          .toISOString()
          .slice(0, 10);
        due = new Date(Date.parse(from) + 6 * 86400000)
          .toISOString()
          .slice(0, 10);
      }
      if (c.cadence === 'monthly') {
        from = day.slice(0, 7) + '-01';
        due = new Date(
          Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10);
      }
      const key = `checklist:${template.id}:${from}`;
      generated.push(
        await this.save(
          org,
          principal,
          {
            dataset,
            kind: 'task',
            locationId: template.locationId,
            data: {
              title: c.title,
              description: `${c.cadence === 'daily' ? 'Dagelijkse' : c.cadence === 'weekly' ? 'Wekelijkse' : 'Maandelijkse'} controle · ${from}`,
              dueDate: due,
              assigneeId: records.some(
                (r) =>
                  r.kind === 'employee' &&
                  r.id === c.assigneeId &&
                  (r.data as EmployeeData).active &&
                  (r.data as EmployeeData).locationIds.includes(
                    template.locationId,
                  ),
              )
                ? c.assigneeId
                : null,
              status: 'open',
              priority: 'normal',
              checks: c.items.map((label) => ({ label, done: false })),
            },
          },
          { key, source: { type: 'checklist', key } },
        ),
      );
    }
    return generated;
  }
}
