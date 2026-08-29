# Analiza: nowa przyczyna statusu `done_with_errors` (Gabriel24) oraz wykonalność odczytu intencji z Dębnik

Data analizy: 2026-08-29
Temat analizy: Ustalenie przyczyny statusu `done_with_errors` w przebiegu z 2026-08-28 19:24 UTC oraz sprawdzenie, czy da się przywrócić odczyt ze strony `https://debniki.sdb.org.pl/intencje/`.

Analiza uzupełnia wcześniejszy dokument `Analizy/analiza-status-done-with-errors-cloudflare-debniki.md`. Tamta analiza dotyczyła **innej** przyczyny tego samego statusu (blokada Cloudflare na Dębnikach) i została zamknięta wyłączeniem obu źródeł Dębnik. Bieżący `done_with_errors` **nie ma z nią związku**.

---

## 1. Oryginalny pełny prompt użytkownika

```text
przeprowadź analizę działania aplikacji. Zaczęła zwracać "done_with_errors". Dodatkowo sprawdź czy da się włączyć odczyt ze strony https://debniki.sdb.org.pl/intencje/
```

---

## 2. Zakres analizy

- Ustalenie bezpośredniej przyczyny statusu `done_with_errors` w ostatnim zapisanym przebiegu.
- Odróżnienie awarii jednorazowej od regresji kodu — weryfikacja przez uruchomienie pełnego przebiegu na żywych źródłach.
- Przegląd historii statusów w `data/job.json` (40 commitów) pod kątem powtarzalności.
- Ocena kosztu czasowego ścieżki błędu w `scripts/fetch.mjs` i ryzyka dla limitu `timeout-minutes: 20` w workflow.
- Sprawdzenie, czy parser `debniki_intencje` nadal pasuje do żywej strony.
- Sprawdzenie, czy blokada Cloudflare na `debniki.sdb.org.pl` nadal obowiązuje i od czego zależy.
- Sformułowanie rekomendacji bez ingerencji w kod (zgodnie z `AGENTS.md` §1 — polecenie dotyczy analizy, nie zmiany kodu).

Poza zakresem: zmiany w kodzie, zmiany konfiguracji źródeł, wysyłka powiadomień Discord (przebieg diagnostyczny uruchomiono z `DISCORD_NOTIFY_ENABLED=false`, pliki w `data/` przywrócono do stanu z repozytorium).

---

## 3. Ustalenia

### 3.1. Bezpośrednia przyczyna: przeterminowanie połączenia do Gabriel24

Przebieg z 2026-08-28 19:24:38 UTC (commit `6b37fc3`, `"trigger": "schedule"`) zapisał:

```json
"status": "done_with_errors",
"sources_total": 7,
"sources_healthy": 6,
"sources_blocked": 0,
"rows_total": 207
```

Jedyny wpis w `source_errors`:

| Pole | Wartość |
|---|---|
| `source_id` | `gabriel_nekrologi` |
| `url` | `https://www.gabriel24.pl/nekrologi/` |
| `http_status` | `0` |
| `parser_status` | `http_error` |
| `error` | `fetch: The operation was aborted.; curl: … curl: (28) Connection timed out after 20002 milliseconds (prób: 3)` |

To **przeterminowanie połączenia na poziomie sieci**, a nie odpowiedź serwera: `http_status: 0` oznacza, że żadna odpowiedź HTTP nie dotarła. Nie jest to ani blokada anty-botowa (`403`, `parser_status: 'blocked'`), ani regresja parsera (`parser_broken`), ani cicha pustka (`empty_streak`).

Ścieżka od błędu do statusu jest jednoznaczna:

1. `parseByListAndDetails` (`scripts/nekrolog_core.mjs:144-145`) — `fetchText` zwraca `ok:false`, więc źródło kończy się z `error`.
2. `classifySourceOutcome` (`scripts/nekrolog_core.mjs:614`) — gałąź `if(parsed.error) return {kind:'error', …}`. Źródło **nie** ma `external_block_tolerated`, więc nie ma ścieżki ostrzeżenia.
3. `resolveJobOutcome` (`scripts/nekrolog_core.mjs:575`) — `if(errors.length) return {status:'done_with_errors', ok:true, …}`.

