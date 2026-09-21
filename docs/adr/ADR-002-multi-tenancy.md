# ADR-002: Shared-schema multi-tenancy

- Status: Accepted
- Datum: 2026-09-21

## Besluit

COP gebruikt één gedeeld PostgreSQL-schema. Iedere tenantgebonden bedrijfstabel bevat expliciet `organization_id`.

## Reden

Dit model is beheersbaar voor de eerste productfase, ondersteunt centrale migrations en voorkomt een database per klant. Expliciete tenantkolommen maken isolatie controleerbaar en testbaar.

## Gevolgen

- unieke sleutels en relaties worden waar nodig tenantgebonden;
- repositories ontvangen tenantcontext en mogen die niet uit clientinput vertrouwen;
- integratietests bewijzen dat data van organisatie A niet via organisatie B bereikbaar is;
- PostgreSQL RLS wordt als extra beveiligingslaag ingevoerd waar dit praktisch betrouwbaar is.
