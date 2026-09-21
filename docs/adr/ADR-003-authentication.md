# ADR-003: Authentication

- Status: Accepted
- Datum: 2026-09-21

## Besluit

Better Auth verzorgt identiteit en sessiebeheer. Browsers gebruiken server-side sessies via `Secure`, `HttpOnly` cookies.

## Reden

Wachtwoordhashing, sessielifecycle en herstelstromen zijn beveiligingsgevoelige standaardproblemen die COP niet zelf opnieuw moet implementeren. Better Auth is open-source en lokaal te hosten.

## Gevolgen

- tokens worden niet standaard in `localStorage` opgeslagen;
- COP behoudt eigen organizations, memberships, rollen en scopes;
- de authenticatielibrary bepaalt niet het businessdatamodel;
- MFA en externe identity providers kunnen later worden toegevoegd.
