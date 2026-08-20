# Analiza: przyczyna statusu `done_with_errors`

- **Data analizy:** 2026-08-20
- **Temat:** Przyczyna statusu przebiegu `done_with_errors` w projekcie Nekrolog oraz ocena możliwości naprawy bez naruszenia działającej części pipeline'u
- **Gałąź robocza:** `claude/nekrolog-done-with-errors-ib9uly`
- **Stan repo w chwili analizy:** commit `08c26ba` („Refresh Nekrolog data”)

---

## 1. Oryginalny prompt użytkownika

> Zapoznaj się z repo "Nekrolog".  Zwrócił status: "done_with_errors". Sprawdź przyczynę i przeprowadź analizę co jest przyczyną i czy można to jakoś naprawić bez psucia reszty.

---

## 2. Zakres analizy

- Odczyt `data/job.json`, `data/errors.json`, `data/source_health.json`, `data/latest.json`.
- Prześledzenie historii statusu przebiegu w 47 commitach dotykających `data/job.json`.
- Analiza kodu: `scripts/refresh_static.mjs`, `scripts/nekrolog_core.mjs` (`resolveJobOutcome`, parsery Dębniki), `scripts/fetch.mjs`.
- Weryfikacja na żywych źródłach: sondowanie `debniki.sdb.org.pl` różnymi nagłówkami, ścieżkami i torami sieciowymi.
- Uruchomienie pełnego zestawu testów (`npm test`) w celu ustalenia stanu bazowego.
- Ocena wpływu awarii na dane prezentowane w UI i na powiadomienia Discord.

**Poza zakresem:** zmiany w kodzie (analiza jest wyłącznie diagnostyczna, zgodnie z pkt. 1 `AGENTS.md`).

---

## 3. Ustalenia

### 3.1. Bezpośrednia przyczyna statusu

`data/job.json` z przebiegu z 2026-08-19T19:31:10Z:

```json
"status": "done_with_errors",
"ok": true,
"sources_total": 9,
"sources_healthy": 7,
"error_message": "Parafia św. Stanisława Kostki (Dębniki): HTTP 403 (prób: 3) | Parafia Dębniki – Intencje mszalne: HTTP 403 (prób: 3)"
```

Status wyznacza `resolveJobOutcome()` (`scripts/nekrolog_core.mjs`, linie 541–549). Reguła jest binarna:

```js
if(sourcesTotal>0&&healthy<=0){ return {status:'error', ...}; }
if(errors.length) return {status:'done_with_errors',ok:true,errorMessage:errors.join(' | ')};
return {status:'done',ok:true,errorMessage:null};
```

**Dowolny niepusty błąd źródła — niezależnie od jego natury, wagi i możliwości naprawy — degraduje status całego przebiegu do `done_with_errors`.** Dwa źródła zwracają HTTP 403, więc status jest czerwony (a ściślej: żółty; `app.js` linia 193 maluje wtedy plakietkę klasą `warn`).

### 3.2. Źródło błędu: Cloudflare Managed Challenge na `debniki.sdb.org.pl`

Odpowiedź serwera dla `https://debniki.sdb.org.pl/intencje`:

```
HTTP/2 403
server: cloudflare
cf-mitigated: challenge
cf-ray: a2df4259be02db3c-IAD
content-type: text/html; charset=UTF-8
```

Treść odpowiedzi to strona `<title>Just a moment...</title>` z obiektem `window._cf_chl_opt = { ..., cType: 'managed', cZone: 'debniki.sdb.org.pl', ... }`.

Nagłówek `cf-mitigated: challenge` w połączeniu z `cType: 'managed'` jednoznacznie identyfikuje **Cloudflare Managed Challenge** — interaktywne wyzwanie wymagające wykonania JavaScriptu i osadzenia widżetu `challenges.cloudflare.com` w przeglądarce. To nie jest zwykła blokada User-Agenta ani reguła WAF na ścieżkę.

Potwierdzeniem, że właściciel strony świeżo włączył zarządzanie botami w Cloudflare, jest `robots.txt` (jedyna ścieżka hosta zwracająca HTTP 200), który zawiera wygenerowany przez Cloudflare blok:

```
# BEGIN Cloudflare Managed content
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /
User-agent: Amazonbot
Disallow: /
...
# END Cloudflare Managed Content
```

Istotne: dla `User-agent: *` polityka to `Allow: /`. **Regulaminowo (robots.txt) odczyt strony przez zwykłego klienta nie jest zabroniony** — blokuje warstwa WAF/bot management, nie polityka robots.

### 3.3. Kryterium blokady to reputacja adresu IP, nie nagłówki żądania

To najważniejsze ustalenie analizy. Wykonano test kontrolowany: **ten sam URL, te same (lub słabsze) nagłówki, dwa różne tory sieciowe wyjścia**:

| Tor wyjścia | Adres IP | User-Agent | Wynik |
|---|---|---|---|
| `curl` przez proxy kontenera | `160.79.106.136` | `Mozilla/5.0 ... Chrome/124.0` (pełny zestaw nagłówków przeglądarkowych) | **HTTP 403** |
| `node-fetch` bezpośrednio | `35.253.77.88` | `nekrolog-refresh-bot/1.0` (nagłówek bota, bez `referer`, bez `accept-language`) | **HTTP 200**, 64 571 B realnej treści |

Wynik jest odwrotny do intuicji: żądanie z **nagłówkiem bota** przeszło, a żądanie **udające przeglądarkę** zostało zablokowane. Zmienną decydującą był wyłącznie adres IP.

Ten sam wzorzec widać w historii repozytorium — statystyka 47 przebiegów zapisanych w `data/job.json`:

| Liczba przebiegów | Status | Źródła w `source_errors` |
|---|---|---|
| 40 | `done_with_errors` | `debniki_sdb` |
| 3 | `done_with_errors` | `debniki_intencje`, `debniki_sdb` |
| 1 | `done_with_errors` | `debniki_sdb`, `zck_funerals` |
| 1 | `done_with_errors` | `debniki_sdb`, `salwator_grobonet` |
| **2** | **`done`** | — |

Oba przebiegi zakończone statusem `done` (commity `f0533a6` i `8ea1d1d` z 2026-08-18, godz. 10:48 i 10:49) mają `"trigger": "manual_or_schedule"` — czyli zostały uruchomione ze stacji roboczej / sesji deweloperskiej, a nie z GitHub Actions. W obu `debniki.sdb.org.pl` zwrócił **HTTP 200**, a `debniki_intencje` dostarczyło 35 rekordów. **Każdy** przebieg z `"trigger": "schedule"` (runner GitHub Actions) kończył się na tym hoście błędem 403.

**Wniosek:** Cloudflare przepuszcza ruch z adresów o dobrej reputacji, a odrzuca ruch z zakresów centrów danych. Adresy wyjściowe runnerów GitHub Actions (Azure) należą do najczęściej nadużywanych puli i mają w bot management Cloudflare niską punktację. Blokada nie jest wymierzona w ten projekt — jest efektem ubocznym generycznej reguły.

### 3.4. Zakres blokady na hoście

| Ścieżka | Wynik |
|---|---|
| `/robots.txt` | 200 |
| `/favicon.ico` | 302 |
| `/` | 403 |
| `/intencje` | 403 |
| `/sitemap.xml`, `/sitemap_index.xml` | 403 |
| `/feed`, `/rss`, `/intencje/feed` | 403 |
| `/wp-json/wp/v2/pages` (REST API WordPressa) | 403 |

Nie istnieje żadna otwarta, maszynowo czytelna ścieżka alternatywna. Wyzwanie obejmuje HTML, XML i JSON; przechodzą wyłącznie zasoby statyczne i `robots.txt`.

Host `sdb.org.pl` (domena nadrzędna zgromadzenia) zwraca 200 — ochrona została włączona na poziomie pojedynczej strefy `debniki.sdb.org.pl`, nie całego hostingu.

### 3.5. Rzeczywista szkoda w danych