**Jeden błąd sieciowy na jednym z siedmiu źródeł degraduje status całego przebiegu.** To zachowanie zgodne z projektem, nie usterka — ale patrz §3.5.

### 3.2. To awaria jednorazowa, nie regresja — weryfikacja na żywych źródłach

Uruchomiono pełny przebieg diagnostyczny w dniu 2026-08-29 06:22 UTC (`DISCORD_NOTIFY_ENABLED=false`):

```text
Rows=196 deaths=7 funerals=1 intentions=0 graves=12 matches=0 healthy=7/7 blocked=0 warnings=0 status=done
```

Gabriel24 odpowiedział poprawnie i dostarczył 12 rekordów (`http_ok: true`, `empty_streak: 0`). Kontrolne `curl` na `https://www.gabriel24.pl/nekrologi/` zwróciło **HTTP 200, 124 377 B, w 1,36 s**.

Testy jednostkowe: `npm test` → **50/50 pass**, zero regresji.

### 3.3. Historia statusów potwierdza jednorazowość

Przegląd 40 commitów `data/job.json`:

| Okres | Status | Źródła w `source_errors` |
|---|---|---|
| 2026-08-09 → 2026-08-17 | `done_with_errors` (18 przebiegów) | `debniki_sdb` (+ pojedynczo `zck_funerals`, `salwator_grobonet`) |
| 2026-08-18 → 2026-08-23 rano | `done_with_errors` (11 przebiegów) | `debniki_sdb`, `debniki_intencje` |
| 2026-08-23 wieczór → 2026-08-28 rano | **`done`** (9 przebiegów z rzędu) | — |
| **2026-08-28 19:24** | **`done_with_errors`** | **`gabriel_nekrologi`** |

Seria dziewięciu czystych przebiegów po wyłączeniu Dębnik (commit `1d7dca9`) dowodzi, że poprzednia przyczyna została skutecznie usunięta. Gabriel24 nie pojawił się w `source_errors` **ani razu** w całej badanej historii — wystąpienie z 2026-08-28 jest pierwsze i jak dotąd jedyne.

**Wniosek:** aplikacja nie „zaczęła zwracać `done_with_errors`” w sensie trwałej zmiany zachowania. Wystąpił pojedynczy incydent sieciowy, który już się zakończył. Formalnie stan jest samoistnie naprawiony.

### 3.4. Koszt czasowy ścieżki błędu — ustalenie istotniejsze niż sam incydent

Znaczniki czasu z `job.json` pokazują, ile kosztowała jedna nieudana próba odczytu jednego adresu:

| Odcinek | Czas |
|---|---|
| Odczyt listy Gabriel24 (19:21:17 → 19:24:19) | **182,9 s** |
| Cały przebieg (19:21:12 → 19:24:38) | 205,9 s |

Nieudany odczyt jednego URL-a pochłonął **89 % czasu całego przebiegu**. Wynika to z konstrukcji `scripts/fetch.mjs`:

- `attemptOnce` przy przeterminowaniu `node-fetch` (20 s) wchodzi w blok `catch` i wykonuje **dwa kolejne** wywołania `curl`, każde z własnym `--max-time 20` — zwykłe i z nagłówkami przeglądarkowymi. Jedna „próba” to więc **do 60 s i trzy wywołania sieciowe**.
- `fetchText` powtarza to do trzech razy (opóźnienia 700 ms i 2000 ms).
- Razem: **do ~183 s i do 9 wywołań sieciowych na jeden adres**. Zmierzone 182,9 s odpowiada temu maksimum co do sekundy.

Dwie obserwacje wynikające z tej arytmetyki:

**(a) Awaryjne wywołania `curl` nie mają zastosowania do przeterminowania.** Ich sens to obejście odrzucenia po nagłówkach (`403`) — przy zerwaniu na poziomie połączenia idą tą samą drogą sieciową i powtarzają ten sam wynik. Przy `curl: (28)` potrajają koszt, nie zwiększając szans powodzenia.

