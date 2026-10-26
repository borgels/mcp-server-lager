# mcp-server-lager

MCP server for et værktøjslager. Serveren er en tynd, revideret facade over lager-appens API (`/api/lager/*`, beskrevet i `/api/lager/openapi.json`): den ejer ingen data og ingen rettigheder. Hvert kald sker på vegne af én bruger, og lager-appen afgør, hvad hun må.

## Identitet

Bag en autentificerende MCP-gateway er brugeren verificeret af Entra og medlem af en sikkerhedsgruppe. Gatewayen sætter `X-MCP-User` (UPN), serveren giver den videre til lager-appen sammen med det interne token `LAGER_API_TOKEN`, og appen slår personen op blandt dem, der har logget ind i lager-appen. Roller (`vaerktoejsbruger`, `lageransvarlig`) og lagre er personens egne, så kostpriser og ansvarlig-værktøjer følger rollen, ikke serveren. Ukendt bruger afvises; ingen person oprettes på en headers ord.

## Roller og adgang

To lag skal begge sige ja, og lager-appen håndhæver desuden altid sine egne roller (403):

1. **Gatewayens roller** (`X-MCP-Roles`, sat af gatewayen ud fra personens Entra-grupper i `hosts.json` → `roles`; aldrig af klienten). Med `LAGER_ROLLER=gateway` kommer de pr. kald fra headeren, og et kald uden en kendt rolle afvises med 403. Ellers gælder en fast rolle for alle kald (`LAGER_ROLLER=lager-laes` eller `lager-skriv`; standard `lager-skriv`, så en gateway uden roller virker som før). `LAGER_ENABLE_WRITES=true` er stadig hovedafbryderen: uden den skriver ingen, uanset rolle.
2. **Lagerets roller** fra `/me` (`vaerktoejsbruger`, `lageransvarlig`, `kiosk` pr. lager), cachet pr. person i `LAGER_ROLLER_TTL_MS` (standard 60 s). Den lageransvarliges værktøjer (`lager_ansvarlig_*`, og `scenario_*`, der skriver under `/ansvarlig`) vises kun for den, der er lageransvarlig på mindst ét lager. Det er synlighed og en ekstra vagt; lageret afgør pr. lager. Svarer `/me` ikke, bruges de sidst kendte roller højst `LAGER_ROLLER_MAKS_ALDER_MS` (standard 5 minutter); derefter, og når intet er kendt, er det fail-closed: brugerens egne værktøjer vises, den lageransvarliges skjules og afvises, til `/me` svarer igen.

| Gateway-rolle | Lagerets rolle | Ser og kan kalde |
| --- | --- | --- |
| (ingen) | (alle) | intet: 403 fra serveren (med `LAGER_ROLLER=gateway`) |
| `lager-laes` | værktøjsbruger | læsende værktøjer for brugeren: opslag, `lager_mine`, `lager_find`, bookinger, bestillinger, lokationer, scenarier (læs) |
| `lager-laes` | lageransvarlig | som ovenfor plus den lageransvarliges læsende værktøjer: overblik, enheder, modeller, priser, perioder, afregninger, optællinger |
| `lager-skriv` | værktøjsbruger | læsende plus brugerens skrivninger: tjek ud, aflever, flyt projekt, forbrug, bestil, book |
| `lager-skriv` | lageransvarlig | alt: også oprette og rette modeller, enheder og forbrugsvarer, modtagelse, optælling, perioder, priser, kassering og fejlregistrering |
| (alle) | kun kiosk | kun `lager_me` og søgningen (kioskkontoen hører til skærmen) |

`lager_me` og `lager_search_capabilities` er altid synlige for den, der har en rolle; søgningen viser kun det, personen må. Et skjult værktøj, der alligevel kaldes, afvises, før lageret spørges (og logges som `policy_denied`).

