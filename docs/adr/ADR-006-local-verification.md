# ADR-006: Lokale verificatie zonder verplichte CI-dienst

- Status: Accepted
- Datum: 2026-09-21

## Besluit

Alle kwaliteitscontroles worden lokaal uitvoerbaar. GitHub Actions is voorbereidbaar, maar geen vereiste voor development of de eerste pilot.

## Reden

De ontwikkelfase moet zonder extra kosten kunnen draaien en mag niet blokkeren wanneer er geen GitHub Actions-minuten beschikbaar zijn.

## Gevolgen

- lint, format, typecheck, tests en builds krijgen lokale pnpm-commando's;
- één lokaal `verify`-commando wordt toegevoegd zodra de apps zijn gebootstrapt;
- toekomstige CI roept exact dezelfde projectcommando's aan;
- een self-hosted runner is nu niet nodig.
