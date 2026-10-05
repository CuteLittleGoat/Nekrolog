# Analiza: `done_with_errors` po przeniesieniu strony parafii św. Jadwigi na nową domenę

Data analizy: 2026-10-05
Temat analizy: Ustalenie przyczyny statusu `done_with_errors` utrzymującego się od przebiegu z 2026-10-02 22:52 UTC i jej usunięcie.

Analiza nie ma związku z wcześniejszymi przyczynami tego samego statusu (blokada Cloudflare na Dębnikach — `Analizy/analiza-status-done-with-errors-cloudflare-debniki.md`; przeterminowanie Gabriel24 — `Analizy/analiza-done-with-errors-gabriel24-timeout-i-debniki-intencje.md`).

---

## 1. Oryginalny pełny prompt użytkownika

```text
Aplikacja zaczęła zwracać done_with_errors
Sprawdź czemu i spróbuj naprawić.
```

---

## 2. Zakres analizy

- Odczyt bieżącego stanu z `data/job.json`, `data/errors.json`, `data/source_health.json`.
- Historia statusów z 25 ostatnich commitów `data/job.json`, żeby ustalić moment rozpoczęcia awarii.
- Sprawdzenie na żywo obu hostów: starego `swietajadwiga.diecezja.pl` (HTTPS i HTTP) i nowego `jadwiga.eparafia.pl`.
- Sprawdzenie, czy parser `sw_jadwiga_pogrzebowe` pasuje do strony pod nowym adresem.
- Sprawdzenie, dlaczego sama zmiana adresu w definicji źródła nie wystarczy (`mergeRequiredSources`).
- Weryfikacja poprawki: `npm test` oraz pełny przebieg `npm run refresh` na żywych źródłach z `DISCORD_NOTIFY_ENABLED=false` (pliki w `data/` przywrócono potem do stanu z repozytorium — odświeży je harmonogram).

Poza zakresem: zmiany w warstwie pobierania (`scripts/fetch.mjs`), wysyłka powiadomień Discord.

---

## 3. Ustalenia

### 3.1. Bezpośrednia przyczyna: certyfikat TLS nie pasuje do hosta

Jedyny wpis w `source_errors` ostatniego przebiegu (2026-10-04 22:16 UTC):

| Pole | Wartość |
|---|---|
| `source_id` | `sw_jadwiga_pogrzebowe` |
| `url` | `https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe` |
| `http_status` | `0` |
| `parser_status` | `http_error` |
| `fail_streak` | `6` |
| `error` | `Hostname/IP does not match certificate's altnames: Host: swietajadwiga.diecezja.pl. is not in the cert's altnames: DNS:jadwiga.eparafia.pl [ERR_TLS_CERT_ALTNAME_INVALID]`; awaryjny curl: `curl: (60) SSL: no alternative certificate subject name matches target host name` |

Serwer pod starym adresem przedstawia certyfikat wystawiony **wyłącznie** dla `jadwiga.eparafia.pl`. To jednoznaczny ślad przeniesienia strony parafii na platformę eParafia. Pozostałe 6 źródeł działało poprawnie (`sources_healthy: 6/7`).

### 3.2. Stary host nie ma działającej ścieżki do treści

| Żądanie | Wynik |
|---|---|
| `https://swietajadwiga.diecezja.pl/...` | błąd TLS (certyfikat innej domeny) |
| `http://swietajadwiga.diecezja.pl/...` | `301` → `https://swietajadwiga.diecezja.pl/...`, czyli z powrotem na ten sam błąd TLS |
| `https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe` | `200`, 101 kB, ta sama struktura listy |

Odczyt ze starego hosta byłby możliwy tylko po wyłączeniu weryfikacji certyfikatu. To niedopuszczalne i niepotrzebne, bo ta sama treść jest dostępna pod nowym, poprawnie zabezpieczonym adresem.

### 3.3. Przebieg w czasie

| Przebieg (UTC) | Status | Uwagi |
|---|---|---|
| 2026-10-01 23:02 | `done` | ostatni udany odczyt św. Jadwigi (`last_nonempty_run`) |
| 2026-10-02 13:43 | `done` | pierwsze niepowodzenie: ostrzeżenie (`fail_streak: 1`) |
| 2026-10-02 22:52 | `done_with_errors` | `fail_streak: 2` = `NETWORK_FAIL_ALERT`, eskalacja do błędu |
| … 2026-10-04 22:16 | `done_with_errors` | `fail_streak: 6` |

