# ADR-001: Modulaire monolith

- Status: Accepted
- Datum: 2026-09-21

## Besluit

COP start als één modulaire backend met duidelijke domeingrenzen, één API en één PostgreSQL-database.

## Reden

De domeinen delen transacties en relationele gegevens. Microservices zouden in V1 extra deployment-, communicatie- en debuggingcomplexiteit veroorzaken zonder bewezen voordeel.

## Gevolgen

- domeinmodules mogen niet willekeurig in elkaars interne implementatie grijpen;
- transacties over gerelateerde domeinen blijven betrouwbaar uitvoerbaar;
- modules kunnen later worden afgesplitst als meetbare noodzaak ontstaat.
