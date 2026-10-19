# mcp-server-lager

MCP server for et værktøjslager. Serveren er en tynd, revideret facade over lager-appens API (`/api/lager/*`, beskrevet i `/api/lager/openapi.json`): den ejer ingen data og ingen rettigheder. Hvert kald sker på vegne af én bruger, og lager-appen afgør, hvad hun må.

## Identitet

Bag en autentificerende MCP-gateway er brugeren verificeret af Entra og medlem af en sikkerhedsgruppe. Gatewayen sætter `X-MCP-User` (UPN), serveren giver den videre til lager-appen sammen med det interne token `LAGER_API_TOKEN`, og appen slår personen op blandt dem, der har logget ind i lager-appen. Roller (`vaerktoejsbruger`, `lageransvarlig`) og lagre er personens egne, så kostpriser og ansvarlig-værktøjer følger rollen, ikke serveren. Ukendt bruger afvises; ingen person oprettes på en headers ord.

## Tools

Navn, titel og beskrivelse er håndplukket i `src/tools/katalog.ts`, så en model kan finde og forstå værktøjerne. Parametre, typer, påkrævede felter og moduler kommer fra lager-API'ets OpenAPI (se nedenfor). `lager_search_capabilities` er kortet.

**Læs (altid på):** `lager_me`, `lager_projekter`, `lager_mine`, `lager_opslag`, `lager_plads`, `lager_model`, `lager_saet`, `lager_forbrugsvarer`, `lager_bestillinger`, `lager_bookinger`, `lager_tilgaengelighed`, og for den lageransvarlige `lager_ansvarlig_overblik`, `_koe`, `_modeller`, `_pakkeliste`, `_enheder`, `_forbrugsvarer`, `_bestillinger`, `_perioder`, `_afregninger`, `_pladser`, `_pluk`, `_optaellinger`.

**Lokationer, evner og IoT (læs):** `lager_lokationer` (træet), `lager_lokation`, `lager_lokation_kode`, `lager_hvor_er`, `lager_belaegning`, `lager_lokationstyper`, `lager_lokation_evner`, `lager_evnetyper`, `lager_ansvarlig_model_krav`, `lager_lokation_visning` (plantegning eller reol forfra, i mm), `lager_lokation_kodeforslag`, og med modulet `iot` `lager_iot_enheder`, `lager_iot_enhed`, `lager_iot_lokation_maalinger`, `lager_iot_enhed_maalinger`, `lager_iot_lokation_dugpunkt`, `lager_iot_lokation_klima` (klimapanelet med luftkvalitet), `lager_iot_lokation_styring`, `lager_iot_lokation_automationer` (YAML-forslag til Home Assistant), `lager_iot_alarmer` og `lager_iot_alarmregler`. Har operationen et `operationId` i kortet, er det værktøjets navn (derfor hedder scenarieværktøjerne `scenario_*`).

**Skabeloner, egenskaber, varer og batterier (læs):** `lager_skabeloner`, `lager_skabelon`, `lager_kategoriskabeloner`, `lager_find` (modeller og varer på egenskaber, fx stik og længde), `lager_forbrugsvare_beholdninger` (hvor er varen), `lager_batterier`, `lager_batteri`, og for den lageransvarlige `lager_ansvarlig_forbrugsvare_beholdninger`, `_kodeskabelon`, `_forsikring` (JSON; regneark og PDF i appen) og `_enhed_dokumenter`.

**Scenarier (planlægning):** læs `lager_scenarier`, `scenario_hent`, `scenario_valider`, `scenario_sammenlign`; skriv `scenario_opret`, `scenario_ret`, `scenario_tilfoej_ting`, `scenario_flyt` (destruktiv: kan fjerne), `scenario_fjern_ting` og `scenario_slet`. En agent arbejder kun i scenarier (kladder); vedtagelsen, der ændrer det rigtige træ, er den lageransvarliges beslutning i appen og er med vilje ikke et værktøj.