Status `done_with_errors` sam w sobie niczego nie psuje: workflow kończy się kodem 0, `npm run refresh` zapisuje komplet plików, UI działa, a 7 z 9 źródeł dostarcza 226 rekordów. Realna strata jest jednak konkretna i mierzalna.

Porównanie snapshotu bieżącego (`08c26ba`, źródło zablokowane) ze snapshotem z 2026-08-18 (`8ea1d1d`, źródło dostępne):

| Kategoria | 2026-08-18 (200 OK) | 2026-08-19 (403) | Zmiana |
|---|---|---|---|
| `deaths` | 152 | 161 | +9 |
| `funerals` | 51 | 53 | +2 |
| `graves` | 12 | 12 | 0 |
| **`intentions`** | **35** | **0** | **−35** |
| **`upcoming_intentions`** | **26** | **0** | **−26** |

Rozkład rekordów `intention` według źródła w działającym przebiegu: `{ debniki_intencje: 35 }`.

**`debniki_intencje` jest jedynym dostawcą kategorii `intention`.** Kategoria ta realizuje w UI sekcję „Najbliższe potrzeby” (README §2). W efekcie blokady sekcja „potrzeby” jest trwale pusta — nie z powodu braku intencji na stronie parafii, tylko z powodu braku dostępu. To nie jest kosmetyczna degradacja statusu, lecz utrata całej jednej z czterech funkcji produktu.

### 3.6. Drugie źródło błędu (`debniki_sdb`) nie wnosi danych nawet gdy działa

Diagnostyka z przebiegu, w którym host był dostępny (`8ea1d1d`):

```json
{
  "source_id": "debniki_sdb",
  "http_status": 200,
  "candidate_links": 2,
  "accepted_rows": 0,
  "parser_status": "empty",
  "rows": 0
}
```

Stan zdrowia źródła w `data/source_health.json` potwierdza to historycznie:

```json
"debniki_sdb": { "last_rows": 0, "last_nonempty_run": null, "known_empty": true }
```

`last_nonempty_run: null` oznacza, że **źródło `debniki_sdb` nie dostarczyło ani jednego rekordu w całej zapisanej historii projektu** — także wtedy, gdy odpowiadało kodem 200. Parser `parseDebnikiSdbPogrzeby` (linie 388–397) znajduje 2 linki kandydujące, ale żaden nie przechodzi walidacji w `parseDebnikiSdbDetailHtml`. Flaga `known_empty: true` w `config/sources.json` już to uznaje — wycisza alarm o pustych przebiegach (`refresh_static.mjs` linia 121), lecz **nie wycisza błędu HTTP**, bo ten trafia do wcześniejszej gałęzi warunku (linia 119).

To źródło odpowiada za 45 z 47 historycznych degradacji statusu, nie wnosząc nic do danych.

### 3.7. Ustalenie poboczne: mylący licznik prób w komunikacie błędu

`scripts/fetch.mjs`, funkcja `fetchText`:

```js
const attempts = RETRY_DELAYS_MS.length + 1;
const error = last?.error || `HTTP ${last?.status ?? 0}`;
return { ok:false, status:last?.status ?? 0, text:last?.text ?? "", error:`${error} (prób: ${attempts})`, attempts };
```

Liczba prób w komunikacie jest **stała** (`2 + 1 = 3`), niezależnie od rzeczywistego przebiegu pętli. Status 403 nie należy do `TRANSIENT_STATUSES`, więc `worthRetrying` jest `false` i pętla przerywa się po pierwszym obiegu. Komunikat „HTTP 403 (prób: 3)” w `data/errors.json` i `data/job.json` jest zatem nieprawdziwy — wykonano 1 próbę `node-fetch` + 1 awaryjną próbę `curl` z nagłówkami przeglądarkowymi. Pole `attempts` w zwracanym obiekcie ma tę samą wadę.

Nie jest to przyczyna awarii, ale utrudnia diagnozę: sugeruje wyczerpanie polityki ponowień tam, gdzie ponowień świadomie nie ma.

### 3.8. Stan bazowy pozostałej części systemu

