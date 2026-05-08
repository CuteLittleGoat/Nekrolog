# Instrukcja odczytu źródeł — Nekrolog

Data badania: 2026-05-08  
Zakres: publiczne pliki aplikacji z GitHub Pages / raw.githubusercontent.com oraz publicznie dostępne strony źródłowe wymienione w `config/sources.json`.

> Uwaga metodyczna: badanie wykonano przez publiczny odczyt HTTP i widok tekstowy stron. Nie wykonywano commitów, nie używano logowania, nie obchodzono zabezpieczeń i nie projektowano parsera wymagającego cookies. Tam, gdzie dokładne klasy CSS nie były widoczne w warstwie tekstowej, wskazano stabilniejszy sposób parsowania po strukturze tekstu/linków oraz oznaczono selektory jako wymagające potwierdzenia w surowym HTML.

---

## 1. Cel dokumentu

Celem dokumentu jest opisanie, jak aplikacja „Nekrolog” powinna technicznie odczytywać dane z każdego skonfigurowanego źródła, a następnie mapować je do rekordów aplikacji:

```json
{
  "kind": "death albo funeral",
  "name": "Imię Nazwisko",
  "date_death": "YYYY-MM-DD albo null",
  "date_funeral": "YYYY-MM-DD albo null",
  "time_funeral": "HH:MM albo null",
  "place": "miejsce / cmentarz / kaplica / parafia albo null",
  "source_id": "id źródła",
  "source_name": "nazwa źródła",
  "url": "bezpośredni link do wpisu lub strony źródłowej",
  "source_url": "główna strona źródła",
  "note": "krótka informacja dodatkowa",
  "priority_hit": true
}
```

Dokument ma pomóc kolejnemu agentowi lub programiście poprawić parsery w `scripts/nekrolog_core.mjs` oraz zmienić typy źródeł w `config/sources.json`.

---

## 2. Aktualny stan aplikacji

### Odczytane pliki

Pliki sprawdzone przez GitHub Pages / raw.githubusercontent.com:

- `app.js`
- `index.html`
- `styles.css`
- `config/sources.json`
- `data/latest.json`
- `data/job.json`
- `data/errors.json`
- `scripts/refresh_static.mjs`
- `scripts/nekrolog_core.mjs`
- `scripts/fetch.mjs`
- `scripts/date.mjs`
- `scripts/normalize.mjs`

### Obecny pipeline

Obecny pipeline jest zgodny z opisem:

```text
config/sources.json
→ scripts/refresh_static.mjs
→ parsery z scripts/nekrolog_core.mjs
→ data/latest.json
→ app.js
```

`refresh_static.mjs`:

1. czyta `config/sources.json`,
2. łączy źródła z `REQUIRED_SOURCES`,
3. uruchamia parser na podstawie `source.type`,
4. filtruje wyniki do okien czasowych:
   - zgony: od dziś minus 7 dni do dziś,
   - pogrzeby: od dziś do dziś plus 7 dni,
5. zapisuje `data/latest.json`, `data/job.json`, `data/errors.json`.

### Obecne parsery

W `scripts/nekrolog_core.mjs` obecnie realnie działają tylko:

- `parseZckFunerals` / `parseZckFuneralsHtml` dla `type: "zck_funerals"`,
- specjalny parser PUK w `parseGenericHtml`, uruchamiany tylko dla `source.id === "puk_pozegnalismy"`,
- `parseIntentionsPlus`, ale żadne z analizowanych źródeł w `config/sources.json` nie ma obecnie typu `intencje_plus`.

Dla pozostałych źródeł `generic_html` zwraca obecnie pustą listę bez błędu. To oznacza, że brak błędów w `data/errors.json` nie znaczy, że parsery rzeczywiście działają. Znaczy tylko, że obecne puste parsery nie zgłosiły błędów.

### Obecny problem techniczny

Źródła inne niż PUK i częściowo ZCK wymagają parserów specyficznych dla serwisu:

- część ma listę i podstrony szczegółowe,
- część ma paginację,
- część ma dane jako listę tekstową bez linków szczegółowych,
- część to intencje/msze pogrzebowe, a nie zgony,
- Facebook jest blokowany / niestabilny bez logowania.

---

## 3. Obecna struktura danych

Docelowo utrzymać dwa logiczne zbiory:

### `deaths` / `recent_deaths`

Rekordy o zgonach:

```json
{
  "kind": "death",
  "name": "...",
  "date_death": "YYYY-MM-DD",
  "date_funeral": "YYYY-MM-DD albo null",
  "time_funeral": "HH:MM albo null",
  "place": "...",
  "source_id": "...",
  "source_name": "...",
  "url": "...",
  "source_url": "...",
  "note": "..."
}
```

### `funerals` / `upcoming_funerals`

Rekordy o pogrzebach albo mszach pogrzebowych:

```json
{
  "kind": "funeral",
  "name": "...",
  "date_death": "YYYY-MM-DD albo null",
  "date_funeral": "YYYY-MM-DD",
  "time_funeral": "HH:MM albo null",
  "place": "...",
  "source_id": "...",
  "source_name": "...",
  "url": "...",
  "source_url": "...",
  "note": "..."
}
```

Ważne: intencje mszalne nie powinny być automatycznie traktowane jako zgon. Jeżeli źródło podaje tylko intencję „+ Jan Kowalski”, jest to najwyżej wzmianka, a nie potwierdzony nowy zgon ani pogrzeb.

---

## 4. Lista źródeł

| source_id | source_name | obecny type | URL | enabled |
|---|---|---:|---|---:|
| `zck_funerals` | ZCK Kraków – Porządek pogrzebów | `zck_funerals` | `https://www.zck-krakow.pl/funerals` | true |
| `puk_pozegnalismy` | PUK Kraków – Pożegnaliśmy | `generic_html` | `https://www.puk.krakow.pl/pozegnalismy/` | true |
| `gabriel_nekrologi` | Gabriel24 – Nekrologi | `generic_html` | `https://www.gabriel24.pl/nekrologi/` | true |
| `karawan_nekrologi` | Karawan – Nekrologi | `generic_html` | `https://karawan.pl/nekrologi/` | true |
| `salwator_grobonet` | Kraków Salwator – Grobonet | `generic_html` | `https://krakowsalwator.grobonet.com/nekrologi.php` | true |
| `debniki_sdb` | Parafia św. Stanisława Kostki (Dębniki) | `generic_html` | `https://debniki.sdb.org.pl/` | true |
| `podwawelskie_nekrologi` | Podwawelskie – Nekrologi | `generic_html` | `https://www.podwawelskie.pl/aktualnosci/nekrologi.html` | true |
| `sw_jadwiga_pogrzebowe` | Parafia św. Jadwigi – Msze święte pogrzebowe | `generic_html` | `https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe` | true |
| `facebook_parafia_debniki` | Facebook – Parafia Dębniki | `generic_html` | `https://www.facebook.com/parafiadebniki/?locale=pl_PL` | false |

---

# 5. Szczegółowa analiza każdego źródła

---

## zck_funerals — ZCK Kraków – Porządek pogrzebów

### 1. Status źródła

**Działa przez statyczny HTML / częściowo wymaga dopracowania parsera tekstowego.**

Źródło jest kluczowe dla `kind: "funeral"`. Strona `/funerals` pokazuje porządek pogrzebów na konkretny dzień. W warstwie tekstowej widoczna jest lista pogrzebów pogrupowana według cmentarzy, z godziną, miejscem/kaplicą i nazwiskiem.

Nie potwierdzono stabilnego endpointu JSON/API ani parametru daty. Do obsługi innych dni niż dzień widoczny na stronie trzeba dodatkowo ręcznie sprawdzić DevTools → Network, szczególnie kliknięcia w kalendarz, jeśli jest dostępny w pełnym widoku przeglądarkowym.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://www.zck-krakow.pl/funerals`
- Ścieżka ręczna: wejść na URL → odczytać bieżący porządek pogrzebów.
- Dane są widoczne jako tekst HTML, nie jako obraz ani PDF.
- Dane logicznie występują w kolejności:
  - data dnia / nagłówek porządku,
  - nazwa cmentarza,
  - lista pozycji z godziną,
  - kaplica / sala / miejsce,
  - imię i nazwisko zmarłego.

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL: `https://www.zck-krakow.pl/funerals`
- Wymagane nagłówki: wystarczy zwykły `User-Agent` i `Accept: text/html` jak w obecnym `fetch.mjs`.
- Endpoint JSON/API: **niepotwierdzony**.
- Parametr daty: **niepotwierdzony**.
- Parser powinien działać na HTML / tekście z `body`.

Obecny parser próbuje przetwarzać wszystkie elementy:

```js
$("body").find("h1,h2,h3,h4,h5,h6,li,p,div,td,span,strong,b")
```

To jest dobra strategia awaryjna, ale algorytm powinien być bardziej odporny na układ, w którym godzina, miejsce i nazwisko znajdują się w jednym lub kilku sąsiednich elementach.

### 4. Jak pobrać szczegóły wpisu

