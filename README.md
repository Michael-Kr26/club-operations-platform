# Club Operations Platform

COP is een multi-tenant operationeel platform voor fitnessclubs. Sport Society wordt de eerste tenant, maar bedrijfsspecifieke regels worden als configuratie en data gemodelleerd in plaats van hardcoded in de applicatie.

## Status

De technische bootstrap bevat een werkende webapp, API-healthcheck, gedeelde contractpackage en database-infrastructuur. Er zijn bewust nog geen functionele COP-modules of productiedata.

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

### Lokale start

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:up
pnpm dev
```

Daarna zijn beschikbaar:

- web: `http://localhost:5173`
- API-healthcheck: `http://localhost:3000/api/v1/health`
- PostgreSQL: `localhost:5432`

Alle lokale kwaliteitscontroles draaien met:

```powershell
pnpm verify
```

Functionele modules volgen pas nadat authenticatie, tenantcontext en autorisatie betrouwbaar zijn ingericht.