**(b) Opóźnienia ponowień są nieadekwatne do przyczyny.** 700 ms i 2000 ms to skala właściwa dla chwilowego `503`. Host, który przestał odpowiadać (przeciążenie albo ograniczanie ruchu po adresie IP), po 0,7 s zachowa się identycznie — co potwierdziły wszystkie trzy próby zakończone tym samym `curl: (28)`.

### 3.5. Ryzyko systemowe: limit `timeout-minutes: 20` jest osiągalny

To najpoważniejsze ustalenie analizy — dotyczy nie tego, co się stało, lecz tego, co może się stać przy nieco gorszym przebiegu tej samej awarii.

`.github/workflows/nekrolog-refresh.yml` ustawia `timeout-minutes: 20`. Zestawienie z kosztem z §3.4:

| Scenariusz | Szacowany czas | Skutek |
|---|---|---|
| Odczyt listy nie działa na wszystkich 7 źródłach | 7 × 183 s ≈ **21,4 min** | **Przekroczenie limitu** |
| Lista Gabriel24 działa, ale strony szczegółowe są powolne (`max_detail_pages: 50`, pętla sekwencyjna, `scripts/nekrolog_core.mjs:149`) | do 50 × 183 s ≈ **152 min** | **Wielokrotne przekroczenie limitu** |

Zdarzenie z 2026-08-28 zatrzymało się na wariancie najłagodniejszym, bo padł **adres listy** — a wtedy `parseByListAndDetails` kończy źródło natychmiast (`return` w linii 145) i pętla po stronach szczegółowych nigdy się nie uruchamia. Gdyby lista odpowiedziała, a spowolnienie dotknęło stron szczegółowych, przebieg zostałby przerwany przez GitHub Actions.

Skutki przerwania limitem są **istotnie gorsze** niż `done_with_errors`:

- krok `npm run refresh` ginie przed zapisem plików — `data/latest.json`, `data/job.json` i `data/errors.json` **nie są aktualizowane**;
- krok „Commit refreshed data” nie wykonuje się — brak commitu, interfejs pokazuje dane sprzed 12 godzin **bez żadnego śladu awarii**;
- `notifyCzerwonaHelena` nie zostaje wywołane — **nie ma ani alertu, ani heartbeatu**. Cisza na Discordzie jest nieodróżnialna od przebiegu bez trafień.

Innymi słowy: obecny status `done_with_errors` jest zachowaniem *poprawnym* — system zgłasza awarię. Ryzykiem jest sąsiedni scenariusz, w którym system **nie zgłosi niczego**.

### 3.6. Brak rozróżnienia awarii przejściowej od trwałej dla błędów sieciowych

Projekt ma już wypracowane rozróżnienie „ostrzeżenie kontra błąd”, ale wyłącznie dla blokad anty-botowych (`external_block_tolerated`, `blocked_since`, `BLOCK_TOLERANCE_DAYS = 14`) oraz dla ciszy parsera (`empty_streak`, `EMPTY_STREAK_ALERT = 3`). Błąd sieciowy nie ma odpowiednika: `classifySourceOutcome` traktuje pierwsze przeterminowanie i dziesiąte z rzędu dokładnie tak samo — jako `error`.

Konsekwencja praktyczna: status `done_with_errors` przestaje odróżniać „internet mrugnął” od „źródło padło na stałe”, czyli dokładnie ten problem, który poprzednia analiza rozwiązała dla Dębnik (§3.2 tamtego dokumentu: „status przestawał odróżniać regresję od normy”).

### 3.7. Stan pozostałych źródeł

Przebieg z 2026-08-29 06:22 UTC, wszystkie źródła `http_ok: true`, `blocked_since: null`:

| Źródło | Rekordy | Stan |
|---|---|---|
| ZCK Kraków | 0 | `last_confirmed_empty_run` ustawione — potwierdzony brak pogrzebów (sobota). Mechanizm z etapu 2 poprzedniej analizy działa poprawnie: `empty_streak: 0`, brak fałszywego alarmu |
| PUK Kraków | 64 | ok |
| Gabriel24 | 12 | ok — źródło wróciło |
| Karawan | 6 | ok |
| Salwator (Grobonet) | 12 | ok |
| Podwawelskie | 72 | ok |
| św. Jadwiga | 30 | ok |

