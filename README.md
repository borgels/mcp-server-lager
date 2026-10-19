# mcp-server-lager

MCP server for et værktøjslager. Serveren er en tynd, revideret facade over lager-appens API (`/api/lager/*`, beskrevet i `/api/lager/openapi.json`): den ejer ingen data og ingen rettigheder. Hvert kald sker på vegne af én bruger, og lager-appen afgør, hvad hun må.

## Identitet

Bag en autentificerende MCP-gateway er brugeren verificeret af Entra og medlem af en sikkerhedsgruppe. Gatewayen sætter `X-MCP-User` (UPN), serveren giver den videre til lager-appen sammen med det interne token `LAGER_API_TOKEN`, og appen slår personen op blandt dem, der har logget ind i lager-appen. Roller (`vaerktoejsbruger`, `lageransvarlig`) og lagre er personens egne, så kostpriser og ansvarlig-værktøjer følger rollen, ikke serveren. Ukendt bruger afvises; ingen person oprettes på en headers ord.

## Tools

Navn, titel og beskrivelse er håndplukket i `src/tools/katalog.ts`, så en model kan finde og forstå værktøjerne. Parametre, typer, påkrævede felter og moduler kommer fra lager-API'ets OpenAPI (se nedenfor). `lager_search_capabilities` er kortet.

**Læs (altid på):** `lager_me`, `lager_projekter`, `lager_mine`, `lager_opslag`, `lager_plads`, `lager_model`, `lager_saet`, `lager_forbrugsvarer`, `lager_bestillinger`, `lager_bookinger`, `lager_tilgaengelighed`, og for den lageransvarlige `lager_ansvarlig_overblik`, `_koe`, `_modeller`, `_pakkeliste`, `_enheder`, `_forbrugsvarer`, `_bestillinger`, `_perioder`, `_afregninger`, `_pladser`, `_pluk`, `_optaellinger`.

**Skriv (opt-in via `LAGER_ENABLE_WRITES=true`):** `lager_tjek_ud`, `lager_aflever`, `lager_flyt_projekt`, `lager_forbrug`, `lager_bestil`, `lager_bestilling_hent`, `lager_bestilling_fortryd`, `lager_book`, `lager_booking_status`, og for den lageransvarlige `lager_ansvarlig_modtag_levering`, `_saet_paa_plads`, `_send_bestillingsliste`, `_afklar_ukendt`, optællingen (`_optaelling_start`, `_scan`, `_goer_op`, `_afgoer`, `_luk`), pladser (`_ny_zone`, `_ny_reol`), stamdata (`_ret_model`, `_ret_enhed`) og sæt (`_saet_tilfoej_del`, `_saet_fjern_del`, `_saet_pakkeliste`). Hver skrivning får sin egen `Idempotency-Key`.

**Bevidst fraværende:** afregningens godkend, bogfør og afvis (den lageransvarliges klik i appen), salg af værktøj, kassation, prisrettelser, rettelser af lejeperioder og udtag, import. Overtagelse kræver et foto og hører til telefonen. Hver operation i OpenAPI-kortet uden et værktøj står i `UDEN_VAERKTOEJ` med sin grund.

**Moduler:** en installation kan have slået moduler fra (fx booking eller bestillinger; `lager_me` → `moduler`). Hver sti i OpenAPI-kortet bærer `x-moduler`; værktøjer for et modul, der er slået fra, skjules fra listen og afvises med en klar besked. Modulerne hentes fra `/me` og caches i processen (`LAGER_MODULER_TTL_MS`, standard 5 minutter). Kan `/me` ikke nås, skjules intet; appen afviser selv.

## Resources og prompts

| Resource | Indhold |
| --- | --- |
| `lager://lagre` | Dine lagre med roller, installationens moduler og tal |
| `lager://plads/{kode}` | En plads (fx `A-12-3`) og enhederne, der hører til dér |
| `lager://enhed/{tag}` | Opslag på et mærke: hvad, hvem har det, hvor skal det stå |

Prompts: `daglig-runde` («Daglig runde»), `tael-en-reol` («Tæl en reol»), `aflever-et-saet` («Aflever et sæt»), `hvor-er` («Hvor er X?»). De kalder ikke appen selv, men beskriver forløbet med værktøjerne og hvor brugeren skal bekræfte.

## OpenAPI som kilde

`openapi/lager.json` er et fastlåst øjebliksbillede af lager-appens `/api/lager/openapi.json` (kun `paths` og `components.schemas`, med en pladsholder som server). Værktøjernes skemaer bygges af det ved opstart; der hentes intet fra appen ved build. Opdatér det fra en kørende backend eller en fil:

```bash
npm run openapi:opdater -- https://lager.example.com   # eller: LAGER_BASE_URL=… npm run openapi:opdater
npm test
```

`test/openapi.test.ts` fejler, hvis et værktøj peger på en operation, der ikke findes, eller hvis kortet har en operation, der hverken har et værktøj eller en grund i `UDEN_VAERKTOEJ`.

## Konfiguration

Se `.env.example`. Påkrævet: `LAGER_BASE_URL`, `LAGER_API_TOKEN`, og en bruger (`LAGER_TRUST_FORWARDED_USER=true` bag gatewayen, ellers `LAGER_DEFAULT_USER`).

Sikkerhed:

- HTTP-transporten starter kun med `LAGER_TRUST_FORWARDED_USER=true` **og** `MCP_HTTP_TOKEN` sat; brugeren kommer altid fra `X-MCP-User`. `LAGER_DEFAULT_USER` bruges kun af stdio.
- `MCP_HTTP_TOKEN` sammenlignes i konstant tid.
- `LAGER_BASE_URL` skal være `https://`. http:// er kun tilladt mod loopback (lokale mocks) og mod værter, der står eksplicit i `LAGER_INTERNAL_HOSTS` (kommasepareret, eksakt værtsnavn, ingen wildcards), fx backendens containernavn på et internt Docker-netværk. URL'en tjekkes ved opstart; HTTP-transporten nægter at starte med en ugyldig værdi.
- Mærker/tags i URL-stier afvises, hvis de er tomme, `.`/`..` eller indeholder `/`, `\`, `?`, `#` eller kodede punktummer/skråstreger.

## Kør

```bash
npm install
npm run dev          # stdio
npm run dev:http     # streamable HTTP på :3000/mcp (stateless)
npm test
```

HTTP-transporten svarer også på `GET /healthz` (processen kører, altid 200) og `GET /readyz` (200 hvis lager-appen svarer på et uautentificeret GET, ellers 503). Ingen af dem kræver token.

Docker-image: `ghcr.io/borgels/mcp-server-lager` (publiceres ved push til `main` og genbygges uden cache hver mandag). Tags:

- `<ååååmmdd>-<nr>-<sha7>`: hvert build, også genbygningen. Unikt og sorterbart; pin dette for at få rettelser i basis-imaget med.
- `<sha>`: commit'ens første build. Genbygningen skriver ikke over det.
- `latest`: seneste build. Pin et af de andre i drift, så en opdatering er et valg, og rollback er muligt.