**Skriv (opt-in via `LAGER_ENABLE_WRITES=true`):** `lager_tjek_ud`, `lager_aflever`, `lager_flyt_projekt`, `lager_forbrug`, `lager_bestil`, `lager_bestilling_hent`, `lager_bestilling_fortryd`, `lager_book`, `lager_booking_status`, og for den lageransvarlige `lager_ansvarlig_modtag_levering`, `_saet_paa_plads`, `_send_bestillingsliste`, `_afklar_ukendt`, optællingen (`_optaelling_start`, `_scan`, `_goer_op`, `_afgoer`, `_luk`), pladser (`_ny_zone`, `_ny_reol`), stamdata (`_ret_model`, `_ret_enhed`), sæt (`_saet_tilfoej_del`, `_saet_fjern_del`, `_saet_pakkeliste`), lokationer (`_lokation_opret`, `_lokation_ret`, `_lokation_flyt`, `_lokation_nedlaeg`), evner og krav (`_lokation_evne_saet`, `_lokation_evne_fjern`, `_evnetype_opret`, `_evnetype_ret`, `_model_krav_saet`) skabeloner og egenskaber (`_skabelon_opret`, `_skabelon_ret`, `_kategoriskabelon_opret`, `_kategoriskabelon_ret`, `_model_egenskaber`, `_forbrugsvare_egenskaber`, `_kodeskabelon_saet`), varer pr. lokation (`_forbrugsvare_beholdning_saet`, `_forbrugsvare_flyt`), bilag som link (`_enhed_dokument_tilfoej`), klima (`_iot_alarm_kvitter`, `_iot_alarmregel_opret`, `_iot_alarmregel_ret`, `_iot_alarmregel_fjern`, `_iot_luftkvalitetsregler`), `lager_ansvarlig_iot_skift` og `lager_ansvarlig_iot_styr` (gennem Home Assistant; skrivninger, men ikke destruktive), og for alle `lager_batteri_opladet`.

**Hints:** læsende værktøjer er `readOnlyHint`. Skrivende er `destructiveHint` ved DELETE og der, hvor kataloget siger det (fx `scenario_flyt`, `lager_ansvarlig_optaelling_luk`), og `idempotentHint` ved PUT, PATCH og DELETE og der, hvor et POST sætter en tilstand (kvittering, tænd/sluk, styring, standardregler).

**Idempotens og nye forsøg:** hvert skrivende tool-kald får én `Idempotency-Key`: en HMAC med serverens hemmelighed (`MCP_IDEMPOTENS_HEMMELIGHED`) over brugeren, sessionen, JSON-RPC-id'et, værktøjet og argumenterne. Flere skrivninger i ét kald får `-2`, `-3` … Sender klienten `_meta.idempotencyKey`, bruges den i stedet for session og id, så en agent, der gentager hele kaldet, også får ét resultat. Lager-appens nøgler er globale og permanente, så samme `_meta.idempotencyKey` med samme input senere giver stille det gamle resultat; brug en ny nøgle pr. handling. Hemmeligheden gør, at nøglen ikke kan beregnes af en, der kalder API'et direkte.

Ikke alle skrive-ruter i appen gemmer svaret pr. nøgle endnu, så en skrivning (alt andet end GET, også DELETE) prøves kun igen, når den bevisligt ikke er udført: ved 429 (rate limit afviser, før ruten kører) og ved en forbindelsesfejl, før forespørgslen blev sendt (`ECONNREFUSED`, DNS). Aldrig ved 502/503/504, timeout eller en fejl efter afsendelse. Et GET prøves også igen ved en proxys 502/503/504 og ved netværksfejl. Et svar med appens egen `{ error }` prøves aldrig igen (bortset fra 429). Ved 429 ventes `Retry-After` plus lidt jitter; et nyt forsøg kræver, at ventetiden er højst `LAGER_RETRY_MAX_VENT_MS` (standard 20 s), og at tool-kaldets samlede frist `LAGER_RETRY_FRIST_MS` (standard 25 s) ikke overskrides. Højst `LAGER_RETRY_MAX` nye forsøg (standard 3).

**Bevidst fraværende:** afregningens godkend, bogfør og afvis (den lageransvarliges klik i appen), salg af værktøj, kassation, prisrettelser, rettelser af lejeperioder og udtag, eksport og import (ZIP og CSV), filupload (bilag som fil, baggrundsplaner) og scenariets vedtagelse. Overtagelse kræver et foto og hører til telefonen. Hver operation i OpenAPI-kortet uden et værktøj står i `UDEN_VAERKTOEJ` med sin grund.

