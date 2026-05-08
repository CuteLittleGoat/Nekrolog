# Instrukcja dla agenta Codex — poprawki parserów w repo „Nekrolog”

Repozytorium: `CuteLittleGoat/Nekrolog`
Docelowo przygotuj JEDEN pull request na wszystkie poprawki, żebym musiał zatwierdzić tylko raz.

## Cel

Wprowadzić poprawki po audycie parserów nekrologów/pogrzebów. Obecnie workflow i konfiguracja są częściowo poprawione, ale dane nadal potrafią być błędne. Najważniejszy błąd produkcyjny: parser czasu bierze fragment daty jako godzinę, np. z tekstu:

`Data pogrzebu 12.05.2026 12:00`

obecny kod potrafi zapisać:

`time_funeral: "12:05"`

zamiast:

`time_funeral: "12:00"`.

## Pliki do sprawdzenia / modyfikacji

- `scripts/nekrolog_core.mjs`
- `tests/refresh.parsers.test.mjs`
- `tests/fixtures/*`
- opcjonalnie `README.md`, jeśli trzeba dopisać krótką informację o nowych zabezpieczeniach parserów
- po uruchomieniu odświeżenia: `data/latest.json`, `data/job.json`, `data/errors.json`

## Zakres wymaganych zmian

### 1. Napraw `parseTime`

Obecna funkcja `parseTime` zbyt łatwo dopasowuje `DD.MM` z daty jako godzinę. Trzeba ją zmienić tak, żeby:

- `parseTime("Data pogrzebu 12.05.2026 12:00")` zwracało `12:00`, nie `12:05`;
- `parseTime("Pogrzeb 8 maja 2026 godz. 9.00")` zwracało `09:00`;
- `parseTime("Pogrzeb 8 V 2026 o 09:00")` zwracało `09:00`;
- `parseTime("12.04.2026 09:30 Anna Nowak msza pogrzebowa")` zwracało `09:30`;
- `parseTime("godz. 9.00")` zwracało `09:00`;
- `parseTime("9:00")` zwracało `09:00`.

W praktyce regex musi ignorować fragmenty dat w formacie `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY` oraz `YYYY-MM-DD`. Można zastosować np. ostrożniejszy regex z kontekstem albo skanowanie wszystkich kandydatów i odrzucanie tych, które są częścią daty.

Dodaj test regresyjny dokładnie dla przykładu:

`Data pogrzebu 12.05.2026 12:00`

oraz upewnij się, że fixture PUK nie generuje `12:05`.

### 2. Dębniki SDB — realny detail fetch

W `config/sources.json` źródło `debniki_sdb` ma `requires_detail_fetch: true`, ale obecna implementacja w praktyce analizuje głównie etykiety linków z listy. To trzeba poprawić.

Wymagane zachowanie:

- parser listy ma wyciągać linki kandydackie do wpisów pogrzebowych / aktualności / informacji o zmarłych;
- następnie parser ma pobierać każdą podstronę szczegółową przez `fetchText`;
- dopiero z HTML-a podstrony szczegółowej ma budować rekord;
- zwykłe intencje typu `+ Jan Kowalski` bez kontekstu pogrzebu NIE mogą być traktowane jako zgon ani pogrzeb;
- rekord powinien mieć `kind: "funeral"`, jeśli źródło informuje o mszy/pogrzebie, a nie o potwierdzonym nowym zgonie.

Dodaj eksportowaną funkcję testowalną, np. `parseDebnikiSdbDetailHtml`, i fixture dla podstrony szczegółowej, np.:

```html
<main>
  <h1>Msza pogrzebowa Jan Nowak</h1>
  <p>Msza święta pogrzebowa za śp. Jana Nowaka odbędzie się 08.05.2026 o godz. 09:00 w kościele parafialnym.</p>
</main>
```

Oczekiwany wynik: `kind: "funeral"`, `name` zawiera `Jan Nowak`, `date_funeral: "2026-05-08"`, `time_funeral: "09:00"`.

Dodaj też fixture/test negatywny:

```html
<a href="/intencje">+ Jan Kowalski</a>
```

Ten wpis nie może dać rekordu, jeśli nie ma słowa „pogrzeb”, „pogrzebowa”, „msza pogrzebowa”, „uroczystości pogrzebowe” itp.

### 3. Gabriel24, Grobonet, Podwawelskie — parsery nie mogą być tylko aliasami

Obecnie funkcje:

- `parseGabriel24DetailHtml`
- `parseGrobonetDetailHtml`
- `parsePodwawelskieDetailHtml`

są w praktyce cienkimi aliasami do wspólnego `parseDetail`. Trzeba to poprawić.

Wymagane zachowanie:

- każda z tych funkcji ma mieć własną logikę ekstrakcji albo przynajmniej własną konfigurację selektorów i reguł, a nie bezmyślne `return parseDetail(...)`;
- parser ma najpierw ograniczać analizę do sensownego kontenera (`main`, `article`, `.entry-content`, `.content`, `.nekrolog`, `.obituary`, itp.);
- parser ma usuwać śmieci techniczne: `script`, `style`, `iframe`, `nav`, `header`, `footer`, cookie bary, elementy social/share/ads;
- nazwa ma być brana z `h1`, `h2`, klas typu `.name`, `.nazwisko`, `img[alt]`, `title` albo dopiero awaryjnie ze sluga URL;
- parser nie może akceptować jako nazwiska tekstów typu `Główna Nekrologi Firma W Służbie`, `Nekrologi`, `Kontakt`, `Oferta`, `Polityka prywatności`;
- `note` i `place` nie mogą zawierać technicznych fragmentów typu `googletagmanager`, `clickcease`, `iframe`, `src=`, `href=`, `document`, `window`, `function`.