Mechanizm tolerancji pojedynczej awarii sieci (`classifySourceOutcome`) zadziałał zgodnie z projektem: jeden przebieg ostrzeżenia, potem błąd. Błąd TLS ma `http_status: 0`, więc trafia do kategorii „niepowodzenie sieciowe” (`isTransientNetworkFailure`).

### 3.4. Parser nie wymaga zmian

Strona pod nowym adresem ma identyczną strukturę: 30 × `li.artykul`, `h2.tytul`, `span.data`, względne linki `msze-swiete-pogrzebowe/<slug>`. Obecny `parseSwJadwigaPogrzeboweHtml` zwraca z niej 30 rekordów (pierwszy: Stefan Biernat, 2026-09-25). Linki są względne i rozwiązują się względem `list_url` źródła — dlatego po zmianie adresu automatycznie wskazują nowy host.

### 3.5. Pułapka: zmiana adresu tylko w kodzie nic nie daje

`mergeRequiredSources` (`scripts/nekrolog_core.mjs`) scala definicję z zapisaną konfiguracją jako `{...definicja, ...zapisane}` — **zapisane wartości wygrywają** (poza `type` i kilkoma flagami). Gdyby poprawić adres wyłącznie w `REQUIRED_SOURCES`, `config/sources.json` dalej podawałby stary host i przebieg nadal kończyłby się błędem. Sprawdzono to bezpośrednio: po zmianie samej definicji scalone źródło miało dalej adres `swietajadwiga.diecezja.pl`. Adres trzeba zmienić w obu plikach.

---

## 4. Wnioski

1. Przyczyną `done_with_errors` jest **zmiana domeny strony parafii św. Jadwigi** (`swietajadwiga.diecezja.pl` → `jadwiga.eparafia.pl`), a nie regresja kodu, parsera ani awaria sieci.
2. Awaria jest trwała, a nie przejściowa — stary host nie zacznie znów działać bez działania administratora parafii.
3. Wystarczy poprawić adres w definicji źródła i w `config/sources.json`. Parser i warstwa pobierania pozostają bez zmian.
4. Po poprawce pełny przebieg na żywych źródłach kończy się `status: done`, `healthy 7/7`, 222 rekordy, św. Jadwiga: `http_status: 200`, `accepted_rows: 30`, `parser_status: ok`.

---

## 5. Rekomendacje

- **Wykonane:** zmiana adresu źródła w `scripts/nekrolog_core.mjs` i `config/sources.json`; nowy zrzut regresyjny z nowego hosta; test pilnujący zgodności adresów między definicją a konfiguracją; aktualizacja dokumentacji.
- **Do rozważenia (niewykonane):** komunikat błędu TLS z niedopasowanym certyfikatem (`ERR_TLS_CERT_ALTNAME_INVALID`, curl `(60)`) mógłby od razu podpowiadać „certyfikat wystawiony dla innej domeny — możliwa zmiana adresu źródła”. Dziś trafia do kategorii przejściowych awarii sieci i eskaluje po 2 przebiegach, co jest poprawne, ale diagnoza wymaga ręcznego czytania komunikatu.

---

## 6. Ryzyka

- **Kolejna migracja.** eParafia to platforma hostingowa parafii; jeśli parafia ją porzuci, problem wróci w tej samej postaci (zmiana adresu). Wykrycie pozostaje szybkie dzięki `fail_streak`.
- **Stare odnośniki w danych historycznych.** Rekordy w `data/latest.json` zapisane przed 2026-10-02 mają linki do `swietajadwiga.diecezja.pl/...`. Zostaną zastąpione w najbliższym przebiegu harmonogramu (lista na stronie źródłowej obejmuje te same wpisy).
- **Klucze deduplikacji Discord** zawierają link (`kind|nazwisko|źródło|link|daty`). Zmiana hosta zmienia link, więc ewentualne trafienie fraz z tego źródła zostałoby zgłoszone ponownie. Obecnie `data/discord_notified.json` jest pusty (`sent_keys: []`), więc ryzyko jest teoretyczne.