- `npm ci && npm test` → **36/36 testów zielonych**.
- 7 z 9 aktywnych źródeł ma `parser_status: "ok"` i `empty_streak: 0`.
- Powiadomienie Discord zostało wysłane poprawnie (`"status": 204`, `"type": "heartbeat_no_match"`).
- Workflow `.github/workflows/nekrolog-refresh.yml` nie traktuje `done_with_errors` jako awarii kroku — commit i push danych wykonują się normalnie.

**Żaden parser nie jest zepsuty. Kod pipeline'u nie jest przyczyną problemu.**

---

## 4. Wnioski

1. Status `done_with_errors` wynika z HTTP 403 na dwóch źródłach z hosta `debniki.sdb.org.pl`.
2. Przyczyną 403 jest **Cloudflare Managed Challenge włączony przez właściciela strony parafii**, a kryterium blokowania jest **reputacja adresu IP klienta**, a nie nagłówki żądania. Udowodniono to testem: to samo żądanie z nagłówkiem bota przechodzi z jednego IP i jest blokowane z innego.
3. Blokada dotyczy runnerów GitHub Actions. Uruchomienia spoza Actions (stacja robocza) przechodzą — stąd dwa jedyne w historii przebiegi ze statusem `done`.
4. Problem jest **całkowicie zewnętrzny wobec repozytorium**. Nie ma tu błędu w kodzie do naprawienia; naprawa musi dotyczyć albo drogi dostępu do źródła, albo sposobu raportowania takiej sytuacji.
5. Rzeczywista szkoda: **kategoria `intention` („potrzeby”) spadła z 35 do 0 rekordów**, bo `debniki_intencje` jest jej jedynym dostawcą.
6. Drugie zablokowane źródło, `debniki_sdb`, jest **bezwartościowe niezależnie od blokady** — nie zwróciło ani jednego rekordu w całej historii, a odpowiada za 45 z 47 degradacji statusu.
7. Sygnał statusu uległ **wysyceniu**: skoro praktycznie każdy przebieg od tygodni kończy się `done_with_errors` z tego samego, znanego i nienaprawialnego powodu, status przestał odróżniać stan normalny od realnej regresji parsera. To ryzyko operacyjne większe niż sama blokada — prawdziwa awaria innego źródła utonie w szumie.

---

## 5. Rekomendacje

Uporządkowane od najniższego ryzyka. Rekomendacje A i B są niezależne od siebie i od C — można wdrożyć dowolny podzbiór.

### A. Odróżnić blokadę zewnętrzną od regresji parsera *(rekomendacja główna)*

**Cel:** przywrócić statusowi wartość informacyjną, nie ukrywając problemu.

Kod już rozpoznaje ten przypadek — każdy parser ustawia `parser_status: r.status===403 ? 'blocked' : 'http_error'`. Informacja jest wytwarzana, ale `resolveJobOutcome` z niej nie korzysta.

Proponowany kształt zmiany:

1. W `config/sources.json` dodać źródłom za anty-botem flagę, np. `external_block_tolerated: true`.
2. W `refresh_static.mjs` rozdzielić `sourceErrors` na dwa zbiory: `sourceErrors` (regresje wymagające reakcji) i `sourceWarnings` (blokady zewnętrzne oflagowane w konfiguracji, rozpoznane po `parser_status === 'blocked'`).
3. Do `resolveJobOutcome` przekazywać wyłącznie `sourceErrors`.
4. Zapisywać `source_warnings` w `job.json` i `latest.json`; `sources_blocked` obok `sources_healthy`.
5. W `app.js` renderować ostrzeżenia w sekcji **Log** jako osobną listę — bez maskowania.
6. **Zabezpieczenie przed zamiataniem pod dywan:** jeżeli źródło oflagowane jako tolerowane pozostaje zablokowane dłużej niż ustalony próg (np. 14 dni od `last_nonempty_run`), ostrzeżenie wraca do rangi błędu. Blokada tymczasowa jest tolerowana; trwała utrata źródła musi być widoczna.

**Efekt:** przebieg z 7/9 sprawnymi źródłami i dwoma znanymi blokadami kończy się statusem `done` + widoczne ostrzeżenie. Kolejny `done_with_errors` znowu będzie znaczył „coś się zepsuło i wymaga reakcji”.

