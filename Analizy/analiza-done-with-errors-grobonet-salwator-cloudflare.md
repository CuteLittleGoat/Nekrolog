# Analiza: `done_with_errors` od 2026-10-19 — blokada Cloudflare na Grobonecie (Salwator)

Data analizy: 2026-10-25
Temat analizy: Ustalenie przyczyny statusu `done_with_errors` utrzymującego się od przebiegu z 2026-10-19 22:50 UTC, wyjaśnienie komunikatu ze zrzutu ekranu, sprawdzenie poprawności wszystkich źródeł i propozycja rozwiązania.

Analiza nie ma związku z wcześniejszymi przyczynami tego samego statusu (Dębniki — `Analizy/analiza-status-done-with-errors-cloudflare-debniki.md`; przeterminowanie Gabriel24 — `Analizy/analiza-done-with-errors-gabriel24-timeout-i-debniki-intencje.md`; zmiana domeny św. Jadwigi — `Analizy/analiza-done-with-errors-sw-jadwiga-zmiana-domeny.md`). Mechanizm blokady jest jednak ten sam co na Dębnikach, więc wnioski z tamtej analizy w dużej części obowiązują.

---

## 1. Oryginalny pełny prompt użytkownika

```text
Jakiś czas temu pojawił się taki komunikat jak na screenie i od tamtej pory aplikacja zwraca "done_with_errors". Przeprowadź analizę błędu, sprawdź poprawność źródeł i zaproponuj rozwiązanie problemu. Analizę i wnioski zapisz jako plik MD w folderze Analizy/
[Image: source: /tmp/claude-0/-home-user/25fd0692-77e1-5b6d-9cb2-87a4aefaeb13/images/1.png]
W folderze Analizy są archiwalne analizy jak wystąpił podobny błąd. Może Ci się to przydać.
Kontynuuj pracę.
```

Dopisek użytkownika w trakcie pracy:

```text
Analizę wrzuć na Main.
```

Treść zrzutu ekranu (przepisana, bo obraz nie jest częścią repozytorium):

```text
Status danych
Snapshot: 2026-10-20T22:12:48.418Z
Job: 2026-10-20T22:12:48.834Z

Źródła z ostrzeżeniem (blokada zewnętrzna lub przejściowy błąd odczytu): 1. Część sekcji może być
pusta mimo poprawnego przebiegu. Szczegóły w sekcji Log.

Status Helenomatu
Helena Gawin - brak informacji
```

---

## 2. Zakres analizy

- Odczyt bieżącego stanu z `data/job.json`, `data/errors.json`, `data/source_health.json` (commit `c2d507f`, a po pobraniu `main` — `914b216`, przebieg z 2026-10-24 21:28 UTC).
- Historia statusów z 49 commitów `data/job.json` (klon płytki — tyle historii jest dostępne), żeby ustalić początek awarii i odtworzyć przebieg ze zrzutu ekranu.
- Odtworzenie logiki banera w `app.js` (`renderStatus`) i klasyfikacji w `scripts/nekrolog_core.mjs` (`classifySourceOutcome`).
- Sondowanie na żywo hosta `krakowsalwator.grobonet.com` i domeny `grobonet.com`: dwa tory sieciowe, dwa zestawy nagłówków, siedem ścieżek.
- Pełny przebieg diagnostyczny na żywych źródłach (`DISCORD_NOTIFY_ENABLED=false`) i kontrola jakości rekordów z każdego źródła.
- Weryfikacja aktualności Gabriel24 na żywej stronie.
- Symulacja klasyfikacji z flagą `external_block_tolerated` na rzeczywistym stanie kondycji źródła.
- `npm test`.

Poza zakresem: zmiany w kodzie i konfiguracji (zgodnie z `AGENTS.md` §1 polecenie dotyczy analizy i propozycji rozwiązania), wysyłka powiadomień Discord.

---

## 3. Ustalenia

### 3.1. Bezpośrednia przyczyna: HTTP 403 z Grobonetu (Salwator)

Jedyny wpis w `source_errors` każdego przebiegu od 2026-10-19 22:50 UTC:

| Pole | Wartość |
|---|---|
| `source_id` | `salwator_grobonet` |
| `url` | `https://krakowsalwator.grobonet.com/grobonet/start.php` |
| `http_status` | `403` |
| `parser_status` | `blocked` |
| `error` | `HTTP 403 (prób: 1)` |
| `blocked_since` | `2026-10-19T22:50:50.823Z` |
| `empty_streak` | rośnie z każdym przebiegiem (10 w przebiegu z 2026-10-24 11:55) |
| `fail_streak` | `0` — 403 to odpowiedź serwera, nie awaria sieci |

Ścieżka od błędu do statusu:

1. `parseGrobonetGroby` (`scripts/nekrolog_core.mjs`, sekcja „Grobonet: groby”) — `fetchText` dla pierwszego nazwiska z `search_terms` zwraca 403, więc źródło kończy się z `parser_status: 'blocked'`.
2. `classifySourceOutcome` — źródło **nie** ma `external_block_tolerated`, więc gałąź ostrzeżenia nie ma zastosowania; błąd nie jest też awarią sieciową (`http_status ≠ 0`), więc nie ma tolerancji `fail_streak`. Wynik: `kind: 'error'` od pierwszego przebiegu.
3. `resolveJobOutcome` — `errors.length > 0` → `status: 'done_with_errors'`.