Trafień fraz monitorowanych: 0. Suma po scaleniu duplikatów: 196 rekordów.

---

## 4. Dębniki – intencje mszalne: czy da się włączyć odczyt

### 4.1. Parser jest sprawny — to nie jest problem kodu

Uruchomiono `parseSource` dla definicji `debniki_intencje` na **żywej stronie** (2026-08-29):

```text
error: null   diagnostics: {"http_status":200,"accepted_rows":29,"parser_status":"ok"}
```

29 rekordów, poprawnie rozpoznane daty i godziny, struktura strony niezmieniona od czasu wyłączenia źródła. Przykłady:

```text
2026-08-24 07:00 | Tadeusz Leyko
2026-08-25 18:00 | Maria Miodek w 4 r. śm. ze wspomnieniem Mieczysław i Krystyna Miodek
2026-08-26 08:00 | Zbigniew Figiel w 5 r. śm.
```

Rozkład tygodniowy — strona publikuje harmonogram od niedzieli do niedzieli:

| Data | 08-23 | 08-24 | 08-25 | 08-26 | 08-27 | 08-28 | 08-29 | 08-30 |
|---|---|---|---|---|---|---|---|---|
| Intencje | 3 | 3 | 4 | 4 | 3 | 6 | 2 | 4 |

W oknie `[dziś, dziś+7]` mieściłoby się dziś 6 rekordów — ale **wartość źródła leży gdzie indziej**: `matches` liczone są na wszystkich rekordach niezależnie od okna (`scripts/refresh_static.mjs`, sekcja „Trafienia liczone na WSZYSTKICH rekordach”), więc źródło dostarcza **~29 nazwisk tygodniowo do dopasowania fraz**. To jedyny dostawca kategorii `intention` — po jego wyłączeniu sekcja „potrzeby” jest trwale pusta.

**Wniosek cząstkowy: gdyby odczyt był możliwy, włączenie źródła to zmiana jednego pola (`enabled: false` → `true`) i nic więcej.** Definicja, flaga `external_block_tolerated`, parser i testy są na miejscu.

### 4.2. Blokada Cloudflare nadal obowiązuje i nadal zależy wyłącznie od adresu IP

Powtórzono test kontrolowany z §3.3 poprzedniej analizy — ten sam URL, dwa różne tory wyjścia sieciowego:

| Tor wyjścia | User-Agent | Wynik |
|---|---|---|
| `curl` przez proxy kontenera | `Mozilla/5.0 … Chrome/124.0` (pełne nagłówki przeglądarkowe) | **HTTP 403**, 5 628 B, `<title>Just a moment...</title>` |
| `node-fetch` bezpośrednio (`scripts/fetch.mjs`) | `nekrolog-refresh-bot/1.0` (nagłówek bota) | **HTTP 200**, 65 497 B realnej treści, 1 próba |

Wynik jest identyczny jak sześć dni wcześniej i równie kontrintuicyjny: żądanie z nagłówkiem bota przechodzi, żądanie udające przeglądarkę zostaje odrzucone. **Zmienną decydującą jest wyłącznie reputacja adresu IP.** Manipulacja nagłówkami jest bezskuteczna — co ponownie potwierdza rekomendację E poprzedniej analizy.

Powtórzono też sondowanie ścieżek alternatywnych (tor zablokowany):

| Ścieżka | Wynik |
|---|---|
| `/robots.txt` | **200** |
| `/`, `/intencje`, `/intencje/` | 403 |
| `/feed`, `/feed/`, `/intencje/feed/`, `/?feed=rss2` | 403 |
| `/sitemap.xml`, `/wp-sitemap.xml`, `http://…/sitemap_index.xml` | 403 |
| `/wp-json/wp/v2/pages?search=intencje` | 403 |

Bez zmian: nie istnieje otwarta, maszynowo czytelna ścieżka alternatywna. Wyzwanie obejmuje HTML, XML i JSON.

