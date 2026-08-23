# Nekrolog (tryb statyczny)

Aplikacja **Nekrolog** agreguje nekrologi, intencje mszalne i wpisy o pochówkach z wielu niezależnych źródeł internetowych, normalizuje dane do wspólnego formatu JSON i prezentuje je w prostym interfejsie statycznym (HTML/CSS/JS), bez backendu aplikacyjnego. Równolegle monitoruje wystąpienia wskazanej osoby (frazy z `Frazy.json`) i zgłasza trafienia webhookiem na Discord.

Projekt działa w modelu:
1. **Pobierz surowe dane ze źródeł** (różne strony WWW),
2. **Wydobądź rekordy parserami źródłowymi**,
3. **Oczyść, ujednolić i scal duplikaty**,
4. **Zapisz wynik do plików statycznych** (`data/latest.json`, `data/job.json`, `data/errors.json`),
5. **Wyświetl wynik w przeglądarce i zgłoś trafienia na Discord**.

---

## 1. Architektura rozwiązania

- `scripts/refresh_static.mjs` – główny skrypt odświeżania (pipeline ETL do JSON), okna czasowe, scalanie duplikatów, kondycja źródeł.
- `scripts/fetch.mjs` – pobieranie treści przez HTTP; ponowienia z backoffem przy błędach przejściowych (5xx, 429, zerwane połączenie) i awaryjne pobranie przez `curl` z nagłówkami przeglądarkowymi.
- `scripts/nekrolog_core.mjs` – definicje źródeł, **wszystkie parsery**, normalizacja nazwisk i dat, walidacja rekordów, dopasowanie fraz.
- `scripts/normalize.mjs` – luźne dopasowanie tekstu (diakrytyka, prefiksy `śp.`, myślniki, interpunkcja).
- `scripts/discord_notify.mjs` – powiadomienia Discord: alerty per trafienie i heartbeat.
- `scripts/date.mjs` – okna czasowe.
- `config/sources.json` – lista i konfiguracja źródeł (uzupełniana automatycznie z definicji w `nekrolog_core.mjs`).
- `Frazy.json` – frazy monitorowanej osoby (formy odmienione i warianty zapisu).
- `data/latest.json` – bieżący snapshot używany przez frontend.
- `data/job.json` – status przebiegu, diagnostyka i kondycja źródeł.
- `data/errors.json` – błędy źródeł oraz ostrzeżenia (`warnings`) o blokadach zewnętrznych.
- `data/source_health.json` – licznik kolejnych pustych przebiegów per źródło (wykrywanie cichych awarii) oraz `blocked_since` – moment rozpoczęcia bieżącej blokady anty-botowej.
- `app.js`, `index.html`, `styles.css` – warstwa prezentacji.

---

## 2. Kategorie rekordów

Każdy rekord ma pole `kind`:

| `kind` | Znaczenie | Okno czasowe | Sekcja w UI |
|---|---|---|---|
| `death` | zgon lub wzmianka o zgonie | `[dziś-7, dziś]` po `date_death` | Ostatnie zgony / wzmianki |
| `funeral` | pogrzeb z terminem | `[dziś, dziś+7]` po `date_funeral` | Najbliższe pogrzeby |
| `intention` | intencja mszalna za zmarłego (**„potrzeby”**) | `[dziś, dziś+7]` po `date_intention` | Najbliższe potrzeby |
| `grave` | pochówek w bazie cmentarnej | brak (zapisy historyczne) | Groby monitorowanych nazwisk |

**Trafienia monitorowanych fraz są niezależne od okien czasowych.** Pole `matches` w `data/latest.json` zawiera wszystkie pasujące rekordy — także wpisy sprzed miesięcy (np. Podwawelskie publikuje z opóźnieniem) i rekordy bez daty. Okna czasowe sterują wyłącznie sekcjami przeglądowymi.

---

## 3. Źródła i sposób odczytu

