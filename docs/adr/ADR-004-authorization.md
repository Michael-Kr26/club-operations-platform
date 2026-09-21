# ADR-004: COP-owned RBAC

- Status: Accepted
- Datum: 2026-09-21

## Besluit

COP gebruikt een eigen permission-based RBAC-model met organisatie- en locatiescope.

## Reden

Vaste rolchecks zoals `role === manager` schalen onvoldoende wanneer een gebruiker verschillende verantwoordelijkheden per locatie heeft.

## Gevolgen

- rollen groeperen permissions, maar businesscode controleert concrete acties;
- access assignments leggen organisatie- of locatiescope vast;
- iedere gevoelige actie wordt server-side gecontroleerd;
- autorisatiewijzigingen en kritieke mutaties worden auditbaar.