### 4.3. Polityka `robots.txt` nie zabrania tego odczytu

Odczytana dziś treść `robots.txt` (sekcja zarządzana przez Cloudflare):

```text
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: Amazonbot        Disallow: /
User-agent: Applebot-Extended Disallow: /
User-agent: Bytespider       Disallow: /
User-agent: CCBot            Disallow: /
User-agent: ClaudeBot        Disallow: /
User-agent: GPTBot           Disallow: /
User-agent: Google-Extended  Disallow: /
User-agent: meta-externalagent Disallow: /
```

Interpretacja istotna dla decyzji:

- Reguła ogólna dla `User-agent: *` to `Allow: /` — **odczyt strony przez zwykłego klienta nie jest zabroniony polityką strony**. Zakazy imienne dotyczą crawlerów trenujących modele; `nekrolog-refresh-bot/1.0` do tej grupy nie należy i nie realizuje żadnego z zakazanych zastosowań (`ai-train=no` jest respektowane — dane nie służą trenowaniu, tylko wyświetleniu listy i dopasowaniu fraz).
- Przeszkodą **nie jest więc wola właściciela wyrażona w `robots.txt`**, tylko generyczna heurystyka reputacji IP w Cloudflare, która nie odróżnia tego ruchu (2 żądania na dobę) od skanowania masowego.

Nie zmienia to jednak wniosku o obchodzeniu zabezpieczenia: właściciel włączył Managed Challenge świadomie i to on jest wiążącą deklaracją na poziomie dostępu.

### 4.4. Czego **nie udało się** ustalić

Środowisko tej analizy nie pozwala sprawdzić, czy blokada nadal obejmuje **adresy wyjściowe runnerów GitHub Actions**. Ostatni faktyczny dowód pochodzi z 2026-08-23 (`403` w `source_errors`), czyli sprzed sześciu dni. Od czasu wyłączenia źródła nic tego nie testuje — parser nie jest uruchamiany, więc ewentualne zdjęcie blokady przeszłoby niezauważone.

Reputacja adresów IP w Cloudflare jest wielkością zmienną w czasie i zarządzaną po stronie usługodawcy. **Założenie, że blokada trwa, jest dziś nieudokumentowane.** Przed jakąkolwiek decyzją należy je zweryfikować — patrz rekomendacja C.

---

## 5. Wnioski

1. **Status `done_with_errors` z 2026-08-28 ma nową, jednorazową przyczynę: przeterminowanie połączenia do `gabriel24.pl`.** Nie ma związku z Dębnikami ani z jakąkolwiek zmianą w kodzie.
2. **Awaria już minęła.** Przebieg z 2026-08-29 daje `status=done`, `healthy=7/7`, Gabriel24 odpowiada w 1,36 s. Testy: 50/50.
3. **Zachowanie systemu było poprawne** — awaria została wykryta, zgłoszona i opisana, a pozostałe 6 źródeł dostarczyło 207 rekordów.
4. **Realnym problemem nie jest ten status, lecz koszt ścieżki błędu.** Jeden niedostępny adres pochłania do 183 s i 9 wywołań sieciowych; przy niedostępnych stronach szczegółowych przebieg przekroczyłby limit 20 minut i **nie zapisałby ani danych, ani statusu, ani heartbeatu** — awaria stałaby się niewidoczna.
5. **Błędy sieciowe nie mają rozróżnienia „przejściowe / trwałe”**, choć blokady anty-botowe i cisza parsera już je mają. Pierwsze mrugnięcie sieci degraduje status tak samo jak trwały upadek źródła.
6. **Parser intencji Dębnik jest sprawny** — 29 rekordów z żywej strony, `parser_status: ok`. Włączenie źródła to zmiana jednego pola.
7. **Jedyną przeszkodą pozostaje reputacja adresu IP w Cloudflare**, potwierdzona dziś testem kontrolowanym. Nagłówki nie mają znaczenia, ścieżek alternatywnych brak, a `robots.txt` tego odczytu nie zabrania.
8. **Nie wiadomo, czy blokada nadal dotyczy runnerów GitHub Actions** — od 2026-08-23 nic tego nie sprawdza.

