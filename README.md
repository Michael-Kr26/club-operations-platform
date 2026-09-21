# Club Operations Platform

COP is een multi-tenant operationeel platform voor fitnessclubs. Sport Society wordt de eerste tenant, maar bedrijfsspecifieke regels worden als configuratie en data gemodelleerd in plaats van hardcoded in de applicatie.

## Status

De repository bevat op dit moment uitsluitend de technische en architecturale fundering. Er is nog geen applicatiecode of productieomgeving.

## Beoogde stack

- pnpm workspace monorepo
- React, TypeScript en Vite voor `apps/web`
- NestJS met Fastify voor `apps/api`
- PostgreSQL en Drizzle ORM in `packages/db`
- REST/OpenAPI voor de API
- Better Auth voor identiteit en sessies
- COP-eigen RBAC met organisatie- en locatiescope
- Vitest, PostgreSQL-integratietests en Playwright

Alle verplichte ontwikkelonderdelen moeten lokaal en zonder betaalde SaaS-dienst kunnen draaien. GitHub Actions blijft optioneel; dezelfde controles moeten lokaal uitvoerbaar zijn.

## Structuur

```text
apps/                   Uitvoerbare applicaties
  web/                  React-frontend
  api/                  NestJS-API
packages/               Gedeelde packages
  db/                   Database-schema en migrations
  contracts/            Gedeelde API-contracten en types
  config/               Gedeelde toolingconfiguratie
docs/
  architecture/         Architectuuroverzicht
  adr/                  Architecture Decision Records
  business-rules/       Gevalideerde businessregels
  sso-reference/        Read-only inventarisatie van SSO
infra/                  Lokale en toekomstige deploymentconfiguratie
scripts/                Projectautomatisering
```

## Volgende stap

Na goedkeuring van deze foundation worden `apps/web`, `apps/api` en `packages/db` afzonderlijk gebootstrapt. Functionele modules volgen pas nadat authenticatie, tenantcontext en autorisatie betrouwbaar zijn ingericht.
