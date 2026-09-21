# Architectuuroverzicht

## Doel

COP wordt een verkoopbaar multi-tenant platform. Sport Society is tenant nummer één en levert bewezen workflows en businessregels, maar bepaalt niet de technische grenzen van het product.

## Systeemvorm

COP start als een modulaire monolith:

```text
React SPA
   |
REST/OpenAPI
   |
NestJS + Fastify
   |
PostgreSQL
```

De API wordt intern opgesplitst in domeinmodules met expliciete grenzen. Er is één relationele database en één consistente transactielaag. Microservices worden alleen overwogen wanneer een concreet schaal-, eigenaarschap- of deploymentprobleem dat rechtvaardigt.

## Belangrijkste domeinen

- organizations en locations
- users, memberships en employees
- authentication en authorization
- availability, scheduling en coverage
- onboarding
- operations, assets en inventory
- HealthPlanner-imports en rapportages
- sales en knowledge
- notifications, imports en audit

## Identiteit en personeel

`User` en `Employee` zijn verschillende concepten:

- een `User` vertegenwoordigt een identiteit die kan inloggen;
- een `Employee` vertegenwoordigt een personeelsrecord binnen een organisatie;
- een medewerker kan bestaan zonder account;
- een gebruiker kan toegang hebben zonder medewerker te zijn.

## Tenantisolatie

Tenantdata krijgt expliciet een `organization_id`. Toegang wordt beschermd door vier lagen:

1. authenticatie van de gebruiker;
2. geldig organisatielidmaatschap;
3. server-side permissions en scope;
4. tenant-scoped databasequeries, constraints en waar passend PostgreSQL RLS.

Frontendcontroles verbeteren alleen de gebruikerservaring en vervangen nooit server-side autorisatie.

## Businessregels

Onbekende regels krijgen geen stilzwijgende standaard. Als een bezettingsnorm niet is vastgelegd, is de norm `unknown` en niet automatisch één medewerker.

SSO wordt uitsluitend read-only gebruikt als bron voor bewezen gedrag. Regels worden opnieuw gemodelleerd, beschreven en getest; bestaande SSO-code wordt niet de technische basis van COP.

## Bouwvolgorde

1. product foundation;
2. organizations, locations en employees;
3. availability, scheduling en coverage;
4. managementdashboard;
5. onboarding;
6. operations en assets;
7. inventory en werkkleding;
8. HealthPlanner;
9. sales, KPI en knowledge;
10. notifications, import/export en pilot-hardening.
