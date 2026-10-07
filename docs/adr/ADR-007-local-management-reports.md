# ADR-007: Lokale managementrapportages, gecontroleerde imports en mailopvang

- Status: Implemented for local development; bedrijfsregels proposal-1 ter review
- Datum: 2026-10-07

Gebruik bestaande PostgreSQL/Drizzle, Nest/Fastify, React en Better Auth. Nog geen bestaande backend-memberships: deze module legt expliciete report_access assignments vast met permissions en organisatie-/locatiescope. Frontend-testrollen verlenen geen rechten. Read-scopes redigeren andere clubs; imports/settings/runhistorie vereisen organisatiescope. DB-queries dragen organisatie-ID uit geverifieerde assignment; parameterized SQL voorkomt client-tenanttrust. RLS is nog niet ingebouwd.

ADR-003 blijft leidend voor auth. Een eenmalige installatiecode buiten de repo bootstrapt de eerste lokale beheerder. Publieke signup is niet beschikbaar. HttpOnly/SameSite cookies; **Secure is uit uitsluitend voor HTTP-localhost**. Dit is geen internetdeploybaar authprofiel. Mailcredentials worden nergens gevraagd of opgeslagen.

Gecontroleerde canonical imports vóór onbevestigde vendor-API’s. Originelen en afgewezen imports blijven behouden. Pure berekeningen produceren null voor ontbrekende gegevens. Definitions zijn versioned en organisatiegoedkeuring is vereist vóór schedulergebruik. Die goedkeuring is een lokale reviewbeslissing, geen bewijs van vendor-volledigheid.

Unieke duurzame runclaim voorkomt dubbele afleveringpogingen over processen/herstarts. SMTP met ontbrekende bevestiging blijft uncertain en krijgt geen automatische retry. Lokale Mailpit, vast loopbackadres en vaste `.invalid` ontvanger; geen real-delivery adapter in v1. Demo/real gescheiden via dataset in imports/runs en queryfilters.

Bewuste grenzen: geen leverancierspecifieke mapping zonder gecontroleerd voorbeeld, geen automatische mailboxontvangst, geen echte e-mail, geen volledige COP-accountbeheerinterface, één pauze-interval per abonnementsperiode. De roadmap noemt benodigde uitbreiding. Laptop uit betekent geen run; gemiste laatste dag/maand wordt zichtbaar, oudere gaten niet automatisch ingehaald.