**Moduler:** en installation kan have slået moduler fra (fx booking eller bestillinger; `lager_me` → `moduler`). Hver sti i OpenAPI-kortet bærer `x-moduler`; værktøjer for et modul, der er slået fra, skjules fra listen og afvises med en klar besked. Modulerne hentes fra `/me` og caches i processen (`LAGER_MODULER_TTL_MS`, standard 5 minutter). Kan `/me` ikke nås, skjules intet; appen afviser selv.

## Resources og prompts

| Resource | Indhold |
| --- | --- |
| `lager://lagre` | Dine lagre med roller, installationens moduler og tal |
| `lager://plads/{kode}` | En plads (fx `A-12-3`) og enhederne, der hører til dér |
| `lager://enhed/{tag}` | Opslag på et mærke: hvad, hvem har det, hvor skal det stå |
| `lager://lokation/{id}` | En lokation i træet med sti, mål, børn og indhold |
| `lager://rum/{id}/klima` | Klimapanelet: følerne, dugpunkt inde og ude, luftkvalitet og åbne alarmer (modulet `iot`) |
| `lager://skabeloner` | Skabelonbiblioteket: reoler, skabe, skuffer og bins med mål |
| `lager://lokation/{id}/plan` | Plantegningen oppefra i mm: møbler, kollisioner og gange |
| `lager://scenarie/{id}` | Et scenarie: træet med planen lagt på, de planlagte ting og indkøbslisten |
| `lager://scenarie/{id}/validering` | Scenariets fejl, advarsler og hint |

Prompts: `daglig-runde` («Daglig runde»), `tael-en-reol` («Tæl en reol»), `aflever-et-saet` («Aflever et sæt»), `hvor-er` («Hvor er X?»), `planlaeg` («Planlæg et rum»: et eller flere scenarier med planlagte ting, valideret og sammenlignet, uden vedtagelse) og `klimatjek` («Klimatjek»). De kalder ikke appen selv, men beskriver forløbet med værktøjerne og hvor brugeren skal bekræfte.

## OpenAPI som kilde

`openapi/lager.json` er et fastlåst øjebliksbillede af lager-appens `/api/lager/openapi.json` (kun `paths` og `components.schemas`, med en pladsholder som server). Værktøjernes skemaer bygges af det ved opstart; der hentes intet fra appen ved build. Opdatér det fra en kørende backend eller en fil:

```bash
npm run openapi:opdater -- https://lager.example.com   # eller: LAGER_BASE_URL=… npm run openapi:opdater
npm test
```

Øjebliksbilledet står i et offentligt repo: scriptet gør installationens egne eksempler neutrale og nægter at gemme et kort, der nævner en vært eller en mailadresse ud over `example.*`.

`test/openapi.test.ts` fejler, hvis et værktøj peger på en operation, der ikke findes, eller hvis kortet har en operation, der hverken har et værktøj eller en grund i `UDEN_VAERKTOEJ`.

## Konfiguration

Se `.env.example`. Påkrævet: `LAGER_BASE_URL`, `LAGER_API_TOKEN`, og en bruger (`LAGER_TRUST_FORWARDED_USER=true` bag gatewayen, ellers `LAGER_DEFAULT_USER`).

Sikkerhed:

- HTTP-transporten starter kun med `LAGER_TRUST_FORWARDED_USER=true`, `MCP_HTTP_TOKEN` og `MCP_IDEMPOTENS_HEMMELIGHED` (mindst 32 tegn, fx `openssl rand -hex 32`, den samme på alle instanser) sat; brugeren kommer altid fra `X-MCP-User`. `LAGER_DEFAULT_USER` bruges kun af stdio.
- `MCP_HTTP_TOKEN` sammenlignes i konstant tid. Under en rotation gælder `MCP_HTTP_TOKEN_FORRIGE` samtidig: sæt det nye token i `MCP_HTTP_TOKEN` og det gamle i `MCP_HTTP_TOKEN_FORRIGE`, skift gatewayen, og fjern så det forrige. Begge sammenlignes altid.
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