Nie stwierdzono podstron szczegółowych dla pojedynczych pogrzebów. Parser powinien pobierać listę z jednego URL-a.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | stała | — | `"funeral"` | ZCK to porządek pogrzebów, nie lista zgonów. |
| `name` | tekst pozycji pogrzebu | `Imię Nazwisko`, czasem z wiekiem/dodatkiem | usunąć nawiasy z wiekiem, znormalizować spacje | Nie wycinać członów nazwiska. |
| `date_death` | brak | — | `null` | ZCK nie jest źródłem daty śmierci. |
| `date_funeral` | data dnia porządku | zwykle `YYYY-MM-DD` albo data w nagłówku | `YYYY-MM-DD` | Obecny parser szuka `YYYY-MM-DD` w tekście. Trzeba dodać fallback: bieżąca data lokalna, jeśli strona pokazuje tylko bieżący dzień. |
| `time_funeral` | godzina przy pozycji | `HH:MM` | `HH:MM`, zero-pad | Wyszukiwać regexem `\b([01]?\d|2[0-3]):[0-5]\d\b`. |
| `place` | kaplica/miejsce + aktualny cmentarz | tekst | `kaplica – cmentarz` | Przechowywać nazwę cmentarza z najbliższego wcześniejszego nagłówka. |
| `source_id` | config | `zck_funerals` | bez zmian | — |
| `source_name` | config | nazwa źródła | bez zmian | — |
| `url` | URL strony | `https://www.zck-krakow.pl/funerals` | bez zmian | Brak linków szczegółowych. |
| `source_url` | URL strony | jw. | bez zmian | Dodać, jeśli parser nie dodaje. |
| `note` | opcjonalnie | np. surowa linia | krótki tekst | Dobrze zapisać `ZCK: <cmentarz>, <kaplica>`. |

### 6. Proponowany parser

- Funkcja: `parseZckFunerals`
- Obecny type: `zck_funerals`
- Proponowany type: `zck_funerals`
- `enabled`: true
- Dodatkowe pola w config:

```json
{
  "list_url": "https://www.zck-krakow.pl/funerals",
  "requires_detail_fetch": false,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

W badaniu potwierdzono, że lista jest publicznie widoczna jako tekst, ale nie zapisano bezpiecznie pełnych realnych nazw z aktualnego dnia w notatkach roboczych. Nie należy zmyślać przykładów. Do testów parsera trzeba pobrać aktualny HTML strony `/funerals` i zapisać go jako fixture.

Rekomendowany fixture:

```text
tests/fixtures/zck_funerals_YYYY-MM-DD.html
```

### 8. Minimalny algorytm parsera

1. Pobierz `https://www.zck-krakow.pl/funerals`.
2. Zbuduj listę linii tekstowych z `body`, preferując elementy tabel/list/kart.
3. Ustal `currentDate`:
   - najpierw szukaj `YYYY-MM-DD`,
   - potem `DD.MM.YYYY`,
   - jeżeli brak, użyj dzisiejszej daty lokalnej jako fallback, ale zapisz w `note`, że data pochodzi z fallbacku.
4. Iteruj po liniach:
   - jeśli linia zawiera `cmentarz`, ustaw `currentCemetery`,
   - jeśli linia zawiera godzinę, uznaj ją za początek rekordu,
   - z tej samej linii lub kolejnych 1–3 linii wyciągnij miejsce i nazwisko.
5. Odrzuć linie typu „brak pogrzebów”.
6. Zbuduj rekord `kind: "funeral"`.
7. Usuń duplikaty po:

```text
name + date_funeral + time_funeral + place + source_id
```

### 9. Ryzyka i ograniczenia

- Jeżeli ZCK zmieni układ HTML, parser tekstowy może pomylić miejsce z nazwiskiem.
- Nie potwierdzono parametru daty ani endpointu kalendarza.
- Jeżeli strona pokazuje tylko dzień bieżący, parser nie pobierze tygodnia do przodu.
- Warto dodać test fixture i testy regresji na aktualnym HTML.

### 10. Rekomendacja

**Wdrożyć / poprawić parser.** To najważniejsze źródło dla `upcoming_funerals`. Nie wymaga OCR ani PDF. W pierwszym etapie obsłużyć dzień widoczny w HTML. W drugim etapie ręcznie sprawdzić DevTools → Network dla kalendarza i ewentualnie rozszerzyć parser o daty przyszłe.

---

## puk_pozegnalismy — PUK Kraków – Pożegnaliśmy

### 1. Status źródła

**Działa przez statyczny HTML.**

To źródło obecnie działa najlepiej, ponieważ dane są w HTML w bardzo regularnej strukturze. Obecny parser `parsePukPozegnalismyHtml` już korzysta z klas specyficznych dla strony.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://www.puk.krakow.pl/pozegnalismy/`
- Ścieżka ręczna: wejść na URL → lista „Pożegnaliśmy” jest widoczna od razu → kliknięcie „Szczegóły” prowadzi do e-klepsydry.
- Dane są tekstem HTML na liście.
- Link szczegółowy prowadzi do domeny `nekrolog.eklepsydra.pl`.

Przykładowa sekwencja tekstowa karty:

```text
W dniu 14.04.2026 przeżywszy 64 lat zmarła
ŚP.
Barbara Piechnik
Data pogrzebu 12.05.2026 12:00
Szczegóły
```

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL: `https://www.puk.krakow.pl/pozegnalismy/`
- Selektor listy/karty, potwierdzony w obecnym kodzie:

```css
.results-klepsydra .eklepsydra
```

- Selektor imienia i nazwiska, potwierdzony w obecnym kodzie:

```css
p.fs-28, p.h-80
```

- Selektor linku szczegółów, potwierdzony w obecnym kodzie:

```css
a.btn.link
```

- Linia daty pogrzebu:

```js
root.find("p").filter((_, el) => /data pogrzebu/i.test($(el).text()))
```

### 4. Jak pobrać szczegóły wpisu

Dla podstawowych pól nie trzeba pobierać szczegółów. Lista zawiera:

- imię i nazwisko,
- datę zgonu,
- datę pogrzebu,
- godzinę pogrzebu,
- link szczegółowy.

Detail fetch jest opcjonalny, jeżeli w przyszłości potrzebne będą dodatkowe informacje, np. cmentarz, kaplica, pełna treść klepsydry.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | generować dwa rekordy | — | `death` oraz drugi `funeral`, jeśli jest data pogrzebu | Obecny parser już tak robi. |
| `name` | `p.fs-28, p.h-80` | `ŚP. Imię Nazwisko` albo samo nazwisko | usunąć `ŚP.`, `ś.p`, trim | — |
| `date_death` | pierwsze `p` karty | `W dniu DD.MM.YYYY ... zmarł/zmarła` | `YYYY-MM-DD` | `parsePolishDateToIso`. |
| `date_funeral` | `p` zawierające `Data pogrzebu` | `Data pogrzebu DD.MM.YYYY HH:MM` | `YYYY-MM-DD` | — |
| `time_funeral` | ta sama linia | `HH:MM` | `HH:MM` | — |
| `place` | lista nie podaje dokładnego miejsca | — | obecnie `source.name` | Można wzbogacić przez detail fetch. |
| `source_id` | config | `puk_pozegnalismy` | bez zmian | — |
| `source_name` | config | nazwa | bez zmian | — |
| `url` | `a.btn.link[href]` | URL szczegółu | bez zmian | Może być zewnętrzna domena. |
| `source_url` | URL listy | — | bez zmian | — |
| `note` | połączone linie dat | tekst | krótki opis | Obecny parser robi `headerText | funeralLine`. |

### 6. Proponowany parser

- Funkcja: `parsePukPozegnalismy`
- Obecny type: `generic_html`
- Proponowany type: `puk_pozegnalismy`
- `enabled`: true
- Dodatkowe pola:

```json
{
  "list_url": "https://www.puk.krakow.pl/pozegnalismy/",
  "requires_detail_fetch": false,
  "detail_fetch_optional": true,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

```json
{
  "kind": "death",
  "name": "Barbara Piechnik",
  "date_death": "2026-04-14",
  "date_funeral": "2026-05-12",
  "time_funeral": "12:00",
  "place": "PUK Kraków – Pożegnaliśmy",
  "source_id": "puk_pozegnalismy",
  "source_name": "PUK Kraków – Pożegnaliśmy",
  "url": "link z przycisku Szczegóły do nekrolog.eklepsydra.pl",
  "source_url": "https://www.puk.krakow.pl/pozegnalismy/",
  "note": "W dniu 14.04.2026 przeżywszy 64 lat zmarła | Data pogrzebu 12.05.2026 12:00"
}
```

```json
{
  "kind": "funeral",
  "name": "Roman Malinowski",
  "date_death": "2026-05-01",
  "date_funeral": "2026-05-11",
  "time_funeral": "12:00",
  "place": "PUK Kraków – Pożegnaliśmy",
  "source_id": "puk_pozegnalismy",
  "source_name": "PUK Kraków – Pożegnaliśmy",
  "url": "link z przycisku Szczegóły do nekrolog.eklepsydra.pl",
  "source_url": "https://www.puk.krakow.pl/pozegnalismy/",
  "note": "W dniu 01.05.2026 przeżywszy 88 lat zmarł"
}
```

```json
{
  "kind": "funeral",
  "name": "Helena Zielińska",
  "date_death": "2026-05-02",
  "date_funeral": "2026-05-08",
  "time_funeral": "12:00",
  "place": "PUK Kraków – Pożegnaliśmy",
  "source_id": "puk_pozegnalismy",
  "source_name": "PUK Kraków – Pożegnaliśmy",
  "url": "link z przycisku Szczegóły do nekrolog.eklepsydra.pl",
  "source_url": "https://www.puk.krakow.pl/pozegnalismy/",
  "note": "W dniu 02.05.2026 przeżywszy 74 lat zmarła"
}
```

### 8. Minimalny algorytm parsera

1. Pobierz `https://www.puk.krakow.pl/pozegnalismy/`.
2. Znajdź karty `.results-klepsydra .eklepsydra`.
3. Dla każdej karty:
   - z pierwszego `p` wyciągnij `date_death`,
   - z `p.fs-28, p.h-80` wyciągnij `name`,
   - z `p` zawierającego `Data pogrzebu` wyciągnij `date_funeral` i `time_funeral`,
   - z `a.btn.link` wyciągnij `url`.