To zachowanie zgodne z projektem: blokada źródła, którego nikt nie oznaczył jako tolerowane, ma być błędem.

### 3.2. Przebieg w czasie

| Przebieg (UTC) | Commit | Status | Grobonet | Uwagi |
|---|---|---|---|---|
| 2026-10-19 14:31 | `38d9f78` | `done` | HTTP 200, 12 rekordów | ostatni udany odczyt |
| **2026-10-19 22:50** | `dd931e4` | **`done_with_errors`** | **HTTP 403** | początek awarii |
| 2026-10-20 12:38 | `077a32e` | `done_with_errors` | 403 | |
| **2026-10-20 22:12** | `b4227be` | `done_with_errors` | 403 | **przebieg ze zrzutu ekranu**; dodatkowo ostrzeżenie Gabriel24 |
| 2026-10-21 → 2026-10-24 | 7 przebiegów | `done_with_errors` | 403 | |
| 2026-10-24 21:28 | `914b216` | `done_with_errors` | 403 | najnowszy przebieg na `main` |

11 przebiegów z rzędu, wszystkie z `"trigger": "schedule"`. Zmiana nastąpiła między 14:31 a 22:50 UTC 2026-10-19 i od tej chwili jest stała — to nie jest mrugnięcie sieci.

### 3.3. Komunikat ze zrzutu ekranu dotyczy **innego** źródła niż błąd

To ustalenie istotne dla zrozumienia sytuacji. W przebiegu ze zrzutu (`b4227be`) były **dwa niezależne zdarzenia**:

| Rodzaj | Źródło | Treść |
|---|---|---|
| błąd (`source_errors`) | Grobonet Salwator | `HTTP 403 (prób: 1)` |
| ostrzeżenie (`source_warnings`) | Gabriel24 | `fetch: The operation was aborted. (prób: 3) — przejściowe niepowodzenie odczytu (1 z 2 przed eskalacją do błędu)` |

Baner „Źródła z ostrzeżeniem …: 1” liczy **wyłącznie ostrzeżenia** — tą jedynką jest przeterminowanie Gabriel24, które ustąpiło w następnym przebiegu. Przyczyna `done_with_errors` (Grobonet) **w banerze się nie pojawiła** i pojawić się nie mogła.

Powód leży w `app.js`, funkcja `renderStatus`, blok banera:

```js
if (loadFailed) { … }
else if (stale) { … }
else if (warningsList.length) { … "Źródła z ostrzeżeniem …" }
else { banner.className = "banner hidden"; }
```

Baner nie ma gałęzi dla błędów. Skutki:

- 2026-10-20 22:12 baner wskazywał ostrzeżenie Gabriel24, choć status degradował Grobonet — łatwo powiązać jedno z drugim, choć nie mają związku.
- Od 2026-10-21 (brak ostrzeżeń) baner jest **ukryty**, mimo że każdy przebieg kończy się `done_with_errors`. Przyczynę widać tylko w sekcji Log.
- `done_with_errors` zaczął się **dzień wcześniej** niż komunikat ze zrzutu (2026-10-19 22:50, nie 2026-10-20 22:12).

Dodatkowo nagłówek listy w Logu brzmi „Ostrzeżenia (blokady zewnętrzne, nie degradują statusu)”, choć od wdrożenia tolerancji awarii sieciowych ostrzeżeniem bywa też przejściowe przeterminowanie — jak właśnie w tym przypadku.

### 3.4. „Status Helenomatu: Helena Gawin - brak informacji” jest stanem prawidłowym

`buildFallbackSummaryForHelena` liczy podsumowanie z rekordów `recent_deaths`, `upcoming_funerals` i `upcoming_intentions` — **nie z grobów**. Ten sam tekst był w ostatnim przebiegu przed awarią (`38d9f78`, Grobonet działał, 12 grobów). Komunikat oznacza „brak trafień monitorowanych fraz” i nie ma związku z błędem.

### 3.5. Natura blokady: Cloudflare Managed Challenge

Odpowiedź serwera dla `https://krakowsalwator.grobonet.com/grobonet/start.php?id=wyniki&name=Gawin` (2026-10-25 08:03 UTC):

```text
HTTP/2 403
server: cloudflare
cf-mitigated: challenge
content-type: text/html; charset=UTF-8
```

Treść: `<title>Just a moment...</title>` i `window._cf_chl_opt = { …, cType: 'managed', cZone: 'krakowsalwator.grobonet.com', … }`. To identyczny mechanizm jak na Dębnikach w sierpniu (Cloudflare Managed Challenge — wymaga wykonania JavaScriptu w przeglądarce).

**Test kontrolowany — tory sieciowe i nagłówki:**

| Tor wyjścia | Adres IP | User-Agent | Wynik |
|---|---|---|---|
| `curl` przez proxy kontenera | `160.79.106.19` | `nekrolog-refresh-bot/1.0` | **403** |
| `curl` przez proxy kontenera | `160.79.106.19` | `Mozilla/5.0 … Chrome/124.0` | **403** |
| `fetchText` projektu (`node-fetch` bezpośrednio, potem awaryjny `curl` z nagłówkami przeglądarki) | `136.114.177.226` / `34.61.193.143` (GCP) | bot, potem przeglądarka | **403** (`prób: 1`) |
| runner GitHub Actions (11 przebiegów produkcyjnych) | Azure | bot, potem przeglądarka | **403** |