| Źródło | Typ parsera | Co dostarcza |
|---|---|---|
| ZCK Kraków – Porządek pogrzebów | `zck_funerals` | pogrzeby na jeden dzień; data z nagłówka `h4`, tabela `td.funeral-time/place/label` |
| PUK Kraków – Pożegnaliśmy | `puk_pozegnalismy` | zgon + pogrzeb (dwa rekordy na osobę), link do klepsydry |
| Gabriel24 – Nekrologi | `gabriel24_nekrologi` | nekrologi spod `/nekrolog/<slug>/`; daty, godzina mszy, cmentarz |
| Karawan – Nekrologi | `karawan_nekrologi` | jak wyżej (ten sam widżet e-Nekrolog) |
| Kraków Salwator – Groby | `grobonet_groby` | **wyszukiwarka grobów**: miejsce pochówku dla nazwisk z `search_terms` |
| Parafia Dębniki – ogłoszenia | `debniki_sdb_pogrzeby` | wyłączone (`enabled: false`) – nigdy nie zwróciło rekordu |
| Parafia Dębniki – Intencje mszalne | `debniki_intencje` | **potrzeby**: tygodniowy harmonogram intencji za zmarłych; host za Cloudflare |
| Podwawelskie – Nekrologi | `podwawelskie_nekrologi` | kafelki z datami ur./zg. (ikony `fa-star` / `fa-cross`), 6 podstron |
| Parafia św. Jadwigi | `sw_jadwiga_pogrzebowe` | zgłoszenia zgonu (`li.artykul`), data publikacji jako `date_death` |
| Facebook – Parafia Dębniki | `generic_html` | wyłączone (`enabled: false`) |

Uwagi merytoryczne:
- **św. Jadwiga** publikuje datę *zgłoszenia*, a strony szczegółowe zawierają intencje mszalne, nie termin pogrzebu — dlatego data trafia do `date_death`, nigdy do `date_funeral`.
- **Grobonet** nie prowadzi listy nekrologów; użyteczna jest jego baza pochówków. Nazwiska do odpytania podaje `search_terms` w konfiguracji źródła — przy zmianie monitorowanej osoby aktualizuj je razem z `Frazy.json`.
- **Podwawelskie** publikuje z kilkutygodniowym opóźnieniem; źródło ma wartość dla wyszukiwania fraz, a nie dla okna 7-dniowego.
- **Dębniki (ogłoszenia)** są wyłączone. Parser znajdował linki, ale żaden nie przechodził walidacji — źródło nie zwróciło ani jednego rekordu w całej historii przebiegów, także przy HTTP 200. Definicja zostaje w `nekrolog_core.mjs`, żeby zachować historię i umożliwić powrót po przebudowie strony parafii.
- **Dębniki (intencje)** to jedyny dostawca kategorii `intention`. Host `debniki.sdb.org.pl` stoi za Cloudflare Managed Challenge, który odrzuca ruch z zakresów centrów danych — w tym z runnerów GitHub Actions. Odczyt udaje się z adresów o dobrej reputacji, więc **uruchomienie lokalne zapełnia sekcję „potrzeby”, a przebieg z GitHub Actions – nie**. Źródło jest oznaczone flagą `external_block_tolerated`, opisaną w §8.

---

## 4. Pułapki ekstrakcji, których pilnują parsery

Te reguły wynikają z realnych błędów wykrytych na żywych stronach — zmieniając kod, nie cofaj ich:

- **Granice bloków w tekście.** Cheerio skleja tekst sąsiadujących elementów bez separatora (`2026-08-18Cmentarz`). `extractBlockText()` wstawia znaki nowej linii; bez tego regexy z `\b` nie trafiają, a filtrowanie stopek działa na całym dokumencie naraz.
- **`\b` nie zachodzi przy znakach spoza ASCII.** `\bśp\.` nigdy nie dopasuje „Śp.”. Nie dodawaj `\b` przed polskimi literami.
- **Filtrowanie szumu jest dwupoziomowe.** `TECH_NOISE` (ślady kodu) dyskwalifikuje rekord; `BOILERPLATE_LINE` (cookies, „Udostępnij”, Facebook) usuwa wyłącznie pojedynczą linię. Wspólny filtr kasował całe nekrologi przez samo słowo „Facebook” w widżecie udostępniania.
- **Linki zbieraj przed `prepareReadableDocument()`.** Funkcja usuwa `nav`/`header`/`footer`, a w menu bywa jedyny link do treści (Dębniki, `/intencje`).
- **Daty są walidowane kalendarzowo.** `isoFromParts()` odrzuca `31.02`; wcześniej `Date.UTC` po cichu przewijało taką datę na inny dzień.

---

## 5. Powiadomienia Discord

Wysyłka idzie na `DISCORD_WEBHOOK_URL` (sekret repozytorium). Zachowanie:

- **alert per trafienie** — zgłaszane są wszystkie trafienia w przebiegu, każde z etykietą kategorii (`zgon / wzmianka`, `pogrzeb`, `intencja mszalna (potrzeba)`, `miejsce pochówku`);
- **deduplikacja** po kluczu `kind|nazwisko|źródło|link|daty` — uzupełnienie terminu pogrzebu przez źródło jest nowym zdarzeniem i wywoła kolejne powiadomienie;
- **heartbeat** przy braku trafień, z kondycją odczytu (ile źródeł sprawnych, ile rekordów);
- **ponowienia** przy `429`/`5xx`, z odczytem nagłówka `Retry-After`.

### Realne pingi zamiast tekstu

Discord tworzy powiadomienie push tylko dla składni `<@ID_UŻYTKOWNIKA>`. Ustaw zmienną środowiskową `DISCORD_MENTION_IDS` (identyfikatory liczbowe, rozdzielone przecinkami), aby wzmianki działały:

```yaml
env:
  DISCORD_MENTION_IDS: ${{ vars.DISCORD_MENTION_IDS }}
```

Bez tej zmiennej wiadomość zawiera dotychczasowy tekst `@koza_z_zagrody, @loshumbakos`, który jest wyłącznie napisem. **Sam webhook nie wymaga żadnych zmian po stronie Discorda** — nowe kategorie alertów to zwykłe wiadomości wysyłane tym samym adresem.

---

## 6. Testy i fixture'y regresyjne

```bash
npm test          # parsery na realnych zrzutach + warstwa okien/scalania/statusu
npm run refresh   # dopiero po przejściu testów
```

Testy parserów działają na **zrzutach realnych stron** (`tests/fixtures/<źródło>_RRRR-MM-DD.html`). Poprzedni zestaw był syntetyczny i opisywał strukturę, której źródła nigdy nie miały — testy przechodziły, podczas gdy cztery parsery w produkcji zwracały zero rekordów.

Odświeżenie zrzutu po zmianie strony źródłowej:

```bash
curl -sSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" \
  https://www.zck-krakow.pl/funerals -o tests/fixtures/zck_funerals_$(date +%F).html
```

Ze zrzutów usuwamy wyłącznie treść `<script>`/`<style>` i osadzone obrazy `data:` — struktura DOM zostaje nienaruszona. Po podmianie zrzutu zaktualizuj datę w nazwie pliku i asercje liczbowe w teście.

---

## 7. Uruchomienie lokalne

```bash
npm install
npm test
DISCORD_NOTIFY_ENABLED=false npm run refresh   # bez zaśmiecania kanału Discord
python3 -m http.server 8000
```

---

## 8. Diagnostyka

- `data/job.json` → `source_diagnostics`: status HTTP, liczba linków/podstron, liczba rekordów, `parser_status`, licznik pustych przebiegów, `blocked_since`.
- `data/source_health.json`: źródło zwracające zero rekordów przez 3 kolejne przebiegi jest zgłaszane jako błąd (poza źródłami oznaczonymi `known_empty`). Uwaga: licznik zlicza **przebiegi, nie dni** — przy harmonogramie 2×/dobę próg to około półtora dnia.
- Sekcja **Log** w interfejsie pokazuje tę diagnostykę oraz ostrzeżenie, gdy snapshot jest starszy niż 26 h.
- `status` zadania opisuje **kondycję odczytu**, nie liczbę rekordów: tydzień bez pogrzebów w oknie to `done`, a nie `error`.

