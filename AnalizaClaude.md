# Analiza Claude — audyt mechanizmu odczytu danych, wyszukiwania fraz i powiadomień

**Data analizy:** 2026-08-18
**Temat:** Audyt działania mechanizmu odczytu źródeł, ekstrakcji rekordów, filtrowania okien czasowych, dopasowywania fraz osoby monitorowanej oraz powiadomień Discord w aplikacji Nekrolog.
**Charakter zadania:** wyłącznie analiza — **nie wprowadzono żadnych zmian w kodzie aplikacji**.
**Analizowana rewizja:** `main` / branch roboczy `claude/obituary-reading-audit-t7nacn`, stan repozytorium z 2026-08-18.
**Analizowany snapshot produkcyjny:** `data/latest.json` + `data/job.json` wygenerowane 2026-08-17T19:33Z (trigger: `schedule`).

---

## 1. Oryginalny, pełny prompt użytkownika

> Zapoznaj się z repo. Nic nie zmieniaj w kodzie. Przeprowadź analizę i zapisz jej wyniki w pliku AnalizaClaude.md (wrzuć na main)
> Aplikacja ma przeszukiwać publicznie dostępne nekrologi w kilku źródłach i wyświetlać dane o ostatnich zgonach i najbliższych potrzebach. Dodatkowo ma wyświetlić informacje jak aplikacja znajdzie informacje o zgonie/potrzebie konkretniej osoby. Następnie przez webhook daje wpis na discord (to już działa). Przeprowadź audyt działania mechanizmu odczytu danych, wyszukiwania fraz itd. sprawdź czy wszystko dobrze działa (bez zmian w kodzie - tylko analiza).

Uzupełnienie przekazane w trakcie realizacji zadania:

> Masz moją zgodę na pełen dostęp do internetu w celu realizacji zadania.

---

## 2. Zakres analizy

Audytem objęto pełną ścieżkę danych:

1. **Pobieranie** — `scripts/fetch.mjs` (HTTP + fallback `curl`).
2. **Parsowanie** — `scripts/nekrolog_core.mjs` (8 aktywnych parserów źródłowych).
3. **Walidacja i odrzucanie rekordów** — `validateParsedRow`, `NOISE`, `BAD_NAME_WORDS`.
4. **Normalizacja dat i godzin** — `parsePolishDateToIso`, `parseTime`, `scripts/date.mjs`.
5. **Filtrowanie okien czasowych i budowa snapshotu** — `scripts/refresh_static.mjs`.
6. **Wyszukiwanie fraz osoby monitorowanej** — `Frazy.json` + `scripts/normalize.mjs` (`textMatchesAny`, `normalizeForLooseMatch`).
7. **Powiadomienia Discord** — `scripts/discord_notify.mjs`.
8. **Prezentacja** — `index.html`, `app.js`, `styles.css`.
9. **Automatyzacja i testy** — `.github/workflows/nekrolog-refresh.yml`, `tests/*.test.mjs`.

### 2.1. Metodyka

- Statyczna analiza całości kodu (ok. 1 460 linii kodu produkcyjnego i testowego).
- Uruchomienie pełnego zestawu testów: `npm ci && npm test` → **6/6 testów przechodzi**.
- Eksperymenty jednostkowe na realnych funkcjach (`parseTime`, `parsePolishDateToIso`, `validateParsedRow`, `isBadNameCandidate`, `textMatchesAny`, `isCzerwonaHelenaRow`) z danymi brzegowymi.
- Analiza ilościowa ostatniego **rzeczywistego** snapshotu produkcyjnego (`data/latest.json`, 103 rekordy) — to najcenniejszy materiał dowodowy, bo powstał z prawdziwego HTML podczas przebiegu GitHub Actions.
- Rekonstrukcja logiki okien czasowych i ponowne policzenie wyników dla daty bieżącej.

### 2.2. Ograniczenie metodyczne (istotne)

Mimo udzielonej zgody użytkownika **nie było możliwe pobranie aktualnego HTML źródeł**. Blokada nie wynika z uprawnień agenta, tylko z **polityki sieciowej środowiska wykonawczego** (`Claude Code on the web`): brama proxy odpowiada `403` na `CONNECT` dla wszystkich ośmiu domen źródłowych (potwierdzone niezależnie przez `curl` oraz `WebFetch` — `EGRESS_BLOCKED`). Środowisko działa na poziomie dostępu **Trusted**, który przepuszcza wyłącznie domeny z listy domyślnej (rejestry pakietów, GitHub, SDK chmurowe) — polskie serwisy pogrzebowe i parafialne na tej liście nie występują.

**Jak to odblokować — patrz rozdział 9 „Jak włączyć dostęp do internetu".**

**Konsekwencja:** wnioski dotyczące struktury zdalnych stron opierają się na kodzie, fixture'ach, dokumencie `Instrukcja_odczytu_zrodel_Nekrolog.md` oraz na wyniku ostatniego realnego przebiegu produkcyjnego. Wszystkie wnioski oznaczone jako „potwierdzone danymi" są weryfikowalne lokalnie i nie wymagają dostępu do sieci.

---

## 3. Jak aplikacja faktycznie działa

```
config/sources.json ──► mergeRequiredSources() ──► filtr enabled
        │
        ▼
   dla każdego źródła: parseSource() ──► fetchText() ──► parser dedykowany
        │                                    │
        │                                    └─► fallback curl (przy 403 / błędzie sieci)
        ▼
   walidacja rekordu (validateParsedRow) ──► odrzucenie lub akceptacja
        ▼
   allRows[] + flaga priority_hit (dopasowanie fraz na name+note+place+source_name)
        ▼
   podział: kind='funeral' / kind='death'
        ▼
   OKNA CZASOWE: recent_deaths = zgony z [dziś-7, dziś]
                 upcoming_funerals = pogrzeby z [dziś, dziś+7]
        ▼
   data/latest.json  ──►  app.js (przeglądarka)
        ▼
   notifyCzerwonaHelena([...recent_deaths, ...upcoming_funerals]) ──► webhook Discord
        ▼
   data/job.json + data/errors.json
```

Harmonogram: GitHub Actions, cron `0 7,19 * * *` UTC (09:00 i 21:00 czasu polskiego latem), z bramką `npm test` przed `npm run refresh`.

---

## 4. Stan faktyczny źródeł — wynik ostatniego przebiegu produkcyjnego