**Różnica wobec Dębnik:** tam bezpośredni `node-fetch` z jednego z adresów przechodził (HTTP 200), co dowodziło kryterium reputacji IP. Tu **żaden** sprawdzony tor nie przechodzi.

**Zakres blokady — ścieżki:**

| Adres | Wynik |
|---|---|
| `/grobonet/start.php?id=wyniki&name=Gawin` | 403 |
| `/grobonet/start.php?id=wyniki&name=Dereń` | 403 |
| `/grobonet/start.php` | 403 |
| `/nekrologi.php` | 403 |
| `/robots.txt` | **403** |
| `http://krakowsalwator.grobonet.com/grobonet/start.php` | 403 |
| `https://grobonet.com/`, `https://www.grobonet.com/` | **403** |

Dwie obserwacje różniące ten przypadek od Dębnik:

1. **Wyzwanie obejmuje nawet `robots.txt`.** Na Dębnikach `robots.txt` zwracał 200, a blokowane były tylko treści. Tu Cloudflare stawia wyzwanie przed każdym zasobem.
2. **Blokada obejmuje główną domenę dostawcy** (`grobonet.com`, `www.grobonet.com`), a wszystkie sprawdzone nazwy rozwiązują się na te same adresy Cloudflare (`104.21.82.155`, `172.67.158.240`).

Wniosek: to **ustawienie na poziomie strefy dostawcy Grobonet** (systemu obsługującego według publikacji prasowych ponad 1300 cmentarzy w Polsce), a nie reguła parafii Salwator ani reguła wymierzona w ten projekt. Projekt nie jest tu celem — jest ofiarą ustawienia globalnego.

**Hipoteza (niezweryfikowana):** blokada pojawiła się 12 dni przed 1 listopada. Wyszukiwarki grobów mają w tym okresie szczyt ruchu, w tym ruchu automatycznego, a włączenie wyzwania dla wszystkich odwiedzających jest typową reakcją awaryjną na przeciążenie. Jeżeli tak jest, blokada może zostać zdjęta po okresie Wszystkich Świętych. Z tego środowiska nie da się tego potwierdzić — w sieci nie znaleziono żadnej informacji o zmianie po stronie Grobonetu.

**Czego nie udało się ustalić:** czy wyzwanie dostają wszyscy odwiedzający (wtedy przeglądarka przechodzi je automatycznie, a każdy klient bez JavaScriptu — niezależnie od adresu IP — zostaje zatrzymany), czy tylko adresy centrów danych. Wszystkie dostępne tu tory to centra danych. Od tego zależy, czy pomógłby self-hosted runner (§5, wariant F).

### 3.6. To nie jest problem kodu

- Parser się nie zmienił; zrzut regresyjny `tests/fixtures/grobonet_groby_gawin_2026-08-18.html` nadal daje poprawne rekordy.
- `npm test` → **63/63 pass**.
- Komunikat `HTTP 403 (prób: 1)` jest prawdziwy: 403 nie należy do statusów ponawianych, a awaryjny `curl` z nagłówkami przeglądarki również dostał 403 (poprawka licznika prób z analizy Dębnik działa).
- Klasyfikacja (`blocked` → błąd, bo brak flagi tolerancji) działa zgodnie z projektem.

### 3.7. Rzeczywista szkoda w danych

| Kategoria | 2026-10-19 14:31 (200) | od 2026-10-19 22:50 (403) |
|---|---|---|
| `graves` | 12 | **0** |

Grobonet jest **jedynym dostawcą kategorii `grave`**. Ostatnio znane rekordy to 12 grobów osób o nazwisku Gawin na Cmentarzu Parafialnym Kraków-Salwator (m.in. Antoni 1969, Konstanty 2007, Teresa 2013). Wyszukiwanie „Dereń” nie zwracało wyników także przed blokadą.

Wartość źródła nie leży w tych 12 rekordach — to zapisy historyczne, które się nie zmieniają — tylko w możliwości **wykrycia nowego wpisu „Helena Gawin” w bazie cmentarza, na którym są groby osób o tym nazwisku**. Główna ścieżka wykrycia (nekrologi i porządki pogrzebów z sześciu działających źródeł) nie jest naruszona. Baza grobów była zabezpieczeniem na wypadek pogrzebu, którego nie opublikuje żadne monitorowane źródło.

Sekcja „Groby monitorowanych nazwisk” pokazuje dziś „Brak grobów w bazie dla monitorowanych nazwisk.” — to **nieprawda w obecnym stanie**: groby w bazie są, tylko nie da się ich odczytać. To ten sam problem, który dla sekcji „potrzeby” rozwiązano przy wyłączeniu Dębnik (osobny komunikat, gdy kategoria nie ma czynnego dostawcy).

### 3.8. Sprawdzenie poprawności pozostałych źródeł