Dodaj lub rozbuduj fixture’y dla tych źródeł tak, żeby zawierały trochę realnego „brudu” HTML, np. `nav`, `script`, `footer`, reklamy/cookie, a nie tylko idealny `<main><h1>...</h1>`.

### 4. Karawan — utrzymać dotychczasową ochronę i nie zepsuć

Karawan został poprawiony najlepiej, ale trzeba go zabezpieczyć testami.

Wymagane:

- nadal nie wolno przepuszczać nazwy `GłównaNekrologiFirmaW Służbie` ani wariantów ze spacjami;
- `note` i `place` nie mogą zawierać `googletagmanager`, `clickcease`, `iframe`, `src=`, `href=`;
- parser powinien pobierać nazwisko z `main h1`, `article h1`, klas nekrologowych/obituary albo ze sluga jako fallback;
- testy dla fixture’ów `karawan_detail_wladyslaw_stozek.html` i `karawan_detail_elzbieta_rodecka.html` muszą nadal przechodzić.

### 5. Ostrzeżenia/błędy przy zerowych wynikach

Obecnie część parserów może zwrócić `error: null`, mimo że znalazła zero linków albo zero poprawnych rekordów. To fałszywie uspokaja, bo `data/errors.json` jest wtedy puste.

Wymagane:

- jeśli aktywne źródło z `enabled: true` nie zwraca żadnego linku kandydackiego, parser powinien zwrócić warning/error w polu `error`;
- jeśli znaleziono linki, ale po pobraniu szczegółów nie powstał żaden poprawny rekord, parser powinien zwrócić warning/error;
- `refresh_static.mjs` już zbiera `parsed.error` do `sourceErrors`, więc wystarczy, żeby parsery konsekwentnie zwracały niepuste `error`;
- nie oznaczaj Facebooka jako błąd, bo `facebook_parafia_debniki` ma pozostać `enabled: false`.

Akceptowalne komunikaty, np.:

- `Gabriel24: nie znaleziono linków szczegółów`
- `Karawan: znaleziono 12 linków, ale zero poprawnych rekordów`
- `Dębniki SDB: pobrano 5 podstron, ale zero jednoznacznych pogrzebów`

### 6. Testy

Rozbuduj `tests/refresh.parsers.test.mjs`.

Minimalne testy wymagane:

- `parseTime("Data pogrzebu 12.05.2026 12:00") === "12:00"`
- `parseTime("12.04.2026 09:30 Anna Nowak msza pogrzebowa") === "09:30"`
- fixture PUK z `Data pogrzebu 12.05.2026 12:00` daje `time_funeral === "12:00"`, nie `"12:05"`
- Dębniki: test pozytywny dla detail HTML mszy pogrzebowej
- Dębniki: test negatywny dla samej intencji `+ Jan Kowalski`
- Gabriel24/Grobonet/Podwawelskie: testy detail parserów na brudniejszym HTML-u, nie tylko na idealnym `<main>`
- Karawan: dotychczasowe testy anty-śmieciowe nadal przechodzą
- `parseSource({ type: "unknown" })` nadal zwraca błąd `Nieznany parser`
- `parseGenericHtml({ id: "abc" })` nadal zwraca błąd `Brak parsera`

Uruchom:

```bash
npm test
```

Testy muszą przechodzić.

### 7. Odświeżenie danych

Po poprawkach uruchom:

```bash
npm run refresh
```

Sprawdź wygenerowane pliki:

- `data/latest.json`
- `data/job.json`
- `data/errors.json`

W `data/latest.json` nie może być już błędnych czasów typu:

- `12.05.2026 12:00` -> `time_funeral: "12:05"`
- `11.05.2026 12:00` -> `time_funeral: "11:05"`
- `08.05.2026 11:40` -> `time_funeral: "08:05"`

Jeśli źródło zwraca zero wyników, ma się to pojawić w `source_errors` / `errors.json`, zamiast udawać pełny sukces.

## Kryteria akceptacji PR

PR można uznać za gotowy tylko jeśli:

1. `npm test` przechodzi.
2. `npm run refresh` kończy się bez crasha.
3. W `data/latest.json` nie ma technicznych śmieci typu `googletagmanager`, `clickcease`, `iframe`, `src=`, `href=`.
4. W `data/latest.json` nie ma nazw typu `GłównaNekrologiFirmaW Służbie`, `Główna Nekrologi Firma W Służbie`.
5. PUK nie generuje błędnych godzin z dat.
6. Dębniki SDB faktycznie pobiera i parsuje podstrony szczegółowe.
7. Gabriel24/Grobonet/Podwawelskie mają parsery szczegółowe, które nie są tylko aliasami do jednego ogólnego parsera.
8. Aktywne źródła z zerowymi wynikami generują warning/error.
9. Facebook pozostaje `enabled: false`.
10. PR obejmuje wszystkie poprawki naraz.

## Sugerowany tytuł PR

`Fix parser audit issues and harden source extraction`

## Sugerowany opis PR

```markdown
### Summary
- Fixed time parsing so date fragments like `12.05.2026` are not interpreted as funeral time.
- Added regression tests for PUK funeral time extraction.
- Added real detail-page parsing for Dębniki SDB and ignored plain mass intentions without funeral context.
- Hardened Gabriel24, Grobonet and Podwawelskie detail parsing with source-aware selectors and noise removal.
- Preserved Karawan protections against menu/noise being parsed as names or notes.
- Added parser warnings when enabled sources return zero links or zero valid records.

### Testing
- npm test
- npm run refresh

### Notes
- Facebook source remains disabled.
- Active sources with no usable records now report source errors instead of silently succeeding.
```