4. Zbuduj rekord `death`.
5. Jeśli istnieje `date_funeral`, zbuduj dodatkowy rekord `funeral`.
6. Usuń duplikaty po:

```text
kind + name + date_death + date_funeral + url
```

### 9. Ryzyka i ograniczenia

- Detail URL jest na zewnętrznej domenie `nekrolog.eklepsydra.pl`.
- Lista nie zawsze musi zawierać miejsce pogrzebu; dokładne miejsce może wymagać detail fetch.
- Parser jest zależny od klas CSS strony PUK.

### 10. Rekomendacja

**Wdrożyć jako osobny parser zamiast ukrywać w `generic_html`.** Obecna logika działa i powinna zostać zachowana, ale typ w config powinien być jawny: `puk_pozegnalismy`.

---

## gabriel_nekrologi — Gabriel24 – Nekrologi

### 1. Status źródła

**Wymaga pobierania podstron szczegółowych. Działa przez statyczny HTML.**

Lista zawiera imię i nazwisko, zakres dat życia oraz datę pogrzebu. Godzina, kaplica i cmentarz są dopiero na podstronie pojedynczego nekrologu.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://www.gabriel24.pl/nekrologi/`
- Paginacja:
  - `https://www.gabriel24.pl/nekrologi/page/2/`
  - `https://www.gabriel24.pl/nekrologi/page/3/`
  - itd.
- Link szczegółu:
  - wzorzec `https://www.gabriel24.pl/nekrolog/<slug>/`

Ścieżka ręczna:

```text
Wejdź na /nekrologi/ → kliknij „Więcej informacji” przy osobie → odczytaj szczegóły z podstrony.
```

Przykład listy:

```text
Śp. Zdzisław Kotaś
01.02.1942 - 10.04.2026
Wiek: 84 lata
Data pogrzebu: 16.04.2026
Więcej informacji
```

Przykład szczegółu:

```text
Śp. Zdzisław Kotaś
01.02.1942 - 10.04.2026
Data pogrzebu: 16.04.2026
Msza Święta: o godz. 13:40 kaplica cmentarna
Cmentarz: cmentarz komunalny Grębałów
```

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL pierwszej strony: `https://www.gabriel24.pl/nekrologi/`
- URL paginacji: `https://www.gabriel24.pl/nekrologi/page/{n}/`
- Selektor linków szczegółów, praktyczny:

```css
a[href^="https://www.gabriel24.pl/nekrolog/"],
a[href^="/nekrolog/"]
```

- Filtr linków:
  - odrzucić `https://www.gabriel24.pl/nekrologi/`,
  - przyjąć tylko `/nekrolog/<slug>/`.

W widoku tekstowym paginacja pokazuje zakres wielu stron, np. `1 2 3 … 79`. Parser nie musi przechodzić wszystkich stron przy odświeżaniu bieżących danych. Wystarczy pobrać pierwsze 1–3 strony, bo nowe wpisy są na początku.

### 4. Jak pobrać szczegóły wpisu

- Metoda: `GET`
- URL: link z listy `/nekrolog/<slug>/`
- Pola na podstronie:
  - `h1` / główny nagłówek: imię i nazwisko,
  - linia `DD.MM.YYYY - DD.MM.YYYY`: data urodzenia i zgonu; aplikacja potrzebuje drugiej daty jako `date_death`,
  - `Data pogrzebu: DD.MM.YYYY`: `date_funeral`,
  - `Msza Święta: o godz. HH:MM ...`: `time_funeral` i część miejsca,
  - `Cmentarz: ...`: cmentarz.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | generować `death` i opcjonalnie `funeral` | — | `death` + `funeral` | Jeżeli jest data pogrzebu, dodać rekord funeral. |
| `name` | nagłówek linku/listy albo `h1` szczegółu | `Śp. Zdzisław Kotaś` | usunąć `Śp.` | Detail jest pewniejszy. |
| `date_death` | druga data w zakresie życia | `01.02.1942 - 10.04.2026` | `2026-04-10` | Pierwsza data to urodzenie, nie zapisywać do rekordu. |
| `date_funeral` | lista albo szczegół | `Data pogrzebu: 16.04.2026` | `2026-04-16` | — |
| `time_funeral` | szczegół | `o godz. 13:40` | `13:40` | Brak na liście. |
| `place` | szczegół | `kaplica cmentarna`; `Cmentarz: ...` | połączyć | np. `kaplica cmentarna – cmentarz komunalny Grębałów`. |
| `source_id` | config | `gabriel_nekrologi` | bez zmian | — |
| `source_name` | config | nazwa | bez zmian | — |
| `url` | link szczegółu | `/nekrolog/<slug>/` | absolutny URL | — |
| `source_url` | lista | `/nekrologi/` | bez zmian | — |
| `note` | wiek, pełna linia mszy | tekst | krótki opis | np. `Wiek: 84 lata | Msza Święta: ...`. |

### 6. Proponowany parser

- Funkcja: `parseGabriel24`
- Obecny type: `generic_html`
- Proponowany type: `gabriel_nekrologi`
- `enabled`: true
- Dodatkowe pola:

```json
{
  "list_url": "https://www.gabriel24.pl/nekrologi/",
  "page_url_pattern": "https://www.gabriel24.pl/nekrologi/page/{page}/",
  "max_pages": 3,
  "detail_url_pattern": "https://www.gabriel24.pl/nekrolog/{slug}/",
  "requires_detail_fetch": true,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

```json
{
  "kind": "funeral",
  "name": "Zdzisław Kotaś",
  "date_death": "2026-04-10",
  "date_funeral": "2026-04-16",
  "time_funeral": "13:40",
  "place": "kaplica cmentarna – cmentarz komunalny Grębałów",
  "source_id": "gabriel_nekrologi",
  "source_name": "Gabriel24 – Nekrologi",
  "url": "https://www.gabriel24.pl/nekrolog/zdzislaw-kotas/",
  "source_url": "https://www.gabriel24.pl/nekrologi/",
  "note": "Wiek: 84 lata"
}
```

```json
{
  "kind": "funeral",
  "name": "Krystyna Markiewicz- Ladd",
  "date_death": "2026-02-19",
  "date_funeral": "2026-04-16",
  "time_funeral": "13:00",
  "place": "kaplica cmentarna – Cmentarz komunalny Rakowice",
  "source_id": "gabriel_nekrologi",
  "source_name": "Gabriel24 – Nekrologi",
  "url": "https://www.gabriel24.pl/nekrolog/krystyna-markiewicz-ladd/",
  "source_url": "https://www.gabriel24.pl/nekrologi/",
  "note": "Wiek: 74 lata"
}
```

### 8. Minimalny algorytm parsera

1. Pobierz `https://www.gabriel24.pl/nekrologi/`.
2. Opcjonalnie pobierz `page/2/` i `page/3/`.
3. Z każdej strony zbierz unikalne linki `/nekrolog/<slug>/`.
4. Dla każdego linku pobierz detail.
5. Z detailu odczytaj:
   - `name` z nagłówka,
   - `date_death` z drugiej daty w zakresie życia,
   - `date_funeral` z `Data pogrzebu`,
   - `time_funeral` z `Msza Święta: o godz. ...`,
   - `place` z linii mszy i `Cmentarz:`.
6. Zbuduj rekord `death` i, jeżeli jest pogrzeb, `funeral`.
7. Usuń duplikaty po:

```text
kind + name + date_death + date_funeral + source_id
```

### 9. Ryzyka i ograniczenia

- Bardzo dużo stron archiwalnych; nie pobierać całego archiwum przy każdym odświeżeniu.
- Niektóre rekordy mogą nie mieć daty zgonu albo mieć nietypowy format nazwiska.
- Miejsce i godzina są na detailu, więc parser listy bez detail fetch będzie niepełny.

### 10. Rekomendacja

**Wdrożyć parser z detail fetch.** Źródło jest wartościowe i tekstowe, nie wymaga OCR ani PDF.

---

## karawan_nekrologi — Karawan – Nekrologi

### 1. Status źródła

**Wymaga pobierania podstron szczegółowych. Działa przez statyczny HTML.**

Lista zawiera nadchodzące pogrzeby oraz pogrzeby z wczoraj/przedwczoraj. Detail zawiera pełne dane: data śmierci, data pogrzebu, godzina mszy, kaplica i cmentarz.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://karawan.pl/nekrologi/`
- Link szczegółu:
  - wzorzec `https://karawan.pl/nekrolog/<slug>/`

Ścieżka ręczna:

```text
Wejdź na /nekrologi/ → sekcja „Nadchodzące pogrzeby” → kliknij „Więcej informacji” → detail nekrologu.
```

Przykład listy:

```text
Śp. WŁADYSŁAW STOŻEK
zm. 02.05.2026
Wiek: 85
Pogrzeb dziś: 08.05.2026
Więcej informacji
```

Przykład detailu:

```text
Śp. WŁADYSŁAW STOŻEK
zm. 02.05.2026
Pogrzeb dziś: 08.05.2026 (Piątek)
Msza Święta: 08.05.2026 o godz. 09:00 KAPLICA CMENTARNA RAKOWICE
Cmentarz: CMENTARZ RAKOWICKI
```

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL: `https://karawan.pl/nekrologi/`
- Selektor linków szczegółów, praktyczny:

```css
a[href^="https://karawan.pl/nekrolog/"],
a[href^="/nekrolog/"]
```

- Sekcje tekstowe:
  - `Nadchodzące pogrzeby`,
  - `Pogrzeby, które odbyły się wczoraj i przedwczoraj`.

Nie potwierdzono paginacji na stronie głównej Karawan. Aktualna lista jest krótka i wystarczy jedna strona.

### 4. Jak pobrać szczegóły wpisu

- Metoda: `GET`
- URL: `/nekrolog/<slug>/`
- Pola:
  - nagłówek: imię i nazwisko,
  - `zm. DD.MM.YYYY`: data śmierci,
  - `Pogrzeb dziś/wczoraj/przedwczoraj: DD.MM.YYYY`: data pogrzebu,
  - `Msza Święta: DD.MM.YYYY o godz. HH:MM ...`: godzina i kaplica,
  - `Cmentarz: ...`: cmentarz.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | generować `death` + `funeral` | — | jw. | Źródło zawiera oba typy danych. |
| `name` | nagłówek/detail | `Śp. WŁADYSŁAW STOŻEK` | usunąć `Śp.`, zachować wielkość lub title-case opcjonalnie | Nie wymuszać title-case dla nazwisk złożonych. |
| `date_death` | detail/lista | `zm. 02.05.2026` | `2026-05-02` | — |
| `date_funeral` | detail/lista | `Pogrzeb dziś: 08.05.2026` | `2026-05-08` | Nie parsować słowa „dziś” jako daty. Użyć daty jawnej. |
| `time_funeral` | detail | `o godz. 09:00` | `09:00` | — |
| `place` | detail | kaplica + cmentarz | połączyć | np. `KAPLICA CMENTARNA RAKOWICE – CMENTARZ RAKOWICKI`. |
| `source_id` | config | `karawan_nekrologi` | bez zmian | — |
| `source_name` | config | nazwa | bez zmian | — |
| `url` | link szczegółu | `/nekrolog/<slug>/` | absolutny URL | — |
| `source_url` | lista | `/nekrologi/` | bez zmian | — |
| `note` | wiek, prośby rodziny | tekst | krótki opis | Detail może zawierać prośby rodziny. |

### 6. Proponowany parser

- Funkcja: `parseKarawan`
- Obecny type: `generic_html`
- Proponowany type: `karawan_nekrologi`
- `enabled`: true
- Dodatkowe pola:

```json
{
  "list_url": "https://karawan.pl/nekrologi/",
  "detail_url_pattern": "https://karawan.pl/nekrolog/{slug}/",
  "requires_detail_fetch": true,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

```json
{
  "kind": "funeral",
  "name": "WŁADYSŁAW STOŻEK",
  "date_death": "2026-05-02",
  "date_funeral": "2026-05-08",
  "time_funeral": "09:00",
  "place": "KAPLICA CMENTARNA RAKOWICE – CMENTARZ RAKOWICKI",
  "source_id": "karawan_nekrologi",
  "source_name": "Karawan – Nekrologi",
  "url": "https://karawan.pl/nekrolog/wladyslaw-stozek/",
  "source_url": "https://karawan.pl/nekrologi/",
  "note": "Wiek: 85"
}
```

```json
{
  "kind": "funeral",
  "name": "ELŻBIETA RODECKA",
  "date_death": "2026-04-29",
  "date_funeral": "2026-05-08",
  "time_funeral": "11:00",
  "place": "KAPLICA CMENTARNA RAKOWICE – CMENTARZ RAKOWICKI",
  "source_id": "karawan_nekrologi",
  "source_name": "Karawan – Nekrologi",
  "url": "https://karawan.pl/nekrolog/elzbieta-rodecka/",
  "source_url": "https://karawan.pl/nekrologi/",
  "note": "Wiek: 91 | Prosimy o nieskładanie kondolencji."
}
```

```json
{
  "kind": "funeral",
  "name": "WŁADYSŁAW JÓZEF KORDELA",
  "date_death": "2026-04-25",
  "date_funeral": "2026-05-08",
  "time_funeral": "12:20",
  "place": "KAPLICA CMENTARNA RAKOWICE – CMENTARZ RAKOWICKI",
  "source_id": "karawan_nekrologi",
  "source_name": "Karawan – Nekrologi",
  "url": "https://karawan.pl/nekrolog/wladyslaw-jozef-kordela/",
  "source_url": "https://karawan.pl/nekrologi/",
  "note": "Wiek: 91 | HARCMISTRZ, MATEMATYK, MIŁOŚNIK MAZURSKICH JEZIOR"
}
```

### 8. Minimalny algorytm parsera

1. Pobierz `https://karawan.pl/nekrologi/`.
2. Zbierz linki `/nekrolog/<slug>/`.
3. Dla każdego linku pobierz detail.
4. Z detailu wyciągnij:
   - `name`,
   - `date_death`,
   - `date_funeral`,
   - `time_funeral`,
   - `place`.
5. Zbuduj rekord `death` i, jeżeli jest data pogrzebu, `funeral`.
6. Usuń duplikaty po:

```text
kind + name + date_death + date_funeral + url
```

### 9. Ryzyka i ograniczenia

- Nazwy na liście są wielkimi literami.
- Detail może zawierać obrazy, ale podstawowe dane są tekstowe.
- Warto ograniczyć liczbę detail fetch do linków z aktualnej listy.

### 10. Rekomendacja

**Wdrożyć parser z detail fetch.** Źródło jest bardzo dobre jakościowo dla pogrzebów.

---

## salwator_grobonet — Kraków Salwator – Grobonet

### 1. Status źródła

**Aktualnie brak widocznych wpisów w statycznym HTML / możliwe, że źródło jest puste albo wymaga dodatkowego sprawdzenia JS/API.**

Strona `nekrologi.php` zwraca publiczny HTML z nagłówkiem „Nekrologi”, ale w badanym widoku nie było listy nekrologów ani danych osób. Widoczne były tylko elementy nawigacji i dane kontaktowe parafii/cmentarza.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://krakowsalwator.grobonet.com/nekrologi.php`
- Ścieżka ręczna: wejść na URL → zakładka „Nekrologi”.
- W aktualnym HTML brak rekordów.
- Nie potwierdzono endpointu JSON/API.
- Nie potwierdzono paginacji ani detail linków.

### 3. Jak pobrać listę wpisów

Na dziś brak potwierdzonej listy. Parser może wykonać `GET` i sprawdzić, czy pojawią się linki/rekordy:

```css
a[href*="nekrolog"],
tr,
.card,
.lista,
.osoba
```

Te selektory są tylko hipotezą do testu surowego HTML. Nie zostały potwierdzone na aktualnie pustej stronie.

### 4. Jak pobrać szczegóły wpisu

Nie ustalono wzorca detail URL dla tej instancji Grobonet, ponieważ aktualna strona nie pokazała wpisów.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | brak danych | — | prawdopodobnie `death` lub `funeral` | Niepotwierdzone. |
| `name` | brak danych | — | — | — |
| `date_death` | brak danych | — | — | — |
| `date_funeral` | brak danych | — | — | — |
| `time_funeral` | brak danych | — | — | — |
| `place` | cmentarz/parafia | `Cmentarz Parafialny w Krakowie` | stała | Można ustawić tylko jeśli jest rekord. |
| `source_id` | config | `salwator_grobonet` | bez zmian | — |
| `source_name` | config | nazwa | bez zmian | — |
| `url` | potencjalny detail | brak | — | — |
| `source_url` | URL listy | — | bez zmian | — |
| `note` | brak | — | — | — |

### 6. Proponowany parser

- Funkcja: `parseGrobonetSalwator`
- Obecny type: `generic_html`
- Proponowany type: `grobonet_nekrologi`
- `enabled`: **false albo true z parserem, który bezbłędnie zwraca pustą listę**
- Dodatkowe pola:

```json
{
  "list_url": "https://krakowsalwator.grobonet.com/nekrologi.php",
  "requires_detail_fetch": false,
  "requires_ocr": false,
  "requires_pdf": false,
  "status_note": "W aktualnym HTML brak wpisów; parser do ponownego sprawdzenia, gdy pojawią się nekrologi."
}
```

### 7. Przykładowe wpisy testowe

Brak aktualnych wpisów widocznych w badanym HTML. Nie należy tworzyć fikcyjnych rekordów.

### 8. Minimalny algorytm parsera

1. Pobierz `https://krakowsalwator.grobonet.com/nekrologi.php`.
2. Sprawdź, czy po nagłówku `Nekrologi` są elementy zawierające imię/nazwisko i daty.
3. Jeżeli nie ma rekordów, zwróć:

```json
{
  "rows": [],
  "error": null
}
```

4. Jeżeli pojawią się rekordy, zapisać HTML jako fixture i dopiero wtedy ustalić selektory.

### 9. Ryzyka i ograniczenia

- Grobonet może mieć dane ładowane przez JS albo tylko okresowo publikować nekrologi.
- Bez aktualnego wpisu nie da się potwierdzić selektorów.
- Parser ogólny Grobonet warto projektować dopiero po zebraniu 2–3 instancji Grobonet z aktywnymi nekrologami.

### 10. Rekomendacja