| # | Źródło | Status HTTP | Rekordy surowe | Rekordy w oknie (UI/Discord) | Ocena |
|---|---|---|---|---|---|
| 1 | ZCK Kraków – Porządek pogrzebów | OK | 13 pogrzebów | 13 | ⚠️ dane są, ale **data zawsze fałszowana na „dziś"** |
| 2 | PUK Kraków – Pożegnaliśmy | OK | 31 zgonów + 31 pogrzebów | 7 + 8 | ✅ **jedyne w pełni sprawne źródło** |
| 3 | Gabriel24 – Nekrologi | OK | 22 „pogrzeby" | 0 | ❌ 9 rekordów to strony marketingowe; 13 realnych bez dat → niewidoczne |
| 4 | Karawan – Nekrologi | OK | 6 zgonów | 0 | ❌ same nazwiska, `note=""`, brak dat → odfiltrowane |
| 5 | Kraków Salwator – Grobonet | 200 | 0 | 0 | ❌ 0 linków kandydujących, **błąd niezgłaszany** |
| 6 | Parafia św. Stanisława Kostki (Dębniki) | **403** | 0 | 0 | ❌ blokada, jedyny błąd widoczny w `errors.json` |
| 7 | Podwawelskie – Nekrologi | 200 | 0 (z 7 podstron) | 0 | ❌ **błąd niezgłaszany**, parser detali niepodpięty |
| 8 | Parafia św. Jadwigi – Msze pogrzebowe | OK | 0 | 0 | ❌ **błąd niezgłaszany**, brak jakiejkolwiek diagnostyki |
| 9 | Facebook – Parafia Dębniki | — | — | — | ⏸️ `enabled: false` (świadomie) |

**Podsumowanie ilościowe:** z 8 aktywnych źródeł **realne, użyteczne dane dostarcza jedno (PUK)**, a częściowo drugie (ZCK, z zafałszowaną datą). **4 źródła zwracają zero rekordów, przy czym 3 z nich robią to całkowicie po cichu** — `status` całego zadania to `done_with_errors`, a jedyny raportowany błąd dotyczy Dębnik (403).

Z 103 sparsowanych rekordów **tylko 28 (27 %) trafia do okien czasowych**, czyli do interfejsu i do skanowania pod kątem monitorowanej osoby. Pozostałe 73 % istnieje w `latest.json`, ale jest funkcjonalnie martwe.

---

## 5. Ustalenia szczegółowe

Klasyfikacja: **[K]** krytyczne (wpływa na główny cel aplikacji), **[W]** wysokie, **[Ś]** średnie, **[N]** niskie.

### Blok A — pobieranie danych

#### A1. **[W]** Wyjątek w dowolnym parserze wywraca cały przebieg
`scripts/refresh_static.mjs:66-67` — `parsed = await parseSource(s);` jest **poza** blokiem `try/catch` per źródło (deklaracja `let parsed;` w osobnej linii sugeruje, że taki blok istniał i został usunięty). Jeden nieoczekiwany wyjątek (np. `cheerio` na zdegenerowanym HTML, `new URL()` na nietypowym `href`) przerywa pętlę, przechodzi do `catch` w `main()` (linia 114), ustawia `status: 'error'` i **`data/latest.json` nie zostaje w ogóle zapisany** — aplikacja pokazuje wtedy poprzedni, nieaktualny snapshot bez czytelnej informacji dlaczego.

#### A2. **[Ś]** Timeout nie obejmuje całości pobierania źródła
`scripts/fetch.mjs:99` — timeout 20 s dotyczy pojedynczego żądania. Źródło z `max_detail_pages: 50` może w najgorszym razie zająć ~17 minut przy limicie zadania 20 minut (`nekrolog-refresh.yml`). Cztery źródła mają limit 50 podstron. Obecnie przebieg trwa ~30 s, ale margines bezpieczeństwa jest pozorny — spowolnienie jednego serwisu może wyczerpać budżet całego joba.

#### A3. **[N]** Pobieranie w pełni sekwencyjne
Brak jakiejkolwiek równoległości i brak odstępów między żądaniami (`parseByListAndDetails:41`). Przy 50 podstronach z jednej domeny bez opóźnień rośnie ryzyko rate-limitu / blokady WAF — co jest prawdopodobną przyczyną `403` na Dębnikach.

#### A4. **[N]** Fallback `curl` używa `execFileSync`
`scripts/fetch.mjs:61` — synchroniczne wywołanie blokuje pętlę zdarzeń Node na czas do 20 s przy każdej próbie awaryjnej.

### Blok B — parsowanie i walidacja

#### B1. **[K]** ZCK: data pogrzebu jest zmyślana
`scripts/nekrolog_core.mjs:108` — parser szuka daty **wyłącznie** we wzorcu ISO `\d{4}-\d{2}-\d{2}`. Jeśli nie znajdzie, podstawia `todayIso()`. W ostatnim przebiegu **wszystkie 13 rekordów ZCK ma `note: "ZCK fallback date; …"`**, czyli strona nigdy nie podaje daty w formacie ISO i data jest zawsze podmieniana na dzień pobrania.

Skutki:
- pogrzeb ogłoszony na inny dzień jest raportowany jako dzisiejszy;
- ZCK **nigdy nie zasili okna „+7 dni"** — zawsze wnosi wyłącznie „dziś";
- dane starzeją się natychmiast. Dowód empiryczny: przeliczenie snapshotu z 2026-08-17 na datę 2026-08-18 daje **`upcoming_funerals` = 5 zamiast 21** — wszystkie 13 rekordów ZCK wypada z okna dzień po pobraniu.

`Instrukcja_odczytu_zrodel_Nekrolog.md` (sekcja 8, punkt 3) wprost przewiduje kolejność: ISO → `DD.MM.YYYY` → dopiero fallback. **Krok z `DD.MM.YYYY` nie został zaimplementowany**, mimo że funkcja `parsePolishDateToIso` (linia 30) obsługuje ten format i jest gotowa do użycia.

#### B2. **[K]** Gabriel24: strony marketingowe wchodzą jako „pogrzeby"
`scripts/nekrolog_core.mjs:43` — filtr linków akceptuje każdy URL zawierający `nekrolog` **lub** `pogrzeb`, a `BAD_NAME_WORDS` (linia 21) nie zawiera wzorców usług. Efekt w produkcji — 9 z 22 rekordów Gabriel24 to:

```
Pogrzeby tradycyjne · Pogrzeby wyznaniowe · Pogrzeby świeckie ·
Pogrzeby dzieci nienarodzonych · Pogrzeby wojskowe ·
Transmisje online z pogrzebu · Kwiaty na pogrzeb ·
Akcesoria pogrzebowe · Przewozy zmarłych · Zasiłek pogrzebowy
```

Rekord „Zasiłek pogrzebowy" dostał w dodatku `date_funeral: "2026-01-01"` wyciągnięte z tekstu o zmianie przepisów. Potwierdzenie: `isBadNameCandidate("Pogrzeby tradycyjne")` → `false`, `isBadNameCandidate("Zasiłek pogrzebowy")` → `false`.

#### B3. **[K]** Gabriel24: prawdziwe nekrologi nie mają dat, więc znikają
Pozostałe 13 rekordów to realne osoby („Śp. Tomasz Korczak", „Śp. Irena Faff" …), ale **wszystkie mają `date_death: null` i `date_funeral: null`**. Ponieważ `parseGabriel24DetailHtml:69` ustawia `kind = dd ? 'death' : 'funeral'`, brak daty zgonu klasyfikuje je jako pogrzeby — a pogrzeb bez daty nie przechodzi przez `inWindow` (`refresh_static.mjs:82`). **Rezultat: 100 % realnych nekrologów Gabriel24 jest niewidoczne w UI i niewidoczne dla powiadomień.**

