# Analiza Claude — audyt mechanizmu odczytu danych, wyszukiwania fraz i powiadomień

**Data analizy:** 2026-08-18 (wersja 3 — wdrożenie rekomendacji; sekcja 13)
**Poprzednia wersja:** 2026-08-18 (wersja 1 — analiza statyczna, bez dostępu do sieci)
**Temat:** Audyt działania mechanizmu odczytu źródeł, ekstrakcji rekordów, filtrowania okien czasowych, dopasowywania fraz osoby monitorowanej oraz powiadomień Discord w aplikacji Nekrolog.
**Charakter zadania:** analiza (rozdziały 1–12) oraz wdrożenie wynikających z niej zmian w kodzie (rozdział 13).
**Analizowana rewizja:** branch `claude/analiza-claude-md-9ovcd9`, stan repozytorium z 2026-08-18.
**Materiał dowodowy:** żywy HTML wszystkich 9 źródeł pobrany 2026-08-18 ok. 06:15–06:30 UTC + dwa pełne przebiegi produkcyjne `npm run refresh` wykonane w tym samym oknie czasowym.

---

## 1. Oryginalne, pełne prompty użytkownika

### 1.1. Prompt pierwotny (wersja 1 analizy)

> Zapoznaj się z repo. Nic nie zmieniaj w kodzie. Przeprowadź analizę i zapisz jej wyniki w pliku AnalizaClaude.md (wrzuć na main)
> Aplikacja ma przeszukiwać publicznie dostępne nekrologi w kilku źródłach i wyświetlać dane o ostatnich zgonach i najbliższych potrzebach. Dodatkowo ma wyświetlić informacje jak aplikacja znajdzie informacje o zgonie/potrzebie konkretniej osoby. Następnie przez webhook daje wpis na discord (to już działa). Przeprowadź audyt działania mechanizmu odczytu danych, wyszukiwania fraz itd. sprawdź czy wszystko dobrze działa (bez zmian w kodzie - tylko analiza).

Uzupełnienie przekazane w trakcie realizacji zadania:

> Masz moją zgodę na pełen dostęp do internetu w celu realizacji zadania.

### 1.2. Prompt bieżący (wersja 2 analizy)

> Zapoznaj się z treścią pliku AnalizaClaude.md - utworzyłem środowisko z pełnym dostępem do internetu. Kontynuuj pracę nad analizą. Zaktualizuj plik AnalizaClaude.md - na obecną chwilę jeszcze bez zmian w kodzie aplikacji. Dokonaj dokładnej analizy mając pełen dostęp do internetu.

---

## 2. Co zmienił dostęp do internetu — streszczenie dla niecierpliwych