**Na teraz wdrożyć parser pusty/bezbłędny albo zostawić jako niskopriorytetowe.** Nie traktować jako źródła krytycznego, dopóki nie pojawią się aktualne wpisy lub nie zostanie potwierdzony endpoint.

---

## debniki_sdb — Parafia św. Stanisława Kostki (Dębniki)

### 1. Status źródła

**Nie jest dobrym źródłem nekrologów. Strona ma intencje mszalne w statycznym HTML, ale nie należy ich traktować jako zgony ani pogrzeby.**

Na stronie głównej widoczne są ogłoszenia parafialne. Link „Intencje” prowadzi do `/intencje/`, gdzie widoczna jest tygodniowa lista intencji mszalnych, np. `07:00 + Jerzy Palusiński (gr)`.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://debniki.sdb.org.pl/`
- Link intencji: `https://debniki.sdb.org.pl/intencje/`
- Ścieżka ręczna:

```text
Wejdź na stronę główną → kliknij „Intencje” → odczytaj tygodniową listę intencji.
```

Dane w `/intencje/` mają postać:

```text
NIEDZIELA 03 maja
07:00 + Jerzy Palusiński (gr)
10:00 + Józef Światak (gr)
...
```

To są intencje mszalne, nie lista pogrzebów.

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL: `https://debniki.sdb.org.pl/intencje/`
- Dane są tekstowe w HTML.
- Parser technicznie może zbierać nagłówki dni i linie zaczynające się od godziny oraz `+`/`++`/`†`.

Praktyczny regex linii intencji:

```regex
^([01]?\d|2[0-3]):[0-5]\d\s+[+†]{1,3}\s+(.+)$
```

Ale wyniki nie powinny trafiać do `deaths` ani `funerals` jako pełnoprawne rekordy.

### 4. Jak pobrać szczegóły wpisu

Brak podstron szczegółowych dla intencji. Lista jest na jednej stronie.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | nie rekomendować | — | ewentualnie osobny typ `mention` poza obecnym modelem | Nie wpisywać jako `death` ani `funeral`. |
| `name` | linia intencji | `+ Jerzy Palusiński (gr)` | usunąć znak `+`, ale ostrożnie | Może być kilka osób albo opis rocznicy. |
| `date_death` | brak | — | `null` | — |
| `date_funeral` | data dnia intencji | `03 maja` | nie mapować jako pogrzeb | To data mszy/intencji, nie pogrzebu. |
| `time_funeral` | godzina mszy | `07:00` | `HH:MM` | Nie jest godziną pogrzebu. |
| `place` | stała parafia | Parafia Dębniki | — | — |
| `source_id` | config | `debniki_sdb` | — | — |
| `source_name` | config | nazwa | — | — |
| `url` | `/intencje/` | — | — | — |
| `source_url` | główna strona | — | — | — |
| `note` | pełna linia intencji | tekst | zachować | Tylko informacyjnie. |

### 6. Proponowany parser

- Funkcja: `parseDebnikiSdb`
- Obecny type: `generic_html`
- Proponowany type: `debniki_intencje` albo `disabled`
- Rekomendowany `enabled`: **false dla głównego pipeline nekrologów**
- Alternatywnie: `enabled: true`, ale parser nie powinien zwracać `death/funeral`.

Dodatkowe pola:

```json
{
  "list_url": "https://debniki.sdb.org.pl/intencje/",
  "requires_detail_fetch": false,
  "is_intentions_source": true,
  "do_not_emit_death_or_funeral": true,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

To są przykłady intencji, **nie rekordy nekrologowe**:

```json
{
  "kind": "mention",
  "name": "Jerzy Palusiński",
  "date_death": null,
  "date_funeral": null,
  "time_funeral": null,
  "place": "Parafia św. Stanisława Kostki (Dębniki)",
  "source_id": "debniki_sdb",
  "source_name": "Parafia św. Stanisława Kostki (Dębniki)",
  "url": "https://debniki.sdb.org.pl/intencje/",
  "source_url": "https://debniki.sdb.org.pl/",
  "note": "Intencja: 07:00 + Jerzy Palusiński (gr). Nie traktować jako zgon/pogrzeb."
}
```

```json
{
  "kind": "mention",
  "name": "Zygmunt Ptak",
  "date_death": null,
  "date_funeral": null,
  "time_funeral": null,
  "place": "Parafia św. Stanisława Kostki (Dębniki)",
  "source_id": "debniki_sdb",
  "source_name": "Parafia św. Stanisława Kostki (Dębniki)",
  "url": "https://debniki.sdb.org.pl/intencje/",
  "source_url": "https://debniki.sdb.org.pl/",
  "note": "Intencja: 07:00 + Zygmunt Ptak w 5 r. śm. To rocznica/intencja, nie nowy zgon."
}
```

### 8. Minimalny algorytm parsera

Jeżeli mimo rekomendacji źródło ma być monitorowane:

1. Pobierz `https://debniki.sdb.org.pl/intencje/`.
2. Podziel tekst po nagłówkach dni tygodnia.
3. Zbierz linie intencji zaczynające się godziną i znakiem `+`/`†`.
4. Nie zwracaj ich jako `death` ani `funeral`.
5. Opcjonalnie zapisz jako osobne `mentions`, jeśli aplikacja kiedyś dostanie trzeci typ danych.

### 9. Ryzyka i ograniczenia

- Bardzo wysokie ryzyko fałszywych trafień.
- Intencje gregoriańskie `(gr)`, rocznice śmierci i modlitwy za wielu zmarłych nie oznaczają bieżącego zgonu.
- Obecny parser `parseIntentionsPlus` zwracający `kind: "death"` jest zbyt ryzykowny dla tego źródła.

### 10. Rekomendacja

**Zostawić disabled dla pipeline `deaths/funerals` albo wdrożyć tylko jako źródło informacyjnych wzmianek poza głównym modelem.** Nie używać do automatycznego wykrywania zgonów.

---

## podwawelskie_nekrologi — Podwawelskie – Nekrologi

### 1. Status źródła

**Działa przez statyczny HTML, ale dostarcza głównie datę urodzenia i datę śmierci, bez daty/godziny pogrzebu.**

Strona zawiera paginowaną listę nekrologów parafialnych. Rekordy są tekstowe, nie jako obraz/PDF. W aktualnym widoku każdy rekord wygląda jak cztery kolejne pola:

```text
Imię
Nazwisko
YYYY-MM-DD
YYYY-MM-DD
```

Pierwsza data wygląda na datę urodzenia, druga na datę śmierci.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://www.podwawelskie.pl/aktualnosci/nekrologi.html`
- Paginacja:
  - `https://www.podwawelskie.pl/aktualnosci/nekrologi--str-1.html?str=1`
  - `https://www.podwawelskie.pl/aktualnosci/nekrologi--str-2.html?str=2`
  - itd.
- Ścieżka ręczna:

```text
Wejdź na Nekrologi → lista stron 1..6 → odczytaj kolejne rekordy tekstowe.
```

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL pierwszej strony: `https://www.podwawelskie.pl/aktualnosci/nekrologi.html`
- URL paginacji: `https://www.podwawelskie.pl/aktualnosci/nekrologi--str-{n}.html?str={n}`
- Dane są w HTML jako tekst.
- Linki paginacji są widoczne jako numery stron.

Nie potwierdzono osobnych podstron szczegółowych dla każdego nekrologu. Widok wygląda jak lista tabelaryczna bez linków szczegółowych.

### 4. Jak pobrać szczegóły wpisu

Detail fetch nie jest potrzebny, chyba że surowy HTML pokaże ukryte linki. Aktualnie dane podstawowe są bezpośrednio na liście.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | stała | — | `death` | Źródło podaje nekrologi/zmarłych, nie harmonogram pogrzebów. |
| `name` | dwa kolejne pola tekstowe | `Marian` + `Roś` | połączyć spacją | Uważać na nazwiska wieloczłonowe. |
| `date_death` | druga data w rekordzie | `2026-03-23` | już ISO | — |
| `date_funeral` | brak | — | `null` | — |
| `time_funeral` | brak | — | `null` | — |
| `place` | parafia | stała | `Parafia Matki Boskiej Fatimskiej, Kraków os. Podwawelskie` | — |
| `source_id` | config | `podwawelskie_nekrologi` | — | — |
| `source_name` | config | nazwa | — | — |
| `url` | URL strony/paginacji | lista | bez zmian | Ustawić na stronę, z której pochodzi rekord. |
| `source_url` | URL główny | — | bez zmian | — |
| `note` | data urodzenia | `ur. YYYY-MM-DD` | tekst | Nie ma daty pogrzebu. |

### 6. Proponowany parser

- Funkcja: `parsePodwawelskie`
- Obecny type: `generic_html`
- Proponowany type: `podwawelskie_nekrologi`
- `enabled`: true
- Dodatkowe pola:

```json
{
  "list_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "page_url_pattern": "https://www.podwawelskie.pl/aktualnosci/nekrologi--str-{page}.html?str={page}",
  "max_pages": 2,
  "requires_detail_fetch": false,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

```json
{
  "kind": "death",
  "name": "Marian Roś",
  "date_death": "2026-03-23",
  "date_funeral": null,
  "time_funeral": null,
  "place": "Parafia Matki Boskiej Fatimskiej, Kraków os. Podwawelskie",
  "source_id": "podwawelskie_nekrologi",
  "source_name": "Podwawelskie – Nekrologi",
  "url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "source_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "note": "Data urodzenia: 1933-06-30"
}
```

```json
{
  "kind": "death",
  "name": "Anna Jasiewicz",
  "date_death": "2026-03-21",
  "date_funeral": null,
  "time_funeral": null,
  "place": "Parafia Matki Boskiej Fatimskiej, Kraków os. Podwawelskie",
  "source_id": "podwawelskie_nekrologi",
  "source_name": "Podwawelskie – Nekrologi",
  "url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "source_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "note": "Data urodzenia: 1940-02-27"
}
```

```json
{
  "kind": "death",
  "name": "Elżbieta Kapusta",
  "date_death": "2026-03-07",
  "date_funeral": null,
  "time_funeral": null,
  "place": "Parafia Matki Boskiej Fatimskiej, Kraków os. Podwawelskie",
  "source_id": "podwawelskie_nekrologi",
  "source_name": "Podwawelskie – Nekrologi",
  "url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "source_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "note": "Data urodzenia: 1948-03-16"
}
```

### 8. Minimalny algorytm parsera

1. Pobierz stronę główną nekrologów.
2. Zidentyfikuj blok po nagłówku `Nekrologi` i przed stopką/menu bocznym.
3. Usuń numery paginacji.
4. Z tekstu zbuduj sekwencję tokenów.
5. Szukaj wzorca:

```text
imię, nazwisko, YYYY-MM-DD, YYYY-MM-DD
```

6. Pierwszą datę zapisz w `note` jako datę urodzenia.
7. Drugą datę zapisz jako `date_death`.
8. Zbuduj rekord `death`.
9. Usuń duplikaty po:

```text
name + date_death + source_id
```

### 9. Ryzyka i ograniczenia

- Brak dat pogrzebu i godzin.
- Nazwiska dwuczłonowe mogą utrudnić parsowanie prostym wzorcem „imię + nazwisko”.
- Strona zawiera dużo menu i stopki; trzeba ograniczyć parser do bloku treści.

### 10. Rekomendacja

**Wdrożyć parser częściowy.** Źródło jest dobre dla `recent_deaths`, ale nie dla `upcoming_funerals`.

---

## sw_jadwiga_pogrzebowe — Parafia św. Jadwigi – Msze święte pogrzebowe

### 1. Status źródła

**Działa przez statyczny HTML, ale semantycznie jest to źródło mszy pogrzebowych, nie zgonów. Wymaga detail fetch dla pełnych wpisów.**

Lista zawiera tytuły typu `śp. Józef Pasyk`, a niektóre wpisy mają już na liście podane terminy mszy. Każdy tytuł prowadzi do podstrony szczegółowej.

### 2. Gdzie dokładnie są dane

- URL startowy: `https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe`
- Link szczegółu:
  - wzorzec `https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/<slug>`
- Paginacja:
  - linki z parametrem `?aktualnie=30`, itd.

Ścieżka ręczna:

```text
Wejdź na stronę „Msze święte pogrzebowe” → kliknij nazwisko zmarłego → odczytaj listę mszy na podstronie.
```

Przykład z listy:

```text
śp.Józef Pasyk
1. Od córki Mirosławy Leśniak 14.05.26r. godz. 6.30
2. Od Ani, Przemka, Andrzejka i Grzesia Kluba 18.05.26r. godz. 7.00
3. Od rodziny Abratańskich 27.05.26r. godz. 6.30
```

### 3. Jak pobrać listę wpisów

- Metoda: `GET`
- URL: `https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe`
- Linki wpisów:

```css
a[href*="/parafia/msze-swiete-pogrzebowe/"]
```

- Filtrowanie:
  - przyjmować tytuły zawierające `śp`, `Śp`, `Sp.` lub podobne,
  - nie brać linków paginacji jako wpisów.

### 4. Jak pobrać szczegóły wpisu

- Metoda: `GET`
- URL: link detail z listy.
- Detail powinien zawierać tytuł osoby oraz listę mszy.
- Terminy mają formaty:
  - `14.05.26r. godz. 6.30`,
  - `18.05.26r. godz. 7.00`,
  - możliwe warianty z `godz. 06:30`.

### 5. Mapowanie do rekordu aplikacji

| Pole aplikacji | Skąd pobrać | Format na stronie | Normalizacja | Uwagi |
|---|---|---|---|---|
| `kind` | stała | — | `funeral` albo lepiej `funeral_mass` jeśli model zostanie rozszerzony | W obecnym modelu najbliżej: `funeral`. |
| `name` | tytuł wpisu | `śp.Józef Pasyk` | usunąć `śp.`, naprawić brak spacji | — |
| `date_death` | brak | — | `null` | To nie źródło daty zgonu. |
| `date_funeral` | data mszy pogrzebowej | `14.05.26r.` | `2026-05-14` | To data mszy pogrzebowej, niekoniecznie data pogrzebu. |
| `time_funeral` | termin mszy | `godz. 6.30` | `06:30` | Zamienić kropkę na dwukropek. |
| `place` | stała | Parafia św. Jadwigi | tekst | Detail może nie podawać cmentarza. |
| `source_id` | config | `sw_jadwiga_pogrzebowe` | — | — |
| `source_name` | config | nazwa | — | — |
| `url` | detail URL | `/sp-jozef-pasyk` | absolutny URL | — |
| `source_url` | lista | URL listy | bez zmian | — |
| `note` | linia „Od ...” | tekst | zachować | Ważne: msza zamówiona przy okazji pogrzebu. |

### 6. Proponowany parser

- Funkcja: `parseSwJadwigaPogrzebowe`
- Obecny type: `generic_html`
- Proponowany type: `sw_jadwiga_pogrzebowe`
- `enabled`: true, ale z wyraźną semantyką „msze pogrzebowe”
- Dodatkowe pola:

```json
{
  "list_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
  "page_url_pattern": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/?aktualnie={offset}",
  "detail_url_pattern": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/{slug}",
  "requires_detail_fetch": true,
  "is_funeral_mass_source": true,
  "requires_ocr": false,
  "requires_pdf": false
}
```

### 7. Przykładowe wpisy testowe

```json
{
  "kind": "funeral",
  "name": "Józef Pasyk",
  "date_death": null,
  "date_funeral": "2026-05-14",
  "time_funeral": "06:30",
  "place": "Parafia św. Jadwigi Królowej w Krakowie",
  "source_id": "sw_jadwiga_pogrzebowe",
  "source_name": "Parafia św. Jadwigi – Msze święte pogrzebowe",
  "url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/sp-jozef-pasyk",
  "source_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
  "note": "Msza święta pogrzebowa: Od córki Mirosławy Leśniak. To termin mszy, nie data zgonu."
}
```

```json
{
  "kind": "funeral",
  "name": "Józef Pasyk",
  "date_death": null,
  "date_funeral": "2026-05-18",
  "time_funeral": "07:00",
  "place": "Parafia św. Jadwigi Królowej w Krakowie",
  "source_id": "sw_jadwiga_pogrzebowe",
  "source_name": "Parafia św. Jadwigi – Msze święte pogrzebowe",
  "url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/sp-jozef-pasyk",
  "source_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
  "note": "Msza święta pogrzebowa: Od Ani, Przemka, Andrzejka i Grzesia Kluba."
}
```

```json
{
  "kind": "funeral",
  "name": "Józef Pasyk",
  "date_death": null,
  "date_funeral": "2026-05-27",
  "time_funeral": "06:30",
  "place": "Parafia św. Jadwigi Królowej w Krakowie",
  "source_id": "sw_jadwiga_pogrzebowe",
  "source_name": "Parafia św. Jadwigi – Msze święte pogrzebowe",
  "url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/sp-jozef-pasyk",
  "source_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
  "note": "Msza święta pogrzebowa: Od rodziny Abratańskich."
}
```

### 8. Minimalny algorytm parsera

1. Pobierz listę główną.
2. Zbierz linki detail do wpisów osób.
3. Dla każdego detailu pobierz stronę.
4. Odczytaj `name` z tytułu.
5. Znajdź wszystkie terminy regexem:

```regex
(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*r?\.?\s*godz\.\s*(\d{1,2})[.:](\d{2})
```

6. Dla każdego terminu zbuduj osobny rekord `kind: "funeral"` z notatką, że to msza pogrzebowa.
7. Usuń duplikaty po:

```text
name + date_funeral + time_funeral + source_id + url
```

### 9. Ryzyka i ograniczenia

- To są msze zamówione przy okazji pogrzebu, a niekoniecznie sama ceremonia pogrzebowa.
- Jeden zmarły może mieć wiele mszy, więc powstanie wiele rekordów.
- Jeżeli UI aplikacji nie rozróżnia mszy pogrzebowej od pogrzebu, może to mylić użytkownika.

### 10. Rekomendacja

**Wdrożyć parser częściowy z wyraźną notatką.** Traktować jako `funeral` tylko dlatego, że obecny model nie ma `funeral_mass`. Docelowo rozważyć trzeci typ `funeral_mass`.

---

## facebook_parafia_debniki — Facebook – Parafia Dębniki

### 1. Status źródła

**Wymaga logowania / niestabilne / niezalecane.**

Publiczny odczyt strony Facebooka bez logowania zwrócił ekran logowania/blokady „You’re Temporarily Blocked”. Nie ma stabilnego HTML z postami do parsowania.

### 2. Gdzie dokładnie są dane

- URL: `https://www.facebook.com/parafiadebniki/?locale=pl_PL`
- Bez logowania i cookies nie uzyskano wiarygodnej listy postów.
- Brak publicznego RSS potwierdzonego w badaniu.

### 3. Jak pobrać listę wpisów

Nie rekomenduje się pobierania. Facebook wymaga logowania/cookies albo jest blokowany antybotowo.

### 4. Jak pobrać szczegóły wpisu

Nie projektować parsera.

### 5. Mapowanie do rekordu aplikacji

Nie dotyczy.

### 6. Proponowany parser

- Funkcja: brak
- Obecny type: `generic_html`
- Proponowany type: `facebook_disabled`
- `enabled`: false

Dodatkowe pola:

```json
{
  "enabled": false,
  "requires_login": true,
  "unstable_for_github_actions": true,
  "recommendation": "Nie parsować Facebooka bez oficjalnego API/RSS."
}
```

### 7. Przykładowe wpisy testowe

Brak. Nie pobrano publicznych postów bez logowania.

### 8. Minimalny algorytm parsera

Nie wdrażać.

### 9. Ryzyka i ograniczenia

- Blokada antybotowa.
- Cookies/logowanie.
- Zmienny HTML.
- Ryzyko naruszenia regulaminu przy obchodzeniu zabezpieczeń.

### 10. Rekomendacja

**Zostawić `enabled:false`.** Nie próbować parsować Facebooka w GitHub Actions.

---

# 6. Proponowane zmiany parserów

| source_id | obecny type | proponowany type | funkcja parsera | sposób pobrania | wymaga detail fetch | wymaga OCR | wymaga PDF | rekomendacja |
|---|---|---|---|---|---:|---:|---:|---|
| `zck_funerals` | `zck_funerals` | `zck_funerals` | `parseZckFunerals` | statyczny HTML `/funerals` | false | false | false | poprawić parser tekstowy, wdrożyć |
| `puk_pozegnalismy` | `generic_html` | `puk_pozegnalismy` | `parsePukPozegnalismy` | statyczny HTML listy | false | false | false | wydzielić osobny parser, zachować obecną logikę |
| `gabriel_nekrologi` | `generic_html` | `gabriel_nekrologi` | `parseGabriel24` | lista + detail `/nekrolog/<slug>/` | true | false | false | wdrożyć |
| `karawan_nekrologi` | `generic_html` | `karawan_nekrologi` | `parseKarawan` | lista + detail `/nekrolog/<slug>/` | true | false | false | wdrożyć |
| `salwator_grobonet` | `generic_html` | `grobonet_nekrologi` | `parseGrobonetSalwator` | statyczny HTML, obecnie brak wpisów | niepotwierdzone | false | false | niskopriorytetowo / pusty parser |
| `debniki_sdb` | `generic_html` | `debniki_intencje` albo disabled | `parseDebnikiSdb` | `/intencje/`, statyczny HTML | false | false | false | zostawić poza `deaths/funerals` |
| `podwawelskie_nekrologi` | `generic_html` | `podwawelskie_nekrologi` | `parsePodwawelskie` | statyczny HTML + paginacja | false | false | false | wdrożyć parser częściowy `death` |
| `sw_jadwiga_pogrzebowe` | `generic_html` | `sw_jadwiga_pogrzebowe` | `parseSwJadwigaPogrzebowe` | lista + detail, ewentualnie paginacja offset | true | false | false | wdrożyć jako msze pogrzebowe, ostrożnie |
| `facebook_parafia_debniki` | `generic_html` | `facebook_disabled` | brak | brak stabilnego pobrania bez logowania | — | — | — | zostawić disabled |

---

# 7. Proponowane zmiany `config/sources.json`

Proponowana struktura konfiguracyjna:

```json
{
  "sources": [
    {
      "id": "zck_funerals",
      "name": "ZCK Kraków – Porządek pogrzebów",
      "type": "zck_funerals",
      "url": "https://www.zck-krakow.pl/funerals",
      "list_url": "https://www.zck-krakow.pl/funerals",
      "enabled": true,
      "distance_km": 0,
      "requires_detail_fetch": false
    },
    {
      "id": "puk_pozegnalismy",
      "name": "PUK Kraków – Pożegnaliśmy",
      "type": "puk_pozegnalismy",
      "url": "https://www.puk.krakow.pl/pozegnalismy/",
      "list_url": "https://www.puk.krakow.pl/pozegnalismy/",
      "enabled": true,
      "distance_km": 4.5,
      "requires_detail_fetch": false,
      "detail_fetch_optional": true
    },
    {
      "id": "gabriel_nekrologi",
      "name": "Gabriel24 – Nekrologi",
      "type": "gabriel_nekrologi",
      "url": "https://www.gabriel24.pl/nekrologi/",
      "list_url": "https://www.gabriel24.pl/nekrologi/",
      "page_url_pattern": "https://www.gabriel24.pl/nekrologi/page/{page}/",
      "max_pages": 3,
      "enabled": true,
      "distance_km": 6.5,
      "requires_detail_fetch": true
    },
    {
      "id": "karawan_nekrologi",
      "name": "Karawan – Nekrologi",
      "type": "karawan_nekrologi",
      "url": "https://karawan.pl/nekrologi/",
      "list_url": "https://karawan.pl/nekrologi/",
      "enabled": true,
      "distance_km": 7.5,
      "requires_detail_fetch": true
    },
    {
      "id": "salwator_grobonet",
      "name": "Kraków Salwator – Grobonet",
      "type": "grobonet_nekrologi",
      "url": "https://krakowsalwator.grobonet.com/nekrologi.php",
      "list_url": "https://krakowsalwator.grobonet.com/nekrologi.php",
      "enabled": true,
      "distance_km": 5.5,
      "requires_detail_fetch": false,
      "status_note": "W aktualnym HTML brak wpisów; parser powinien zwracać pustą listę bez błędu."
    },
    {
      "id": "debniki_sdb",
      "name": "Parafia św. Stanisława Kostki (Dębniki)",
      "type": "debniki_intencje",
      "url": "https://debniki.sdb.org.pl/",
      "list_url": "https://debniki.sdb.org.pl/intencje/",
      "enabled": false,
      "distance_km": 2.5,
      "is_intentions_source": true,
      "do_not_emit_death_or_funeral": true
    },
    {
      "id": "podwawelskie_nekrologi",
      "name": "Podwawelskie – Nekrologi",
      "type": "podwawelskie_nekrologi",
      "url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
      "list_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
      "page_url_pattern": "https://www.podwawelskie.pl/aktualnosci/nekrologi--str-{page}.html?str={page}",
      "max_pages": 2,
      "enabled": true,
      "distance_km": 2.5,
      "requires_detail_fetch": false
    },
    {
      "id": "sw_jadwiga_pogrzebowe",
      "name": "Parafia św. Jadwigi – Msze święte pogrzebowe",
      "type": "sw_jadwiga_pogrzebowe",
      "url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
      "list_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
      "page_url_pattern": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/?aktualnie={offset}",
      "enabled": true,
      "distance_km": 6.5,
      "requires_detail_fetch": true,
      "is_funeral_mass_source": true
    },
    {
      "id": "facebook_parafia_debniki",
      "name": "Facebook – Parafia Dębniki",
      "type": "facebook_disabled",
      "url": "https://www.facebook.com/parafiadebniki/?locale=pl_PL",
      "enabled": false,
      "distance_km": 2.5,
      "requires_login": true,
      "unstable_for_github_actions": true
    }
  ]
}
```

---

# 8. Przykładowe rekordy testowe

Poniżej zebrane realne rekordy z badania. Rekordy z PUK, Gabriel i Karawan są pełnoprawnymi rekordami `death/funeral`. Rekordy z Dębnik oznaczono jako `mention`, bo nie powinny trafiać do obecnych list `deaths/funerals`.

```json
[
  {
    "kind": "funeral",
    "name": "Barbara Piechnik",
    "date_death": "2026-04-14",
    "date_funeral": "2026-05-12",
    "time_funeral": "12:00",
    "place": "PUK Kraków – Pożegnaliśmy",
    "source_id": "puk_pozegnalismy",
    "source_name": "PUK Kraków – Pożegnaliśmy",
    "url": "link z przycisku Szczegóły do nekrolog.eklepsydra.pl",
    "source_url": "https://www.puk.krakow.pl/pozegnalismy/",
    "note": "W dniu 14.04.2026 przeżywszy 64 lat zmarła"
  },
  {
    "kind": "funeral",
    "name": "Zdzisław Kotaś",
    "date_death": "2026-04-10",
    "date_funeral": "2026-04-16",
    "time_funeral": "13:40",
    "place": "kaplica cmentarna – cmentarz komunalny Grębałów",
    "source_id": "gabriel_nekrologi",
    "source_name": "Gabriel24 – Nekrologi",
    "url": "https://www.gabriel24.pl/nekrolog/zdzislaw-kotas/",
    "source_url": "https://www.gabriel24.pl/nekrologi/",
    "note": "Wiek: 84 lata"
  },
  {
    "kind": "funeral",
    "name": "WŁADYSŁAW STOŻEK",
    "date_death": "2026-05-02",
    "date_funeral": "2026-05-08",
    "time_funeral": "09:00",
    "place": "KAPLICA CMENTARNA RAKOWICE – CMENTARZ RAKOWICKI",
    "source_id": "karawan_nekrologi",
    "source_name": "Karawan – Nekrologi",
    "url": "https://karawan.pl/nekrolog/wladyslaw-stozek/",
    "source_url": "https://karawan.pl/nekrologi/",
    "note": "Wiek: 85"
  },
  {
    "kind": "death",
    "name": "Marian Roś",
    "date_death": "2026-03-23",
    "date_funeral": null,
    "time_funeral": null,
    "place": "Parafia Matki Boskiej Fatimskiej, Kraków os. Podwawelskie",
    "source_id": "podwawelskie_nekrologi",
    "source_name": "Podwawelskie – Nekrologi",
    "url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
    "source_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
    "note": "Data urodzenia: 1933-06-30"
  },
  {
    "kind": "funeral",
    "name": "Józef Pasyk",
    "date_death": null,
    "date_funeral": "2026-05-14",
    "time_funeral": "06:30",
    "place": "Parafia św. Jadwigi Królowej w Krakowie",
    "source_id": "sw_jadwiga_pogrzebowe",
    "source_name": "Parafia św. Jadwigi – Msze święte pogrzebowe",
    "url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe/sp-jozef-pasyk",
    "source_url": "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe",
    "note": "Msza święta pogrzebowa: Od córki Mirosławy Leśniak."
  }
]
```

---

# 9. Ryzyka i ograniczenia

1. **Brak pełnego Network/XHR z DevTools.**  
   W tym badaniu potwierdzono publiczny HTML. Nie potwierdzono endpointów JSON/API poza samymi URL-ami HTML. Dla ZCK warto dodatkowo ręcznie sprawdzić kalendarz w DevTools.

2. **Źródła semantycznie różne.**  
   Nie wszystkie źródła są nekrologami:
   - ZCK: pogrzeby,
   - PUK/Gabriel/Karawan: nekrologi + pogrzeby,
   - Podwawelskie: zgony/nekrologi bez pogrzebów,
   - Dębniki: intencje mszalne,
   - św. Jadwiga: msze pogrzebowe.

3. **Detail fetch jest potrzebny dla Gabriel i Karawan.**  
   Parser listy bez szczegółów nie dostarczy godziny i miejsca.

4. **Facebook nie nadaje się do GitHub Actions.**  
   Wymaga logowania/cookies albo jest blokowany.

5. **OCR/PDF nie są potrzebne dla potwierdzonych danych.**  
   W badanych publicznych widokach podstawowe dane źródeł PUK, Gabriel, Karawan, Podwawelskie i św. Jadwiga są tekstowe. Nie projektować OCR jako domyślnego etapu.

6. **Salwator/Grobonet wymaga ponownego sprawdzenia, gdy pojawią się wpisy.**  
   Aktualnie brak danych osób w HTML.

---

# 10. Plan wdrożenia dla kolejnego agenta/kodera

1. **Rozdzielić `generic_html` na parsery jawne.**
   - Dodać funkcje:
     - `parsePukPozegnalismy`,
     - `parseGabriel24`,
     - `parseKarawan`,
     - `parsePodwawelskie`,
     - `parseSwJadwigaPogrzebowe`,
     - opcjonalnie `parseGrobonetSalwator`,
     - opcjonalnie `parseDebnikiSdb` jako parser wzmianek, ale nie `death/funeral`.

2. **Zmienić dispatch w `refresh_static.mjs`.**
   Dodać obsługę nowych `source.type`:

```text
zck_funerals → parseZckFunerals
puk_pozegnalismy → parsePukPozegnalismy
gabriel_nekrologi → parseGabriel24
karawan_nekrologi → parseKarawan
podwawelskie_nekrologi → parsePodwawelskie
sw_jadwiga_pogrzebowe → parseSwJadwigaPogrzebowe
grobonet_nekrologi → parseGrobonetSalwator
debniki_intencje → parseDebnikiSdb albo pomiń
facebook_disabled → pomiń
```

3. **Zaktualizować `config/sources.json`.**
   - Zmienić `type` z `generic_html` na typy jawne.
   - Dodać `list_url`, `page_url_pattern`, `max_pages`, `requires_detail_fetch`.
   - Utrzymać `facebook_parafia_debniki.enabled = false`.
   - Rozważyć `debniki_sdb.enabled = false` dla głównego pipeline.

4. **Poprawić helpery normalizacji.**
   Dodać funkcje:
   - `parsePolishDateToIso` dla `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD`,
   - `parseTimeToHHMM` dla `6.30`, `06:30`, `godz. 6.30`,
   - `stripDeceasedPrefix` dla `Śp.`, `ś.p`, `Sp.`, `śp.` bez spacji,
   - `absoluteUrl(base, href)`.

5. **Dodać fixtures HTML.**

```text
tests/fixtures/puk_pozegnalismy.html
tests/fixtures/gabriel_list_page1.html
tests/fixtures/gabriel_detail_zdzislaw_kotas.html
tests/fixtures/karawan_list.html
tests/fixtures/karawan_detail_wladyslaw_stozek.html
tests/fixtures/podwawelskie_nekrologi_page1.html
tests/fixtures/sw_jadwiga_list.html
tests/fixtures/sw_jadwiga_detail_jozef_pasyk.html
tests/fixtures/zck_funerals_current.html
```

6. **Dodać testy parserów.**
   Każdy parser powinien mieć test:
   - czy zwraca niepuste `rows`, jeśli fixture ma dane,
   - czy daty są w ISO,
   - czy godziny są w `HH:MM`,
   - czy linki są absolutne,
   - czy nie ma duplikatów,
   - czy Dębniki nie zwracają fałszywych `death/funeral`.

7. **Uruchomić testy.**

```bash
npm test
```

8. **Uruchomić refresh lokalnie / w GitHub Actions.**

```bash
npm run refresh
```

9. **Sprawdzić `data/latest.json`.**
   Zweryfikować:
   - `upcoming_funerals` zawiera ZCK/Karawan/Gabriel/św. Jadwiga,
   - `recent_deaths` zawiera PUK/Podwawelskie/Gabriel/Karawan,
   - nie ma wpisów z Dębnik-intencji jako zgonów,
   - `source_errors` nie maskują pustych parserów.

10. **Dodać raport z odświeżenia.**
    W `data/job.json` lub w logu warto zapisać liczby per źródło:

```json
{
  "source_stats": [
    { "source_id": "gabriel_nekrologi", "rows": 24, "errors": 0 },
    { "source_id": "salwator_grobonet", "rows": 0, "errors": 0, "note": "brak wpisów" }
  ]
}
```

---

# 11. Checklist testowania po wdrożeniu

## Testy ogólne

- [ ] `npm test` przechodzi bez błędów.
- [ ] `npm run refresh` kończy się statusem `done` albo `done_with_errors`, nie `error`.
- [ ] `data/latest.json` zawiera pola `deaths`, `funerals`, `recent_deaths`, `upcoming_funerals`.
- [ ] Każdy rekord ma `kind`, `name`, `source_id`, `source_name`, `url`, `source_url`.
- [ ] Daty są w formacie `YYYY-MM-DD` albo `null`.
- [ ] Godziny są w formacie `HH:MM` albo `null`.
- [ ] `priority_hit` nadal działa po zmianach parserów.

## Testy per źródło

### ZCK

- [ ] Parser zwraca rekordy `kind: "funeral"`.
- [ ] Każdy rekord ma `date_funeral`.
- [ ] Godzina nie trafia do pola `name`.
- [ ] Cmentarz/kaplica trafia do `place`.

### PUK

- [ ] Parser zwraca rekord `death`.
- [ ] Jeśli jest data pogrzebu, zwraca też rekord `funeral`.
- [ ] `ŚP.` jest usunięte z `name`.
- [ ] Link `Szczegóły` trafia do `url`.

### Gabriel

- [ ] Lista zbiera linki `/nekrolog/<slug>/`.
- [ ] Detail fetch uzupełnia `time_funeral` i `place`.
- [ ] Druga data z zakresu życia trafia do `date_death`.
- [ ] Parser nie pobiera całych 79 stron przy każdym refreshu.

### Karawan

- [ ] Lista zbiera linki `/nekrolog/<slug>/`.
- [ ] Detail fetch uzupełnia godzinę i cmentarz.
- [ ] Słowa `dziś`, `wczoraj`, `przedwczoraj` nie są używane jako data; parser używa jawnej daty.

### Salwator/Grobonet

- [ ] Przy braku wpisów parser zwraca `rows: []` bez błędu.
- [ ] Jeżeli pojawią się wpisy, zapisać fixture i dopiero wtedy dopisać selektory.

### Dębniki

- [ ] Intencje nie trafiają do `deaths` ani `funerals`.
- [ ] Jeżeli parser istnieje, zwraca najwyżej osobne `mentions` albo nic.

### Podwawelskie

- [ ] Parser łączy imię + nazwisko.
- [ ] Pierwszą datę zapisuje tylko jako data urodzenia w `note`.
- [ ] Drugą datę zapisuje jako `date_death`.
- [ ] Nie generuje fałszywych pogrzebów.

### Św. Jadwiga

- [ ] Parser rozpoznaje wiele terminów mszy dla jednej osoby.
- [ ] `6.30` normalizuje do `06:30`.
- [ ] `date_funeral` jest jasno opisana w `note` jako data mszy pogrzebowej.
- [ ] Detail fetch działa dla linków `/sp-...`.

### Facebook

- [ ] Źródło pozostaje `enabled:false`.
- [ ] Refresh nie próbuje pobierać Facebooka.

---

## Końcowa rekomendacja priorytetów

1. **Najpierw wdrożyć:** ZCK, PUK jako osobny parser, Karawan, Gabriel.
2. **Następnie wdrożyć częściowo:** Podwawelskie, św. Jadwiga.
3. **Niskie priority / ponowne sprawdzenie:** Salwator Grobonet.
4. **Wyłączyć z pipeline:** Dębniki-intencje i Facebook.