---

## 6. Rekomendacje

Uporządkowane według stosunku korzyści do kosztu.

### A. Ograniczyć koszt ścieżki błędu w `scripts/fetch.mjs` *(rekomendacja główna)*

Cel: żaden pojedynczy niedostępny adres nie może zagrozić budżetowi 20 minut.

- **Pomijać awaryjne `curl` przy błędach połączenia.** Uruchamiać je wyłącznie tam, gdzie mają sens — po odpowiedzi `403` lub statusie przejściowym. Przy `AbortError` / `ETIMEDOUT` / `ECONNRESET` przejść od razu do ponowienia. Efekt: koszt próby spada z ~60 s do ~20 s, czyli trzykrotnie.
- **Wprowadzić budżet czasowy na źródło** (np. 120 s) sprawdzany w pętli stron szczegółowych w `parseByListAndDetails`. Po jego wyczerpaniu przerwać pętlę i zwrócić rekordy już zebrane wraz z diagnostyką `partial: true`. Dane częściowe są warte więcej niż przebieg ubity limitem.
- **Wydłużyć opóźnienia ponowień** przy błędach połączenia (np. 2 s i 8 s zamiast 0,7 s i 2 s). Ponowienie po 700 ms wobec hosta, który nie odpowiada, jest wywołaniem straconym.

### B. Nadać błędom sieciowym tolerancję analogiczną do blokad anty-botowych

Dodać w `data/source_health.json` licznik `fail_streak` per źródło i w `classifySourceOutcome` zwracać dla błędu sieciowego (`http_status: 0`) `kind: 'warning'` przy pierwszym wystąpieniu, a `kind: 'error'` od drugiego lub trzeciego z rzędu. Wzorzec i testy już istnieją — to rozszerzenie mechanizmu `blocked_since`, nie nowa konstrukcja.

Efekt: przebieg z 2026-08-28 zakończyłby się statusem `done` z ostrzeżeniem widocznym w `warning_message` i w sekcji Log interfejsu, a trwała awaria Gabriel24 nadal eskalowałaby do `done_with_errors` po pół doby. Status odzyskuje funkcję sygnału.

### C. Zweryfikować blokadę Dębnik z runnera przed jakąkolwiek decyzją *(warunek wstępny dla D)*

Dodać jednorazowy workflow diagnostyczny uruchamiany wyłącznie ręcznie (`workflow_dispatch`), który wykonuje jedno żądanie do `https://debniki.sdb.org.pl/intencje/` i wypisuje kod odpowiedzi w logu. Bez commitu, bez Discorda, bez zmian w `data/`.

Uzasadnienie: to jedyny sposób zamknięcia luki z §4.4 przy koszcie jednego żądania HTTP. Wynik rozstrzyga wprost:

- **HTTP 200** → blokada zdjęta; przejść do rekomendacji D.
- **HTTP 403** → blokada trwa; utrzymać `enabled: false` i przejść do wariantów C1–C4 z poprzedniej analizy (prośba do parafii o regułę *Skip* w Cloudflare, self-hosted runner, źródło alternatywne, akceptacja utraty).

### D. Włączyć źródło wyłącznie po potwierdzeniu dostępu

Jeżeli rekomendacja C da HTTP 200:

1. `debniki_intencje.enabled` → `true` w `scripts/nekrolog_core.mjs` (`REQUIRED_SOURCES`) **i** w `config/sources.json`.
2. **Zachować `external_block_tolerated: true`** — przy nawrocie blokady źródło da ostrzeżenie, a nie błąd, i status pozostanie `done` przez 14 dni tolerancji.
3. Zaktualizować README §3 (tabela źródeł i akapit o Dębnikach) oraz komunikat pustej sekcji w `app.js` — po włączeniu źródła `hasIntentionSource` przestanie być `false` i komunikat wróci do wersji o oknie czasowym automatycznie.
4. Uruchomić `npm test` i jeden przebieg z `DISCORD_NOTIFY_ENABLED=false`.