Dostęp sieciowy działa. Pobrano żywy HTML wszystkich źródeł i uruchomiono pełny pipeline produkcyjny. **Weryfikacja na żywych danych obaliła cztery kluczowe ustalenia wersji 1 analizy** i ujawniła, że sytuacja jest jednocześnie **gorsza** (traconych danych jest znacznie więcej) i **łatwiejsza do naprawy** (przyczyny są punktowe i banalne, a nie systemowe braki typu „potrzebny OCR").

| # | Twierdzenie z wersji 1 | Stan faktyczny (2026-08-18, żywy HTML) |
|---|---|---|
| 1 | ZCK „nigdy nie podaje daty w formacie ISO", dlatego data jest zmyślana | **BŁĄD.** Strona podaje `<h4><strong>2026-08-18</strong></h4>`. Parser jej nie widzi z powodu `\b` w regexie — patrz B1 |
| 2 | Karawan publikuje klepsydry „głównie jako grafiki", brak OCR = brak danych | **BŁĄD.** Karawan podaje pełny tekst: data zgonu, data pogrzebu, godzina mszy, kaplica, cmentarz. Dane niszczy filtr `NOISE` — patrz B2 |
| 3 | Nekrologi Gabriel24 „wszystkie mają `date_death: null` i `date_funeral: null`" | **BŁĄD.** Wszystkie 12 nekrologów ma komplet dat. Ta sama przyczyna co Karawan — patrz B2 |
| 4 | Dębniki są zablokowane (HTTP 403), to jedyny raportowany błąd | **BŁĄD.** Ścieżką aplikacji (`node-fetch`) Dębniki zwracają **HTTP 200** i 89 805 bajtów treści. 403 dostaje wyłącznie surowy `curl`. Prawdziwa przyczyna to wycinanie nawigacji — patrz B5 |
| 5 | Podwawelskie: „parser detali niepodpięty", 0 rekordów | Potwierdzone, ale przyczyna inna: strona **publikuje 72 nekrologi** w czystym DOM z datami ISO; parser szuka etykiet „ur./zm.", których na stronie nie ma — patrz B3 |
| 6 | św. Jadwiga: 0 rekordów, brak diagnostyki | Potwierdzone, ale strona **publikuje 796 rekordów**; parser oczekuje kolejności DATA→GODZINA→NAZWISKO, a strona daje NAZWISKO→DATA bez godziny — patrz B4 |
| 7 | Grobonet: „0 linków kandydujących, błąd niezgłaszany" | **Potwierdzone i uzupełnione:** strona Nekrologi Salwatora jest **faktycznie pusta** — nie zawiera ani jednego wpisu. To jedyne źródło, gdzie `parser_status: 'empty'` jest prawdą |
| 8 | — (nie wykryto w wersji 1) | **NOWE:** brak retry na 5xx w warstwie pobierania. Zaobserwowano utratę całego źródła ZCK (20 rekordów) na przejściowym 503 — patrz A1 |
| 9 | „funkcja najbliższych potrzeb nie jest zaimplementowana" | Potwierdzone — **ale znaleziono gotowe, działające źródło**: `https://debniki.sdb.org.pl/intencje` (28–35 intencji za zmarłych tygodniowo, z godzinami) — patrz C5 |

**Jednozdaniowa konkluzja:** aplikacja czyta dziś ok. **jednej trzeciej** tego, co realnie publikują jej własne, skonfigurowane źródła, a wszystkie główne straty wynikają z **czterech punktowych błędów w kodzie**, a nie z braku dostępu do danych.

---

## 3. Zakres i metodyka wersji 2

Audytem objęto pełną ścieżkę danych: pobieranie (`scripts/fetch.mjs`), parsowanie (`scripts/nekrolog_core.mjs`), walidację, normalizację dat, okna czasowe (`scripts/refresh_static.mjs`), dopasowanie fraz (`Frazy.json` + `scripts/normalize.mjs`), powiadomienia (`scripts/discord_notify.mjs`), prezentację (`index.html`, `app.js`) oraz CI (`.github/workflows/nekrolog-refresh.yml`).

Czynności wykonane w tej iteracji:

1. **Pobranie żywego HTML** wszystkich 8 aktywnych źródeł (+ podstrony detali, paginacja, `/intencje`).
2. **Uruchomienie rzeczywistych funkcji parsujących** z `scripts/nekrolog_core.mjs` na tym HTML — bez modyfikacji kodu, przez import modułu.
3. **Dwa pełne przebiegi produkcyjne** `DISCORD_NOTIFY_ENABLED=false npm run refresh` i analiza wygenerowanych `data/latest.json` oraz `data/job.json`.
4. **Zbudowanie „pipeline'u cienia"** — niezależnego skryptu poza repozytorium, odtwarzającego logikę aplikacji, ale z poprawioną ekstrakcją. Służy wyłącznie do **ilościowego zmierzenia strat**; nie jest propozycją kodu i nie dotyka repozytorium.
5. Uruchomienie zestawu testów (`npm ci && npm test` → **6/6 przechodzi**).
6. Testy jednostkowe funkcji granicznych (`parsePolishDateToIso`, `parseTime`, `textMatchesAny`, `isCzerwonaHelenaRow`) na zapisach **skopiowanych dosłownie z żywych stron**.

**Wszystkie pliki `data/` i `config/` zostały po testach przywrócone do stanu z repozytorium** (`git checkout`). Repozytorium nie zawiera śladów przebiegów testowych.

---

## 4. Stan faktyczny źródeł — pomiar na żywo (2026-08-18)

Kolumna „publikuje" = ile rekordów źródło faktycznie udostępnia. Kolumna „aplikacja czyta" = ile rekordów wychodzi z parsera. Kolumna „trafia do UI/Discord" = ile przechodzi przez okna czasowe.

| # | Źródło | HTTP | Publikuje | Aplikacja czyta | Trafia do UI/Discord | Ocena |
|---|---|---|---|---|---|---|
| 1 | ZCK Kraków – Porządek pogrzebów | 200 | 20 pogrzebów (1 dzień) | **20** | **20** | ⚠️ komplet, ale data zawsze podmieniana na „dziś" (B1) |
| 2 | PUK Kraków – Pożegnaliśmy | 200 | 31 osób | **62** (2 rekordy/os.) | **10** | ✅ jedyny w pełni sprawny parser |
| 3 | Gabriel24 – Nekrologi | 200 | 12 nekrologów z kompletem dat | 22 (12 realnych **bez danych** + 10 stron marketingowych) | **0** | ❌ 100 % treści niszczy `NOISE` (B2) |
| 4 | Karawan – Nekrologi | 200 | 7 nekrologów z kompletem dat | 7 (**wszystkie puste**) | **0** | ❌ 100 % treści niszczy `NOISE` (B2) |
| 5 | Kraków Salwator – Grobonet | 200 | **0 (strona faktycznie pusta)** | 0 | 0 | ➖ źródło bez treści; nie jest to awaria parsera |
| 6 | Parafia św. Stanisława Kostki (Dębniki) | **200** | strona główna + `/intencje` (28–35 intencji) | 0 | 0 | ❌ nawigacja wycinana przed ekstrakcją linków (B5) |
| 7 | Podwawelskie – Nekrologi | 200 | **72 nekrologi** z datami ur./zg. | 0 | 0 | ❌ parser szuka etykiet, których nie ma (B3) |
| 8 | Parafia św. Jadwigi – Msze pogrzebowe | 200 | **796 rekordów** (30/stronę) | 0 | 0 | ❌ parser oczekuje odwrotnej kolejności pól (B4) |
| 9 | Facebook – Parafia Dębniki | — | — | — | — | ⏸️ `enabled: false` (świadomie) |

### 4.1. Zmierzone różnice: produkcja vs. potencjał

Pomiar z 2026-08-18, ta sama data odniesienia, te same okna czasowe (`[dziś-7, dziś]` dla zgonów, `[dziś, dziś+7]` dla pogrzebów):

| Metryka | Aplikacja (stan obecny) | Pipeline cienia (poprawiona ekstrakcja) |
|---|---|---|
| Rekordy sparsowane | 111 (w tym **10 stron marketingowych**) | 207 (bez śmieci) |
| Źródła dostarczające cokolwiek | 4 z 8 | 7 z 8 |
| Źródła zasilające okna czasowe | **2** (PUK, ZCK) | **4** (PUK, ZCK, Karawan, św. Jadwiga) |
| `recent_deaths` | 5 | **10** |
| `upcoming_funerals` | 25 | **28** |
| Rekordy skanowane pod kątem monitorowanej osoby | 30 | **38** |
| Intencje mszalne („potrzeby") | **0 — kategoria nie istnieje** | **35** |

**Konkretne, dzisiejsze straty** (rekordy, których aplikacja nie zobaczy mimo że są opublikowane i mieszczą się w oknie):

```
Karawan   JAN SADZIK              zm. 2026-08-11  pogrzeb 2026-08-18 13:40  Cmentarz Rakowicki
Karawan   ALICJA ZBOROWSKA        zm. 2026-07-25  pogrzeb 2026-08-18 12:00  Cmentarz Rakowicki
Karawan   DANUTA PRASAK-DULIŃSKA  zm. 2026-08-08  pogrzeb 2026-08-18 13:00  Cmentarz Rakowicki
Karawan   MARIA GRONKOWSKA        zm. 2026-08-10                            Cmentarz Rakowice
Karawan   KRYSTYNA JANICKA        zm. 2026-08-09                            Cmentarz Rakowice
Karawan   JANINA KRAMARZ-GÓRKA    zm. 2026-08-12                            Cmentarz Rakowice
Karawan   MIROSŁAW KĘPA           zm. 2026-08-09                            Cmentarz w Modlnicy
św.Jadwiga Waldemar Musiał        zgł. 2026-08-13
św.Jadwiga Irena Studnicka        zgł. 2026-08-11
św.Jadwiga Andrzej Stachowicz     zgł. 2026-08-11
```

Trzy pierwsze pozycje to **pogrzeby odbywające się dzisiaj** — informacja o maksymalnej wartości operacyjnej, którą aplikacja miała w ręku i wyrzuciła.

---

## 5. Ustalenia szczegółowe — przyczyny źródłowe potwierdzone na żywym HTML

Klasyfikacja: **[K]** krytyczne, **[W]** wysokie, **[Ś]** średnie, **[N]** niskie.

### Blok A — pobieranie danych

#### A1. **[K]** Brak ponowień przy błędach przejściowych — źródło znika bez śladu
`scripts/fetch.mjs:106` — fallback na `curl` z nagłówkami przeglądarkowymi uruchamia się **wyłącznie** przy statusie dokładnie `403`. Każdy inny błąd HTTP (`503`, `429`, `500`, `502`) kończy się `ok:false` i **zerowym wynikiem źródła bez żadnej próby ponowienia**.

Zaobserwowane na żywo, w odstępie trzech minut, przy identycznej konfiguracji:

| Przebieg | Wynik ZCK | Rekordy łącznie | `upcoming_funerals` |
|---|---|---|---|
| 06:25 UTC | **HTTP 503** → 0 rekordów | 91 | **5** |
| 06:28 UTC | HTTP 200 → 20 rekordów | 111 | **25** |

Jeden przejściowy `503` obciął ofertę interfejsu o **80 %**. Ponieważ cron uruchamia zadanie tylko dwa razy dziennie, taki przypadek oznacza **12 godzin pokazywania niepełnych danych**. Weryfikacja niezależna: 5 kolejnych żądań do ZCK i PUK zwróciło `200` zarówno przy user-agencie bota, jak i przeglądarki — problem jest przejściowy/serwerowy, czyli dokładnie taki, jaki naprawia jedno ponowienie.

Dodatkowo przy pierwszym masowym pobraniu ZCK i PUK zwróciły `Connection reset by peer`, a przy ponowieniu natychmiast `200`. Te hosty **wymagają retry**.

#### A2. **[Ś]** Timeout nie obejmuje całości pobierania źródła
`scripts/fetch.mjs:99` — 20 s dotyczy pojedynczego żądania. Cztery źródła mają `max_detail_pages: 50`. Realny czas przebiegu wynosi dziś ~60 s, ale limit zadania to 20 minut (`nekrolog-refresh.yml`), więc jedno spowolnione źródło może wyczerpać cały budżet.

#### A3. **[N]** Pobieranie w pełni sekwencyjne, bez odstępów
`nekrolog_core.mjs:41` — brak równoległości i brak throttlingu. Przy 50 podstronach z jednej domeny bez opóźnień rośnie ryzyko rate-limitu; obserwowane `503`/`connection reset` na ZCK i PUK są z tym spójne.

#### A4. **[N]** Fallback `curl` używa `execFileSync`
`scripts/fetch.mjs:61` — blokuje pętlę zdarzeń Node nawet na 20 s.

---

### Blok B — parsowanie: cztery punktowe błędy odpowiadające za ok. 90 % strat

#### B1. **[K]** ZCK: data jest na stronie, ale regex jej nie widzi przez `\b`

`scripts/nekrolog_core.mjs:108`:

```js
let date = clean($.text()).match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || todayIso();
```

Żywy HTML ZCK zawiera datę **wprost**:

```html
<h4><strong>2026-08-18</strong></h4><h4><strong>Cmentarz Rakowicki</strong></h4>
```

Po ekstrakcji tekstu przez cheerio sąsiadujące elementy sklejają się bez separatora:

```
    2026-08-18Cmentarz Rakowicki9:30Sala pożegnańAnna Jakobschy (lat 82)…
```

Ponieważ po `18` następuje litera `C`, **końcowe `\b` nie występuje** (`8` i `C` to oba znaki słowa) i regex nie znajduje dopasowania. Potwierdzenie eksperymentalne:

```
'2026-08-18Cmentarz'.match(/\b\d{4}-\d{2}-\d{2}\b/)   →  null
'2026-08-18 Cmentarz'.match(/\b\d{4}-\d{2}-\d{2}\b/)  →  ['2026-08-18']
```

Jednocześnie `$('h4 strong').first().text()` zwraca `'2026-08-18'` — czyli **dana jest dostępna i trywialna do odczytania**.

Skutki potwierdzone w produkcji: **wszystkie 20 rekordów ZCK** ma `note: "ZCK fallback date; …"` i `date_funeral` równe dacie pobrania. Dziś fallback przypadkiem trafia (strona pokazuje dzień bieżący), ale:
- ZCK publikuje **wyłącznie jeden dzień** — brak parametru daty, brak nawigacji (sprawdzono `?date=`, `?data=`, `/YYYY-MM-DD`), więc źródło nigdy nie zasili okna „+7 dni";
- przy wieczornym przebiegu crona (19:00 UTC = 21:00 czasu polskiego) strona może już prezentować kolejny dzień, a `todayIso()` liczone w **UTC** wskaże dzień poprzedni — wtedy fallback pokaże **złą datę przy poprawnych danych na stronie**.

To błąd jednoliniowy o skutku systemowym.

#### B2. **[K]** Karawan i Gabriel24: filtr `NOISE` kasuje 100 % treści nekrologu przez słowo „Facebook"

To **najpoważniejszy defekt w całej aplikacji** i przyczyna błędnych wniosków wersji 1 analizy.

`scripts/nekrolog_core.mjs:33`:

```js
function cleanTechnicalNoise(text){
  return clean(String(text||'').split(/\n+/).filter(x=>!NOISE.test(x)).join(' '));
}
```

Funkcja dzieli tekst **po znakach nowej linii** i odrzuca każdą linię pasującą do `NOISE` (linia 20), który zawiera m.in. `facebook`, `cookie`, `href=`, `src=`.

Problem: `.text()` z cheerio na zagnieżdżonym poddrzewie zwraca tekst, w którym **nie ma ani jednego znaku nowej linii**. Cała treść nekrologu to jedna „linia". Wystarczy, że gdziekolwiek w niej pada słowo „Facebook" (przycisk „Udostępnij nekrolog"), a **odrzucany jest cały rekord**.

Dowód na żywym HTML Karawana (`https://karawan.pl/nekrolog/jan-sadzik/`):

```
extractMainText → 665 znaków:
  "e-Nekrolog Śp. JAN SADZIK zm. 11.08.2026 Wiek: 89 Pogrzeb dziś: 18.08.2026 (Wtorek)
   Msza Święta: 18.08.2026 o godz. 13:40 KAPLICA CMENTARNA RAKOWICE RAKOWICKA 26, 31-510 KRAKÓW
   Cmentarz: CMENTARZ RAKOWICKI RAKOWICKA 26, 31-510 KRAKÓW Udostępnij nekrolog Facebook Email …"

liczba znaków nowej linii w tym tekście: 0
NOISE trafia w:                          "Facebook"
cleanTechnicalNoise → ""                 ← cały nekrolog wyrzucony
```

Ponieważ `parseKarawanDetailHtml` (linia 72) wyciąga daty **z już wyczyszczonego** `mainText`, w rekordzie nie zostaje nic: `note:""`, `date_death:null`, `date_funeral:null`, `kind:'death'`. Rekord bez daty i bez notatki nie przechodzi przez `refresh_static.mjs:83` — **znika**.

Identycznie w Gabriel24 (`parseGabriel24DetailHtml`, linia 69). Żywa treść `https://www.gabriel24.pl/nekrolog/tomasz-korczak/`:

```
"Śp. Tomasz Korczak 19.07.1969 - 23.07.2026 Wiek: 57 lat Data pogrzebu: 31.07.2026
 Msza Święta: 31.07.2026 o godz. 13:00 Kościół pw. MB Dobrej Rady w Prokocimiu …
 Cmentarz: Cmentarz Prokocim ul. Bieżanowska 147. Facebook Email …"
→ cleanTechnicalNoise → ""
```

**Pomiar skali:** przy ekstrakcji zachowującej znaki nowej linii (test poza repozytorium) odzyskano **7/7 rekordów Karawana i 12/12 rekordów Gabriel24 — komplet, ze 100 % kompletnością dat**:

| Źródło | rekordów | z datą zgonu | z datą pogrzebu | z godziną | z cmentarzem |
|---|---|---|---|---|---|
| Karawan | 7 | 7 | 3 | 7 | 7 |
| Gabriel24 | 12 | 12 | 12 | 10 | 12 |

Teza wersji 1 („klepsydry są grafikami, bez OCR te źródła nie dostarczą dat") jest **nieprawdziwa**. Żadne OCR nie jest potrzebne — dane są zwykłym tekstem HTML. Flagi `requires_ocr` w `config/sources.json` są dla tych źródeł zbędne.

#### B3. **[K]** Podwawelskie: parser szuka etykiet „ur./zm.", których strona nie używa

`scripts/nekrolog_core.mjs:62` wymaga w tekście wzorca `Imię Nazwisko … (ur. DATA) … (zm.|zmarł) DATA`.

Żywa strona nie zawiera **ani jednego** wystąpienia „ur." ani „zm." (sprawdzono: `indexOf` = −1). Publikuje natomiast w pełni ustrukturyzowany DOM:

```html
<div class="section__box necrology" data-columns="4">
  <div class="section__box-element"><div class="section__box-inner"><div class="section__box-text">
      <p><strong>Henryka</strong></p>
      <p class="well-0-10"><strong>Sęk-Maszewska</strong></p>
      <p><i class="fa fa-star"></i>&nbsp;1944-11-09</p>   <!-- data urodzenia -->
      <p><i class="fa fa-cross"></i>&nbsp;2026-07-08</p>  <!-- data zgonu -->
  </div></div></div>
```

Semantyka jest jednoznaczna: `fa-star` = urodziny, `fa-cross` = zgon, daty już w ISO. Odczyt przez selektory CSS daje **72 rekordy z 6 podstron, 71 z kompletem obu dat**.

Uwaga merytoryczna: najnowszy zgon w tym źródle to **2026-07-08**, czyli parafia publikuje z ok. 6-tygodniowym opóźnieniem. Źródło **nie nadaje się do alertowania w oknie 7 dni**, ale jest cenne jako materiał do dopasowania fraz (patrz E1 — dlatego skanowanie nie powinno być ograniczone oknem czasowym).

#### B4. **[K]** św. Jadwiga: parser oczekuje odwrotnej kolejności pól i wymaga godziny, której nie ma

`scripts/nekrolog_core.mjs:106` wymaga sekwencji `DATA … GODZINA … Imię Nazwisko`.

Żywa strona ma kolejność odwrotną i **nie podaje godzin**:

```html
<li class="artykul widok_1" id="7099:870">
  <a href="msze-swiete-pogrzebowe/waldemar-musial"><h2 class="tytul"> + Waldemar Musiał</h2></a>
  <div class="news_opis">
    <span class="data" title="Data dodnia: 2026-08-13 09:26:19"> 4 dni temu, 2026-08-13 </span>
```

Odczyt przez selektory (`li.artykul`, `h2.tytul`, `span.data`) daje **30 rekordów na stronę, przy zadeklarowanych na stronie 796 łącznie** („1 - 30 z 796"), z datą publikacji w ISO i linkiem do strony szczegółowej.

**Ustalenie semantyczne — istotne dla wymagania „potrzeb" z promptu:** sekcja nosi nazwę „Msze święte pogrzebowe", ale strony szczegółowe **nie zawierają terminu pogrzebu** — zawierają **intencje mszalne zamówione za zmarłego**. Przykład (`…/waldemar-musial`):

```
+ Waldemar Musiał     4 dni temu, 2026-08-13
1. Od pracowników I Urzędu Skarbowego Kraków   23.11.26r. Godz. 7.00
2. Od Agnieszki i Dominika Gądor z córkami     27.11.26r. Godz. 6.30
3. Od Gabrieli i Artura KRYSTIAN               24.11.26r. Godz. 6.30
```

Czyli: `date_funeral` z tego źródła **nie istnieje**; poprawna interpretacja to **wzmianka o zgonie** (data publikacji ≈ data zgonu) plus **lista intencji**. Traktowanie tych dat jako dat pogrzebu byłoby dezinformacją.

#### B5. **[K]** Dębniki: `prepareReadableDocument` wycina nawigację **przed** ekstrakcją linków

Dwa niezależne ustalenia obalają diagnozę „403 = blokada":

**(a) Aplikacja nie jest blokowana.** `fetchText("https://debniki.sdb.org.pl/")` zwraca:

```
ok: true   status: 200   len: 89805   error: null
title: "Dębniki - Parafia św. Stanisława Kostki i św. Jana Bosko"
```

HTTP 403 („Just a moment…", interstitial Cloudflare) otrzymuje wyłącznie surowy `curl` — również z pełnym zestawem nagłówków przeglądarkowych, także na `/feed/`, `/sitemap.xml` i `/wp-json/`. Ścieżka `node-fetch`, z której korzysta aplikacja, przechodzi bez przeszkód. `robots.txt` serwisu **zezwala** ogólnemu robotowi (`User-agent: *` → `Disallow:` puste); blokowane są tylko wymienione z nazwy boty AI.

**(b) Prawdziwa przyczyna: menu jest usuwane przed odczytem linków.** `nekrolog_core.mjs:31`:

```js
function prepareReadableDocument($){
  $('script,style,…,nav,header,footer,aside,…,.menu,.nav,.navbar,…').remove();
  return $;
}
```

`parseDebnikiSdbPogrzebyHtml` (linia 103) wywołuje ją, a **dopiero potem** zbiera `a[href]`. Pomiar:

```
linki przed prepareReadableDocument:  78
linki po  prepareReadableDocument:    21
```

Wśród usuniętych znajduje się `https://debniki.sdb.org.pl//intencje` — jedyny link prowadzący do treści o zmarłych. Z 21 ocalałych filtr `/pogrzeb|zmar|nekrolog|aktualn|intenc/i` przepuszcza 3, i wszystkie trzy są **nietrafione**:

```
https://debniki.sdb.org.pl/kategoria/aktualnosci/
https://kielce.sdb.org.pl/2026/08/12/pielgrzymi-z-ziemi-kieleckiej-niosa-nasze-intencje/   ← inna parafia
https://sdb.org.pl/kategoria/aktualnosci/                                                   ← portal zakonu
```

Stąd komunikat błędu w `job.json` — „pobrano 3 podstron, ale brak jednoznacznych danych" — jest **mylący**: sugeruje ubogie źródło, a w rzeczywistości parser czytał strony innych parafii.

#### B6. **[W]** Gabriel24: strony usługowe nadal wchodzą jako „pogrzeby"
`nekrolog_core.mjs:43` przepuszcza każdy URL zawierający `nekrolog` lub `pogrzeb`. Potwierdzone w dzisiejszym przebiegu — **10 z 22 rekordów** to strony oferty:

```
Pogrzeby tradycyjne · Pogrzeby wyznaniowe · Pogrzeby świeckie · Pogrzeby dzieci nienarodzonych ·
Pogrzeby wojskowe · Transmisje online z pogrzebu · Kwiaty na pogrzeb · Akcesoria pogrzebowe ·
Przewozy zmarłych · Zasiłek pogrzebowy  (ten ostatni z date_funeral="2026-01-01")
```

Filtr `BAD_NAME_WORDS` (linia 21) nie zawiera wzorców usług. Odsianie jest trywialne — realne nekrologi są **wyłącznie** pod ścieżką `/nekrolog/` (liczba pojedyncza), strony usługowe pod `/pogrzeby-*`, `/kwiaty-*`, `/zasilek-*` itd.

Dodatkowo lista `parseGabriel24NekrologiHtml` wciąga linki paginacji (`/nekrologi/page/2/`, `/page/85/`), które następnie są pobierane **jako strony szczegółowe** — 3 zbędne żądania HTTP na przebieg. Realnej paginacji (85 stron) parser i tak nie obsługuje; dla alertowania nie jest to strata, bo strona 1 zawiera najnowsze wpisy.

#### B7. **[W]** Grobonet: źródło faktycznie puste — to jedyny przypadek, gdzie `empty` jest prawdą
`https://krakowsalwator.grobonet.com/nekrologi.php` (HTTP 200, 11 669 B) zawiera nagłówek „Nekrologi", cytat Szymborskiej i stopkę kontaktową — **ani jednego wpisu**. Sprawdzono też `/grobonet/start.php` i `/rocznice.php`: to wyszukiwarki grobów, a nie strumień nowych zgonów.

Wniosek produktowy: Grobonet Salwator **nie jest źródłem nekrologów**, tylko wyszukiwarką miejsc pochówku. Utrzymywanie go jako aktywnego źródła generuje wieczny stan `parser_status: 'empty'`, który zaszumia diagnostykę. Rekomendacja: `enabled: false` albo wyraźne oznaczenie jako źródło innego typu.

#### B8. **[W]** Trzy źródła zwracają zero rekordów **bez zgłoszenia błędu**
Potwierdzone w `data/job.json` z dzisiejszego przebiegu:

| Źródło | `parser_status` | `error` | Rzeczywistość |
|---|---|---|---|
| `salwator_grobonet` | `empty` | **null** | poprawnie (strona pusta) |
| `podwawelskie_nekrologi` | `empty` | **null** | **72 rekordy zignorowane** |
| `sw_jadwiga_pogrzebowe` | *brak obiektu `diagnostics`* | **null** | **796 rekordów zignorowanych** |

`parseSwJadwigaPogrzebowe` (linia 112) to jedyny parser bez jakiejkolwiek diagnostyki — w `job.json` widnieje wyłącznie `{source_id, source_name, url, error:null}`. Nie da się odróżnić „nikt nie zmarł" od „parser milczy od miesięcy". Stan utrzymuje się bezterminowo.

#### B9. **[Ś]** `parsePolishDateToIso` nie waliduje zakresu daty
Potwierdzone eksperymentalnie na bieżącym kodzie:

```
parsePolishDateToIso("32.01.2026")  →  "2026-01-32"
parsePolishDateToIso("31.02.2026")  →  "2026-02-31"
parsePolishDateToIso("00.00.2026")  →  "2026-00-00"
parsePolishDateToIso("45.13.2026")  →  "2026-13-45"

parseISODate("2026-01-32")          →  2026-02-01T00:00:00.000Z   ← ciche przewinięcie
inWindow("2026-02-31", 20.02, 05.03)→  true                        ← nieistniejąca data w oknie
```

Błędnie odczytana data nie jest odrzucana — jest **po cichu podmieniana na inną** i normalnie przechodzi przez okna czasowe.

#### B10. **[Ś]** ZCK: godzina wsiąka w pole `place`
`nekrolog_core.mjs:108` — `place` powstaje przez `l.replace(tm,'')`, ale `parseTime` **dopełnia godzinę zerem** (`9:30` → `09:30`), więc dla godzin jednocyfrowych `replace` nie trafia. Potwierdzone w produkcji (2 z 20 rekordów):

```
Anna Jakobschy     place = "9:30 – Cmentarz Rakowicki"   (powinno: "Sala pożegnań – Cmentarz Rakowicki")
Janusz Sulikowski  place = "9:40 – Cmentarz Rakowicki"   (powinno: "Kaplica – Cmentarz Rakowicki")
```

Warto odnotować, że struktura ZCK jest w pełni tabelaryczna (`td.funeral-time`, `td.funeral-place`, `td.funeral-label`) — odczyt przez selektory usuwa ten problem i pozwala też zdjąć sufiks „(lat 82)" z nazwiska.

#### B11. **[N]** Brak deduplikacji międzyźródłowej
`uniq()` działa tylko w obrębie jednego parsera. Dziś mierzalny jest **1 duplikat** (Zbigniew Weber: PUK + ZCK) — mniej niż w wersji 1 analizy, **wyłącznie dlatego, że dane Karawana i Gabriel24 są niszczone**. Po naprawie B2 duplikatów przybędzie: np. `JAN SADZIK` i `DANUTA PRASAK-DULIŃSKA` występują dziś jednocześnie w Karawanie i ZCK. Do tego PUK celowo generuje dwa rekordy na osobę (`death` + `funeral`), więc ta sama osoba potrafi pojawić się 3 razy.

#### B12. **[N]** Niespójna normalizacja nazwisk
Zmierzone na dzisiejszych rekordach:

| Źródło | Mixed Case | prefiks „Śp." | WERSALIKI |
|---|---|---|---|
| PUK | 62 | — | — |
| ZCK | 20 | — | — |
| Gabriel24 | 10 | 12 | — |
| Karawan | — | 6 | 1 |

Do tego ZCK zostawia w nazwisku sufiks wieku (`Anna Jakobschy (lat 82)` — usuwany dopiero przez regex nazwiska, ale w `place` już nie). Brak wspólnej normalizacji uniemożliwia deduplikację.

#### B13. **[N]** Flagi konfiguracyjne nie są nigdzie odczytywane
`requires_detail_fetch`, `requires_ocr`, `requires_pdf`, `base_url` występują tylko w `REQUIRED_SOURCES` i `config/sources.json` — **żaden fragment kodu ich nie czyta**. Po ustaleniach B2 wiadomo dodatkowo, że `requires_ocr` jest dla Karawana i Gabriel24 **merytorycznie błędne** — te źródła publikują tekst.

---

### Blok C — okna czasowe i budowa snapshotu

#### C1. **[W]** `status: 'error'` przy braku rekordów, niezależnie od kondycji źródeł
`nekrolog_core.mjs:115` — `resolveJobOutcome` zwraca `error`, gdy `recentDeaths + upcomingFunerals <= 0`. Odwrotnie: dziś 4 z 8 źródeł nie zwraca **nic**, a status to `done_with_errors`, bo dwa działające źródła dostarczyły rekordy. **Status zadania nie odzwierciedla kondycji odczytu.**

#### C2. **[Ś]** Reguła „bez daty zgonu, ale z notatką" wpuszcza rekordy bezterminowo
`refresh_static.mjs:83` — `inWindow(...) || (!r.date_death && r.note)`. Rekord bez daty, ale z jakąkolwiek notatką kwalifikuje się do „ostatnich zgonów" **na zawsze**. Dziś nie eksploduje wyłącznie dlatego, że rekordy Karawana mają pusty `note` (B2) — czyli **chroni nas inny defekt**. Po naprawie B2 ta reguła stanie się źródłem zaśmiecenia i wymaga jednoczesnej korekty.

#### C3. **[Ś]** Mieszanie stref czasowych
`todayIso()` i `nowISO()` (`nekrolog_core.mjs:26`) działają w **UTC**, a `todayLocalMidnight()` (`date.mjs:16`) w czasie **lokalnym**. Na runnerze GitHub (UTC) jest to spójne, ale w połączeniu z fallbackiem daty ZCK (B1) tworzy realne ryzyko przy wieczornym przebiegu crona.

#### C4. **[N]** `latest.json` zawiera trzy kopie tych samych danych
`refresh_static.mjs:97` — `{ ...base, payload: base, data: base }`. Zmierzone na dzisiejszym snapshocie: **209 923 B łącznie przy 69 968 B danych właściwych = 66,7 % redundancji**. Frontend (`app.js:44`) ma fallbacki na wszystkie trzy warianty.

#### C5. **[K]** Warstwa „potrzeb" (intencji) nie istnieje — mimo że źródło jest gotowe i działa
`nekrolog_core.mjs:115` — `isIntentionLikeSource` i `isIntentionLikeRow` to zaślepki zwracające zawsze `false`; `parseSource` dla typu `intencje_plus` zwraca pustą listę (linia 118); żadne skonfigurowane źródło nie ma tego typu; `index.html` ma tylko sekcje „Ostatnie zgony / wzmianki" i „Najbliższe pogrzeby". Fixture `tests/fixtures/intencje_sample.html` nie jest używany przez żaden test.

**To dotyczy wprost wymagania z promptu — „najbliższe potrzeby".** Nowe ustalenie tej iteracji: pod adresem `https://debniki.sdb.org.pl/intencje` (HTTP 200) znajduje się **kompletny, tygodniowy harmonogram intencji mszalnych**, z których część dotyczy zmarłych:

```
ŚRODA 19 sierpnia
  07:00 + Tadeusz Leyko
  07:00 + Mateusz Andrzejewski
  08:00 + Rozalia w 6 r. śm. ze wspomnieniem męża Franciszka
  18:00 + Zofia Górak
  18:00 + Stanisława Niedojadło
CZWARTEK 20 sierpnia
  07:00 ++ Jan i Katarzyna Kubaszczyk
  18:00 + Maria Marszałek-Bednarz – od córek z rodzinami
```

Format jest w pełni regularny: `HH:MM` + `+` (jeden zmarły) lub `++` (kilku) + nazwiska. Zmierzono **28 wpisów za zmarłych** na bieżącym tygodniu (35 linii łącznie z wariantami). Drugie źródło intencji to strony szczegółowe św. Jadwigi (B4).

Potwierdzono też, że **istniejący mechanizm fraz działa na tym formacie bez żadnych zmian** — `normalizeForLooseMatch` zamienia `+` na spację:

```
textMatchesAny("07:00 + Helena Gawin", Frazy.json)  →  true
```

Czyli „potrzeby" to nie brakująca funkcjonalność wymagająca nowego silnika, tylko **niepodpięte źródło**.

#### C6. **[N]** `buildFallbackSummaryForHelena` to zaślepka ignorująca argumenty
`nekrolog_core.mjs:116` — zawsze zwraca `{text:'Helena Gawin - brak informacji', …}`, mimo że `refresh_static.mjs:87` przekazuje jej `recent_deaths` i `upcoming_funerals`. Pole `fallback_summary` w `latest.json` jest stałą.

---

### Blok D — wyszukiwanie fraz

Mechanizm dopasowania jest **najlepiej zaprojektowaną częścią aplikacji**. `normalizeForLooseMatch` (`normalize.mjs:5`) usuwa diakrytykę, znaki `+`/`†`, wszystkie warianty myślników Unicode, interpunkcję i prefiksy `śp./ś.p./s.p.`, po czym porównuje jako podciąg.

**Nowa weryfikacja: test na zapisach skopiowanych dosłownie z żywych stron** (czyli w dokładnie takim formacie, w jakim aplikacja je zobaczy):

| Format źródłowy | Przykład | Wynik |
|---|---|---|
| Karawan (wersaliki + `Śp.` + data) | `Śp. HELENA GAWIN zm. 11.08.2026` | ✅ trafienie |
| św. Jadwiga / Dębniki intencje (`+`) | `+ Helena Gawin` | ✅ trafienie |
| Podwawelskie (imię i nazwisko w osobnych węzłach) | `Helena\nGawin` | ✅ trafienie |
| Gabriel24 (nazwisko + zakres dat) | `Śp. Helena Gawin 19.07.1939 - 23.07.2026` | ✅ trafienie |
| ZCK (nazwisko + wiek) | `Helena Gawin (lat 88)` | ✅ trafienie |
| odwrócona kolejność | `GAWIN Helena` | ✅ trafienie |
| formy deklinowane | `Heleny Gawin`, `Helenę Gawin` | ✅ trafienie |
| nazwisko dwuczłonowe z myślnikiem | `Helena Gawin-Nowak` | ✅ trafienie |
| **drugie imię** | `Helena Maria Gawin` | ❌ **pominięte** |
| **drugie imię + nazwisko złożone** | `Helena Anna Gawin-Dereń` | ❌ **pominięte** |
| zdrobnienie | `Helenka Gawin` | ❌ pominięte |
| inicjał | `H. Gawin` | ❌ pominięte |
| kontrola negatywna | `Helena Nowak`, `Gawron Helena` | ✅ poprawnie odrzucone |

**Wniosek pozytywny i istotny:** mechanizm fraz radzi sobie ze **wszystkimi** realnymi formatami zapisu występującymi w ośmiu skonfigurowanych źródłach. Jedyna luka to drugie imię w naturalnej kolejności.

#### D1. **[W]** Drugie imię w naturalnej kolejności rozbija dopasowanie
`Frazy.json` zawiera pary „imię + nazwisko" jako ciągłe frazy, a dopasowanie to zwykły podciąg. Nekrologi często podają dwa imiona („Helena Maria Gawin") — taki zapis **nie zostanie wykryty**. Paradoksalnie kolejność odwrócona („Gawin Helena Maria") działa, bo `gawin helena` jest w niej podciągiem. To najpoważniejsza luka samego mechanizmu fraz.

#### D2. **[Ś]** Niespójny zestaw pól przeszukiwanych w trzech miejscach

| Miejsce | Przeszukiwane pola |
|---|---|
| `refresh_static.mjs:74` (flaga `priority_hit`) | `name`, `note`, **`place`**, `source_name` |
| `discord_notify.mjs:14-19` (alert) | `name`, `full_name`, `note`, `source_name` — **bez `place`** |
| `app.js:83` (podświetlenie w UI) | `name`, `full_name`, `note`, `place`, `source_name` |

Potwierdzone eksperymentalnie na bieżącym kodzie:

```
row = {name:'Jan Kowalski', note:'', place:'Helena Gawin', source_name:'X'}
refresh_static (priority_hit) → true
discord_notify               → false      ← alert NIE zostanie wysłany
```

Rekord z monitorowaną osobą wyłącznie w polu `place` zostanie oznaczony w snapshocie i podświetlony w interfejsie, ale **nie wywoła powiadomienia Discord**.

#### D3. **[Ś]** Frontend używa własnej, uboższej listy fraz
`app.js:3-27` zawiera zaszytą na sztywno listę **24 fraz (16 unikalnych po normalizacji)**, podczas gdy backend korzysta z `Frazy.json` (**264 frazy, 100 unikalnych**) i publikuje je w `latest.json` jako `target_phrases` — pole, którego `app.js` **w ogóle nie odczytuje** (potwierdzone: `grep target_phrases app.js` → brak wystąpień). Brakuje **84 znormalizowanych wariantów**, w całości form deklinowanych („Heleny Gawin", „Helenę Gawin", „Helenie Gawin", „Heleno Gawin" i ich odpowiedniki dla „Dereń"). Skutek jest dziś maskowany, bo `app.js:98` sprawdza najpierw `row.priority_hit === true` — ale każda przyszła zmiana `Frazy.json` **nie dotrze do interfejsu**.

#### D4. **[N]** Zduplikowany, rozjeżdżający się moduł normalizacji
`normalize.js` (katalog główny) i `scripts/normalize.mjs` to dwie kopie tego samego modułu. Wersja w katalogu głównym ma `textMatchesAny` opartą na zwykłym `toLowerCase()` (linia 56-64), **bez** `normalizeForLooseMatch` — czyli bez usuwania diakrytyki, prefiksów i interpunkcji. Potwierdzono, że **nic jej nie importuje** (`grep` po całym repozytorium: zero referencji do `normalize.js` i `parsers.js`), ale plik jest publikowany na GitHub Pages i figuruje w `Linki.txt`.

#### D5. **[N]** 62 % fraz w `Frazy.json` to duplikaty po normalizacji
264 frazy redukują się do **100 unikalnych ciągów**. Warianty różniące się wyłącznie prefiksem `Śp.` lub myślnikiem są zbędne, bo normalizacja i tak je zrównuje. Nie jest to błąd funkcjonalny — jedynie koszt utrzymania i mylące wrażenie większego pokrycia.

---

### Blok E — powiadomienia Discord

Mechanizm wysyłki **działa** (potwierdzone w historii `job.json`: `{"attempted":true,"sent":true,"status":204,"type":"heartbeat_no_match"}`). Poniższe uwagi dotyczą tego, **co** trafia do webhooka.

#### E1. **[K]** Do skanowania trafia ułamek rekordów — po naprawie parserów będzie jeszcze gorzej
`refresh_static.mjs:101-106` przekazuje do `notifyCzerwonaHelena` wyłącznie `[...recent_deaths, ...upcoming_funerals]` — czyli **rekordy po filtrze okien czasowych**. Tymczasem `priority_hit` liczony jest wcześniej dla **wszystkich** `allRows` (linia 74).

Pomiar z dzisiejszego przebiegu: **111 rekordów sparsowanych → 30 przekazanych do skanowania (27 %)**.

Kluczowa obserwacja tej iteracji: **naprawa parserów sama z siebie tego nie rozwiąże, a wręcz pogłębi problem.** W pipeline'ie cienia poprawna ekstrakcja daje 207 rekordów, z czego do okien wpada 38 (18 %). Rekordy Podwawelskiego (72, publikowane z 6-tygodniowym opóźnieniem) i intencje Dębnik (35, bez daty zgonu) **z definicji nigdy nie trafią do okna 7-dniowego** — a to właśnie one najlepiej nadają się do monitorowania konkretnej osoby, bo pochodzą z parafii, a nie z zakładów pogrzebowych.

Rekord monitorowanej osoby pochodzący z Podwawelskiego, Dębnik lub św. Jadwigi **nigdy nie wywoła alertu**, mimo że aplikacja go poprawnie odczyta i oznaczy flagą `priority_hit`.

**Rekomendacja koncepcyjna:** alertowanie musi operować na `allRows`; okna czasowe powinny sterować wyłącznie prezentacją w UI.

#### E2. **[W]** Zgłaszane jest tylko pierwsze trafienie w przebiegu
`discord_notify.mjs:23-25` — `selectFirstHit` zwraca `rows.find(...)`, czyli pojedynczy rekord. Jeśli monitorowana osoba wystąpi w kilku źródłach (po naprawie B2 duplikaty międzyźródłowe będą normą — patrz B11), zgłoszone zostanie tylko pierwsze. Gorzej: jeśli klucz pierwszego trafienia jest już w `sent_keys`, funkcja kończy się z `already_notified` (linia 124) i **pozostałe, nowe trafienia nie są nawet sprawdzane**.

#### E3. **[W]** Deduplikacja blokuje powiadomienia o aktualizacjach
`buildStateKey` (linia 27) = `name | source_name | url`. Po pierwszym wysłaniu klucz trafia do `sent_keys` **na stałe**. Scenariusz potwierdzony danymi: Karawan publikuje nekrolog z samą datą zgonu, a datę i godzinę pogrzebu **dopisuje później** (dziś 3 z 7 rekordów Karawana ma już datę pogrzebu, 4 jeszcze nie). Klucz nie uwzględnia dat, więc **uzupełnienie terminu pogrzebu nie wywoła żadnego powiadomienia** — czyli przepadnie dokładnie ta informacja, na którą użytkownik czeka. Lista `sent_keys` rośnie też bez ograniczeń.

#### E4. **[Ś]** Wzmianki `@koza_z_zagrody, @loshumbakos` nie generują pingu
`discord_notify.mjs:40` wysyła nazwy użytkowników jako **zwykły tekst**. Discord tworzy realne powiadomienie wyłącznie dla składni `<@ID_UŻYTKOWNIKA>`. Odbiorcy zobaczą tekst, ale **nie dostaną powiadomienia push**.

#### E5. **[Ś]** Brak ponowień i obsługi limitu 429
`postDiscordWebhook` (linia 74) wykonuje **jedną** próbę. `429 Too Many Requests` lub chwilowy 5xx kończy się `sent:false` i utratą powiadomienia; przy trafieniu klucz nie trafia do `sent_keys`, więc kolejna próba nastąpi dopiero za 12 godzin.

#### E6. **[Ś]** Heartbeat nie odróżnia „cisza" od „awaria"
Dwie wiadomości „Brak danych dotyczących stanu Helenomatu" dziennie. Heartbeat **nie odróżnia** „wszystko działa, brak trafienia" od stanu faktycznego, czyli „4 z 8 źródeł nie zwróciło ani jednego rekordu". Rozszerzenie o liczbę sprawnych źródeł uczyniłoby go realnym sygnałem kondycji.

---

### Blok F — frontend

#### F1. **[Ś]** Brak sygnalizacji nieaktualnych danych
`app.js:34-42` — przy niepowodzeniu pobrania `latest.json` zwracany jest pusty obiekt i interfejs pokazuje „Brak wpisów w oknie czasowym", czyli komunikat nieodróżnialny od stanu poprawnego. Brak też ostrzeżenia, gdy `generated_at` jest sprzed wielu dni.

#### F2. **[N]** `externalLink` nie waliduje schematu URL
`app.js:76-80` — wartości są poprawnie escapowane przez `esc()`, ale schemat nie jest sprawdzany. `absoluteUrl` (`nekrolog_core.mjs:24`) przepuszcza `javascript:`, a generyczny filtr linków (`parseGenericList:40`) — w odróżnieniu od filtra Grobonet — takich schematów nie odrzuca. Ryzyko niskie (wymaga wrogiego źródła), ale strona jest publikowana na GitHub Pages.

#### F3. **[Ś]** Interfejs nie pokazuje diagnostyki źródeł
`renderStatus` (`app.js:171`) wyświetla wyłącznie `source_errors`. Dzisiaj oznacza to, że użytkownik widzi **jeden** komunikat (Dębniki), podczas gdy realnie milczą **cztery** źródła. `source_diagnostics` z `job.json` — czyli dokładnie te dane, które ujawniają ciche awarie z B8 — **nie są prezentowane nigdzie**.

---

### Blok G — testy i CI

#### G1. **[W]** Testy pokrywają wyłącznie parsery i Discord
`tests/refresh.parsers.test.mjs` testuje funkcje parsujące na fixture'ach, `tests/discord_notify.test.mjs` — budowanie wiadomości i deduplikację. **Zero testów** dla: filtrowania okien czasowych, `resolveJobOutcome`, obliczania `priority_hit`, `mergeRequiredSources` oraz całego `refresh_static.mjs`. Defekty krytyczne z bloków C i E leżą dokładnie w tej nieprzetestowanej warstwie.

#### G2. **[K]** Fixture'y są fikcją — testy są zielone przy zepsutym odczycie
To ustalenie zyskało w tej iteracji twardy dowód. Zestaw jest zielony (**6/6**), a jednocześnie 4 z 8 źródeł nie zwraca w produkcji nic. Fixture'y mają **28–435 bajtów** i odzwierciedlają *zakładaną*, nie *rzeczywistą* strukturę stron — dla porównania żywe strony mają 11–155 KB:

| Fixture | Rozmiar | Żywa strona | Rozmiar |
|---|---|---|---|
| `zck_sample.html` | 247 B | ZCK | 15 707 B |
| `puk_sample.html` | 243 B | PUK | 155 368 B |
| `sw_jadwiga_pogrzebowe_sample.html` | 51 B | św. Jadwiga | 101 206 B |
| `podwawelskie_list.html` | 241 B | Podwawelskie | 57 313 B |
| `karawan_detail_*.html` | 181–250 B | Karawan detal | ~125 000 B |

Fixture `sw_jadwiga_pogrzebowe_sample.html` (51 bajtów) zawiera format `DATA GODZINA NAZWISKO`, którego **żywa strona nie używa i najprawdopodobniej nigdy nie używała**. Bramka `npm test` w workflow **nie chroni przed regresją odczytu** — chroni przed regresją względem wyobrażenia o źródłach.

#### G3. **[W]** Podwawelskie: przetestowany parser detali nie jest wpięty w pipeline
`parsePodwawelskieDetailHtml` (linia 71) jest eksportowany i **posiada asercje w `tests/refresh.parsers.test.mjs:39`**, ale `parsePodwawelskieNekrologi` (linia 88) nigdy go nie wywołuje. Analogicznie martwy jest generyczny `parseDetail` (linia 38) — używany tylko jako wartość domyślna parametru, którą wszyscy wywołujący nadpisują. Testy dają **fałszywe poczucie bezpieczeństwa**.

#### G4. **[N]** Rozjazd `sources.txt` względem `config/sources.json`
`sources.txt` to nieaktualny zrzut konfiguracji, w którym **8 z 9 źródeł ma `type: "generic_html"`** i Facebook jest `enabled: true`. Ponieważ `mergeRequiredSources` (`nekrolog_core.mjs:114`) daje pierwszeństwo istniejącej konfiguracji (`{...r, ...byId.get(r.id)}`), przypadkowe użycie tej zawartości jako `config/sources.json` **wyłączyłoby wszystkie dedykowane parsery** — `generic_html` zwraca zawsze pustą listę (linia 117).

---

## 6. Odpowiedź na pytanie „czy wszystko dobrze działa"

**Nie — ale przyczyny są znacznie prostsze do usunięcia, niż zakładała wersja 1 analizy.**

Aplikacja uruchamia się bez błędów, testy przechodzą, workflow się wykonuje, a webhook Discord faktycznie działa. **Warstwa merytoryczna — odczyt danych — jest jednak w dużej mierze niesprawna, a niesprawność jest niewidoczna z zewnątrz.**

### Co działa poprawnie
- pipeline jako proces (fetch → parse → normalize → JSON → UI → Discord);
- **parser PUK** — pełne, poprawne dane: nazwisko, data zgonu, data i godzina pogrzebu, link do klepsydry;
- **parser ZCK** — czyta komplet 20/20 rekordów, poprawnie rozpoznaje nazwiska, godziny i cmentarze (psuje jedynie datę i częściowo `place`);
- **mechanizm dopasowania fraz** — zweryfikowany na wszystkich realnych formatach ośmiu źródeł: radzi sobie z wersalikami, prefiksem `Śp.`, znakiem `+`, diakrytyką, myślnikami, nazwiskiem w drugiej kolejności, formami deklinowanymi i podziałem imienia/nazwiska na osobne węzły HTML;
- wysyłka na Discord z deduplikacją i heartbeatem;
- warstwa prezentacji z escapowaniem HTML;
- **dostęp sieciowy do wszystkich źródeł** — żadne z nich nie blokuje aplikacji.

### Co nie działa
- **6 z 8 aktywnych źródeł nie dostarcza użytecznych danych**, a 3 z nich zawodzą całkowicie po cichu (`error: null`);
- **cztery punktowe błędy w kodzie kasują dane, które są fizycznie obecne na stronach**:
  - `\b` w regexie daty ZCK (B1),
  - `cleanTechnicalNoise` + słowo „Facebook" — 100 % treści Karawana i Gabriel24 (B2),
  - wymaganie etykiet „ur./zm." w Podwawelskim (B3),
  - odwrotna kolejność pól i wymóg godziny w św. Jadwidze (B4),
  - wycinanie nawigacji przed odczytem linków w Dębnikach (B5);
- **brak ponowień na 5xx** — jeden przejściowy `503` obciął dziś interfejs o 80 % (A1);
- **73 % sparsowanych rekordów nigdy nie trafia do skanowania pod kątem monitorowanej osoby**; po naprawie parserów odsetek ten **wzrośnie do 82 %**, jeśli alertowanie pozostanie związane z oknami czasowymi (E1);
- **funkcja „najbliższych potrzeb" (intencji) nie jest zaimplementowana**, mimo że działające źródło istnieje i jest zgodne z obecnym mechanizmem fraz (C5);
- **status zadania i heartbeat nie odzwierciedlają kondycji odczytu** (C1, E6);
- **testy są zielone przy zepsutym odczycie**, bo fixture'y nie mają związku z rzeczywistą strukturą stron (G2).

---

## 7. Ryzyka

| # | Ryzyko | Prawdopodobieństwo | Skutek |
|---|---|---|---|
| R1 | Nekrolog monitorowanej osoby zostanie odczytany, ale nie zgłoszony (poza oknem czasowym) | **Wysokie** — dziś 73 % rekordów, po naprawie parserów 82 % | **Krytyczny — niezrealizowanie głównego celu aplikacji** |
| R2 | Nekrolog monitorowanej osoby w ogóle nie zostanie odczytany (`NOISE`, złe regexy, wycięta nawigacja) | **Pewne** — dziś 4 źródła i ok. 890 publikowanych rekordów poza zasięgiem | **Krytyczny** |
| R3 | Przejściowy błąd 5xx wyzeruje źródło na 12 godzin | **Wysokie** — zaobserwowane raz na dwa przebiegi | Wysoki |
| R4 | Fraza z drugim imieniem („Helena Maria Gawin") nie zostanie dopasowana | Średnie | Krytyczny |
| R5 | Data pogrzebu z ZCK wskaże zły dzień (wieczorny cron + fallback UTC) | Średnie | Wysoki — dezinformacja użytkownika |
| R6 | Kolejna zmiana HTML źródła pozostanie niezauważona (raportowana jako `empty` lub wcale) | **Wysokie** | Wysoki — cicha erozja pokrycia |
| R7 | Trafienie zgłoszone raz nie zostanie zaktualizowane po uzupełnieniu daty pogrzebu | **Wysokie** — 4 z 7 rekordów Karawana czeka dziś na uzupełnienie terminu | Wysoki |
| R8 | Odbiorcy nie dostaną pingu na Discordzie (wzmianki jako zwykły tekst) | **Pewne** | Średni |
| R9 | Zafałszowane rekordy marketingowe (Gabriel24) obniżają zaufanie do listy | **Pewne** — 10 z 22 rekordów | Średni |
| R10 | Wyjątek w jednym parserze wywróci cały przebieg i zablokuje zapis snapshotu (`refresh_static.mjs:66` poza `try/catch`) | Niskie | Wysoki |
| R11 | Deduplikacja międzyźródłowa stanie się konieczna dopiero po naprawie B2 (dziś maskowana przez utratę danych) | Wysokie po naprawie | Średni |

---

## 8. Rekomendacje

Kolejność odzwierciedla stosunek efektu do nakładu, zmierzony na żywych danych.

### Priorytet P0 — przywrócenie głównej funkcji (bez tego reszta nie ma znaczenia)

1. **Odłączyć alertowanie od okien czasowych** (`refresh_static.mjs:101`). Skanowanie fraz musi obejmować `allRows`, nie `[...recent_deaths, ...upcoming_funerals]`. To jedyna zmiana, która sprawia, że naprawy parserów w ogóle przełożą się na powiadomienia. *(R1)*
2. **Naprawić `cleanTechnicalNoise`** (`nekrolog_core.mjs:33`) — nie stosować `NOISE` do całego bloku tekstu czytelnego dla człowieka. Minimalna poprawka: wstawiać separatory linii przy ekstrakcji tekstu (np. zamiana `<br>` i domknięć bloków na `\n`) i/lub wycinać tylko dopasowany fragment zamiast całej „linii". **Sam ten punkt odzyskuje 19 kompletnych rekordów dziennie z Karawana i Gabriel24.** *(R2, B2)*
3. **ZCK: czytać datę z `<h4><strong>`** zamiast polegać na regexie z `\b` po sklejonym tekście (`nekrolog_core.mjs:108`). Gdy fallback jednak zadziała, oznaczyć rekord flagą `date_is_fallback: true` i pokazać to w UI. *(R5, B1)*
4. **Dodać jedno–dwa ponowienia z krótkim backoffem dla statusów 5xx i 429** w `fetchText` (`fetch.mjs:106`) — dziś fallback uruchamia się wyłącznie na dokładnie `403`. *(R3, A1)*
5. **Zgłaszać wszystkie trafienia w przebiegu, nie tylko pierwsze** (`discord_notify.mjs:23`) — iterować po wszystkich dopasowaniach i sprawdzać `sent_keys` osobno dla każdego. *(R7, E2)*
6. **Ujednolicić zbiór przeszukiwanych pól** w trzech miejscach (`refresh_static.mjs:74`, `discord_notify.mjs:14`, `app.js:83`) — wydzielić jedną funkcję `buildMatchHaystack(row)`. *(D2)*
7. **Zamienić wzmianki Discord na `<@ID>`** (`discord_notify.mjs:40`), aby alert faktycznie generował powiadomienie push. *(R8)*
8. **Włączyć datę pogrzebu/treść do klucza deduplikacji** (`discord_notify.mjs:27`), żeby uzupełnienie terminu pogrzebu wywołało kolejne powiadomienie. *(R7, E3)*

### Priorytet P1 — odzyskanie milczących źródeł (struktura znana, gotowe selektory)

9. **Podwawelskie:** czytać przez selektory `.section__box.necrology .section__box-element`, gdzie `<p><strong>` to imię i nazwisko, `i.fa-star` = data urodzenia, `i.fa-cross` = data zgonu (ISO). 6 podstron `nekrologi--str-N.html?str=N`. → **72 rekordy**. *(B3)*
10. **św. Jadwiga:** czytać przez selektory `li.artykul` → `h2.tytul` (nazwisko po `+`) i `span.data[title="Data dodnia: …"]` (data ISO). Uwaga semantyczna: to **data zgłoszenia, nie data pogrzebu** — mapować na `kind:'death'`/wzmiankę, nigdy na `date_funeral`. → **do 796 rekordów**, 30 na stronę. *(B4)*
11. **Dębniki:** przenieść ekstrakcję linków **przed** `prepareReadableDocument` (albo zbierać `a[href]` z nieoczyszczonego dokumentu). Bez tego link `/intencje` jest usuwany razem z menu, a parser czyta strony innych parafii. *(B5)*
12. **Gabriel24: odsiać strony usługowe** — realne nekrologi są wyłącznie pod `/nekrolog/` (liczba pojedyncza); wykluczyć `/pogrzeby-*`, `/kwiaty-*`, `/zasilek-*`, `/transmisje-*`, `/akcesoria-*`, `/przewozy-*` oraz linki paginacji `/nekrologi/page/N/`. Rozszerzyć `BAD_NAME_WORDS` o wzorce „Pogrzeby …", „Zasiłek …", „Transmisje …". *(R9, B6)*
13. **Wprowadzić wykrywanie cichych awarii**: jeśli źródło zwraca 0 rekordów przez N kolejnych przebiegów, podnieść to do `source_errors` i do statusu zadania. Uzupełnić `parseSwJadwigaPogrzebowe` o obiekt `diagnostics` (jedyny parser bez niego). *(R6, B8)*
14. **Opakować `parseSource` w `try/catch` per źródło** (`refresh_static.mjs:66`), aby awaria jednego parsera nie kasowała całego przebiegu. *(R10)*
15. **Grobonet Salwator: podjąć decyzję produktową** — serwis nie publikuje nekrologów (jest wyszukiwarką grobów). Albo `enabled: false`, albo wyraźne oznaczenie jako źródło innego typu, żeby wieczny `parser_status: 'empty'` nie zaszumiał diagnostyki. *(B7)*
16. **Podwawelskie: usunąć lub podpiąć `parsePodwawelskieDetailHtml`** — obecny stan generuje zielone testy dla kodu, który nigdy się nie wykonuje. *(G3)*

### Priorytet P2 — realizacja wymagania „najbliższych potrzeb"

17. **Podpiąć `https://debniki.sdb.org.pl/intencje` jako źródło typu `intencje`.** Format jest regularny (`HH:MM` + `+`/`++` + nazwiska, pogrupowane pod nagłówkami dni tygodnia), obecny mechanizm fraz działa na nim bez zmian (zweryfikowano). Wymaga: nowego `kind:'intention'`, sekcji w `index.html` i dopuszczenia rekordów bez `date_death` do skanowania (co realizuje już P0-1). *(C5)*
18. **Rozważyć strony szczegółowe św. Jadwigi jako drugie źródło intencji** — każda zawiera listę mszy zamówionych za zmarłego z datami i godzinami. *(B4)*
19. **Utrzymać rozdział pojęć** zgodnie z `Instrukcja_odczytu_zrodel_Nekrolog.md:142`: intencja mszalna **nie jest** zgonem ani pogrzebem. To trzecia kategoria — i to właśnie ona odpowiada „potrzebom" z promptu.

### Priorytet P3 — higiena, utrzymanie, wiarygodność testów

20. **Zastąpić syntetyczne fixture'y zrzutami żywych stron** (z datą w nazwie, wg konwencji `Instrukcja_odczytu_zrodel_Nekrolog.md:242`). Bez tego kroku `npm test` pozostaje bramką pozorną. *(G2)*
21. Dodać testy dla `refresh_static.mjs`: okna czasowe, `priority_hit`, `resolveJobOutcome`, `mergeRequiredSources`. *(G1)*
22. **Uzupełnić `Frazy.json` o warianty z drugim imieniem** albo — trwalej — zmienić dopasowanie z „podciąg" na „wszystkie tokeny imienia i nazwiska obecne w promieniu N słów". *(R4, D1)*
23. `app.js` powinien czytać `snap.target_phrases` zamiast zaszytej listy 24 fraz (dziś brakuje **84 znormalizowanych wariantów deklinacyjnych**). *(D3)*
24. Walidować zakres daty w `parsePolishDateToIso` (odrzucać dzień > 31 i miesiąc > 12 zamiast cichego przewijania). *(B9)*
25. Naprawić wsiąkanie godziny w `place` dla ZCK — najprościej przez odczyt z `td.funeral-place` zamiast manipulacji tekstem. *(B10)*
26. Dodać deduplikację międzyźródłową po znormalizowanym nazwisku + dacie oraz wspólną normalizację nazwiska (usunięcie `Śp.`, sufiksu „(lat N)", ujednolicenie wielkości liter). **Wdrożyć razem z P0-2**, bo naprawa B2 zwielokrotni duplikaty. *(R11, B11, B12)*
27. Zaostrzyć regułę `(!r.date_death && r.note)` w `refresh_static.mjs:83` — dziś nie szkodzi wyłącznie dlatego, że chroni nas defekt B2. *(C2)*
28. Rozdzielić `status` zadania na „kondycja odczytu" i „liczba rekordów"; rozszerzyć heartbeat o liczbę sprawnych źródeł. *(C1, E6)*
29. Wyświetlać `source_diagnostics` w sekcji „Log" interfejsu oraz ostrzeżenie o nieaktualnym snapshocie. *(F1, F3)*
30. Usunąć martwy kod: `normalize.js` i `parsers.js` (katalog główny — zero referencji), `parseDetail`, nieaktualny `sources.txt`; skorygować flagi `requires_ocr` dla Karawana i Gabriel24 (są nieprawdziwe). *(D4, G4, B13)*
31. Zredukować trojaką duplikację w `latest.json` (66,7 % objętości pliku). *(C4)*
32. Dodać ponowienie z odczytem `Retry-After` w `postDiscordWebhook` oraz walidację schematu URL w `app.js:externalLink`. *(E5, F2)*

---

## 9. Dostęp do internetu — stan aktualny

Rozdział zastępuje instrukcję konfiguracyjną z wersji 1 analizy: **konfiguracja została wykonana przez użytkownika i działa.**

### 9.1. Weryfikacja

Wszystkie osiem aktywnych domen jest osiągalnych z sesji:

```
200  https://www.zck-krakow.pl/funerals
200  https://www.puk.krakow.pl/pozegnalismy/
200  https://www.gabriel24.pl/nekrologi/
200  https://karawan.pl/nekrologi/
200  https://krakowsalwator.grobonet.com/nekrologi.php
200  https://debniki.sdb.org.pl/            (przez node-fetch; surowy curl → 403 Cloudflare)
200  https://www.podwawelskie.pl/aktualnosci/nekrologi.html
200  https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe
```

Osiągalne są też domeny wtórne, niezbędne do działania pipeline'u: `nekrolog.eklepsydra.pl` (klepsydry PUK — potwierdzone pobraniem detali).

### 9.2. Zaobserwowane zachowania sieciowe warte odnotowania

- **Niestabilność ZCK i PUK.** Przy pierwszym masowym pobraniu oba hosty zwróciły `Connection reset by peer`, przy ponowieniu natychmiast `200`. Podczas jednego z przebiegów produkcyjnych ZCK zwrócił `503`. To argument za rekomendacją P0-4, niezależny od środowiska.
- **Dębniki i Cloudflare.** Serwis serwuje interstitial „Just a moment…" dla surowego `curl` (również z pełnymi nagłówkami przeglądarkowymi, na `/`, `/feed/`, `/sitemap.xml`, `/wp-json/`). `node-fetch` — czyli podstawowa ścieżka aplikacji — przechodzi bez przeszkód i otrzymuje pełną treść. **Aplikacja nie jest tu blokowana i nie wymaga żadnego obejścia.**
- **`robots.txt` Dębnik zezwala** ogólnemu robotowi (`User-agent: *` → `Disallow:` puste). Blokady dotyczą wyłącznie wymienionych z nazwy botów AI (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `meta-externalagent`). Bot aplikacji nie należy do tej kategorii.
- **Ograniczenie tego środowiska:** przeglądarka headless (Chromium/Playwright) nie potrafi korzystać z proxy sesji (`ERR_CONNECTION_RESET` również dla `example.com`). Nie udało się więc przetestować przejścia challenge'u Cloudflare przez realną przeglądarkę. **Nie ma to znaczenia praktycznego** — aplikacja i tak dostaje HTTP 200 przez `node-fetch`.

### 9.3. Rekomendacja na przyszłość

Materiał zebrany w tej iteracji (żywy HTML ośmiu źródeł + podstrony detali) powinien zostać **zapisany jako fixture'y regresyjne** z datą w nazwie, zgodnie z konwencją `Instrukcja_odczytu_zrodel_Nekrolog.md:242` — to bezpośrednio realizuje rekomendację P3-20 i usuwa ustalenie G2. Zrzuty nie zostały dodane do repozytorium w ramach tego zadania, ponieważ polecenie brzmiało „na obecną chwilę jeszcze bez zmian".

Polecenie do odtworzenia zrzutów:

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
curl -sSL -A "$UA" https://www.zck-krakow.pl/funerals -o tests/fixtures/zck_funerals_$(date +%F).html
# analogicznie dla pozostałych siedmiu źródeł oraz dla po jednej stronie szczegółowej
# Karawana, Gabriel24 i św. Jadwigi
```

---

## 10. Następne kroki

1. **Wdrożyć blok P0** — osiem punktowych zmian, wszystkie weryfikowalne lokalnie na żywym HTML. Efekt zmierzony: z 2 do 4 źródeł zasilających okna czasowe, z 30 do 38 rekordów skanowanych, **plus zniesienie limitu okna dla alertów**, co jest warunkiem sensowności całej reszty.
2. **Wdrożyć blok P1** — struktura DOM wszystkich milczących źródeł jest w tym dokumencie opisana wraz z selektorami; nie wymaga dalszego rozpoznania.
3. **Zapisać żywe zrzuty jako fixture'y** i dopiero na nich budować testy regresji (P3-20, P3-21). Bez tego każda kolejna naprawa parsera pozostanie nieudokumentowana i nieodporna na regresję.
4. **Podjąć decyzję produktową o „potrzebach"** — źródło (`debniki.sdb.org.pl/intencje`) jest gotowe, format regularny, mechanizm fraz zweryfikowany. Do rozstrzygnięcia pozostaje wyłącznie sposób prezentacji: osobna sekcja w `index.html` i osobna kategoria alertu.
5. **Podjąć decyzję o Grobonet Salwator** — źródło nie publikuje nekrologów; utrzymywanie go jako aktywnego zaszumia diagnostykę.
6. **Rozstrzygnąć zakres monitorowania Podwawelskiego** — 6-tygodniowe opóźnienie publikacji czyni je bezużytecznym dla alertu „w ciągu 7 dni", ale wartościowym dla wyszukiwania fraz w dłuższym horyzoncie. Kolejny argument za rekomendacją P0-1.

---

## 11. Weryfikacja wykonana w ramach audytu (wersja 2)

| Sprawdzenie | Sposób | Wynik |
|---|---|---|
| Dostęp do 8 domen źródłowych | `curl` + `node-fetch` | 8/8 osiągalnych |
| Zestaw testów | `npm ci && npm test` | 6/6 przechodzi |
| Pełny pipeline produkcyjny | `DISCORD_NOTIFY_ENABLED=false npm run refresh` ×2 | 91 i 111 rekordów — wariancja z powodu 503 na ZCK |
| Parsery na żywym HTML | import modułu, wywołanie realnych funkcji | ZCK 20, PUK 62, Gabriel24 22, Karawan 7, Grobonet 0, Podwawelskie 0, św. Jadwiga 0, Dębniki 0 |
| Przyczyna B1 (ZCK) | porównanie `$('h4 strong').text()` z regexem na tekście sklejonym | `\b` nie dopasowuje przed literą — potwierdzone |
| Przyczyna B2 (Karawan/Gabriel24) | pomiar `extractMainText` → `cleanTechnicalNoise` | 665 znaków → 0; 0 znaków nowej linii; trafienie `NOISE` = „Facebook" |
| Odzysk danych po poprawnej ekstrakcji | pipeline cienia poza repozytorium | Karawan 7/7, Gabriel24 12/12 z kompletem dat |
| Struktura Podwawelskiego | selektory CSS na 6 podstronach | 72 rekordy, 71 z obiema datami; brak etykiet „ur./zm." |
| Struktura św. Jadwigi | selektory CSS + strona szczegółowa | 30 rekordów/stronę, 796 deklarowanych; detal = intencje mszalne, nie termin pogrzebu |
| Dostępność Dębnik | `node-fetch` vs `curl` | 200 vs 403 (Cloudflare); `robots.txt` zezwala |
| Przyczyna B5 (Dębniki) | zliczenie `a[href]` przed i po `prepareReadableDocument` | 78 → 21; link `/intencje` usunięty razem z menu |
| Źródło „potrzeb" | pobranie `debniki.sdb.org.pl/intencje` | 28 wpisów za zmarłych, format `HH:MM + Nazwisko`, dopasowanie fraz działa |
| Pustka Grobonet | analiza tekstu `nekrologi.php`, `start.php`, `rocznice.php` | brak wpisów; serwis to wyszukiwarka grobów |
| `textMatchesAny` na formatach żywych źródeł | 16 realistycznych zapisów | wszystkie formaty źródłowe trafiają; luka tylko przy drugim imieniu |
| Rozbieżność pól (D2) | `isCzerwonaHelenaRow` vs logika `refresh_static` | trafienie w `place`: `priority_hit=true`, Discord `false` |
| Rozbieżność list fraz (D3) | normalizacja i porównanie zbiorów | app.js 16 unikalnych vs `Frazy.json` 100; brakuje 84 form deklinowanych |
| Walidacja zakresu dat (B9) | wywołanie `parsePolishDateToIso` i `inWindow` | `2026-02-31` przechodzi i jest cicho przewijana |
| Redundancja `latest.json` | pomiar bajtowy | 209 923 B przy 69 968 B danych = 66,7 % |
| Rekordy marketingowe Gabriel24 | filtr po nazwach w `latest.json` | 10 z 22 |
| Duplikaty międzyźródłowe | normalizacja nazwisk | 1 dziś; po naprawie B2 co najmniej 3 |
| Martwy kod | `grep` po repozytorium | `normalize.js`, `parsers.js` (0 referencji), `parseDetail`, `parsePodwawelskieDetailHtml` (tylko w testach) |
| Realizm fixture'ów (G2) | porównanie rozmiarów i struktury | fixture'y 28–435 B vs żywe strony 11–155 KB; format św. Jadwigi w fixture nie istnieje na stronie |

---

## 12. Uwagi proceduralne

`AGENTS.md` przewiduje zapisywanie analiz w katalogu `Analizy/`. Niniejszy dokument pozostaje w katalogu głównym jako `AnalizaClaude.md` **na wyraźne polecenie użytkownika** (prompt pierwotny: „zapisz jej wyniki w pliku AnalizaClaude.md"; prompt bieżący: „Zaktualizuj plik AnalizaClaude.md"). Struktura treści jest zgodna z `AGENTS.md` sekcja 2 (data, temat, pełny prompt, zakres, wnioski, rekomendacje, ryzyka, następne kroki).

Rozdziały 1–12 opisują stan **sprzed** wdrożenia i zostały zachowane bez zmian jako materiał dowodowy. Wykonane poprawki opisuje rozdział 13.

Podczas audytu uruchomiono dwa przebiegi `npm run refresh`, które nadpisały `data/latest.json`, `data/job.json`, `data/errors.json` oraz `config/sources.json`. **Wszystkie te pliki zostały przywrócone do stanu z repozytorium** (`git checkout -- data/ config/`) i nie zawierają śladów przebiegów testowych. Pipeline cienia, użyty do ilościowego zmierzenia strat, powstał i pozostał **poza repozytorium** — nie jest propozycją kodu, lecz narzędziem pomiarowym.

Zgodnie z `AGENTS.md` sekcja 4: gdy na podstawie tej analizy zostaną wykonane zmiany w kodzie, do niniejszego pliku należy dopisać sekcję „Zmiany wykonane w kodzie" z nazwą pliku, lokalizacją oraz stanem przed i po zmianie.

---

## 13. Zmiany wykonane w kodzie

**Data wdrożenia:** 2026-08-18
**Prompt użytkownika inicjujący ten etap:**

> Gałąź sam usunąłem. Zrobiłem backup repo. Wprowadź zmiany w kodzie zgodnie z rekomendacjami z analizy.
>
> (poprawki też od razu wypchnij na main. Po realizacji zaktualizuj dokumentację oraz plik AnalizaClaude.md)

**Decyzje produktowe przekazane przez użytkownika w trakcie wdrożenia:**

> Podjąć decyzję produktową o „potrzebach” — Może być prezentacja w osobnej sekcji i osobny alert.
>
> Podjąć decyzję o Grobonet Salwator — Jeżeli jest szansa, że będą tu informacje o miejscu pochówku poszukiwanej osoby to zostawiamy. W innym razie do skasowania. Podobnie jak powyżej może być osobna sekcja i osobny alert.
>
> Rozstrzygnąć zakres monitorowania Podwawelskiego — Zostawiamy. Działaniem oczekiwanym jest, żeby aplikacja zwróciła informacje o znalezieniu wpisu pasującego do poszukiwanej osoby nawet jeżeli wpis pojawił się poza 7 dniowym oknem czasowym.

### 13.1. Wynik mierzalny

Porównanie przebiegu produkcyjnego przed wdrożeniem i po nim, ta sama data odniesienia (2026-08-18), te same okna czasowe:

| Metryka | Przed | Po |
|---|---|---|
| Rekordy sparsowane | 111 (w tym 10 stron marketingowych) | **250** (bez śmieci) |
| Źródła dostarczające dane | 4 z 8 | **7 z 9** |
| Źródła zasilające okna czasowe | 2 | **5** |
| `recent_deaths` | 5 | **10** |
| `upcoming_funerals` | 25 | **25** |
| `upcoming_intentions` („potrzeby”) | — kategoria nie istniała | **26** |
| `graves` (miejsca pochówku) | — kategoria nie istniała | **12** |
| Rekordy bez jakiejkolwiek daty | 27 | **0** |
| Rekordy skanowane pod kątem monitorowanej osoby | 30 (27 %) | **250 (100 %)** |
| Status zadania | `done_with_errors` | `done`, 9/9 źródeł sprawnych |
| Rozmiar `data/latest.json` | 276 276 B / 111 rekordów | **191 086 B / 250 rekordów** |
| Testy | 6 (fixture'y syntetyczne) | **36** (zrzuty realnych stron) |

### 13.2. Zmiany plik po pliku

#### Plik: `scripts/fetch.mjs`

Lokalizacja: cały moduł; kluczowo `fetchText` i nowa `attemptOnce`.

Było: fallback awaryjny uruchamiał się wyłącznie przy statusie dokładnie `403`; każdy inny błąd HTTP kończył się zerowym wynikiem źródła bez ponowienia.

```js
let first = await runFetch(url, ctrl.signal);
if (first.status === 403) { /* ... */ }
return first;
```

Jest: dwa ponowienia z backoffem (700 ms, 2 s) dla statusów przejściowych (`408, 425, 429, 500, 502, 503, 504, 521, 522, 524`), błędów sieciowych i statusu `0`; awaryjne pobranie przez `curl` z nagłówkami przeglądarkowymi przy `403` **oraz** przy statusach przejściowych; kolejne podejścia wymuszają IPv4. Wynik niesie licznik `attempts`.

*Powód: A1 — przejściowy `503` na ZCK obciął interfejs o 80 % między dwoma przebiegami odległymi o trzy minuty.*

---

#### Plik: `scripts/nekrolog_core.mjs`

**Lokalizacja: stała `NOISE` (dawna linia 20) → `TECH_NOISE` + `BOILERPLATE_LINE`**

Było: jeden filtr stosowany zarówno do odrzucania rekordów, jak i do czyszczenia tekstu — zawierał m.in. `facebook`, `cookie`.

Jest: `TECH_NOISE` (ślady kodu i znaczników) dyskwalifikuje rekord; `BOILERPLATE_LINE` (cookies, „Udostępnij”, Facebook, „Napędzane przez technologię”) usuwa wyłącznie pojedynczą linię.

**Lokalizacja: nowa `extractBlockText($, root)`; `extractMainText` przepisana na jej bazie**

Było: `extractMainText` używała `$(sel).first().text()`, co dawało tekst bez znaków nowej linii; `cleanTechnicalNoise` dzieliła go przez `split(/\n+/)`, więc cała treść była jedną „linią”.

Jest: `extractBlockText` wstawia granice bloków (`br` → `\n`, znacznik zamykający bloku → `\n`) przed odczytem tekstu.

**Lokalizacja: `cleanTechnicalNoise`**

Było: `lines.filter(x=>!NOISE.test(x))` — jedna linia zawierająca „Facebook” kasowała cały nekrolog.

Jest: filtrowanie dwupoziomowe plus zabezpieczenie — gdy po odsianiu nie zostaje nic, zwracany jest tekst pozbawiony wyłącznie fragmentów technicznych.

*Powód: B2 — najpoważniejszy defekt aplikacji; niszczył 100 % treści Karawana i Gabriel24 (19 rekordów dziennie z kompletem dat).*

**Lokalizacja: nowa `isoFromParts`, przepisana `parsePolishDateToIso`**

Było: `parsePolishDateToIso("31.02.2026")` → `"2026-02-31"`, następnie `Date.UTC` po cichu przewijało datę na 3 marca.

Jest: walidacja kalendarzowa; niepoprawna data zwraca `null` zamiast być podmienianą.

**Lokalizacja: nowa `normalizePersonName`**

Było: brak wspólnej normalizacji — PUK „Marek Nalborski”, Karawan „Śp. JAN SADZIK”, ZCK „Anna Jakobschy (lat 82)”.

Jest: usunięcie prefiksu `Śp.`/`+`, sufiksu `(lat 82)`, sprowadzenie wersalików do formy tytułowej z polskim odwzorowaniem wielkości liter.

**Lokalizacja: `parseZckFuneralsHtml` (dawna linia 108)**

Było:

```js
let date = clean($.text()).match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || todayIso();
```

Jest: odczyt daty z `$('h4 strong')` i rekordów z `td.funeral-time` / `td.funeral-place` / `td.funeral-label`; pole `date_is_fallback` oznacza rekordy z datą zastępczą.

*Powód: B1 — po sklejeniu tekstu powstawało `2026-08-18Cmentarz`, więc końcowe `\b` nie zachodziło i data była zawsze podmieniana na dzień pobrania. Naprawia też B10 (godzina wsiąkająca w `place`).*

**Lokalizacja: `parseGabriel24DetailHtml` i `parseKarawanDetailHtml` → wspólna `parseObituaryWidgetDetail`**

Było: dwa niemal identyczne parsery czytające tekst z `NOISE`-owanego bloku; oba zwracały `note:""` i `date_*: null`.

Jest: jeden parser widżetu e-Nekrolog (oba serwisy używają tej samej wtyczki) czytający etykiety `Śp.`, `zm.`, `Data pogrzebu:`/`Pogrzeb:`, `Msza Święta:`, `Cmentarz:`. Strona bez `Śp.` i bez dat nie tworzy rekordu — to odsiewa strony oferty typu „Zasiłek pogrzebowy”.

**Lokalizacja: `parseGabriel24NekrologiHtml`, `parseKarawanNekrologiHtml`**

Było: filtr `/gabriel24/i.test(url) || /nekrolog/i.test(url)` przepuszczał strony oferty i paginację.

Jest: `\/\/(?:www\.)?gabriel24\.pl\/nekrolog\/[^/]+\/?$` — wyłącznie strony pojedynczych nekrologów. *Powód: B6 — 10 z 22 rekordów Gabriel24 stanowiły strony marketingowe.*

**Lokalizacja: `parsePodwawelskieRowsFromListHtml` (dawna linia 62)**

Było: regex wymagający etykiet `ur.` / `zm.`, których strona nie zawiera ani razu.

Jest: odczyt przez selektory `.section__box.necrology .section__box-element`, `p > strong` (imię, nazwisko), `i.fa-star` (urodziny), `i.fa-cross` (zgon). *Powód: B3 — 72 rekordy ignorowane.*

**Lokalizacja: `parseSwJadwigaPogrzeboweHtml` (dawna linia 106)**

Było: regex oczekujący sekwencji `DATA … GODZINA … Nazwisko`; strona podaje `+ Nazwisko` i datę publikacji, bez godzin.

Jest: odczyt przez `li.artykul`, `h2.tytul`, `span.data[title]`; data trafia do `date_death` (zgłoszenie), nigdy do `date_funeral`, bo strony szczegółowe zawierają intencje mszalne, a nie termin pogrzebu. *Powód: B4 — do 796 rekordów ignorowanych.*

**Lokalizacja: `parseDebnikiSdbPogrzebyHtml` (dawna linia 103)**

Było: `prepareReadableDocument` usuwała nawigację **przed** zebraniem linków (78 → 21), niszcząc jedyny link do treści; pozostałe trafienia prowadziły do innych parafii salezjańskich.

Jest: linki zbierane z surowego dokumentu, filtrowane do własnego hosta. *Powód: B5.*

**Lokalizacja: nowe `parseDebnikiIntencjeHtml`, `parseDebnikiIntencje`, `resolveIntentionDate`, typ źródła `debniki_intencje`**

Było: brak — `isIntentionLikeSource` i `isIntentionLikeRow` były zaślepkami zwracającymi `false`.

Jest: parser tygodniowego harmonogramu intencji (`PONIEDZIAŁEK 18 sierpnia` → `07:00 + Nazwisko`), z rozwiązywaniem roku na przełomie grudnia i stycznia. Rekordy mają `kind:'intention'`, `date_intention`, `time_intention`. *Powód: C5 — realizacja wymagania „najbliższych potrzeb”.*

**Lokalizacja: `parseGrobonetNekrologi*`, `parseGrobonetDetailHtml` → `parseGrobonetGroby`, `parseGrobonetGrobyHtml`, `grobonetSearchUrl`**

Było: parser listy nekrologów Salwatora, która jest **faktycznie pusta** — źródło produkowało wieczny `parser_status: 'empty'`.

Jest: odpytywanie bazy pochówków (`start.php?id=wyniki&name=<nazwisko>`) nazwiskami z pola `search_terms`; rekordy `kind:'grave'` z datą urodzenia, datą zgonu i cmentarzem. *Powód: decyzja użytkownika — źródło zostaje, bo daje miejsce pochówku szukanej osoby.*

**Lokalizacja: `validateParsedRow`**

Było: dopuszczała `kind` `death`/`funeral`; stosowała `NOISE` do `note` i `place`; regułę „imię + nazwisko” do wszystkich rekordów.

Jest: dopuszcza też `intention` i `grave`; używa `TECH_NOISE`; reguły nazwiska nie stosuje do intencji (bywają opisowe) i grobów; odrzuca adresy o schemacie `javascript:`/`data:`.

**Lokalizacja: `mergeRequiredSources` (dawna linia 114)**

Było: `{...r, ...byId.get(r.id)}` — zastana konfiguracja wygrywała nad definicją, także co do `type`.

Jest: `type`, `known_empty`, `requires_ocr`, `requires_pdf` wymuszane z definicji; przy zmianie typu parsera (migracja źródła) przejmowane są też adresy i `search_terms`. *Powód: G4 oraz migracja Grobonetu.*

**Lokalizacja: nowe `buildMatchHaystack`, `rowMatchesPhrases`**

Było: trzy różne zbiory przeszukiwanych pól w `refresh_static.mjs`, `discord_notify.mjs` i `app.js`; Discord pomijał `place`.

Jest: jedna definicja (`name`, `full_name`, `note`, `place`, `source_name`) używana we wszystkich trzech miejscach. *Powód: D2.*

**Lokalizacja: nowe `mergeDuplicateRows`, `dedupeKeyForRow`, `rowCompleteness`**

Było: deduplikacja wyłącznie w obrębie jednego parsera.

Jest: scalanie po `kind` + znormalizowanym nazwisku + dacie; zachowywany jest rekord bogatszy, pozostałe źródła trafiają do `also_in_sources`, flaga trafienia jest propagowana. *Powód: B11 — po naprawie B2 duplikaty międzyźródłowe stały się normą.*

**Lokalizacja: `resolveJobOutcome` (dawna linia 115)**

Było: `recentDeaths + upcomingFunerals <= 0` → `status: 'error'`.

Jest: status opisuje kondycję odczytu — `error` tylko wtedy, gdy żadne źródło nie odpowiedziało poprawnie; tydzień bez pogrzebów w oknie to `done`. *Powód: C1.*

**Lokalizacja: `buildFallbackSummaryForHelena` (dawna linia 116)**

Było: zaślepka zwracająca stały tekst mimo przekazywanych argumentów.

Jest: podsumowanie liczone z rekordów — liczba trafień, liczba źródeł, najwcześniejsze daty, lista adresów. *Powód: C6.*

**Lokalizacja: usunięte `parseDetail`, `parsePodwawelskieDetailHtml`, `parseGenericList` (dawne domyślne parsery)**

Było: martwy kod; `parsePodwawelskieDetailHtml` miał testy, mimo że nigdy nie był wywoływany w produkcji.

Jest: usunięte; `parseByListAndDetails` wymaga jawnego parsera detali. *Powód: G3.*

---

#### Plik: `scripts/refresh_static.mjs`

Lokalizacja: pętla po źródłach (dawne linie 65–78).

Było: `parsed = await parseSource(s);` poza blokiem `try/catch` — wyjątek jednego parsera przerywał cały przebieg i `data/latest.json` nie był zapisywany.

Jest: `try/catch` per źródło; wyjątek daje `parser_status: 'exception'` i nie zatrzymuje pozostałych źródeł. *Powód: R10.*

Lokalizacja: nowa `updateSourceHealth` + plik `data/source_health.json`.

Było: źródło zwracające zero rekordów robiło to bezterminowo z `error: null`.

Jest: licznik kolejnych pustych przebiegów; po trzech z rzędu źródło trafia do `source_errors` (z wyjątkiem oznaczonych `known_empty`). *Powód: B8.*

Lokalizacja: przekazanie rekordów do powiadomień (dawna linia 101–106).

Było:

```js
rows: [...recent_deaths, ...upcoming_funerals]
```

Jest:

```js
rows   // wszystkie rekordy, niezależnie od okien czasowych
```

*Powód: E1 oraz wprost wyrażone oczekiwanie użytkownika, żeby wpis pasujący do poszukiwanej osoby był zgłaszany także spoza okna 7-dniowego.*

Lokalizacja: filtr „ostatnich zgonów” (dawna linia 83).

Było: `inWindow(...) || (!r.date_death && r.note)` — rekord bez daty kwalifikował się bezterminowo.

Jest: wyłącznie `inWindow(...)`; rekordy bez daty widać w sekcji trafień, która nie ma okna. *Powód: C2.*

Lokalizacja: budowa snapshotu (dawna linia 97).

Było: `{ ...base, payload: base, data: base }` — 66,7 % objętości pliku stanowiła redundancja.

Jest: pojedyncza struktura z nowymi polami `window`, `intentions`, `graves`, `upcoming_intentions`, `matches`, `source_diagnostics`. *Powód: C4.*

---

#### Plik: `scripts/discord_notify.mjs`

Lokalizacja: `selectFirstHit` → `selectHits` + pętla po trafieniach.

Było: `rows.find(...)` — zgłaszane było wyłącznie pierwsze trafienie, a jeśli jego klucz był już w `sent_keys`, pozostałe nie były nawet sprawdzane.

Jest: iteracja po wszystkich trafieniach, każde z osobnym sprawdzeniem `sent_keys`; wynik niesie `hits`, `sent_count` i listę `alerts`. *Powód: E2.*

Lokalizacja: `buildStateKey` (dawna linia 27).

Było: `name | source_name | url`.

Jest: `kind | name | source_name | url | daty i godziny` — uzupełnienie terminu pogrzebu przez źródło jest nowym zdarzeniem. *Powód: E3.*

Lokalizacja: `buildDiscordMessage` (dawna linia 34).

Było: stała treść bez rozróżnienia kategorii i bez szczegółów terminu.

Jest: etykieta kategorii (`[zgon / wzmianka]`, `[pogrzeb]`, `[intencja mszalna (potrzeba)]`, `[miejsce pochówku]`) oraz daty, godzina, miejsce i lista źródeł, w których rekord wystąpił. *Powód: decyzja użytkownika o osobnych alertach.*

Lokalizacja: nowe `mentionPrefix`, `allowedMentions`.

Było: `'@koza_z_zagrody, @loshumbakos'` jako zwykły tekst — bez powiadomienia push.

Jest: przy ustawionej zmiennej `DISCORD_MENTION_IDS` wysyłane jest `<@ID>` wraz z `allowed_mentions`; bez niej zachowany dotychczasowy tekst. *Powód: E4.*

Lokalizacja: `postDiscordWebhook` (dawna linia 74).

Było: jedna próba; `429` lub `5xx` oznaczał utratę powiadomienia.

Jest: dwa ponowienia z odczytem nagłówka `Retry-After`. *Powód: E5.*

Lokalizacja: `buildNoMatchMessage`, stała `MAX_SENT_KEYS`.

Było: heartbeat bez informacji o kondycji; `sent_keys` rosło bez ograniczeń.

Jest: heartbeat podaje liczbę sprawnych źródeł i rekordów; historia kluczy ograniczona do 500 ostatnich. *Powód: E6, E3.*

---

#### Plik: `app.js`

Było: zaszyta lista 24 fraz (16 unikalnych po normalizacji) przy 100 w `Frazy.json`; brak sygnalizacji nieaktualnych danych; brak walidacji schematu adresu; `source_diagnostics` nieprezentowane.

Jest:
- odczyt `snap.target_phrases` (lista zapasowa tylko na wypadek braku snapshotu) — *D3*;
- sekcja **Trafienia monitorowanych fraz** renderowana z pola `matches`, bez ograniczenia czasowego — *E1 i oczekiwanie użytkownika*;
- sekcje **Najbliższe potrzeby** oraz **Groby monitorowanych nazwisk** — *decyzje produktowe użytkownika*;
- baner ostrzegawczy przy nieudanym pobraniu snapshotu i przy snapshocie starszym niż 26 h — *F1*;
- `externalLink` odrzuca schematy `javascript:`, `data:`, `vbscript:`, `file:` — *F2*;
- sekcja **Log** pokazuje pełną diagnostykę źródeł wraz z licznikiem pustych przebiegów — *F3*;
- oznaczenie rekordów z datą zastępczą (`date_is_fallback`).

---

#### Plik: `index.html`

Było: dwie sekcje list (zgony, pogrzeby).

Jest: dodatkowo `#dataWarning` (baner), `#matches` (trafienia bez okna), `#intentions` (potrzeby), `#graves` (miejsca pochówku).

#### Plik: `styles.css`

Jest: dopisane style `.banner`, `.banner.warn`, `.banner.bad`, `.hint.hitText`, `.fact.warnText`.

---

#### Plik: `.github/workflows/nekrolog-refresh.yml`

Jest: przekazanie zmiennej `DISCORD_MENTION_IDS` do kroku odświeżania oraz dopisanie `data/source_health.json` do commitowanych plików.

---

#### Testy

Plik: `tests/refresh.parsers.test.mjs` — przepisany w całości. Było: 6 asercji na fixture'ach o rozmiarze 28–435 B, opisujących strukturę, której źródła nigdy nie miały. Jest: **17 testów na zrzutach realnych stron** z 2026-08-18, z asercjami na konkretne nazwiska, daty i liczby rekordów, w tym przypadki negatywne (strona oferty Gabriel24, pusta lista, adres `javascript:`). *Powód: G2.*

Plik: `tests/refresh.snapshot.test.mjs` — **nowy, 19 testów**: okna czasowe, scalanie duplikatów, status zadania, spójność zbioru przeszukiwanych pól między snapshotem, Discordem i UI, klucz deduplikacji, kategorie alertów, wzmianki `<@ID>`, podsumowanie Helenomatu, migracja konfiguracji źródeł. *Powód: G1.*

Katalog `tests/fixtures/` — usunięto 19 fixture'ów syntetycznych, dodano 13 zrzutów realnych stron (nazwa `<źródło>_RRRR-MM-DD.html`, usunięta wyłącznie treść `<script>`/`<style>` i obrazy `data:`).

---

#### Pliki usunięte

| Plik | Powód |
|---|---|
| `normalize.js` | duplikat `scripts/normalize.mjs` z gorszą implementacją `textMatchesAny` (bez normalizacji diakrytyki i prefiksów); zero referencji — *D4* |
| `parsers.js` | zero referencji; nazwa myliła, bo sugerowała, że mieści parsery źródeł (te są w `nekrolog_core.mjs`) |
| `sources.txt` | nieaktualny zrzut konfiguracji z `type: "generic_html"` dla ośmiu źródeł — *G4* |

`Linki.txt` przegenerowano z rzeczywistego stanu repozytorium. `README.md` przepisano: dodano opis kategorii rekordów, tabelę źródeł, rozdział „Pułapki ekstrakcji”, opis powiadomień Discord i procedurę odświeżania zrzutów testowych; usunięto odwołania do skasowanych plików.

### 13.3. Odpowiedź na pytanie o webhook Discord

> Czy muszę coś zmieniać w webhooku discordowym? Czy „osobny alert” zadziała z obecnym mechanizmem?

**Po stronie Discorda nie trzeba zmieniać nic.** Osobne alerty dla intencji i grobów to zwykłe wiadomości wysyłane tym samym adresem webhooka — różnią się wyłącznie treścią (etykieta kategorii w nagłówku). Ten sam `DISCORD_WEBHOOK_URL` obsługuje wszystkie cztery kategorie.

Jedyna opcjonalna zmiana dotyczy **realnych powiadomień push**: obecne wzmianki `@koza_z_zagrody, @loshumbakos` są zwykłym tekstem i nikogo nie powiadamiają. Aby to naprawić, potrzebne są liczbowe identyfikatory użytkowników Discord (prawy przycisk na użytkowniku → *Kopiuj ID użytkownika*, przy włączonym trybie dewelopera) i ustawienie ich w repozytorium jako zmiennej `DISCORD_MENTION_IDS` (Settings → Secrets and variables → Actions → Variables), np. `123456789012345678,987654321098765432`. Kod odczytuje ją automatycznie i wysyła `<@ID>` wraz z `allowed_mentions`. Bez tej zmiennej wszystko działa jak dotąd, tylko bez pingu.

Warto też mieć na uwadze, że przy pierwszym przebiegu po wdrożeniu liczba wiadomości może być większa niż zwykle: zgłaszane są teraz **wszystkie** trafienia (nie tylko pierwsze) i obejmują wpisy spoza okna czasowego. Kolejne przebiegi wracają do normy, bo klucze trafiają do `data/discord_notified.json`.

### 13.4. Co pozostaje otwarte

1. **Źródło Facebook (`facebook_parafia_debniki`)** — pozostaje `enabled: false`. Ocena, czy da się z niego wyciągać dane o zgonach i pogrzebach, to osobny etap uzgodniony z użytkownikiem.
2. **Frazy z drugim imieniem** (D1/R4) — `Helena Maria Gawin` nadal nie zostanie dopasowane. Wymaga decyzji: dopisać warianty do `Frazy.json` czy zmienić dopasowanie z „podciąg” na „wszystkie tokeny w promieniu N słów”. Nie zmieniano tego bez uzgodnienia, bo druga opcja podnosi ryzyko fałszywych trafień.
3. **`search_terms` Grobonetu** wymagają ręcznej aktualizacji razem z `Frazy.json` przy zmianie monitorowanej osoby.
4. **Podwawelskie** publikuje z kilkutygodniowym opóźnieniem — źródło zostaje ze względu na wyszukiwanie fraz, ale nie zasili okna 7-dniowego. Jest to zachowanie oczekiwane, nie defekt.