### Błąd a ostrzeżenie

Nie każda awaria odczytu jest defektem do naprawienia w kodzie. Pipeline rozdziela dwa przypadki:

| | **Błąd** (`source_errors`) | **Ostrzeżenie** (`source_warnings`) |
|---|---|---|
| Co oznacza | regresja parsera, awaria serwera, ciche zamilknięcie źródła | znana blokada zewnętrzna warstwy anty-botowej (HTTP 403, `parser_status: "blocked"`) |
| Wpływ na `status` | degraduje do `done_with_errors` | **brak** — przebieg kończy się jako `done` |
| Reakcja | poprawka kodu lub zrzutu testowego | zmiana drogi dostępu; kod nie ma na to wpływu |
| Widoczność | sekcja Log, `error_message` | sekcja Log (osobna lista), `warning_message`, baner w UI |

Warunkiem potraktowania blokady jako ostrzeżenia jest flaga `external_block_tolerated: true` w definicji źródła. Bez niej HTTP 403 pozostaje zwykłym błędem.

**Tolerancja jest ograniczona w czasie.** Jeżeli blokada trwa dłużej niż `BLOCK_TOLERANCE_DAYS` (domyślnie 14 dni, `scripts/refresh_static.mjs`), ostrzeżenie wraca do rangi błędu z komunikatem wskazującym na potrzebę decyzji. Ma to zapobiec sytuacji, w której trwała utrata źródła chowa się bezterminowo za ostrzeżeniem i status przestaje cokolwiek znaczyć. Wtedy trzeba albo przywrócić dostęp, albo wyłączyć źródło (`enabled: false`).

Flaga tolerancji **nie tłumi** innych awarii tego samego źródła: HTTP 500, zepsuty parser i seria pustych przebiegów nadal są zgłaszane jako błędy.

### Dlaczego to rozróżnienie powstało

Przez kilkadziesiąt kolejnych przebiegów status brzmiał `done_with_errors` z tego samego, nienaprawialnego powodu — blokady Cloudflare na `debniki.sdb.org.pl`. Sygnał uległ wysyceniu: przestał odróżniać stan normalny od realnej regresji parsera, więc prawdziwa awaria innego źródła utonęłaby w szumie.

---

## 9. Ograniczenia i uwagi operacyjne

- Dane zależą od dostępności i struktury zewnętrznych serwisów; zmiana HTML źródła wymaga aktualizacji parsera i zrzutu testowego.
- Żadne skonfigurowane źródło nie wymaga OCR ani obsługi PDF — wszystkie publikują dane tekstem.
- Źródło Facebook pozostaje wyłączone (dostęp wymaga uwierzytelnienia; ocena możliwości włączenia to osobne zadanie).
- Część serwisów chroni się warstwą anty-botową rozstrzygającą po reputacji adresu IP. Odczyt z runnerów GitHub Actions bywa wtedy odrzucany, mimo że to samo żądanie z innego łącza przechodzi — nagłówki i User-Agent nie mają tu znaczenia. **Projekt nie obchodzi takich zabezpieczeń**; blokada jest raportowana jako ostrzeżenie (§8), a nie omijana.
- Harmonogram: GitHub Actions, cron `0 7,19 * * *` UTC, z bramką `npm test` przed `npm run refresh`.

---

## 10. Pliki referencyjne

- Szczegółowy opis źródeł: `Instrukcja_odczytu_zrodel_Nekrolog.md`.
- Bieżące dane: `data/latest.json`; status: `data/job.json`; błędy: `data/errors.json`.
- Lista źródeł: `config/sources.json`.