Przebieg diagnostyczny 2026-10-25 08:04 UTC (22 s, `DISCORD_NOTIFY_ENABLED=false`):

```text
Rows=200 deaths=10 funerals=7 intentions=0 graves=0 matches=0 healthy=6/7 blocked=1 warnings=0 status=done_with_errors
```

| Źródło | HTTP | `parser_status` | Rekordy | Ocena |
|---|---|---|---|---|
| ZCK Kraków | 200 | `empty_confirmed` | 0 | poprawnie — niedziela, wszystkie tabele z komunikatem „Brak pogrzebów”; mechanizm potwierdzonego braku działa |
| PUK Kraków | 200 | `ok` | 82 | poprawnie |
| Gabriel24 | 200 | `ok` | 12 (12/12 linków) | parser poprawny; patrz §3.9 |
| Karawan | 200 | `ok` | 6 (6/6 linków) | poprawnie; patrz §3.10 |
| **Salwator (Grobonet)** | **403** | **`blocked`** | **0** | **blokada Cloudflare** |
| Podwawelskie | 200 | `ok` | 72 | poprawnie |
| św. Jadwiga | 200 | `ok` | 30 | poprawnie — nowy adres `jadwiga.eparafia.pl` działa od poprawki z 2026-10-05 |

Kontrola jakości rekordów (wszystkie źródła): zero rekordów bez daty, zero dat zgonu z przyszłości, zero nazw z cyframi lub jednowyrazowych. Wyłączone źródła (`debniki_sdb`, `debniki_intencje`, `facebook_parafia_debniki`) pozostają wyłączone zgodnie z wcześniejszymi decyzjami.

### 3.9. Gabriel24 — dwie obserwacje poboczne (nie są przyczyną błędu)

**(a) Powtarzające się pojedyncze przeterminowania.** Ostrzeżenia Gabriel24 wystąpiły w przebiegach 2026-10-10 22:24, 2026-10-15 12:34 i 2026-10-20 22:12 — za każdym razem `1 z 2`, za każdym razem źródło odpowiedziało w następnym przebiegu. Tolerancja `NETWORK_FAIL_ALERT = 2` wdrożona po analizie z 2026-08-29 działa dokładnie tak, jak miała: żadne z tych zdarzeń nie zdegradowało statusu. Bez niej każde z nich dałoby osobny `done_with_errors`.

**(b) Strona nie publikuje nowych nekrologów od miesiąca.** Wszystkie 12 rekordów Gabriel24 ma daty zgonu 2026-09-07 – 2026-09-19 (pogrzeby do 2026-09-25) i ten sam zestaw utrzymuje się co najmniej od 2026-10-14. Sprawdzono na żywej stronie: `/nekrologi/` i strona główna `gabriel24.pl` jako najnowszą datę pokazują **25.09.2026**. To stan strony źródłowej, nie błąd parsera — historia pokazuje, że Gabriel24 i wcześniej publikował z kilkutygodniowym opóźnieniem (2026-09-30 najnowszy zgon z 2026-08-23). Model kondycji źródeł nie wykrywa sytuacji „źródło odpowiada, ale stoi w miejscu” — tu to tylko informacja, nie zalecenie zmiany.

### 3.10. Karawan / Gabriel24 — pogrzeby z terminem nie trafiają do „Najbliższych pogrzebów” (obserwacja poboczna)

`parseObituaryWidgetDetail` tworzy **jeden** rekord: `kind: 'death'`, gdy jest data zgonu, inaczej `'funeral'`. Rekord z datą zgonu i datą pogrzebu jest więc zawsze „zgonem”. Sekcja „Najbliższe pogrzeby” filtruje po `kind === 'funeral'`, a „Ostatnie zgony” po oknie `date_death` z ostatnich 7 dni.

Przykład z dzisiejszego przebiegu: **Piotr Wrzesiński** (Karawan) — zm. 2026-10-12, pogrzeb **2026-10-26 13:00**, Cmentarz Grębałów. Zgon jest poza oknem 7 dni, a rekord nie jest pogrzebem, więc **nie widać go w żadnej sekcji przeglądowej**, choć pogrzeb jest jutro. PUK tego problemu nie ma, bo tworzy dwa rekordy na osobę (zgon + pogrzeb).

Nie wpływa to na wykrywanie Heleny Gawin — trafienia (`matches`) liczone są na wszystkich rekordach niezależnie od rodzaju i okna. Dotyczy wyłącznie kompletności sekcji przeglądowych.

---

## 4. Wnioski

