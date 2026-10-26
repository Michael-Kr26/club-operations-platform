import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  Dataset,
  InventoryItem,
  InventoryOverview,
  Principal,
} from '@cop/contracts';
import { operationScope } from './store.js';

export function initialSportSocietyInventory(): InventoryItem[] {
  const sizes = () => ({ S: null, M: null, L: null, XL: null, XXL: null });
  return [
    {
      id: 'initial-shirts',
      name: 'Werkshirts',
      category: 'shirts',
      quantities: { ...sizes(), M: 2, L: 2, XL: 3 },
    },
    {
      id: 'initial-vests',
      name: 'Vesten',
      category: 'vests',
      quantities: sizes(),
    },
    {
      id: 'initial-sweaters',
      name: 'Truien',
      category: 'sweaters',
      quantities: sizes(),
    },
    {
      id: 'initial-bags',
      name: 'Tassen',
      category: 'bags',
      quantities: { total: null },
    },
  ];
}
function scope(
  principal: Principal,
  org: string,
  dataset: Dataset,
  write = false,
) {
  operationScope(principal, org, write);
  if (principal.locations !== null)
    throw new ForbiddenException(
      'Centrale voorraad vereist toegang tot de hele organisatie.',
    );
  if (dataset !== 'real' && dataset !== 'demo')
    throw new BadRequestException('Ongeldige dataset.');
}
function validate(input: unknown): InventoryItem[] {
  if (!Array.isArray(input) || input.length > 500)
    throw new BadRequestException('Gebruik maximaal 500 artikelen.');
  const ids = new Set<string>();
  return input.map((item: unknown): InventoryItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new BadRequestException('Artikel ontbreekt.');
    const value = item as Record<string, unknown>;
    if (
      typeof value.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(value.id) ||
      ids.has(value.id)
    )
      throw new BadRequestException('Artikelcode ontbreekt of is dubbel.');
    ids.add(value.id);
    if (
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 120
    )
      throw new BadRequestException(
        'Gebruik een artikelnaam van maximaal 120 tekens.',
      );
    if (
      !['shirts', 'vests', 'sweaters', 'bags', 'merch'].includes(
        String(value.category),
      )
    )
      throw new BadRequestException('Categorie ontbreekt.');
    if (
      value.color !== undefined &&
      value.color !== null &&
      (typeof value.color !== 'string' || value.color.length > 60)
    )
      throw new BadRequestException(
        'Gebruik een kleur van maximaal 60 tekens.',
      );
    const quantities = value.quantities;
    if (
      !quantities ||
      typeof quantities !== 'object' ||
      Array.isArray(quantities)
    )
      throw new BadRequestException('Aantallen ontbreken.');
    const keys = Object.keys(quantities);
    const expected = keys.includes('total')
      ? ['total']
      : ['S', 'M', 'L', 'XL', 'XXL'];
    if (
      keys.length !== expected.length ||
      keys.some((key) => !expected.includes(key))
    )
      throw new BadRequestException('Gebruik S t/m XXL of één totaal.');
    const cleaned: InventoryItem['quantities'] = {};
    for (const key of expected) {
      const quantity = (quantities as Record<string, unknown>)[key];
      if (
        quantity !== null &&
        (typeof quantity !== 'number' ||
          !Number.isInteger(quantity) ||
          quantity < 0 ||
          quantity > 1000000)
      )
        throw new BadRequestException(
          'Gebruik hele aantallen van 0 tot 1.000.000, of leeg voor onbekend.',
        );
      cleaned[key as keyof typeof cleaned] = quantity as number | null;
    }
    return {
      id: value.id,
      name: value.name.trim(),
      category: value.category as InventoryItem['category'],
      ...(value.color !== undefined
        ? {
            color:
              typeof value.color === 'string'
                ? value.color.trim() || null
                : null,
          }
        : {}),
      quantities: cleaned,
    };
  });
}
export class InventoryStore {
  constructor(private pool: Pool) {}
  async read(
    org: string,
    principal: Principal,
    dataset: Dataset,
  ): Promise<InventoryOverview> {
    scope(principal, org, dataset);
    const { rows } = await this.pool.query(
      'SELECT items,version,updated_at FROM inventory_stock WHERE organization_id=$1 AND dataset=$2',
      [org, dataset],
    );
    return {
      items: rows[0]?.items ?? [],
      version: rows[0]?.version ?? 0,
      updatedAt: rows[0]?.updated_at?.toISOString() ?? null,
      canWrite: principal.permissions.includes('operations.manage'),
    };
  }
  async save(
    org: string,
    principal: Principal,
    body: { dataset: Dataset; version: number; items: unknown },
  ): Promise<InventoryOverview> {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('Gegevens ontbreken.');
    scope(principal, org, body.dataset, true);
    if (!Number.isInteger(body.version) || body.version < 0)
      throw new BadRequestException('Versienummer ontbreekt.');
    const items = validate(body.items),
      client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const previous = await client.query(
        'SELECT items FROM inventory_stock WHERE organization_id=$1 AND dataset=$2',
        [org, body.dataset],
      );
      if (
        previous.rows[0]?.items.some(
          (old: InventoryItem) => !items.some((item) => item.id === old.id),
        )
      )
        throw new BadRequestException(
          'Bestaande artikelen mogen niet worden verwijderd.',
        );
      const result =
        body.version === 0
          ? await client.query(
              'INSERT INTO inventory_stock(organization_id,dataset,items,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING version',
              [org, body.dataset, JSON.stringify(items), principal.userId],
            )
          : await client.query(
              'UPDATE inventory_stock SET items=$3,version=version+1,updated_at=now(),updated_by=$4 WHERE organization_id=$1 AND dataset=$2 AND version=$5 RETURNING version',
              [
                org,
                body.dataset,
                JSON.stringify(items),
                principal.userId,
                body.version,
              ],
            );
      if (!result.rows.length)
        throw new ConflictException(
          'De voorraad is ondertussen gewijzigd. Vernieuw het overzicht voordat je opnieuw opslaat.',
        );
      await client.query(
        'INSERT INTO report_audit(id,organization_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          org,
          principal.userId,
          'inventory.updated',
          JSON.stringify({
            dataset: body.dataset,
            version: result.rows[0].version,
            items,
          }),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.read(org, principal, body.dataset);
  }
}
