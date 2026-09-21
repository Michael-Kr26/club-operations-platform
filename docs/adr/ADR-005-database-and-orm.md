# ADR-005: PostgreSQL en Drizzle

- Status: Accepted
- Datum: 2026-09-21

## Besluit

COP gebruikt PostgreSQL als relationele database en Drizzle ORM met expliciete SQL-migrations.

## Reden

COP bevat sterk relationele data, historie, constraints, transacties en rapportages. Drizzle houdt SQL zichtbaar en laat PostgreSQL-mogelijkheden expliciet benutten.

## Gevolgen

- schemawijzigingen worden gegenereerd, inhoudelijk gereviewd en gecommit;
- productie gebruikt nooit `db push` als vervanging van migrations;
- JSONB wordt alleen gebruikt voor werkelijk flexibele configuratie of snapshots;
- provider-specifieke afhankelijkheden blijven beperkt en gedocumenteerd.
