# Instrukcja dla Codex — Nekrolog: dopracowanie źródeł z `done_with_errors`

Repozytorium: `CuteLittleGoat/Nekrolog`

Przygotuj JEDEN pull request na wszystkie poniższe poprawki.

## Kontekst

Po ostatnim PR aplikacja jest bezpieczniejsza i poprawnie raportuje problemy, ale refresh nadal kończy się statusem `done_with_errors`.

Aktualne błędy w `data/job.json` / `data/errors.json`:

1. `salwator_grobonet`
   - komunikat: `Kraków Salwator – Grobonet: znaleziono 2 linków, ale zero poprawnych rekordów`

2. `debniki_sdb`
   - komunikat: `Dębniki SDB: pobrano 3 podstron, ale zero jednoznacznych pogrzebów`

3. `podwawelskie_nekrologi`
   - komunikat: `Podwawelskie – Nekrologi: znaleziono 8 linków, ale zero poprawnych rekordów`

Cel tego zadania: doprowadzić do sytuacji, w której te trzy źródła są albo skutecznie parsowane, albo celowo oznaczone jako tymczasowo nieskuteczne z jasnym powodem. Nie wolno wracać do „cichego sukcesu” przy zerowych wynikach.

---

## 1. Grobonet / Salwator — napraw parser szczegółów

Pliki do sprawdzenia:

- `scripts/nekrolog_core.mjs`
- testy i fixtures Grobonet w `tests/fixtures/`

Problem: parser znajduje linki, ale z podstron nie buduje żadnego poprawnego rekordu.

Zadania:

- Sprawdź realny HTML linków z `https://krakowsalwator.grobonet.com/nekrologi.php`.
- Ustal, gdzie faktycznie są:
  - imię i nazwisko,
  - data pogrzebu,
  - godzina pogrzebu,
  - miejsce / cmentarz / kaplica,
  - ewentualna data śmierci.
- Popraw `parseGrobonetDetailHtml`, żeby działał na realnej strukturze Grobonet, a nie tylko na uproszczonym fixture.
- Parser ma nadal usuwać techniczne śmieci: `script`, `style`, `iframe`, `nav`, `footer`, cookie/ads/social.
- Parser nie może akceptować jako nazwiska tekstów typu `Nekrologi`, `Kontakt`, `Oferta`, `Główna`.
- Jeśli realna strona Grobonet nie udostępnia obecnie poprawnych nekrologów albo blokuje dane, parser ma zwrócić czytelny `error`, ale nie może udawać sukcesu.

Dodaj fixture możliwie podobny do realnego HTML-a Grobonet, a nie tylko idealny `<main><h1>...</h1>`.

Wymagany test:

- parser Grobonet detail zwraca rekord z poprawnym `name`,
- jeśli na stronie jest data/godzina pogrzebu, zwraca `date_funeral` i `time_funeral`,
- `note` i `place` nie zawierają śmieci technicznych.

---

## 2. Dębniki SDB — ustalić, czy brak rekordów jest poprawny, czy parser za ostry

Pliki do sprawdzenia:

- `scripts/nekrolog_core.mjs`
- `tests/fixtures/debniki_*`

Problem: parser pobiera 3 podstrony, ale zwraca zero jednoznacznych pogrzebów.

Zadania:

- Sprawdź realne 3 podstrony pobierane przez parser.
- Ustal, czy są to:
  - zwykłe intencje mszalne,
  - aktualności bez pogrzebu,
  - strony pogrzebowe, których parser nie rozpoznaje.
- Jeżeli to zwykłe intencje lub strony bez jednoznacznego pogrzebu: obecne zachowanie jest logicznie poprawne, ale komunikat błędu powinien być bardziej informacyjny, np. `Dębniki SDB: pobrano 3 podstrony, ale żadna nie zawierała jednoznacznej mszy/pogrzebu`.
- Jeżeli któraś podstrona faktycznie opisuje pogrzeb: popraw `parseDebnikiSdbDetailHtml`, żeby ją rozpoznawał.
- Nie wolno traktować samej intencji `+ Jan Kowalski` jako zgonu ani pogrzebu.
- Rekord z Dębnik powinien mieć `kind: "funeral"` tylko wtedy, gdy tekst jasno mówi o mszy pogrzebowej / pogrzebie / uroczystościach pogrzebowych.

Dodaj testy:

- pozytywny dla realnego lub realistycznego HTML-a strony pogrzebowej,
- negatywny dla samej intencji mszalnej,
- test komunikatu błędu, jeżeli znaleziono linki, ale żadna podstrona nie zawiera jednoznacznego pogrzebu.

---

## 3. Podwawelskie — napraw parser listy i szczegółów