---

## 7. Następne kroki

- Najbliższy przebieg harmonogramu (`0 7,19 * * *` UTC) albo ręczne uruchomienie workflow **Nekrolog refresh** powinno zapisać `status: done` i wyzerować `fail_streak` dla `sw_jadwiga_pogrzebowe` w `data/source_health.json`.
- Jeżeli status nie wróci do `done`, sprawdzić `source_diagnostics` w `data/job.json` — wtedy przyczyna będzie inna niż opisana tutaj.

---

## Zmiany wykonane w kodzie

### Plik: `scripts/nekrolog_core.mjs`

Lokalizacja: linie 34–38, tablica `REQUIRED_SOURCES`, wpis `sw_jadwiga_pogrzebowe`

Było:

```js
  { id:"sw_jadwiga_pogrzebowe", name:"Parafia św. Jadwigi – Msze święte pogrzebowe", type:"sw_jadwiga_pogrzebowe", url:"https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe", enabled:true, distance_km:6.5, list_url:"https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe", ...DEFAULT_FLAGS },
```

Jest:

```js
  // Od 2026-10-02 parafia działa pod jadwiga.eparafia.pl. Stary host swietajadwiga.diecezja.pl
  // przedstawia certyfikat nowej domeny (ERR_TLS_CERT_ALTNAME_INVALID), a po HTTP przekierowuje
  // z powrotem na siebie po HTTPS — nie ma ścieżki, która by do treści doprowadziła.
  // Adres zmieniaj razem z config/sources.json: przy scalaniu wygrywa zapisana konfiguracja.
  { id:"sw_jadwiga_pogrzebowe", name:"Parafia św. Jadwigi – Msze święte pogrzebowe", type:"sw_jadwiga_pogrzebowe", url:"https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe", enabled:true, distance_km:6.5, list_url:"https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe", ...DEFAULT_FLAGS },
```

### Plik: `config/sources.json`

Lokalizacja: linie 115 i 118, obiekt `"id": "sw_jadwiga_pogrzebowe"`

Było:

```json
      "url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
      ...
      "list_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
```

Jest:

```json
      "url": "https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe",
      ...
      "list_url": "https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe",
```

### Plik: `tests/fixtures/sw_jadwiga_list_2026-08-18.html` → `tests/fixtures/sw_jadwiga_list_2026-10-05.html`

Lokalizacja: cały plik

Było: zrzut listy ze starego hosta `swietajadwiga.diecezja.pl` z 2026-08-18.

Jest: zrzut listy z nowego hosta `jadwiga.eparafia.pl` z 2026-10-05 (pobrany z nagłówkiem bota, jak w przebiegu produkcyjnym). Zgodnie z README §6 usunięto wyłącznie treść `<script>`/`<style>` i osadzone obrazy `data:`. Struktura DOM jest nienaruszona.

### Plik: `tests/refresh.parsers.test.mjs`

Lokalizacja: linie 134–147, test `św. Jadwiga: zgłoszenia zgonu z datą publikacji, nigdy jako data pogrzebu`

Było:

```js
  const html = await fixture('sw_jadwiga_list_2026-08-18.html');
  const rows = parseSwJadwigaPogrzeboweHtml(html, SOURCES.sw_jadwiga_pogrzebowe);
  assert.equal(rows.length, 30);
  assert.equal(rows[0].name, 'Waldemar Musiał');
  assert.equal(rows[0].date_death, '2026-08-13');
  assert.equal(rows[0].kind, 'death');
  // Strony szczegółowe zawierają intencje mszalne, a nie termin pogrzebu.
  assert.ok(rows.every((r) => r.date_funeral === null));
  assert.match(rows[0].url, /msze-swiete-pogrzebowe\/waldemar-musial/);
```

Jest:

```js
  // Zrzut z nowego hosta parafii (jadwiga.eparafia.pl) — struktura listy bez zmian.
  const html = await fixture('sw_jadwiga_list_2026-10-05.html');
  const rows = parseSwJadwigaPogrzeboweHtml(html, SOURCES.sw_jadwiga_pogrzebowe);
  assert.equal(rows.length, 30);
  assert.equal(rows[0].name, 'Stefan Biernat');
  assert.equal(rows[0].date_death, '2026-09-25');
  assert.equal(rows[0].kind, 'death');
  // Strony szczegółowe zawierają intencje mszalne, a nie termin pogrzebu.
  assert.ok(rows.every((r) => r.date_funeral === null));
  // Linki na liście są względne — rozwiązują się względem adresu źródła, więc po
  // zmianie domeny muszą wskazywać nowy host, a nie martwy swietajadwiga.diecezja.pl.
  assert.equal(rows[0].url, 'https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe/stefan-biernat');
```

### Plik: `tests/refresh.snapshot.test.mjs`

Lokalizacja: linia 5 (import) oraz linie 252–263, nowy test przed `mergeRequiredSources wymusza flagę tolerancji nad zastaną konfiguracją`

Było: brak importu `readFile` i brak testu zgodności adresów.

Jest:

```js
import { readFile } from 'node:fs/promises';
```

```js
test('adresy w config/sources.json zgadzają się z definicjami źródeł', async () => {
  // Przy scalaniu adres z zapisanej konfiguracji wygrywa z definicją w kodzie. Zmiana
  // adresu tylko w REQUIRED_SOURCES nic więc nie zmienia: przebieg dalej odpytuje stary
  // host. Tak po przeniesieniu parafii św. Jadwigi na jadwiga.eparafia.pl (2026-10).
  const cfg = JSON.parse(await readFile(new URL('../config/sources.json', import.meta.url), 'utf8'));
  const stored = Object.fromEntries(cfg.sources.map((s) => [s.id, s]));
  for (const def of REQUIRED_SOURCES) {
    for (const key of ['url', 'list_url', 'base_url']) {
      assert.equal(stored[def.id]?.[key] ?? null, def[key] ?? null, `${def.id}.${key}`);
    }
  }
});
```

Sprawdzono, że test wykrywa błąd: przy `config/sources.json` z poprzedniego commita kończy się `not ok … sw_jadwiga_pogrzebowe.url`.

### Plik: `Linki.txt`

Lokalizacja: linia 37

Było:

```text
https://cutelittlegoat.github.io/Nekrolog/tests/fixtures/sw_jadwiga_list_2026-08-18.html
```

Jest:

```text
https://cutelittlegoat.github.io/Nekrolog/tests/fixtures/sw_jadwiga_list_2026-10-05.html
```

### Plik: `README.md`

Lokalizacja: linia 22 (§1, opis `config/sources.json`) i linia 63 (§3, uwaga o św. Jadwidze)

Było:

```markdown
- `config/sources.json` – lista i konfiguracja źródeł (uzupełniana automatycznie z definicji w `nekrolog_core.mjs`).
```

```markdown
- **św. Jadwiga** publikuje datę *zgłoszenia*, a strony szczegółowe zawierają intencje mszalne, nie termin pogrzebu — dlatego data trafia do `date_death`, nigdy do `date_funeral`.
```

Jest: dopisano, że zapisane wartości w `config/sources.json` (w tym adresy) mają pierwszeństwo przed definicją, więc zmianę adresu wprowadza się w obu plikach, a rozjazd wykrywa test. Przy św. Jadwidze dopisano nowy adres `https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe` i przyczynę: certyfikat starego hosta nie pasuje do domeny, a weryfikacji certyfikatu nie wyłączamy.

### Plik: `Instrukcja_odczytu_zrodel_Nekrolog.md`

Lokalizacja: §0 (tabela stanu źródeł, wiersz `sw_jadwiga_pogrzebowe`), §4 (tabela źródeł i przypis pod nią), sekcja `sw_jadwiga_pogrzebowe` (linie ok. 1263–1389) oraz przykładowe konfiguracje i rekordy (linie ok. 1594–1686)

Było: wszystkie adresy w postaci `https://swietajadwiga.diecezja.pl/...`; w §0 dla `sw_jadwiga_pogrzebowe` uwaga „—”.

Jest: wszystkie adresy w postaci `https://jadwiga.eparafia.pl/...` (18 wystąpień); w §0 opis przeniesienia strony od 2026-10-02 z datą aktualizacji dokumentu; w przypisie pod tabelą §4 informacja o aktualizacji adresu 2026-10-05.