### E. Czego **nie** robić — bez zmian

Podtrzymana rekomendacja E poprzedniej analizy: **nie implementować obchodzenia wyzwania Cloudflare** — headless browser rozwiązujący challenge, usługi typu „CAPTCHA solver”, rotacja proxy rezydencjalnych, podszywanie się pod odcisk TLS przeglądarki. Test z §4.2 ponownie dowiódł, że manipulacja nagłówkami i tak jest nieskuteczna, a właściciel strony włączył ochronę świadomie.

Wariant „self-hosted runner” do tej kategorii **nie** należy — zmienia punkt wyjścia ruchu na taki, który Cloudflare przepuszcza, i niczego nie obchodzi.

---

## 7. Ryzyka

| Ryzyko | Prawdopodobieństwo | Skutek | Ograniczanie |
|---|---|---|---|
| Powtórka przeterminowania na źródle ze stronami szczegółowymi → przebieg ubity limitem 20 min, brak danych, brak heartbeatu, awaria niewidoczna | Średnie — hosty nekrologowe bywają przeciążone, a `max_detail_pages` wynosi 50 | Wysoki: cisza nieodróżnialna od braku trafień | Rekomendacja A (budżet na źródło) |
| Gabriel24 zaczyna ograniczać ruch po adresie IP na stałe (jak Dębniki) | Niskie — jeden incydent, brak wcześniejszych | Utrata jednego z siedmiu źródeł | Rekomendacja B ujawni trend zamiast pojedynczych alertów |
| „Zmęczenie alertem”: `done_with_errors` przy każdym mrugnięciu sieci przestaje być czytany | Wysokie przy obecnym zachowaniu | Realna regresja przeoczona wśród szumu | Rekomendacja B |
| Blokada Dębnik zostaje zdjęta, a nikt tego nie zauważy — źródło jest wyłączone, więc nic go nie testuje | Średnie | Trwale pusta sekcja „potrzeby” mimo dostępnych danych | Rekomendacja C, powtarzana okresowo |
| Włączenie źródła bez weryfikacji z §4.4 | — | Powrót do serii `done_with_errors`, choć tolerancja z §D2 by to przykryła na 14 dni | Rekomendacja C jako warunek wstępny |

---

## 8. Następne kroki

1. **Nie podejmować działań naprawczych wobec Gabriel24** — awaria minęła, źródło działa, status wróci do `done` w najbliższym przebiegu (07:00 UTC). *(bez kosztu)*
2. Zrealizować **rekomendację A** — pominięcie `curl` przy błędach połączenia i budżet czasowy na źródło. *(największa redukcja ryzyka na jednostkę pracy)*
3. Zrealizować **rekomendację B** — `fail_streak` i ostrzeżenie zamiast błędu przy pierwszym niepowodzeniu sieciowym.
4. Zrealizować **rekomendację C** — jednorazowa sonda z runnera do Dębnik; wynik rozstrzyga o dalszej ścieżce.
5. Zależnie od wyniku kroku 4: **rekomendacja D** (włączenie źródła) albo powrót do wariantów C1–C4 poprzedniej analizy.

---

## 9. Zmiany wykonane w kodzie

**Brak.** Zgodnie z `AGENTS.md` §1 polecenie użytkownika dotyczyło analizy, a nie zmiany kodu. Rekomendacje A–D pozostają do zatwierdzenia przed implementacją.

Czynności wykonane w środowisku i ich odwrócenie:

- `npm ci` — instalacja zależności (`node_modules/` jest w `.gitignore`).
- `npm test` — 50/50 pass, bez zmian w plikach.
- `node scripts/refresh_static.mjs` z `DISCORD_NOTIFY_ENABLED=false` — przebieg diagnostyczny. Nadpisane pliki `data/latest.json`, `data/job.json`, `data/errors.json`, `data/source_health.json` **przywrócono do stanu z repozytorium** (`git checkout -- data/ config/`). Żadne powiadomienie Discord nie zostało wysłane.
- Sondowanie sieciowe (`curl`, `node-fetch`) — wyłącznie żądania odczytu `GET`, po 1–3 na adres.