1. **Przyczyną `done_with_errors` jest HTTP 403 z Grobonetu (źródło `salwator_grobonet`) od przebiegu 2026-10-19 22:50 UTC** — 11 przebiegów z rzędu, bez przerwy.
2. **403 to Cloudflare Managed Challenge** włączony na całej strefie dostawcy Grobonet (także `robots.txt` i `grobonet.com`). Nie jest wymierzony w projekt ani w parafię Salwator. Żaden sprawdzony tor sieciowy ani zestaw nagłówków nie przechodzi.
3. **Komunikat ze zrzutu ekranu nie dotyczy tego błędu.** Baner liczył jedno *ostrzeżenie* — przejściowe przeterminowanie Gabriel24, które minęło w następnym przebiegu. Baner nie pokazuje błędów w ogóle, dlatego przyczyna `done_with_errors` była w nim niewidoczna, a od 2026-10-21 baner jest ukryty mimo trwającego błędu. To wada interfejsu, która wprowadziła w błąd.
4. **„Helena Gawin - brak informacji” jest stanem prawidłowym** — brak trafień; podsumowanie nie zależy od grobów.
5. **Kod nie jest przyczyną problemu.** Parser, warstwa pobierania i klasyfikacja działają zgodnie z projektem; testy 63/63.
6. **Pozostałe 6 źródeł działa poprawnie** i dostarcza rekordy dobrej jakości. Gabriel24 ma powtarzające się pojedyncze przeterminowania (poprawnie tolerowane) i od miesiąca nie publikuje nowych nekrologów (stan strony, nie parsera).
7. **Realna strata: kategoria `grave` spadła z 12 do 0** — Grobonet jest jej jedynym dostawcą. Traci się zabezpieczenie w postaci wykrycia nowego wpisu w bazie cmentarza, na którym są groby osób o nazwisku Gawin. Główna ścieżka wykrywania (nekrologi, pogrzeby) działa.
8. **Blokada jest świeża (6 dni), globalna u dostawcy i zbiega się z okresem Wszystkich Świętych** — istnieje realna szansa, że jest przejściowa, ale nie da się tego potwierdzić.

---

## 5. Rekomendacje

Uporządkowane od najwyższego stosunku korzyści do kosztu. Zgodnie z wcześniejszymi decyzjami użytkownika (analiza Dębnik, §8): zabezpieczeń nie obchodzimy, kontaktu z parafią nie podejmujemy.

### A. Oznaczyć Grobonet jako tolerowaną blokadę zewnętrzną *(rekomendacja główna, natychmiastowa)*

Dodać `external_block_tolerated: true` do definicji `salwator_grobonet` w `REQUIRED_SOURCES` (`scripts/nekrolog_core.mjs`) i — dla jawności — w `config/sources.json`.

**Uwaga wdrożeniowa:** `mergeRequiredSources` wymusza tę flagę **z definicji w kodzie** (`external_block_tolerated: r.external_block_tolerated === true`). Zmiana samego `config/sources.json` nic nie da.

Propozycja zmiany (niewdrożona):

```js
  // Od 2026-10-19 cała strefa grobonet.com stoi za Cloudflare Managed Challenge
  // (także robots.txt i strona główna dostawcy) — 403 z każdego toru sieciowego.
  // Blokada jest tolerowana przez BLOCK_TOLERANCE_DAYS, potem wraca do rangi błędu.
  { id:"salwator_grobonet", …, max_detail_pages:50, external_block_tolerated:true, ...DEFAULT_FLAGS },
```

Efekt potwierdzony symulacją `classifySourceOutcome` na rzeczywistym `data/source_health.json` (`blocked_since: 2026-10-19T22:50:50.823Z`):

| Chwila (UTC) | Bez flagi | Z flagą |
|---|---|---|
| 2026-10-25 08:00 | `error` | `warning` — „blokada anty-botowa źródła, trwa 5 dni” |
| 2026-11-02 12:00 | `error` | `warning` — „trwa 13 dni” |
| 2026-11-02 23:00 | `error` | `error` — „przekroczono próg 14 dni — źródło wymaga decyzji (przywrócenie dostępu albo enabled: false)” |

Status wraca do `done` od najbliższego przebiegu, ostrzeżenie jest widoczne w banerze i w Logu, a **2026-11-02 wieczorem status sam wróci do `done_with_errors`**, jeżeli blokada nie ustąpi. Termin wypada tuż po Wszystkich Świętych — jeśli hipoteza z §3.5 jest trafna, blokada zniknie przed eskalacją i nic więcej nie trzeba robić. Źródło pozostaje włączone, więc każdy przebieg jest zarazem sondą: zdjęcie blokady zostanie wykryte automatycznie (`blocked_since` wyzeruje się przy pierwszym udanym odczycie).

Wymagane testy: dopisać w `tests/refresh.snapshot.test.mjs` asercję `byId.salwator_grobonet.external_block_tolerated === true` obok istniejącej dla `debniki_intencje`. Żaden istniejący test nie zakłada wartości `false` dla tego źródła.

**Ryzyko psucia reszty: bardzo niskie** — to ta sama ścieżka kodu, która działała dla `debniki_intencje` w sierpniu (testy 2026-08-23: `healthy=7/8 blocked=1 warnings=1 status=done`).

### B. Poprawić baner w interfejsie *(niezależnie od A — usuwa źródło nieporozumienia)*

W `app.js`, `renderStatus`:

1. Dodać gałąź dla błędów o priorytecie **wyższym** niż ostrzeżenia, np. „Błędy źródeł: N — przebieg zakończony statusem done_with_errors. Szczegóły w sekcji Log.” z klasą `banner bad` lub `warn`.
2. Gdy są jednocześnie błędy i ostrzeżenia — podać obie liczby, żeby ostrzeżenie nie było mylone z przyczyną statusu (dokładnie sytuacja ze zrzutu).
3. Zmienić nagłówek w Logu „Ostrzeżenia (blokady zewnętrzne, nie degradują statusu)” na „Ostrzeżenia (blokady zewnętrzne lub przejściowe błędy odczytu, nie degradują statusu)” — zgodnie z treścią banera.
4. W komunikacie pustej sekcji „Groby monitorowanych nazwisk” odróżnić „źródło zablokowane / wyłączone” od „brak grobów w bazie” — analogicznie do `intentionsEmptyText` dla sekcji „potrzeby”. Informację o blokadzie da się wziąć z `job.source_diagnostics` (`parser_status === 'blocked'` dla źródła typu `grobonet_groby`).