**Bekræftelse:** kassering, fejlregistrering, sletning, annullering, opløsning og det, der flytter penge (`lager_ansvarlig_kasser`, `_fejlregistrer`, `_udtag_registrer`, `_udtag_annuller`, `_periode_ret`, `_periode_annuller`, `_pris_saet`, `_saet_oploes`, `_saet_fjern_del`, `_lokation_nedlaeg`, `_kanban_tilbagekald`, `_iot_alarmregel_fjern`, `scenario_slet`, og `_optaelling_afgoer` med «savnet») er `destructiveHint` og kræver `bekraeftet: true`: brugerens udtrykkelige ja i samtalen. Feltet sendes ikke til lageret. Lageret afviser desuden gennem gatewayen alt, der krediterer det bogførte (`krediter` ved fejlregistrering, annullering af en faktureret periode eller et faktureret udtag), og en pris i en oprettelse, der rammer en kendt model eller vare (varenummeret går igen). Et ejerskift (omm-lager #230) får samme krav, når det kommer.

## Tools

Navn, titel og beskrivelse er håndplukket i `src/tools/katalog.ts`, så en model kan finde og forstå værktøjerne. Parametre, typer, påkrævede felter og moduler kommer fra lager-API'ets OpenAPI (se nedenfor). `lager_search_capabilities` er kortet.

**Læs (altid på):** `lager_me`, `lager_projekter`, `lager_mine`, `lager_opslag`, `lager_plads`, `lager_model`, `lager_saet`, `lager_forbrugsvarer`, `lager_bestillinger`, `lager_bookinger`, `lager_tilgaengelighed`, og for den lageransvarlige `lager_ansvarlig_overblik`, `_koe`, `_modeller`, `_pakkeliste`, `_enheder`, `_forbrugsvarer`, `_bestillinger`, `_perioder`, `_afregninger`, `_pladser`, `_pluk`, `_optaellinger`.

**Lokationer, evner og IoT (læs):** `lager_lokationer` (træet), `lager_lokation`, `lager_lokation_kode`, `lager_hvor_er`, `lager_belaegning`, `lager_lokationstyper`, `lager_lokation_evner`, `lager_evnetyper`, `lager_ansvarlig_model_krav`, `lager_lokation_visning` (plantegning eller reol forfra, i mm), `lager_lokation_kodeforslag`, `lager_lejemaal` (lejemålet på et depotrum eller en container; aldrig koderne), og med modulet `iot` `lager_iot_enheder`, `lager_iot_enhed`, `lager_iot_lokation_maalinger`, `lager_iot_enhed_maalinger`, `lager_iot_lokation_dugpunkt`, `lager_iot_lokation_klima` (klimapanelet med luftkvalitet), `lager_iot_lokation_styring`, `lager_iot_lokation_automationer` (YAML-forslag til Home Assistant), `lager_iot_alarmer` og `lager_iot_alarmregler`. Har operationen et `operationId` i kortet, er det værktøjets navn (derfor hedder scenarieværktøjerne `scenario_*`).

**Skabeloner, egenskaber, varer og batterier (læs):** `lager_skabeloner`, `lager_skabelon`, `lager_kategoriskabeloner`, `lager_find` (modeller og varer på egenskaber, fx stik og længde), `lager_forbrugsvare_beholdninger` (hvor er varen), `lager_batterier`, `lager_batteri`, og for den lageransvarlige `lager_ansvarlig_forbrugsvare_beholdninger`, `_kodeskabelon`, `_forsikring` (JSON; regneark og PDF i appen), `_enhed_dokumenter`, `_lokation_dokumenter`, `_personer` (personvælgeren) og med modulet `economic` `_economic_varer`.

**Placeringsregler, særhåndteringsmærker og procesflows:** læs `lager_placeringsregler`, `lager_placeringsafvigelser`, `lager_saermaerker` (asbest, bly, PCB …: værn, certificering, regler og flows pr. mærke), og med modulet `procesflows` `lager_procesflows`, `lager_procesforloeb`, `lager_procesforloeb_log`; skriv `lager_procesforloeb_udfoer` (et trin, det sidste er frigivelsen, hvor hvert særhåndteringsmærke kan kræve sin certificering: destruktiv, og beskrivelsen beder agenten lade brugeren bekræfte trin, tjekliste og certificering og aldrig sætte `certificeret` selv), og for den lageransvarlige `_procesforloeb_start`, `_placeringsregel_opret`, `_placeringsregel_ret` og `_procesflow_ret` (destruktive: kan slå et værn for et særhåndteringsmærke fra, kun med `bekraeft: true` efter brugerens udtrykkelige ja), `_procesflow_opret`, og `_saermaerke_opret` og `_saermaerke_ret` (destruktive: et mærke i brug løsnes kun med `bekraeft: true` efter brugerens ja; agenten sender det aldrig af sig selv). Enheder, modeller, scenarieting og reglernes `hvem` bruger `maerker` (mærkernes nøgler); de forældede `asbest`, `asbestStandard` og `hvem.asbest` står i skemaerne som felter, der altid afvises med en fejl («asbest er forældet; brug maerker: ['asbest']»), så et kald aldrig skrælles af i stilhed (et tomt `hvem` ville gælde alt udstyr). I `_ret_enhed` og `_ret_model` (destruktive) anbefales `maerkerTilfoej` til at lægge mærker til og `maerkerFjern` til at tage dem af; `maerker` erstatter hele listen og kan ikke kombineres med de to (afvises, før noget sendes). Fjernes et mærke med et værn, svarer lageret 409 med `fjernes`; agenten viser mærkerne, spørger brugeren og sender aldrig `bekraeft` af sig selv. Asbest er ikke længere et modul i `/me`.

**Udlån, kanban, stregkoder, kameraer og indretning:** `lager_udlaan`, `lager_udlaan_et`, `lager_udlaan_ret` (påmindelse på mail kun efter brugerens ja; `openWorldHint`), `lager_ansvarlig_udlaan`; kanbankort `lager_ansvarlig_kanban`, `_kanban_et`, `_kanban_opret`, `_kanban_ret`, `_kanban_tilbagekald`; `lager_stregkode`, `lager_ansvarlig_produktopslag` (stregkoden sendes til eksterne kilder; `openWorldHint`), `lager_ansvarlig_forbrugsvare_stregkoder`; `lager_iot_kameraer` (kun listen; billede og live ses i appen); `lager_find_plads`, `lager_lokation_passer`, `lager_ansvarlig_model_maal`, `lager_ansvarlig_skabelon_fravalg` og `_skabelon_fravalg_saet`. Lånerens link, kanbankortets token og etiketter, lånerens og kortets sider uden login og kameraernes billeder og strømme er aldrig værktøjer. Det samme gælder adgangskoden og PIN'en til et lejet rum (`/lokationer/{id}/lejet/koder`): de vises og sættes kun i appen.

**Scenarier (planlægning):** læs `lager_scenarier`, `scenario_hent`, `scenario_valider`, `scenario_sammenlign`, `scenario_vurder_placering` og `scenario_foreslaa_placering` (placeringsmotoren: en POST, der intet skriver, så den er `readOnlyHint` og ikke bag skrive-flaget; kræver lageransvarlig); skriv `scenario_opret`, `scenario_ret`, `scenario_tilfoej_ting`, `scenario_flyt` (destruktiv: kan fjerne), `scenario_fjern_ting`, `scenario_placer` (forslagets linjer i kladden, alt eller intet; `version` er påkrævet, og en forældet giver 409), zonerne `scenario_zone_opret`, `scenario_zone_ret`, `scenario_zone_slet`, og `scenario_slet`. En agent arbejder kun i scenarier (kladder); vedtagelsen, der ændrer det rigtige træ, er den lageransvarliges beslutning i appen og er med vilje ikke et værktøj.

**Register for den lageransvarlige (skriv):** modeller (`lager_ansvarlig_model_opret`, `_ret_model`), enheder (`_enhed_opret`, `_ret_enhed`, `_modtag_enhed`, `_frigiv`, `_kasser`, `_fejlregistrer`; kreditering af faktureret leje sker kun i appen, og lageret afviser den gennem gatewayen), forbrugsvarer (`_forbrugsvare_opret`, `_forbrugsvare_ret`, `_forbrugsvare_bevaegelser`), udtag (`_udtag`, `_udtag_registrer`, `_udtag_annuller`), lejeperioder (`_periode_opret`, `_periode_ret`, `_periode_annuller`; læs `_perioder`), priser (`_priser`, `_pris_saet`: en ny version fra en dato, det bogførte røres ikke), `_saet_oploes` og `_bestilling_forventet`.

**Skriv (opt-in via `LAGER_ENABLE_WRITES=true`, og rollen `lager-skriv`):** `lager_tjek_ud`, `lager_aflever`, `lager_flyt_projekt`, `lager_forbrug`, `lager_bestil`, `lager_bestilling_hent`, `lager_bestilling_fortryd`, `lager_book`, `lager_booking_status`, og for den lageransvarlige `lager_ansvarlig_modtag_levering`, `_saet_paa_plads`, `_send_bestillingsliste`, `_afklar_ukendt`, optællingen (`_optaelling_start`, `_scan`, `_goer_op`, `_afgoer`, `_luk`), pladser (`_ny_zone`, `_ny_reol`), stamdata (`_ret_model`, `_ret_enhed`), sæt (`_saet_tilfoej_del`, `_saet_fjern_del`, `_saet_pakkeliste`), lokationer (`_lokation_opret`, `_lokation_ret`, `_lokation_flyt`, `_lokation_nedlaeg`), evner og krav (`_lokation_evne_saet`, `_lokation_evne_fjern`, `_evnetype_opret`, `_evnetype_ret`, `_model_krav_saet`) skabeloner og egenskaber (`_skabelon_opret`, `_skabelon_ret`, `_kategoriskabelon_opret`, `_kategoriskabelon_ret`, `_model_egenskaber`, `_forbrugsvare_egenskaber`, `_kodeskabelon_saet`), varer pr. lokation (`_forbrugsvare_beholdning_saet`, `_forbrugsvare_flyt`), enhedernes egne felter (`_enhedsfelter_opret`, `_enhedsfelter_ret`, `_enhed_egenskaber`; læs `lager_enhedsfelter`), forbrugsgrupper (`_forbrugsgruppe_opret`, `_forbrugsgruppe_ret`; læs `lager_forbrugsgrupper`), bilag som link (`_enhed_dokument_tilfoej`, `_lokation_dokument_tilfoej`), lejemålet (`_lejemaal_ret`; koderne kun i appen), klima (`_iot_alarm_kvitter`, `_iot_alarmregel_opret`, `_iot_alarmregel_ret`, `_iot_alarmregel_fjern`, `_iot_luftkvalitetsregler`), `lager_ansvarlig_iot_skift` og `lager_ansvarlig_iot_styr` (gennem Home Assistant; skrivninger, men ikke destruktive), og for alle `lager_batteri_opladet`.

**Hints:** læsende værktøjer er `readOnlyHint`. Skrivende er `destructiveHint` ved DELETE, ved `bekraeftet` og der, hvor kataloget siger det (fx `scenario_flyt`, `lager_ansvarlig_optaelling_luk`), og `idempotentHint` ved PUT, PATCH og DELETE og der, hvor et POST sætter en tilstand (kvittering, tænd/sluk, styring, standardregler).

**Idempotens og nye forsøg:** hvert skrivende tool-kald får én `Idempotency-Key`: en HMAC med serverens hemmelighed (`MCP_IDEMPOTENS_HEMMELIGHED`) over brugeren, sessionen, JSON-RPC-id'et, værktøjet og argumenterne. Flere skrivninger i ét kald får `-2`, `-3` … Sender klienten `_meta.idempotencyKey`, bruges den i stedet for session og id, så en agent, der gentager hele kaldet, også får ét resultat. Lager-appens nøgler er globale og permanente, så samme `_meta.idempotencyKey` med samme input senere giver stille det gamle resultat; brug en ny nøgle pr. handling. Hemmeligheden gør, at nøglen ikke kan beregnes af en, der kalder API'et direkte.

Ikke alle skrive-ruter i appen gemmer svaret pr. nøgle endnu, så en skrivning (alt andet end GET, også DELETE) prøves kun igen, når den bevisligt ikke er udført: ved 429 (rate limit afviser, før ruten kører) og ved en forbindelsesfejl, før forespørgslen blev sendt (`ECONNREFUSED`, DNS). Aldrig ved 502/503/504, timeout eller en fejl efter afsendelse. Et GET prøves også igen ved en proxys 502/503/504 og ved netværksfejl. Et svar med appens egen `{ error }` prøves aldrig igen (bortset fra 429). Ved 429 ventes `Retry-After` plus lidt jitter; et nyt forsøg kræver, at ventetiden er højst `LAGER_RETRY_MAX_VENT_MS` (standard 20 s), og at tool-kaldets samlede frist `LAGER_RETRY_FRIST_MS` (standard 25 s) ikke overskrides. Højst `LAGER_RETRY_MAX` nye forsøg (standard 3).

**Bevidst fraværende:** afregningens godkend, bogfør og afvis (den lageransvarliges klik i appen), kreditering af faktureret leje, salg af værktøj, prispolitikken, adgangsstyring og moduler, eksport og import (ZIP og CSV), filupload (bilag som fil, baggrundsplaner), AI-indtaget fra foto og sætning (agenten er selv en model) og scenariets vedtagelse. Overtagelse kræver et foto og hører til telefonen. Hver operation i OpenAPI-kortet uden et værktøj har en grund: lagerets egen markering `x-mcp: { vaerktoej: false, grund }` på operationen eller på hele stien, også med `"false"` som tekst (fx lånerens link og kanbankortets token; en markeret sti giver heller ingen resource), eller serverens i `UDEN_VAERKTOEJ_HER`. Et værktøj på en operation, lageret har markeret, afvises ved opstart.

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

Prompts: `daglig-runde` («Daglig runde»), `tael-en-reol` («Tæl en reol»), `aflever-et-saet` («Aflever et sæt»), `hvor-er` («Hvor er X?»), `planlaeg` («Planlæg et rum»: interview om målene (hvad skal stå der, arbejdspladser, brugsfrekvens, hvad hører sammen, zoner som elektronik, 3D-print og grovværktøj, særhåndteringsmærker), placeringsmotorens forslag, 1 til 3 scenarier med zoner og de placeringer, brugeren har taget imod, valideret og sammenlignet med en anbefaling; uden vedtagelse og uden at slette scenarier) og `klimatjek` («Klimatjek»). De kalder ikke appen selv, men beskriver forløbet med værktøjerne og hvor brugeren skal bekræfte.

## OpenAPI som kilde

`openapi/lager.json` er et fastlåst øjebliksbillede af lager-appens `/api/lager/openapi.json` (kun `paths` og `components.schemas`, med en pladsholder som server). Værktøjernes skemaer bygges af det ved opstart; der hentes intet fra appen ved build. Opdatér det fra en kørende backend eller en fil:

```bash
npm run openapi:opdater -- https://lager.example.com   # eller: LAGER_BASE_URL=… npm run openapi:opdater
npm test
```

Øjebliksbilledet står i et offentligt repo. Lager-appen holder selv kortets eksempler neutrale; scriptet ændrer intet i teksten, men nægter at gemme et kort, der nævner en vært eller en mailadresse ud over `example.*`, et forbudt navn (som hash i `scripts/neutral.ts`, så listen ikke selv nævner det) eller en person («hos Fornavn»). `test/openapi.test.ts` tjekker det samme.

`test/openapi.test.ts` fejler, hvis et værktøj peger på en operation, der ikke findes, eller hvis kortet har en operation, der hverken har et værktøj eller en grund (`x-mcp` i kortet eller `UDEN_VAERKTOEJ_HER`).

## Konfiguration

Se `.env.example`. Påkrævet: `LAGER_BASE_URL`, `LAGER_API_TOKEN`, og en bruger (`LAGER_TRUST_FORWARDED_USER=true` bag gatewayen, ellers `LAGER_DEFAULT_USER`). Roller: `LAGER_ROLLER` (`gateway`, `lager-laes` eller `lager-skriv`; standard `lager-skriv`) og `LAGER_ROLLER_TTL_MS` (se Roller og adgang); en ugyldig `LAGER_ROLLER` stopper opstarten.

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