Pliki do sprawdzenia:

- `scripts/nekrolog_core.mjs`
- testy i fixtures Podwawelskie w `tests/fixtures/`

Problem: parser znajduje 8 linków, ale z nich powstaje zero poprawnych rekordów.

Zadania:

- Sprawdź realną strukturę `https://www.podwawelskie.pl/aktualnosci/nekrologi.html`.
- Ustal, czy linki prowadzą do:
  - listy nekrologów,
  - konkretnych wpisów,
  - stron kategorii/archiwum,
  - albo stron bez danych.
- Jeżeli parser łapie za dużo linków kategorii/menu, zawęź `parsePodwawelskieNekrologiHtml`, żeby zbierał tylko linki kandydackie do konkretnych nekrologów.
- Popraw `parsePodwawelskieDetailHtml`, żeby działał na realnym HTML-u strony szczegółowej.
- Uważaj na „datę publikacji”: nie traktuj automatycznie daty publikacji artykułu jako daty pogrzebu.
- `date_funeral` można ustawić tylko, jeśli tekst wiąże datę z pogrzebem / uroczystością / mszą pogrzebową.
- Jeśli źródło ma aktualnie same archiwalne albo nieparsowalne wpisy, ma być jasny warning/error, nie cichy sukces.

Dodaj fixture z brudniejszym HTML-em Podwawelskiego: menu/header/footer/script + właściwy content.

Wymagany test:

- parser listy nie łapie menu/kategorii jako wpisów,
- parser detail zwraca poprawny rekord dla realistycznego nekrologu,
- data publikacji nie jest mylona z datą pogrzebu,
- `note` i `place` nie zawierają śmieci technicznych.

---

## 4. Zachować dotychczasowe naprawy

Nie wolno zepsuć poprawek z poprzedniego PR.

W szczególności nadal musi działać:

- `parseTime("Data pogrzebu 12.05.2026 12:00") === "12:00"`;
- PUK nie może generować `12:05`, `11:05`, `08:05` z fragmentów dat;
- Karawan nie może przepuszczać `Główna Nekrologi Firma W Służbie`;
- `latest.json` nie może zawierać `googletagmanager`, `clickcease`, `iframe`, `src=`, `href=`;
- Facebook pozostaje `enabled: false`;
- aktywne źródła z zerową liczbą poprawnych rekordów muszą raportować warning/error.

---

## 5. Testy

Uruchom:

```bash
npm test
```

Testy muszą przejść.

Dodaj lub zaktualizuj testy dla:

- Grobonet detail parser,
- Dębniki detail parser i scenariusz „brak jednoznacznego pogrzebu”,
- Podwawelskie list/detail parser,
- regresja `parseTime`,
- anty-śmieciowe walidacje Karawan/ogólne.

---

## 6. Refresh i walidacja danych

Po poprawkach uruchom:

```bash
npm run refresh
```

Sprawdź:

- `data/latest.json`
- `data/job.json`
- `data/errors.json`

Kryteria:

- Jeżeli Grobonet, Dębniki i Podwawelskie faktycznie mają aktualne dane możliwe do parsowania, powinny generować rekordy.
- Jeżeli któreś źródło aktualnie nie ma jednoznacznych danych, `errors.json` może nadal zawierać warning, ale komunikat ma jasno wyjaśniać dlaczego.
- Nie wolno wracać do sytuacji, w której parser zwraca zero rekordów i `error: null`.

---

## 7. Kryteria akceptacji PR

PR jest gotowy, jeśli:

1. `npm test` przechodzi.
2. `npm run refresh` nie crashuje.
3. PUK ma poprawne godziny.
4. Grobonet, Dębniki i Podwawelskie są albo skutecznie parsowane, albo raportują precyzyjne, uzasadnione warningi.
5. Nie ma technicznych śmieci w `latest.json`.
6. Nie ma fałszywych nazw typu menu/header/footer.
7. Facebook nadal jest wyłączony.
8. PR zawiera wszystkie zmiany naraz.

---

## Sugerowany tytuł PR

`Improve remaining source parsers and clarify zero-record warnings`

## Sugerowany opis PR

```markdown
### Summary
- Improved Grobonet, Dębniki SDB and Podwawelskie parsing based on current real-page structure.
- Tightened list parsers so menu/category links are not treated as obituary details.
- Preserved zero-record warnings instead of silently succeeding.
- Added more realistic fixtures and regression tests for the remaining failing sources.
- Kept previous parseTime, PUK and Karawan protections intact.

### Testing
- npm test
- npm run refresh

### Notes
- Facebook remains disabled.
- Sources with no unambiguous current funeral/obituary data now report clear warnings.
```