Zmiana czysto prezentacyjna, bez wpływu na dane i status.

### C. Jeżeli blokada przetrwa próg 14 dni — wyłączyć źródło

Po eskalacji (2026-11-02) i potwierdzeniu, że 403 trwa: `enabled: false` dla `salwator_grobonet` **w obu miejscach** — `REQUIRED_SOURCES` i `config/sources.json` (przy scalaniu wartość `enabled` z zapisanej konfiguracji wygrywa nad definicją). Do tego:

- komunikat pustej sekcji grobów „brak czynnego źródła” (punkt B4),
- README §2 (kategoria `grave` bez czynnego źródła) i §3 (tabela źródeł, akapit o Grobonecie),
- test pilnujący stanu źródła, jak dla Dębnik.

Flagę `external_block_tolerated: true` zostawić, żeby ponowne włączenie było zmianą jednego pola.

### D. Sonda dostępu — tylko w połączeniu z C

Gdy źródło zostanie wyłączone, nic go już nie testuje (ta sama luka, co opisana dla Dębnik). Rozszerzyć `.github/workflows/debniki-probe.yml` o drugi krok (albo zamienić na sondę z wyborem adresu przez `workflow_dispatch.inputs`) z żądaniem `GET https://krakowsalwator.grobonet.com/grobonet/start.php?id=wyniki&name=Gawin`. Interpretacja jak dotąd: 200 → można włączyć, 403 → utrzymać wyłączenie. Przy wariancie A sonda jest zbędna — robi to zwykły przebieg.

### E. Pogrzeby z Karawana i Gabriel24 w sekcji „Najbliższe pogrzeby” *(obserwacja poboczna, niski priorytet, osobne zadanie)*

W `parseObituaryWidgetDetail`, gdy rekord ma jednocześnie datę zgonu i datę pogrzebu, zwracać dwa rekordy (zgon + pogrzeb) — tak jak robi to parser PUK. Wymaga zmiany sygnatury (parser szczegółów zwraca dziś pojedynczy wiersz, a `fetchDetailRows` zbiera po jednym) i aktualizacji testów na zrzutach Gabriel24 i Karawana. Do decyzji użytkownika — nie jest związane z bieżącym błędem.

### F. Warianty rozważone i ich ocena

| Wariant | Ocena |
|---|---|
| **Self-hosted runner** (łącze domowe) | Legalny — zmienia punkt wyjścia ruchu, niczego nie obchodzi. **Skuteczność niepewna**: w odróżnieniu od Dębnik nie ma dowodu, że jakikolwiek adres przechodzi bez JavaScriptu (wyzwanie obejmuje nawet `robots.txt`, co sugeruje wyzwanie dla wszystkich). Przed inwestycją trzeba by sprawdzić jedno żądanie `curl` z łącza domowego. |
| **Prośba do dostawcy Grobonet o regułę *Skip*** | Formalnie możliwe, ale dostawca obsługuje ponad 1300 cmentarzy i mało prawdopodobne, by robił wyjątek dla jednego bota. Wcześniej użytkownik odrzucił analogiczny kontakt z parafią Dębniki — do decyzji użytkownika. |
| **Alternatywne źródło grobów Salwatora** | Nie znaleziono. Cmentarz Salwatorski jest parafialny (zarządza nim parafia Najświętszego Salwatora), a jedyną znalezioną wyszukiwarką jego pochówków jest `krakowsalwator.grobonet.com`. ZCK zarządza cmentarzami komunalnymi, nie parafialnymi. |

### G. Czego **nie** robić — bez zmian

Podtrzymana rekomendacja E z analizy Dębnik: **nie obchodzić wyzwania Cloudflare** — bez przeglądarki headless rozwiązującej wyzwanie, usług typu „CAPTCHA solver”, rotacji proxy rezydencjalnych, podszywania się pod odcisk TLS przeglądarki ani korzystania z nieudokumentowanego API aplikacji mobilnej Grobonet. Dostawca włączył ochronę świadomie, a test z §3.5 pokazuje, że zmiana nagłówków i tak nic nie daje.

---

## 6. Ryzyka