#### B4. **[K]** Karawan: rekordy bez żadnej treści
`scripts/nekrolog_core.mjs:72` — 6 rekordów Karawan ma poprawne nazwiska, ale `note: ""`, `date_death: null`, `date_funeral: null`. Nazwisko pochodzi z `<title>`/slug, natomiast treść nekrologu **nie została wyekstrahowana** (Karawan publikuje klepsydry głównie jako grafiki — spójne z uwagą w README o „źródłach graficznych bez OCR").

Podwójny skutek:
- `kind` = `death` (bo brak `df`), a filtr `recent_deaths` (`refresh_static.mjs:83`) dopuszcza rekordy bez daty **tylko gdy mają `note`** — pusty `note` je eliminuje;
- nawet gdyby przeszły, nie niosą żadnej informacji poza nazwiskiem.

Dodatkowo `parseKarawanDetailHtml` przyjmuje **pierwszą napotkaną datę w treści** jako datę pogrzebu, bez sprawdzania kontekstu semantycznego — gdyby treść była czytana, ryzyko wpisania daty urodzenia jako daty pogrzebu jest wysokie.

#### B5. **[W]** Filtr `NOISE` odrzuca poprawne nekrologi
`scripts/nekrolog_core.mjs:20` + `validateParsedRow:36` — wzorzec `NOISE` zawiera m.in. `facebook`, `cookie`, `cookies`, `href=`, `src=` i jest stosowany do **całego pola `note`**, które w większości parserów jest surowym tekstem `<body>`/`main`. Weryfikacja eksperymentalna:

| `note` | rekord zaakceptowany? |
|---|---|
| „Msza pogrzebowa odbędzie się w kościele" | ✅ tak |
| „Zapraszamy, informacje na Facebook" | ❌ **odrzucony** |
| „Strona używa plików cookie" | ❌ **odrzucony** |

Każda stopka z linkiem do Facebooka lub baner cookies wewnątrz wyekstrahowanego tekstu kasuje **cały rekord osoby**. `parseGabriel24DetailHtml:69` robi to jeszcze dosadniej — `if (!name || NOISE.test(note)) return null;`. To jeden z najpoważniejszych mechanizmów utraty danych (fałszywie negatywnych) w całej aplikacji.

#### B6. **[W]** Trzy źródła zwracają zero rekordów bez zgłoszenia błędu
- **Grobonet** (`nekrolog_core.mjs:75-86`): HTTP 200, `candidate_links: 0`. Kod celowo rozróżnia `empty` od `parser_broken` — skoro w HTML występuje słowo `grobonet|nekrologi|cmentarz`, uznaje stan za „pusty" i zwraca **`error: null`**.
- **Podwawelskie** (`nekrolog_core.mjs:88-99`): 7 pobranych podstron, `accepted_rows: 0`, `parser_status: 'empty'`, `error: null`.
- **św. Jadwiga** (`nekrolog_core.mjs:106`): zero rekordów, **brak nawet obiektu `diagnostics`** — w `job.json` widnieje wyłącznie `error: null`.

Skutek: nie da się odróżnić „w tym tygodniu nikt nie zmarł" od „parser przestał działać po przebudowie strony". Sytuacja utrzymuje się bezterminowo, a `status` całego zadania pozostaje `done_with_errors` z jedyną wzmianką o Dębnikach.

#### B7. **[W]** Podwawelskie: przetestowany parser detali nie jest wpięty w pipeline
`parsePodwawelskieDetailHtml` (linia 71) jest eksportowany i **posiada asercje w `tests/refresh.parsers.test.mjs:38-40`**, ale `parsePodwawelskieNekrologi` (linia 88) nigdy go nie wywołuje — używa wyłącznie `parsePodwawelskieRowsFromListHtml`. Testy dają zatem **fałszywe poczucie bezpieczeństwa**: zielony wynik testu dotyczy kodu, który w produkcji nigdy się nie wykonuje. Analogicznie martwy jest generyczny `parseDetail` (linia 38) — używany tylko jako wartość domyślna parametru, którą wszyscy wywołujący nadpisują.

#### B8. **[Ś]** `parsePolishDateToIso` nie waliduje zakresu daty
Potwierdzone eksperymentalnie: `parsePolishDateToIso("32.01.2026")` → `"2026-01-32"`, `parsePolishDateToIso("2026-13-45")` → `"2026-13-45"`. Taki ciąg przechodzi następnie przez `parseISODate` (`date.mjs:10`), gdzie `Date.UTC(2026, 0, 32)` cicho przewija się na 1 lutego. Błędnie odczytana data nie jest odrzucana — jest **po cichu podmieniana na inną**.

#### B9. **[Ś]** Brak deduplikacji między źródłami
`uniq()` działa wyłącznie w obrębie jednego parsera. W ostatnim snapshocie **6 osób występuje w dwóch źródłach jednocześnie**:

```
Elżbieta Czech, Stefan Pyciński, Danuta Galus   → PUK + ZCK
Maria Gronkowska, Krystyna Janicka, Janina Kramarz-Górka → Karawan + ZCK
```

Do tego PUK celowo tworzy dwa rekordy na osobę (`death` + `funeral`, linia 110), więc ta sama osoba potrafi pojawić się w interfejsie 3 razy. Utrudnia to czytanie listy i zawyża statystyki.

#### B10. **[N]** Niespójna normalizacja nazwisk
Karawan zwraca `"Śp. MARIA GRONKOWSKA"` (wersaliki + prefiks), ZCK `"Maria Gronkowska"`, PUK usuwa prefiks `ŚP.` (linia 110), Gabriel24 zostawia `"Śp. Tomasz Korczak"`. Brak wspólnej normalizacji nazwiska uniemożliwia deduplikację i zaburza prezentację.

#### B11. **[N]** Zanieczyszczone pole `place`
Przykłady z produkcji: `"9:00 – Cmentarz Prądnik Czerwony"` (godzina wsiąkła w nazwę miejsca), a w Gabriel24 `"cmentarzach całej Małopolski – w tym Krakowa i okolic"`, `"cmentarzu zapewnia obecność operatora przy grobie"` — fragmenty zdań marketingowych wyciągnięte regexem `cmentarz[^.\n]*`.

#### B12. **[N]** Flagi konfiguracyjne nie są nigdzie odczytywane
`requires_detail_fetch`, `requires_ocr`, `requires_pdf`, `base_url` występują wyłącznie w definicjach `REQUIRED_SOURCES` i w `config/sources.json` — **żaden fragment kodu ich nie czyta**. Sugerują możliwości, których pipeline nie posiada (brak OCR, brak obsługi PDF).

### Blok C — okna czasowe i budowa snapshotu

#### C1. **[W]** `status: 'error'` przy braku rekordów, niezależnie od kondycji źródeł
`nekrolog_core.mjs:115` — `resolveJobOutcome` zwraca `error`, gdy `recentDeaths + upcomingFunerals <= 0`. W okresie, gdy faktycznie nie ma zgonów ani pogrzebów w oknie, zadanie zgłosi błąd mimo poprawnego działania. Odwrotnie: jeśli 7 z 8 źródeł jest zepsutych, ale jedno dostarczy rekord, status to `done` / `done_with_errors` — czyli **status zadania nie odzwierciedla kondycji odczytu**.

#### C2. **[Ś]** Reguła „bez daty zgonu, ale z notatką" wpuszcza rekordy bezterminowo
`refresh_static.mjs:83` — `inWindow(...) || (!r.date_death && r.note)`. Rekord bez daty, ale z jakąkolwiek notatką, kwalifikuje się do „ostatnich zgonów" **na zawsze**, niezależnie od tego, jak stary jest wpis. Obecnie nie eksploduje wyłącznie dlatego, że rekordy Karawana mają pusty `note` (B4) — czyli chroni nas inny defekt.

#### C3. **[Ś]** Mieszanie stref czasowych
`todayIso()` (`nekrolog_core.mjs:27`) i `nowISO()` operują w **UTC**, natomiast `todayLocalMidnight()` (`date.mjs:16`) w **czasie lokalnym**. Na runnerze GitHub (UTC) jest to spójne, ale przy uruchomieniu lokalnym w Polsce między 22:00 a północą (czas letni) fallbackowa data ZCK wskaże już następny dzień, podczas gdy okno czasowe liczone jest wg dnia bieżącego.

#### C4. **[N]** `latest.json` zawiera trzy kopie tych samych danych
`refresh_static.mjs:97` — `{ ...base, payload: base, data: base }`. Plik ma 261 KB, z czego **~67 % to redundancja**. Frontend (`app.js:44`) i tak ma fallbacki na wszystkie trzy warianty, więc duplikacja służy wyłącznie wstecznej kompatybilności.

#### C5. **[N]** Martwy mechanizm intencji („potrzeb")
`nekrolog_core.mjs:115` — `isIntentionLikeSource` i `isIntentionLikeRow` to zaślepki zwracające zawsze `false`, a `parseSource` dla typu `intencje_plus` zwraca pustą listę (linia 118). Żadne skonfigurowane źródło nie ma tego typu. Fixture `tests/fixtures/intencje_sample.html` nie jest używany przez żaden test.

**To bezpośrednio dotyczy wymagania z promptu — „najbliższe potrzeby".** Aplikacja w obecnej postaci obsługuje wyłącznie dwie kategorie: zgony i pogrzeby. Warstwa intencji/potrzeb nie jest zaimplementowana ani w backendzie, ani w interfejsie (`index.html` ma tylko sekcje „Ostatnie zgony / wzmianki" i „Najbliższe pogrzeby"). Jest to zgodne z rekomendacją `Instrukcja_odczytu_zrodel_Nekrolog.md:142`, aby nie traktować intencji mszalnych jako zgonów, ale oznacza, że **funkcja „potrzeb" nie istnieje**, a nie że działa niepoprawnie.

#### C6. **[N]** `buildFallbackSummaryForHelena` to zaślepka ignorująca argumenty
`nekrolog_core.mjs:116` — zawsze zwraca `{text: 'Helena Gawin - brak informacji', date_death: null, date_funeral: null, urls: []}`, mimo że `refresh_static.mjs:87` przekazuje jej `recent_deaths` i `upcoming_funerals`. Pole `fallback_summary` w `latest.json` jest więc stałą.

### Blok D — wyszukiwanie fraz

Mechanizm dopasowania jest **najlepiej zaprojektowaną częścią aplikacji**. `normalizeForLooseMatch` (`normalize.mjs:5`) usuwa diakrytykę, znaki `+`/`†`, wszystkie warianty myślników Unicode, interpunkcję i prefiksy `śp./ś.p./s.p.`, po czym porównuje jako podciąg. Weryfikacja eksperymentalna na `Frazy.json` (264 frazy):

| Tekst wejściowy | Wynik |
|---|---|
| `Śp. Helena Gawin` | ✅ trafienie |
| `ŚP. HELENA GAWIN` | ✅ trafienie |
| `Helena Gawinowa` | ✅ trafienie |
| `GAWIN Helena` | ✅ trafienie |
| `Helena Gawin z domu Dereń` | ✅ trafienie |
| `ś.p. Heleny Gawin` | ✅ trafienie |
| `zmarła Helena Gawin, lat 88` | ✅ trafienie |
| `Helena Gawin` z podwójną spacją / nową linią | ✅ trafienie |
| `Gawin Helena Maria` | ✅ trafienie |
| **`Helena Maria Gawin`** | ❌ **pominięte** |
| **`Helena Anna Gawin-Dereń`** | ❌ **pominięte** |
| **`Helenka Gawin`** | ❌ pominięte |
| **`H. Gawin` / `Helena G.`** | ❌ pominięte |
| `Helena Nowak`, `Gawron Helena`, samo `Helena` | ✅ poprawnie odrzucone |

#### D1. **[W]** Drugie imię w naturalnej kolejności rozbija dopasowanie
`Frazy.json` zawiera pary „imię + nazwisko" jako ciągłe frazy. Nekrologi bardzo często podają **dwa imiona**: „Helena Maria Gawin". Ponieważ dopasowanie to zwykły podciąg, taki zapis **nie zostanie wykryty**. Paradoksalnie kolejność odwrócona („Gawin Helena Maria") działa, bo `gawin helena` jest w niej podciągiem. To najpoważniejsza luka w samym mechanizmie fraz — trafia w realny i częsty format publikacji.

#### D2. **[Ś]** Niespójny zestaw pól przeszukiwanych w trzech miejscach
Ta sama logika biznesowa jest zaimplementowana trzykrotnie, za każdym razem na innym zbiorze pól:

| Miejsce | Przeszukiwane pola |
|---|---|
| `refresh_static.mjs:74` (flaga `priority_hit`) | `name`, `note`, **`place`**, `source_name` |
| `discord_notify.mjs:14-19` (alert) | `name`, `full_name`, `note`, `source_name` — **bez `place`** |
| `app.js:83` (podświetlenie w UI) | `name`, `full_name`, `note`, `place`, `source_name` |

Rekord, w którym monitorowana osoba pojawia się wyłącznie w polu `place`, zostanie oznaczony jako trafienie w snapshocie i podświetlony w interfejsie, ale **nie wywoła powiadomienia Discord**. Potwierdzone eksperymentalnie: `isCzerwonaHelenaRow({name:'X Y', place:'Helena Gawin', note:''})` → `false`.

#### D3. **[Ś]** Frontend używa własnej, uboższej listy fraz
`app.js:3-28` zawiera **zaszytą na sztywno listę 24 fraz**, podczas gdy backend korzysta z `Frazy.json` (264 frazy) i publikuje je w `latest.json` jako `target_phrases` — pole, którego `app.js` w ogóle nie odczytuje. Formy deklinowane („Helenę Gawin", „Heleny Gawin") istnieją tylko po stronie backendu. Skutek jest częściowo maskowany, bo `app.js:98` sprawdza najpierw `row.priority_hit === true`, więc trafienia backendowe i tak się podświetlą — ale każda przyszła zmiana `Frazy.json` **nie dotrze do interfejsu**.

#### D4. **[N]** Zduplikowany, rozjeżdżający się moduł normalizacji
`normalize.js` (katalog główny) i `scripts/normalize.mjs` to dwie kopie tego samego modułu. Wersja w katalogu głównym ma `textMatchesAny` opartą na zwykłym `toLowerCase()`, **bez** `normalizeForLooseMatch` — czyli bez usuwania diakrytyki, prefiksów i interpunkcji. Nic jej obecnie nie importuje (`app.js:1` używa poprawnej wersji z `scripts/`), ale plik jest publikowany na GitHub Pages i figuruje w `Linki.txt`. To pułapka na przyszłość.

#### D5. **[N]** 62 % fraz w `Frazy.json` to duplikaty po normalizacji
264 frazy redukują się do **100 unikalnych ciągów** po przepuszczeniu przez `normalizeForLooseMatch`. Warianty różniące się wyłącznie prefiksem `Śp.` lub myślnikiem są zbędne, bo normalizacja i tak je zrównuje. Nie jest to błąd funkcjonalny — jedynie koszt utrzymania i mylące wrażenie większego pokrycia niż faktyczne.

### Blok E — powiadomienia Discord

Mechanizm jako taki **działa** — potwierdza to `job.json`: `{"attempted": true, "sent": true, "status": 204, "type": "heartbeat_no_match"}`. Poniższe uwagi dotyczą tego, **co** trafia do webhooka, a nie tego, czy wysyłka działa.

#### E1. **[K]** Do skanowania trafia tylko 27 % rekordów
`refresh_static.mjs:101-106` przekazuje do `notifyCzerwonaHelena` wyłącznie `[...recent_deaths, ...upcoming_funerals]` — czyli **rekordy po filtrze okien czasowych**. Tymczasem flaga `priority_hit` liczona jest wcześniej dla **wszystkich** `allRows` (linia 74).

W ostatnim przebiegu: 103 rekordy sparsowane → **28 przekazanych do skanowania (27 %)**. Rekord monitorowanej osoby pochodzący z Gabriel24 lub Karawana (a więc bez daty — patrz B3, B4) **nigdy nie wywoła alertu**, mimo że aplikacja go poprawnie odczytała i oznaczyła. To najpoważniejszy defekt z punktu widzenia głównego celu aplikacji: 27 rekordów w snapshocie nie ma żadnej daty, a 18 ma pusty `note`.

**Rekomendacja koncepcyjna:** alertowanie powinno operować na `allRows` (ewentualnie z osobnym, znacznie szerszym oknem), a okna czasowe powinny sterować wyłącznie prezentacją w UI.

#### E2. **[W]** Zgłaszane jest tylko pierwsze trafienie w przebiegu
`discord_notify.mjs:23-25` — `selectFirstHit` zwraca `rows.find(...)`, czyli pojedynczy rekord. Jeśli w jednym przebiegu monitorowana osoba wystąpi w kilku źródłach (co przy 6 potwierdzonych duplikatach międzyźródłowych jest realne), zgłoszony zostanie tylko pierwszy. Gorzej — jeśli klucz pierwszego trafienia jest już w `sent_keys`, funkcja kończy się z `already_notified` (linia 124) i **pozostałe, nowe trafienia nie są nawet sprawdzane**.

#### E3. **[W]** Deduplikacja blokuje powiadomienia o aktualizacjach
`buildStateKey` (linia 27) = `name | source_name | url`. Po pierwszym wysłaniu klucz trafia do `sent_keys` **na stałe**. Jeśli źródło uzupełni później datę pogrzebu lub miejsce ceremonii — czyli dokładnie tę informację, której użytkownik oczekuje — **nie zostanie wysłane żadne kolejne powiadomienie**, bo klucz nie uwzględnia dat ani treści. Lista `sent_keys` rośnie też bez ograniczeń.

#### E4. **[Ś]** Wzmianki `@koza_z_zagrody, @loshumbakos` nie generują pingu
`discord_notify.mjs:40` wysyła nazwy użytkowników jako **zwykły tekst**. Discord tworzy realne powiadomienie wyłącznie dla składni `<@ID_UŻYTKOWNIKA>`. Odbiorcy zobaczą tekst, ale **nie dostaną powiadomienia push** — co podważa sens alertu.

#### E5. **[Ś]** Brak ponowień i obsługi limitu 429
`postDiscordWebhook` (linia 74) wykonuje **jedną** próbę. Odpowiedź `429 Too Many Requests` lub chwilowy błąd 5xx kończy się `sent: false` i utratą powiadomienia — przy trafieniu klucz nie trafia do `sent_keys`, więc kolejny przebieg spróbuje ponownie, ale najbliższy dopiero za 12 godzin.

#### E6. **[N]** Heartbeat wysyłany przy każdym przebiegu bez trafienia
Zachowanie zamierzone (potwierdzone testem `tests/discord_notify.test.mjs:45`) — dwie wiadomości „Brak danych dotyczących stanu Helenomatu" dziennie. Warto jednak zauważyć, że heartbeat **nie odróżnia** „wszystko działa, brak trafienia" od „7 z 8 źródeł nie zwróciło danych" — a to drugie jest stanem faktycznym. Rozszerzenie heartbeatu o liczbę sprawnych źródeł uczyniłoby go realnym sygnałem kondycji.

### Blok F — frontend

#### F1. **[Ś]** Brak sygnalizacji nieaktualnych danych
`app.js:34-42` — przy niepowodzeniu pobrania `latest.json` zwracany jest pusty obiekt i interfejs pokazuje „Brak wpisów w oknie czasowym", czyli komunikat nieodróżnialny od stanu poprawnego. Brak też ostrzeżenia, gdy `generated_at` jest sprzed wielu dni.

#### F2. **[N]** `externalLink` nie waliduje schematu URL
`app.js:76-80` — wartości są poprawnie escapowane przez `esc()` (brak możliwości wyjścia z atrybutu), ale schemat nie jest sprawdzany. `absoluteUrl` (`nekrolog_core.mjs:24`) przepuszcza `javascript:` (`new URL('javascript:…', base)` zwraca ten ciąg bez zmian), a generyczny filtr linków (`parseGenericList:40`) — w odróżnieniu od filtra Grobonet — takich schematów nie odrzuca. Ryzyko niskie (wymaga wrogiego źródła), ale realne, bo strona jest publikowana na GitHub Pages.

#### F3. **[N]** Interfejs nie pokazuje diagnostyki źródeł
`renderStatus` (`app.js:171`) wyświetla wyłącznie `source_errors`. Bogate `source_diagnostics` z `job.json` (`parser_status: 'empty' | 'parser_broken' | 'blocked'`, `candidate_links`, `accepted_rows`) — czyli dokładnie te dane, które ujawniają ciche awarie z B6 — **nie są prezentowane nigdzie**.

### Blok G — testy i CI

#### G1. **[W]** Testy pokrywają wyłącznie parsery i Discord
`tests/refresh.parsers.test.mjs` testuje funkcje parsujące na fixture'ach, `tests/discord_notify.test.mjs` — budowanie wiadomości i deduplikację. **Zero testów** dla: filtrowania okien czasowych, `resolveJobOutcome`, obliczania `priority_hit`, `mergeRequiredSources` oraz całego `refresh_static.mjs`. Wszystkie defekty krytyczne z bloku C i E leżą dokładnie w tej nieprzetestowanej warstwie.

#### G2. **[Ś]** Testy przechodzą mimo zerowego wyniku produkcyjnego
Zestaw jest zielony (6/6), a jednocześnie 4 z 8 źródeł nie zwraca w produkcji nic. Fixture'y są syntetyczne i odzwierciedlają *zakładaną*, nie *rzeczywistą* strukturę stron — `Instrukcja_odczytu_zrodel_Nekrolog.md:242` sam to sygnalizuje („Do testów parsera trzeba pobrać aktualny HTML"). W efekcie bramka `npm test` w workflow **nie chroni przed regresją odczytu**.

#### G3. **[N]** Rozjazd `sources.txt` względem `config/sources.json`
`sources.txt` to nieaktualny zrzut konfiguracji, w którym **8 z 9 źródeł ma `type: "generic_html"`** i Facebook jest `enabled: true`. Ponieważ `mergeRequiredSources` (`nekrolog_core.mjs:114`) daje pierwszeństwo istniejącej konfiguracji nad `REQUIRED_SOURCES` (`{...r, ...byId.get(r.id)}`), przypadkowe użycie tej zawartości jako `config/sources.json` **wyłączyłoby wszystkie dedykowane parsery** — `generic_html` zwraca zawsze pustą listę (linia 117).

---

## 6. Odpowiedź na pytanie „czy wszystko dobrze działa"

**Nie.** Aplikacja uruchamia się bez błędów, testy przechodzą, workflow się wykonuje, a webhook Discord faktycznie działa (`status: 204`) — ale **warstwa merytoryczna, czyli odczyt danych, jest w dużej mierze niesprawna, przy czym niesprawność jest niewidoczna z zewnątrz**.

Co działa poprawnie:
- pipeline jako proces (fetch → parse → normalize → JSON → UI → Discord);
- fallback `curl` z nagłówkami przeglądarkowymi przy `403`;
- **parser PUK** — pełne, poprawne dane: nazwisko, data zgonu, data i godzina pogrzebu, link do klepsydry;
- **mechanizm dopasowania fraz** — luźne porównanie odporne na diakrytykę, wersaliki, prefiksy `śp.`, interpunkcję i myślniki, z poprawnym odrzucaniem podobnych nazwisk;
- wysyłka na Discord z deduplikacją i heartbeatem;
- warstwa prezentacji z escapowaniem HTML.

Co nie działa:
- **6 z 8 aktywnych źródeł nie dostarcza użytecznych danych**, a 3 z nich zawodzą po cichu (brak błędu w `errors.json`);
- **ZCK — jedyne źródło „porządku pogrzebów" — zawsze zmyśla datę**, przez co nie zasila okna „+7 dni" i dezaktualizuje się w ciągu doby;
- **73 % sparsowanych rekordów nigdy nie trafia do skanowania pod kątem monitorowanej osoby** — czyli głównej funkcji aplikacji;
- **rekordy bez daty są systemowo tracone**, a bez daty jest większość źródeł innych niż PUK;
- **funkcja „najbliższych potrzeb" (intencji) nie jest zaimplementowana** — istnieją tylko zaślepki zwracające `false`;
- filtr `NOISE` odrzuca poprawne nekrologi zawierające słowa „facebook" lub „cookie";
- status zadania nie odzwierciedla kondycji odczytu.

---

## 7. Ryzyka

| # | Ryzyko | Prawdopodobieństwo | Skutek |
|---|---|---|---|
| R1 | Nekrolog monitorowanej osoby zostanie odczytany, ale nie zgłoszony (brak daty → poza oknem) | **Wysokie** | **Krytyczny — niezrealizowanie głównego celu aplikacji** |
| R2 | Nekrolog nie zostanie w ogóle odczytany (źródło ciche, `NOISE`, brak OCR) | **Wysokie** | Krytyczny |
| R3 | Fraza z drugim imieniem („Helena Maria Gawin") nie zostanie dopasowana | Średnie | Krytyczny |
| R4 | Kolejna zmiana HTML źródła pozostanie niezauważona (raportowana jako `empty`) | Wysokie | Wysoki — cicha erozja pokrycia |
| R5 | Data pogrzebu z ZCK wskaże zły dzień | **Pewne** (występuje w 100 % rekordów) | Wysoki — dezinformacja użytkownika |
| R6 | Trafienie zgłoszone raz nie zostanie zaktualizowane po uzupełnieniu daty pogrzebu | Średnie | Wysoki |
| R7 | Wyjątek w jednym parserze wywróci cały przebieg i zablokuje aktualizację snapshotu | Niskie | Wysoki |
| R8 | Odbiorcy nie dostaną pingu na Discordzie (wzmianki jako zwykły tekst) | **Pewne** | Średni |
| R9 | Zafałszowane rekordy marketingowe (Gabriel24) obniżają zaufanie do listy | Pewne | Średni |
| R10 | Wyczerpanie limitu 20 minut zadania przy spowolnieniu któregoś serwisu | Niskie | Średni |

---

## 8. Rekomendacje

### Priorytet P0 — przywrócenie głównej funkcji

1. **Odłączyć alertowanie od okien czasowych** (`refresh_static.mjs:101`). Skanowanie fraz powinno obejmować `allRows`, a nie `[...recent_deaths, ...upcoming_funerals]`. Okna czasowe niech sterują wyłącznie prezentacją. *(usuwa R1)*
2. **Zgłaszać wszystkie trafienia w przebiegu, nie tylko pierwsze** (`discord_notify.mjs:23`) — iterować po wszystkich dopasowaniach i sprawdzać `sent_keys` osobno dla każdego. *(usuwa R6 częściowo, E2)*
3. **Ujednolicić zbiór przeszukiwanych pól** w trzech miejscach (`refresh_static.mjs:74`, `discord_notify.mjs:14`, `app.js:83`) — wydzielić jedną funkcję `buildMatchHaystack(row)` i używać jej wszędzie. *(usuwa D2)*
4. **Uzupełnić `Frazy.json` o wzorce z drugim imieniem** albo — rozwiązanie trwalsze — zmienić dopasowanie z „podciąg" na „wszystkie tokeny nazwiska i imienia obecne w rekordzie w dowolnej kolejności, w promieniu N słów". *(usuwa D1/R3)*
5. **Zamienić wzmianki Discord na `<@ID>`** (`discord_notify.mjs:40`), aby alert faktycznie generował powiadomienie. *(usuwa R8)*

### Priorytet P1 — naprawa odczytu i widoczności awarii

6. **ZCK: dodać rozpoznawanie `DD.MM.YYYY` i dat słownych** przed fallbackiem na „dziś" (`nekrolog_core.mjs:108`) — zgodnie z algorytmem opisanym w `Instrukcja_odczytu_zrodel_Nekrolog.md`, sekcja 8. Gdy fallback jednak zadziała, oznaczyć rekord flagą `date_is_fallback: true` i zaznaczyć to w UI. *(usuwa R5)*
7. **Wprowadzić wykrywanie cichych awarii**: jeśli źródło zwraca 0 rekordów przez N kolejnych przebiegów, podnieść to do `source_errors` i do statusu zadania. Uzupełnić `parseSwJadwigaPogrzebowe` o obiekt `diagnostics` (obecnie jedyny parser bez niego). *(usuwa R4)*
8. **Zawęzić `NOISE` do pól technicznych** zamiast stosować go do całego `note` — albo wcześniej wycinać stopki/nagłówki, albo sprawdzać tylko wystąpienia w kontekście znaczników, a nie w tekście czytelnym dla człowieka. *(usuwa B5/R2)*
9. **Gabriel24: filtrować strony usługowe** — dodać listę wykluczeń URL (`/pogrzeby-*`, `/zasilek-*`, `/kwiaty-*`, `/transmisje-*`, `/akcesoria-*`, `/przewozy-*`) i rozszerzyć `BAD_NAME_WORDS` o wzorce „Pogrzeby …", „Zasiłek …", „Transmisje …". *(usuwa B2/R9)*
10. **Opakować `parseSource` w `try/catch` per źródło** (`refresh_static.mjs:66`), aby awaria jednego parsera nie kasowała całego przebiegu. *(usuwa R7)*
11. **Podwawelskie: podpiąć `parsePodwawelskieDetailHtml`** do `parsePodwawelskieNekrologi` albo usunąć go wraz z testami — obecny stan generuje fałszywie pozytywny wynik testów. *(usuwa B7/G2)*
12. **Rozstrzygnąć los Karawana i Gabriel24**: skoro klepsydry są grafikami, bez OCR te źródła nie dostarczą dat. Decyzja: wdrożyć OCR, albo świadomie oznaczyć je jako „tylko nazwiska" i dopuścić rekordy bez dat do osobnej sekcji „wzmianki bez daty" (co jednocześnie realizuje P0-1).

### Priorytet P2 — higiena i utrzymanie

13. Walidować zakres daty w `parsePolishDateToIso` (odrzucać dzień > 31 i miesiąc > 12 zamiast cichego przewijania).
14. Dodać deduplikację międzyźródłową po znormalizowanym nazwisku + dacie oraz wspólną normalizację nazwiska (usunięcie `Śp.`, ujednolicenie wielkości liter).
15. Rozdzielić `status` zadania na „kondycja odczytu" i „liczba rekordów" — `resolveJobOutcome` nie powinien zgłaszać `error` tylko dlatego, że w oknie nie ma pogrzebów.
16. Usunąć martwy kod: `normalize.js` (katalog główny), `parseDetail`, nieużywane flagi `requires_ocr`/`requires_pdf`/`base_url`, nieaktualny `sources.txt`.
17. `app.js` powinien czytać `snap.target_phrases` zamiast zaszytej listy 24 fraz.
18. Dodać testy dla `refresh_static.mjs`: okna czasowe, `priority_hit`, `resolveJobOutcome`, `mergeRequiredSources`.
19. Wyświetlać `source_diagnostics` w sekcji „Log" interfejsu oraz ostrzeżenie o nieaktualnym snapshocie.
20. Zredukować trojaką duplikację w `latest.json` (`base` / `payload` / `data`) po potwierdzeniu, że nic zewnętrznego nie polega na starym formacie.
21. Dodać jedno ponowienie z odczytem `Retry-After` w `postDiscordWebhook` oraz walidację schematu URL w `app.js:externalLink`.

---

## 9. Jak włączyć dostęp do internetu

Ten rozdział opisuje, jak odblokować ruch wychodzący do domen źródłowych, żeby możliwa była weryfikacja parserów na **żywym HTML** (najważniejszy brakujący krok tego audytu — patrz §2.2).

### 9.1. Dlaczego obecnie nie działa

Sesja Claude Code on the web działa w tzw. **środowisku chmurowym** (*cloud environment*), które ma jeden ustawiony **poziom dostępu sieciowego**. Cały ruch wychodzący przechodzi przez proxy bezpieczeństwa, które odrzuca połączenia do domen spoza listy dozwolonych — stąd `403` na `CONNECT` i błąd `EGRESS_BLOCKED`. Zgoda wyrażona w czacie nie zmienia tego ustawienia: to konfiguracja środowiska, a nie uprawnienie przyznawane agentowi w trakcie rozmowy.

Dostępne poziomy dostępu:

| Poziom | Co przepuszcza |
|---|---|
| **None** | brak dostępu sieciowego |
| **Trusted** *(obecny — domyślny)* | wyłącznie domeny z listy domyślnej: rejestry pakietów, GitHub, SDK chmurowe |
| **Full** | dowolna domena |
| **Custom** | własna lista dozwolonych domen, opcjonalnie razem z listą domyślną |

Operacje GitHub (klonowanie, push, PR) idą przez **osobne proxy** i działają niezależnie od tego ustawienia — dlatego commit i push tej analizy powiodą się mimo blokady pozostałego ruchu.

### 9.2. Zalecana konfiguracja dla tego projektu — poziom Custom

**Kroki (interfejs claude.ai/code):**

1. Otwórz https://claude.ai/code.
2. W rzędzie **nad polem wiadomości** kliknij **ikonę chmury** z nazwą bieżącego środowiska (np. `Default`). To jedyne wejście do selektora — nie ma dla niego osobnej strony ustawień ani bezpośredniego URL-a.
3. Najedź na środowisko, którego używasz, i kliknij **ikonę koła zębatego** po prawej stronie (albo wybierz **Add cloud environment**, aby utworzyć osobne środowisko np. `Nekrolog`).
4. W polu **Network access** wybierz **Custom**.
5. W polu **Allowed domains** wpisz domeny — **po jednej w linii**:

```text
www.zck-krakow.pl
www.puk.krakow.pl
nekrolog.eklepsydra.pl
www.gabriel24.pl
karawan.pl
krakowsalwator.grobonet.com
debniki.sdb.org.pl
www.podwawelskie.pl
swietajadwiga.diecezja.pl
discord.com
```

6. Zaznacz **„Also include default list of common package managers"** — bez tego przestanie działać `npm ci` (rejestr npm) oraz inne domyślne domeny.
7. Zapisz środowisko.
8. **Uruchom nową sesję** w tym środowisku. Zmiana polityki nie jest doładowywana do już działającego kontenera — bieżąca sesja pozostanie zablokowana.

### 9.3. Uwagi do listy domen

- Wpis `*.` na początku obejmuje wszystkie subdomeny, np. `*.krakow.pl` zamiast osobnych wpisów `www.zck-krakow.pl` i `www.puk.krakow.pl`. Wygodniejsze, ale szersze — dla audytu bezpieczniejsza jest lista dokładna, jak wyżej.
- `nekrolog.eklepsydra.pl` jest niezbędny: PUK publikuje listę na `puk.krakow.pl`, ale **linki szczegółowe prowadzą do `nekrolog.eklepsydra.pl`** (potwierdzone w `data/latest.json`). Bez tej domeny parser PUK — jedyny w pełni sprawny — straci dostęp do klepsydr.
- `discord.com` jest potrzebny wyłącznie, jeśli chcesz testować realną wysyłkę webhooka. **Do audytu odczytu nie jest potrzebny** — przy testach lokalnych i tak należy ustawiać `DISCORD_NOTIFY_ENABLED=false`, żeby nie zaśmiecać kanału (zalecenie z `Analizy/Zrodla.md`).
- Domeny, do których strony źródłowe przekierowują (CDN, `www` vs bez `www`), mogą wymagać dopisania — przy blokadzie w logu pojawi się konkretna nazwa hosta.
- Jeżeli sesja ma czytać artefakty, dopisz `*.frame.claudeusercontent.com`.

### 9.4. Wariant alternatywny — poziom Full

Ustawienie **Network access → Full** dopuszcza dowolną domenę i eliminuje problem dopisywania hostów. Jest wygodniejsze przy eksploracji nieznanych jeszcze przekierowań, ale znosi ograniczenie ruchu wychodzącego z sesji, w której agent wykonuje kod. **Rekomendacja: użyć Full wyłącznie doraźnie**, na czas pobrania świeżych fixture'ów, a docelowo pracować na Custom z listą z punktu 9.2.

### 9.5. Wariant bez zmiany ustawień — ręczne fixture'y

Jeżeli zmiana polityki nie wchodzi w grę, tę samą wartość merytoryczną da ręczne pobranie stron na własnym komputerze i dołożenie ich do repozytorium:

```bash
curl -sL -A "Mozilla/5.0" https://www.zck-krakow.pl/funerals \
  -o tests/fixtures/zck_funerals_$(date +%F).html
```

...i analogicznie dla pozostałych siedmiu źródeł. Fixture'y należy zapisywać z datą w nazwie (konwencja z `Instrukcja_odczytu_zrodel_Nekrolog.md:242`) i traktować jako **materiał referencyjny do testów regresji** — obecne fixture'y są syntetyczne i nie odzwierciedlają rzeczywistej struktury stron, co jest bezpośrednią przyczyną ustalenia G2.

### 9.6. Weryfikacja, że dostęp działa

Po uruchomieniu nowej sesji w zmienionym środowisku:

```bash
# oczekiwany wynik: 200 przy każdej domenie (403 przy Dębnikach to blokada po stronie serwisu, nie proxy)
for u in https://www.zck-krakow.pl/funerals \
         https://www.puk.krakow.pl/pozegnalismy/ \
         https://www.gabriel24.pl/nekrologi/ \
         https://karawan.pl/nekrologi/ \
         https://krakowsalwator.grobonet.com/nekrologi.php \
         https://debniki.sdb.org.pl/ \
         https://www.podwawelskie.pl/aktualnosci/nekrologi.html \
         https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe; do
  echo "$(curl -sL -o /dev/null -w '%{http_code}' --max-time 25 "$u")  $u"
done

# pełny przebieg bez wysyłki na Discord
DISCORD_NOTIFY_ENABLED=false npm run refresh
```

Kod `000` oznacza, że blokada nadal obowiązuje — najczęstsza przyczyna to praca w starej sesji (punkt 8 z 9.2) albo literówka w nazwie hosta. Bieżący stan proxy można podejrzeć poleceniem `curl -sS "$HTTPS_PROXY/__agentproxy/status"`; sekcja `recentRelayFailures` wskazuje dokładnie, który host został odrzucony.

Dokumentacja źródłowa: https://code.claude.com/docs/en/cloud-environments (sekcje *Network access*, *Access levels*, *Allow specific domains*).

---

## 10. Następne kroki

1. **Weryfikacja na żywym HTML** — obowiązkowa przed jakąkolwiek naprawą parserów. Wymaga włączenia dostępu sieciowego wg rozdziału 9 albo ręcznego pobrania stron jako fixture'ów (§9.5). Bez tego kroku poprawki parserów będą zgadywaniem — obecne fixture'y są syntetyczne.
2. **Wdrożenie zmian P0** — to jedyny blok, który da się zrealizować i przetestować w całości bez dostępu do sieci, a zarazem odblokowuje główną funkcję aplikacji.
3. **Wdrożenie P1** po zebraniu świeżych fixture'ów.
4. **Rozstrzygnięcie zakresu „potrzeb" (intencji)** — decyzja produktowa: czy aplikacja ma prezentować intencje mszalne jako osobną kategorię (`Instrukcja_odczytu_zrodel_Nekrolog.md` opisuje gotowy format dla `debniki_intencje`), czy pozostają poza zakresem. Obecnie jest to zaślepka, a interfejs nie ma dla nich miejsca.
5. **Dębniki (403)** — sprawdzić, czy blokada dotyczy user-agenta bota; ewentualnie ograniczyć `max_detail_pages` i dodać odstępy między żądaniami.

---

## 11. Weryfikacja wykonana w ramach audytu

| Sprawdzenie | Sposób | Wynik |
|---|---|---|
| Zestaw testów | `npm ci && npm test` | 6/6 przechodzi |
| `parseTime` na 7 przypadkach brzegowych | uruchomienie funkcji | poprawnie, w tym odróżnianie godziny od daty i numeru telefonu |
| `parsePolishDateToIso` na 6 przypadkach | uruchomienie funkcji | ✅ formaty PL, ❌ brak walidacji zakresu |
| `validateParsedRow` z realistycznymi notatkami | uruchomienie funkcji | potwierdzone odrzucanie przy „facebook"/„cookie" |
| `isBadNameCandidate` na nazwach usług | uruchomienie funkcji | potwierdzone przepuszczanie „Pogrzeby tradycyjne" |
| `textMatchesAny` na 15 realistycznych zapisach | uruchomienie na `Frazy.json` | potwierdzona luka „drugie imię" |
| `isCzerwonaHelenaRow` dla trafienia w `place` | uruchomienie funkcji | potwierdzony brak dopasowania |
| Struktura `latest.json` (103 rekordy) | analiza ilościowa | 27 % pokrycia okien, 27 rekordów bez daty, 18 z pustym `note` |
| Duplikaty międzyźródłowe | normalizacja + porównanie nazwisk | 6 osób w dwóch źródłach |
| Wpływ upływu doby na okna | ponowne policzenie okien dla 2026-08-18 | 21 → 5 pogrzebów; wszystkie rekordy ZCK wypadają |
| Martwy kod | `grep` po całym repozytorium | `parseDetail`, `parsePodwawelskieDetailHtml`, `normalize.js`, flagi konfiguracyjne |
| Redundancja `Frazy.json` | normalizacja 264 fraz | 100 unikalnych ciągów |
| Dostęp do żywych źródeł | `curl` + `WebFetch` na 8 domenach | zablokowany przez politykę sieciową środowiska (`EGRESS_BLOCKED` / `403 CONNECT`) |

---

## 12. Uwaga proceduralna

`AGENTS.md` przewiduje zapisywanie analiz w katalogu `Analizy/`. Niniejszy dokument został umieszczony w katalogu głównym jako `AnalizaClaude.md` **na wyraźne polecenie użytkownika** („zapisz jej wyniki w pliku AnalizaClaude.md (wrzuć na main)"). Struktura treści jest zgodna z wymaganiami `AGENTS.md` sekcja 2 (data, temat, pełny prompt, zakres, wnioski, rekomendacje, ryzyka, następne kroki).

**W ramach tego zadania nie wprowadzono żadnych zmian w kodzie aplikacji.** Jedyną modyfikacją repozytorium jest dodanie tego pliku.