**Ryzyko psucia reszty: niskie.** Zmiana jest addytywna. Test `status zadania opisuje kondycję odczytu, nie liczbę rekordów` (`tests/refresh.snapshot.test.mjs`, linie 61–67) sprawdza `resolveJobOutcome` na czterech przypadkach i **żaden z nich nie dotyczy blokad** — sygnatura wywołania nie zmienia się, bo do funkcji trafia po prostu krótsza lista `refreshErrors`. Wymaga dopisania testów dla nowego rozgałęzienia, nie modyfikacji istniejących.

### B. Wyłączyć źródło `debniki_sdb`

Ustawić `"enabled": false` w `config/sources.json` — analogicznie do wyłączonego już `facebook_parafia_debniki`.

**Uzasadnienie:** źródło nie dostarczyło ani jednego rekordu w całej historii (`last_nonempty_run: null`), jego zakres tematyczny (ogłoszenia parafialne Dębnik) pokrywa się z `debniki_intencje`, a odpowiada za zdecydowaną większość historycznych degradacji statusu.

**Uwaga wdrożeniowa:** `mergeRequiredSources()` scala konfigurację z `REQUIRED_SOURCES` w `nekrolog_core.mjs` i nadpisuje część pól. Przed zmianą należy sprawdzić, czy `enabled: false` przetrwa scalenie — w przeciwnym razie flagę trzeba ustawić także w definicji źródła w `nekrolog_core.mjs`.

**Ryzyko: bardzo niskie** — zero rekordów do stracenia. **Ryzyko rezydualne:** gdyby parafia zmieniła strukturę ogłoszeń tak, że parser zacząłby działać, wyłączone źródło tego nie wykryje. Skoro jednak parser nie działał nigdy, jest to koszt czysto teoretyczny.

### C. Odzyskać dostęp do intencji mszalnych

To jedyna ścieżka realnie przywracająca utracone dane. Warianty, od najlepszego:

| Wariant | Opis | Ocena |
|---|---|---|
| **C1. Prośba do parafii o regułę w Cloudflare** | Kontakt z administratorem `debniki.sdb.org.pl` z prośbą o utworzenie WAF Custom Rule typu *Skip* dla User-Agenta `nekrolog-refresh-bot/1.0` albo dla ASN GitHub Actions. Ruch to 2 żądania na dobę. | **Rekomendowany.** Czyste rozwiązanie, zgodne z wolą właściciela strony, trwałe. Wymaga jednak działania osoby trzeciej i może pozostać bez odpowiedzi. |
| **C2. Self-hosted runner** | Przeniesienie kroku `npm run refresh` na runnera GitHub Actions uruchomionego na łączu domowym użytkownika. Adres o dobrej reputacji przechodzi wyzwanie — co potwierdziły dwa przebiegi z 2026-08-18. | Skuteczny i legalny — zmienia drogę dostępu, nie obchodzi zabezpieczenia. Koszt: stale działająca maszyna, konfiguracja runnera, zagadnienia bezpieczeństwa self-hosted runnera w repozytorium publicznym. |
| **C3. Alternatywne źródło intencji** | Poszukanie innego kanału publikacji intencji parafii Dębniki (profil Facebook — obecnie źródło wyłączone, portal diecezjalny, gablota/biuletyn w formie PDF). | Do zbadania osobno. Sondowanie hosta nie ujawniło żadnej otwartej ścieżki maszynowej (§3.4). |
| **C4. Akceptacja utraty źródła** | Formalne uznanie źródła za niedostępne: `enabled: false`, aktualizacja README §3 i tabeli kategorii w §2, wyraźna informacja w UI, że sekcja „potrzeby” nie ma zasilania. | Uczciwe rozwiązanie awaryjne, jeśli C1–C3 zawiodą. Lepsze niż pusta sekcja bez wyjaśnienia. |

### D. Poprawić licznik prób w `fetch.mjs`