| Ryzyko | Prawdopodobieństwo | Skutek | Ograniczenie |
|---|---|---|---|
| Blokada jest trwała | Średnie | Trwała utrata kategorii `grave` i zabezpieczenia wykrywania pochówku na Salwatorze | Wariant A eskaluje automatycznie 2026-11-02 i wymusza decyzję (C) |
| Wariant A ukrywa problem | Niskie | Status `done` mimo braku grobów | Próg 14 dni wbudowany w `classifySourceOutcome`; ostrzeżenie widoczne w banerze i Logu |
| Pogrzeb Heleny Gawin na Salwatorze bez nekrologu w żadnym monitorowanym źródle | Niskie | Brak powiadomienia w czasie blokady | Baza grobów i tak aktualizuje się z opóźnieniem po pochówku; główne wykrywanie przez 6 działających źródeł pozostaje |
| Baner nadal myli ostrzeżenie z przyczyną statusu | Wysokie bez B | Błędna diagnoza przy kolejnej awarii | Rekomendacja B |
| Gabriel24 przestaje publikować na stałe, a system tego nie zauważy | Niskie–średnie | Źródło „zdrowe”, ale bez nowych danych | Do obserwacji; ewentualny osobny wskaźnik świeżości (najnowsza data w źródle starsza niż N dni) |
| Kolejne źródło trafi pod podobne wyzwanie | Średnie — to już drugi taki przypadek w 2 miesiące | Kolejna seria `done_with_errors` | Mechanizm z wariantu A jest gotowy i działa dla każdego źródła |

---

## 7. Następne kroki

1. **Decyzja użytkownika:** wdrożyć wariant A (rekomendowany) czy od razu C (wyłączenie).
2. Wdrożyć **B** niezależnie od wyboru w kroku 1 — bez tego kolejna awaria znów będzie pokazywana przez baner tak samo mylnie jak na zrzucie.
3. Po wdrożeniu A: obserwować przebieg 2026-11-02 ~23:00 UTC. Jeżeli przed nim Grobonet zwróci 200 — nic więcej nie trzeba robić. Jeżeli status wróci do `done_with_errors` z komunikatem o przekroczeniu progu — przejść do C i D.
4. Opcjonalnie, przed decyzją o self-hosted runnerze: jedno żądanie `curl` do adresu wyszukiwania z łącza domowego, żeby sprawdzić, czy wyzwanie dotyczy wszystkich klientów, czy tylko centrów danych.
5. Rekomendacja E (pogrzeby z Karawana i Gabriel24) — osobno, jeśli użytkownik uzna ją za potrzebną.

---

## 8. Czynności wykonane podczas analizy

Na etapie analizy **nie zmieniano kodu ani konfiguracji** — zgodnie z `AGENTS.md` §1 polecenie dotyczyło analizy i propozycji rozwiązania.

- `npm ci` — instalacja zależności (`node_modules/` jest w `.gitignore`).
- `npm test` — 63/63 pass.
- `node scripts/refresh_static.mjs` z `DISCORD_NOTIFY_ENABLED=false` — przebieg diagnostyczny. Nadpisane pliki w `data/` **przywrócono do stanu z repozytorium** (`git checkout -- data/`). Żadne powiadomienie Discord nie zostało wysłane.
- Symulacja `classifySourceOutcome` z flagą `external_block_tolerated` — wyłącznie w pamięci, bez zapisu plików.
- Sondowanie sieciowe (`curl`, `fetchText` projektu) — wyłącznie żądania `GET`, po 1–2 na adres.

---

## 9. Zmiany wykonane w kodzie — wdrożenie wariantu A (2026-10-25)

Prompt użytkownika:

```text
Wdrażamy wariant A. Za 2-3tyg sprawdzimy czy blokada jest stała po stronie źródła.
```

Wdrożono wyłącznie rekomendację **A**. Rekomendacje B (baner), C/D (wyłączenie i sonda) oraz E (pogrzeby z Karawana i Gabriel24) **nie zostały wdrożone**.

### Plik: `scripts/nekrolog_core.mjs`

Lokalizacja: linie 19–25, tablica `REQUIRED_SOURCES`, wpis `salwator_grobonet`

Było:

```js
  // odpytywane w bazie; przy zmianie monitorowanej osoby aktualizuj je razem z Frazy.json.
  { id:"salwator_grobonet", …, search_terms:["Gawin","Dereń"], max_detail_pages:50, ...DEFAULT_FLAGS },
```

Jest:

```js
  // odpytywane w bazie; przy zmianie monitorowanej osoby aktualizuj je razem z Frazy.json.
  // Od 2026-10-19 cała strefa grobonet.com (także robots.txt i strona dostawcy) stoi za
  // Cloudflare Managed Challenge — HTTP 403 z każdego toru sieciowego. Blokada dotyczy
  // wszystkich klientów dostawcy, nie tego projektu, i może być przejściowa (szczyt ruchu
  // przed 1 listopada), więc jest tolerowana przez BLOCK_TOLERANCE_DAYS, a potem wraca
  // do rangi błędu i wymaga decyzji: przywrócenie dostępu albo enabled: false.
  { id:"salwator_grobonet", …, search_terms:["Gawin","Dereń"], max_detail_pages:50, external_block_tolerated:true, ...DEFAULT_FLAGS },
```

To jedyna zmiana działająca: `mergeRequiredSources` bierze wartość flagi z definicji w kodzie.

### Plik: `config/sources.json`

Lokalizacja: linia 75, obiekt `"id": "salwator_grobonet"`

Było: `"external_block_tolerated": false` jako ostatnie pole obiektu.

Jest: `"external_block_tolerated": true` po `"max_detail_pages": 50`. To kolejność, w jakiej przebieg sam zapisuje scalone źródło. Sprawdzono, że kolejny przebieg nie zmienia już pliku, więc bot nie wygeneruje zmiany kosmetycznej w pierwszym commicie danych.

