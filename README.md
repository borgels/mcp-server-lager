# mcp-server-lager

MCP server for **Borgels Lager**, værktøjslageret i bcc (OMM's udlejning til ONE Group). Serveren er en tynd, revideret facade over bcc's lager-API (`/api/lager/*`, beskrevet i `/api/lager/openapi.json`): den ejer ingen data og ingen rettigheder. Hvert kald sker på vegne af én bruger, og bcc afgør, hvad hun må.

## Identitet

Bag gatewayen (`lager.mcp.omm.dk`) er brugeren verificeret af Entra og medlem af `SG-MCP-lager-omm`. Gatewayen sætter `X-MCP-User` (UPN), serveren giver den videre til bcc sammen med det interne token `LAGER_API_TOKEN`, og bcc slår personen op blandt dem, der har logget ind i lager-appen. Roller (`vaerktoejsbruger`, `lageransvarlig`) og lagre er personens egne, så kostpriser og ansvarlig-værktøjer følger rollen, ikke serveren. Ukendt bruger afvises; ingen person oprettes på en headers ord.

## Tools

**Læs (altid på):** `lager_me`, `lager_projekter`, `lager_mine`, `lager_opslag`, `lager_model`, `lager_forbrugsvarer`, `lager_bestillinger`, `lager_bookinger`, og for den lageransvarlige `lager_ansvarlig_overblik`, `_modeller`, `_enheder`, `_forbrugsvarer`, `_bestillinger`, `_perioder`, `_afregninger`, `_koe`. `lager_search_capabilities` er kortet.

**Skriv (opt-in via `LAGER_ENABLE_WRITES=true`):** `lager_tjek_ud`, `lager_aflever`, `lager_flyt_projekt`, `lager_forbrug`, `lager_bestil`, `lager_bestilling_hent`, `lager_bestilling_fortryd`, `lager_ansvarlig_modtag_levering`, `lager_ansvarlig_send_bestillingsliste`. Hver skrivning får sin egen `Idempotency-Key`.

**Bevidst fraværende:** afregningens godkend, bogfør og afvis (den lageransvarliges klik i appen), salg af værktøj, kassation, prisrettelser, import. Overtagelse kræver et foto og hører til telefonen.

## Konfiguration

Se `.env.example`. Påkrævet: `LAGER_BASE_URL`, `LAGER_API_TOKEN`, og en bruger (`LAGER_TRUST_FORWARDED_USER=true` bag gatewayen, ellers `LAGER_DEFAULT_USER`).

## Kør

```bash
npm install
npm run dev          # stdio
npm run dev:http     # streamable HTTP på :3000/mcp (stateless)
npm test
```

Docker-image: `ghcr.io/borgels/mcp-server-lager` (publiceres ved push til `main`). Drift: `bos-server-config/one-1/mcp`.