Zliczać rzeczywistą liczbę obiegów pętli zamiast stałej `RETRY_DELAYS_MS.length + 1` i raportować ją w komunikacie. Zmiana jednolinijkowa, poprawia wiarygodność diagnostyki. Żaden test nie asertuje treści `(prób: N)`.

### E. Czego **nie** robić

**Nie należy implementować obchodzenia wyzwania Cloudflare** — headless browser rozwiązujący challenge, zewnętrzne usługi typu „CAPTCHA solver”, rotacja proxy rezydencjalnych ani podszywanie się pod odcisk TLS przeglądarki.

Powody:
- Właściciel strony świadomie włączył ochronę przed automatami; jej obchodzenie jest działaniem wbrew jego wyrażonej woli i regulaminowi usługi.
- Rozwiązanie byłoby kruche — każda zmiana progu w Cloudflare wywraca je bez ostrzeżenia, zamieniając stabilną, znaną awarię w awarię losową.
- Koszt utrzymania (przeglądarka w CI, czas przebiegu, zależności) jest nieproporcjonalny do 35 rekordów na dobę.
- §3.3 dowodzi, że manipulacja nagłówkami i tak jest nieskuteczna — decyduje adres IP.

Wariant C2 (self-hosted runner) **nie** należy do tej kategorii: nie obchodzi zabezpieczenia, tylko zmienia punkt wyjścia ruchu na taki, który Cloudflare i tak przepuszcza.

---

## 6. Ryzyka

| Ryzyko | Prawdopodobieństwo | Skutek | Ograniczenie |
|---|---|---|---|
| Wdrożenie rekomendacji A ukryje przyszłą, realną awarię innego źródła | Niskie | Cicha utrata danych | Punkt A6: eskalacja ostrzeżenia do błędu po przekroczeniu progu czasowego; utrzymanie widocznej listy ostrzeżeń w UI |
| Cloudflare zaostrzy próg i zablokuje kolejne źródła | Średnie | Dalsza degradacja pokrycia | Mechanizm z A obsłuży to automatycznie; monitorować `parser_status: "blocked"` w `source_diagnostics` |
| Blokada ustąpi samoistnie (zmiana reputacji IP) i flaga `external_block_tolerated` pozostanie zbędna | Średnie | Brak — flaga jest neutralna gdy źródło działa | Przegląd konfiguracji przy najbliższej zmianie źródeł |
| Wyłączenie `debniki_sdb` (rekomendacja B) nie przetrwa `mergeRequiredSources()` | Średnie | Zmiana bez efektu | Zweryfikować scalanie i ustawić flagę również w `REQUIRED_SOURCES` |
| Self-hosted runner (C2) w repozytorium publicznym | — | Zagrożenie bezpieczeństwa (wykonanie kodu z PR na maszynie domowej) | Ograniczyć wyzwalacze runnera do `schedule` i `workflow_dispatch`; nie dopuszczać `pull_request` |
| Utrata kategorii „potrzeby” utrwali się jako stan normalny | Wysokie, jeśli C zostanie odłożone | Cicha utrata jednej z czterech funkcji produktu | Jawnie oznaczyć stan w UI i README, nie zostawiać pustej sekcji bez wyjaśnienia |

---

## 7. Następne kroki

1. **Decyzja użytkownika** co do zakresu wdrożenia (A, B, D — bezpieczne i szybkie; C wymaga działań poza repozytorium).
2. Po decyzji: implementacja na gałęzi `claude/nekrolog-done-with-errors-ib9uly` wraz z testami pokrywającymi nowe rozgałęzienie `resolveJobOutcome`.
3. Aktualizacja `README.md` §8 („Diagnostyka”) o opis rozróżnienia błąd / ostrzeżenie oraz §3 o status źródeł Dębniki.
4. Uzupełnienie niniejszego pliku o sekcję „Zmiany wykonane w kodzie” zgodnie z pkt. 4 `AGENTS.md`, jeżeli dojdzie do zmian kodu.
5. Niezależnie od ścieżki technicznej — wysłanie prośby do parafii (wariant C1). Jest to jedyne rozwiązanie zarazem trwałe, czyste i tanie.