### Plik: `tests/refresh.snapshot.test.mjs`

Lokalizacja: linie 245–260, nowy test po `źródła bez dostępu i bez wartości danych są wyłączone w definicji`

Było: brak testu dla Grobonetu.

Jest:

```js
test('Grobonet Salwator: blokada Cloudflare jest ostrzeżeniem tylko do progu tolerancji', () => {
  const merged = mergeRequiredSources([{ id: 'salwator_grobonet', type: 'grobonet_groby', external_block_tolerated: false }]);
  const source = merged.find((s) => s.id === 'salwator_grobonet');
  assert.equal(source.enabled, true);
  assert.equal(source.external_block_tolerated, true);

  const parsed = { rows: [], error: 'HTTP 403 (prób: 1)', diagnostics: { http_status: 403, parser_status: 'blocked' } };
  const health = { blocked_since: '2026-10-19T22:50:50.823Z' };
  const at = (iso) => classifySourceOutcome({ source, parsed, health, toleranceDays: 14, now: Date.parse(iso) }).kind;
  assert.equal(at('2026-10-25T08:00:00Z'), 'warning');
  assert.equal(at('2026-11-02T12:00:00Z'), 'warning');
  assert.equal(at('2026-11-02T23:00:00Z'), 'error');
});
```

Test sprawdza cały łańcuch: definicja → scalenie z konfiguracją, w której zapisano `false` → klasyfikacja przed progiem i po nim. Sprawdzono, że wykrywa błąd: po cofnięciu samej zmiany w `nekrolog_core.mjs` kończy się `not ok`.

### Plik: `README.md`

- Linia 55 (§3, tabela źródeł): dopisano, że źródło jest od 2026-10-19 zablokowane przez Cloudflare, a blokada jest tolerowana.
- Linia 64 (§3, uwaga o Grobonecie): dopisano opis blokady (cała strefa `grobonet.com`, także `robots.txt`), zasadę nieobchodzenia zabezpieczeń, działanie progu 14 dni i decyzję po jego przekroczeniu oraz to, że kategoria `grave` nie ma do tego czasu danych.
- Linia 156 (§8, „Błąd a ostrzeżenie”): dopisano, które źródła mają flagę, i że jej wartość ustala definicja w kodzie, a nie `config/sources.json`.

### Plik: `Instrukcja_odczytu_zrodel_Nekrolog.md`

Lokalizacja: linia 22, §0, wiersz `salwator_grobonet`

Było: tylko uwaga o wyszukiwarce grobów i nieaktualnym adresie w §4.

Jest: dopisano blokadę Cloudflare od 2026-10-19, tolerancję 14 dni, zasadę nieobchodzenia zabezpieczeń i datę uzupełnienia wpisu.

### Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| `npm test` | **64/64 pass** (63 przed zmianą + 1 nowy) |
| Nowy test bez zmiany w `nekrolog_core.mjs` | `not ok` — test wykrywa brak flagi |
| Przebieg na żywych źródłach, `DISCORD_NOTIFY_ENABLED=false` | `healthy=6/7 blocked=1 warnings=1 status=done`, `error_message: null` |
| `warning_message` | `Kraków Salwator – Groby (Grobonet): HTTP 403 (prób: 1) — blokada anty-botowa źródła, trwa 5 dni` |
| `data/errors.json` | 0 błędów, 1 ostrzeżenie |
| Stabilność `config/sources.json` | drugi przebieg nie zmienia pliku |

Pliki w `data/` przywrócono do stanu z repozytorium. Zaktualizuje je najbliższy przebieg harmonogramu. Żadne powiadomienie Discord nie zostało wysłane.

### Co zobaczy interfejs

- Od najbliższego przebiegu harmonogramu status wraca do `done`. Baner pokazuje „Źródła z ostrzeżeniem (blokada zewnętrzna lub przejściowy błąd odczytu): 1”, a sekcja Log podaje Grobonet z liczbą dni blokady.
- Sekcja „Groby monitorowanych nazwisk” pozostaje pusta z dotychczasowym komunikatem. Poprawka komunikatu to rekomendacja B4, niewdrożona.

### Uwaga o terminie kontroli

Plan użytkownika to kontrola **za 2–3 tygodnie** (ok. 2026-11-08 – 2026-11-15). Próg tolerancji liczy się jednak od `blocked_since` (2026-10-19 22:50 UTC), więc jeśli blokada nie ustąpi, **status wróci do `done_with_errors` ok. 2026-11-02 23:00 UTC**, czyli przed planowaną kontrolą. Komunikat będzie wtedy jednoznaczny („przekroczono próg 14 dni — źródło wymaga decyzji”). To zamierzone działanie wariantu A, a nie nowa awaria.

Jeżeli ponowny `done_with_errors` przed kontrolą jest niepożądany, można dodać próg tolerancji dla pojedynczego źródła (np. pole `block_tolerance_days` w definicji, odczytywane w `classifySourceOutcome` zamiast globalnego `BLOCK_TOLERANCE_DAYS`). Nie zostało to wdrożone, bo wykracza poza zatwierdzony wariant A.
