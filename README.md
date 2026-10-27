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
- `scripts/fetch.mjs` – pobieranie treści przez HTTP; ponowienia z backoffem przy błędach przejściowych (5xx, 429, zerwane połączenie) i awaryjne pobranie przez `curl` z nagłówkami przeglądarkowymi. Osobno `createHttpSession()` — sesja z ciasteczkami, zapytaniami POST i warunkowymi (`If-Modified-Since`) dla źródeł, które jak przeglądarka wymagają tokenu CSRF (ZCK); przedstawia się tym samym nagłówkiem bota i nie ma awaryjnego `curl`.
- `scripts/nekrolog_core.mjs` – definicje źródeł, **wszystkie parsery** (w tym jeden parser stron parafialnych sterowany profilami `PARISH_PROFILES`), normalizacja nazwisk i dat, walidacja rekordów, dopasowanie fraz.
- `scripts/normalize.mjs` – luźne dopasowanie tekstu (diakrytyka, prefiksy `śp.`, myślniki, interpunkcja).
- `scripts/discord_notify.mjs` – powiadomienia Discord: alerty per trafienie i heartbeat.
- `scripts/date.mjs` – okna czasowe.
- `config/sources.json` – lista i konfiguracja źródeł (uzupełniana automatycznie z definicji w `nekrolog_core.mjs`). Uzupełniane są tylko brakujące źródła i pola — zapisane wartości, w tym adresy, mają pierwszeństwo przed definicją. **Zmianę adresu źródła wprowadza się więc w obu plikach**; rozjazd wykrywa test w `tests/refresh.snapshot.test.mjs`.
- `Frazy.json` – frazy monitorowanej osoby (formy odmienione i warianty zapisu).
- `data/latest.json` – bieżący snapshot używany przez frontend.
- `data/job.json` – status przebiegu, diagnostyka i kondycja źródeł.
- `data/errors.json` – błędy źródeł oraz ostrzeżenia (`warnings`) o blokadach zewnętrznych.
- `data/source_health.json` – licznik kolejnych pustych przebiegów per źródło (wykrywanie cichych awarii) oraz `blocked_since` – moment rozpoczęcia bieżącej blokady anty-botowej.
- `data/source_cache.json` – stan źródeł między przebiegami: wynik lokalizatora grobów ZCK (odpytywanego raz na dobę), `Last-Modified` i wpisy ewidencji grobów Borku, daty pierwszego odczytu wpisów list bez dat, szczegóły kart PUK. Błąd odczytu nie nadpisuje stanu.
- `app.js`, `index.html`, `styles.css` – warstwa prezentacji.

---

## 2. Kategorie rekordów

Każdy rekord ma pole `kind`:

| `kind` | Znaczenie | Okno czasowe | Sekcja w UI |
|---|---|---|---|
| `death` | zgon lub wzmianka o zgonie | `[dziś-7, dziś]` po `date_death`, a gdy źródło jej nie podaje — po `date_reported` (data ogłoszenia parafialnego albo pierwszego odczytu wpisu) | Ostatnie zgony / wzmianki |
| `funeral` | pogrzeb z terminem | `[dziś, dziś+7]` po `date_funeral` | Najbliższe pogrzeby |
| `intention` | intencja mszalna za zmarłego (**„potrzeby”**) — parafie do 5 km od ul. Kapelanka, patrz §3 | `[dziś, dziś+7]` po `date_intention` | Najbliższe potrzeby |
| `grave` | pochówek w ewidencji cmentarnej (lokalizator ZCK, Borek Fałęcki, Grobonet) | brak (zapisy historyczne) | Groby monitorowanych nazwisk |

**Trafienia monitorowanych fraz są niezależne od okien czasowych.** Pole `matches` w `data/latest.json` zawiera wszystkie pasujące rekordy — także wpisy sprzed miesięcy (np. Podwawelskie publikuje z opóźnieniem) i rekordy bez daty. Okna czasowe sterują wyłącznie sekcjami przeglądowymi.

Rekord może też być trafieniem bez dopasowania fraz: `force_match: true` z uzasadnieniem w `match_reason`. Ustawia go wyłącznie lokalizator ZCK dla **nowej osoby w obserwowanym grobie** (grób Adama Gawina na Cmentarzu Rakowickim) — taki pochówek jest najsilniejszym sygnałem, nawet gdy nazwisko w ewidencji nie pasuje do fraz.

---

## 3. Źródła i sposób odczytu

| Źródło | Typ parsera | Co dostarcza |
|---|---|---|
| ZCK Kraków – Porządek pogrzebów | `zck_funerals` | pogrzeby na 8 dni (`[dziś, dziś+7]`): dzień bieżący ze strony, kolejne dni z API kalendarza (`api_url`, `days_ahead`); data z nagłówka `h4`, tabela `td.funeral-time/place/label` |
| ZCK Kraków – Lokalizator grobów | `zck_lokalizator` | **groby** na 12 cmentarzach komunalnych (w tym Rakowickim) dla „Helena Gawin” i „Helena Dereń” oraz obserwowany grób Adama Gawina; odpytywany raz na dobę (`min_interval_hours`) |
| PUK Kraków – Pożegnaliśmy | `puk_pozegnalismy` | zgon + pogrzeb (dwa rekordy na osobę), link do klepsydry; dla nadchodzących pogrzebów cmentarz i godzina ze strony klepsydry (raz na kartę) |
| Gabriel24 – Nekrologi | `gabriel24_nekrologi` | nekrologi spod `/nekrolog/<slug>/`; daty, godzina mszy, cmentarz |
| Karawan – Nekrologi | `karawan_nekrologi` | jak wyżej (ten sam widżet e-Nekrolog); kandydaci ze strony listy **i** z kanału RSS (`feed_url`) |
| Kraków Salwator – Groby | `grobonet_groby` | **wyszukiwarka grobów**: miejsce pochówku dla nazwisk z `search_terms`; od 2026-10-19 zablokowane przez Cloudflare — blokada tolerowana (`external_block_tolerated`) |
| Parafia Dębniki – ogłoszenia | `debniki_sdb_pogrzeby` | wyłączone (`enabled: false`) – nigdy nie zwróciło rekordu |
| Parafia Dębniki – Intencje mszalne | `debniki_intencje` | wyłączone (`enabled: false`) – serwis blokuje odczyt automatyczny |
| Podwawelskie – Nekrologi | `podwawelskie_nekrologi` | kafelki z datami ur./zg. (ikony `fa-star` / `fa-cross`), 6 podstron |
| Parafia św. Jadwigi | `sw_jadwiga_pogrzebowe` | zgłoszenia zgonu (`li.artykul`), data publikacji jako `date_death` |
| Facebook – Parafia Dębniki | `generic_html` | wyłączone (`enabled: false`) |
| Parafie do 5 km od ul. Kapelanka – ogłoszenia (8 źródeł) | `parafia_ogloszenia` | wzmianki o zgonie z list „W minionym tygodniu pożegnaliśmy…” — MB Fatimskiej (Os. Podwawelskie), św. Józefa (Podgórze), Wola Duchacka, NMP z Lourdes, MB Zwycięskiej (Borek Fałęcki), Kliny Borkowskie (także intencje), Dąbie („Odeszli do Pana”), Kliny Zacisze |
| Parafie do 5 km od ul. Kapelanka – intencje (6 źródeł) | `parafia_intencje` | intencje mszalne za zmarłych („+ Imię Nazwisko”) — MB Fatimskiej, św. Kingi, Płaszów, Os. Bronowickie, Skotniki, Kliny Zacisze |
| MB Zwycięskiej (Borek Fałęcki) – Intencje pogrzebowe | `eparafia_intencje_pogrzebowe` | lista zmarłych parafian z terminami mszy zamówionych po pogrzebie: wzmianka o zgonie + intencje |
| Cmentarz Borek Fałęcki – Ewidencja grobów | `eparafia_ewidencja_grobow` | **groby** z publicznego pliku wyszukiwarki „Znajdź grób” dla nazwisk z `search_terms`; zapytanie warunkowe `If-Modified-Since` |

Uwagi merytoryczne:
- **św. Jadwiga** publikuje datę *zgłoszenia*, a strony szczegółowe zawierają intencje mszalne, nie termin pogrzebu — dlatego data trafia do `date_death`, nigdy do `date_funeral`. Od 2026-10-02 strona parafii działa pod adresem `https://jadwiga.eparafia.pl/parafia/msze-swiete-pogrzebowe`. Stary host `swietajadwiga.diecezja.pl` przedstawia certyfikat nowej domeny (`ERR_TLS_CERT_ALTNAME_INVALID`), więc odczyt się nie udaje — weryfikacji certyfikatu nie wyłączamy. Struktura listy (`li.artykul`) się nie zmieniła.
- **Grobonet** nie prowadzi listy nekrologów; użyteczna jest jego baza pochówków. Nazwiska do odpytania podaje `search_terms` w konfiguracji źródła — przy zmianie monitorowanej osoby aktualizuj je razem z `Frazy.json`. Od 2026-10-19 cała strefa `grobonet.com` (także `robots.txt` i strona dostawcy) stoi za Cloudflare Managed Challenge i odpowiada HTTP 403 na każdy odczyt automatyczny — **zabezpieczenia nie są obchodzone**. Blokada dotyczy wszystkich klientów dostawcy i może być przejściowa, dlatego źródło ma flagę `external_block_tolerated`: przez 14 dni od `blocked_since` daje ostrzeżenie zamiast błędu, a potem wraca do rangi błędu i wymaga decyzji (przywrócenie dostępu albo `enabled: false`). Źródło pozostaje włączone, więc każdy przebieg sprawdza, czy blokada ustąpiła. **Do tego czasu kategoria `grave` nie ma danych.**
- **Podwawelskie** publikuje z kilkutygodniowym opóźnieniem; źródło ma wartość dla wyszukiwania fraz, a nie dla okna 7-dniowego.
- **Dębniki (ogłoszenia)** są wyłączone. Parser znajdował linki, ale żaden nie przechodził walidacji — źródło nie zwróciło ani jednego rekordu w całej historii przebiegów, także przy HTTP 200. Definicja zostaje w `nekrolog_core.mjs`, żeby zachować historię i umożliwić powrót po przebudowie strony parafii.
- **Dębniki (intencje)** są wyłączone. Host `debniki.sdb.org.pl` stoi za Cloudflare Managed Challenge, który odrzuca ruch z zakresów centrów danych — w tym z runnerów GitHub Actions (sonda z 2026-10-27: nadal HTTP 403). Decyzja o kryterium blokady zapada po reputacji adresu IP, nie po nagłówkach żądania, więc zmiana User-Agenta niczego nie daje, a **zabezpieczenia nie są obchodzone**. Definicja źródła i flaga `external_block_tolerated` zostają w kodzie, więc ponowne włączenie to zmiana jednego pola. Kategorię `intention` zasilają teraz parafie sąsiednie (niżej).
- **ZCK – kolejne dni porządku pogrzebów i lokalizator grobów** wymagają tego samego co przeglądarka: strona wydaje każdemu odwiedzającemu token CSRF (`<meta name="csrf-token">`) i ciasteczko `_frontendCSRF`, a kalendarz i wyszukiwarka grobów odsyłają je przy zapytaniu `POST`. Sesja HTTP robi dokładnie to samo, z jawnym nagłówkiem bota; `robots.txt` ZCK niczego nie zabrania. Między zapytaniami do ZCK jest odstęp 0,4 s. Awaria API kalendarza nie kasuje dnia bieżącego, a błąd jest zgłaszany dopiero wtedy, gdy nie udał się żaden kolejny dzień.
- **Lokalizator grobów ZCK** dopasowuje nazwisko jako fragment (zapytanie „Gawin” obejmuje „Gawin-Dereń”) i zwraca każdego pochowanego osobno, z listą pozostałych osób z grobu (`extra`). W ewidencji są już **cztery historyczne wpisy „Helena Gawin”** (Rakowicki: zm. 1979, 1994, 2003; Wola Duchacka: zm. 1942). Trafienia fraz liczone są bez okien czasowych, więc wpisy te są na liście bazowej `ZCK_LOCATOR_BASELINE` i nie trafiają do rekordów. Drugie zabezpieczenie: wpis z datą zgonu sprzed ponad roku nie może dotyczyć monitorowanej osoby i również jest pomijany (`historical_skipped` w diagnostyce). Obserwowany grób Adama Gawina (Rakowicki, kw. LXXIV, rz. 7, m. 11) daje rekord informacyjny, a każda nowa osoba w tym grobie — rekord z `force_match`. Lista zapytań, lista bazowa i obserwowany grób są w kodzie (`ZCK_LOCATOR_QUERIES`, `ZCK_LOCATOR_BASELINE`, `ZCK_WATCHED_GRAVES`) — przy zmianie monitorowanej osoby aktualizuj je razem z `Frazy.json`. Zniknięcie obserwowanego grobu z odpowiedzi jest zgłaszane jako błąd.
- **Karawan** pokazuje na stronie listy tylko pogrzeby nadchodzące i sprzed 1–2 dni; kanał RSS obejmuje 10 ostatnich nekrologów. Kandydaci z obu dróg są scalani, a awaria jednej z nich trafia tylko do diagnostyki (`feed_error`, `list_error`). Gabriel24 nie korzysta z kanału — jego `robots.txt` zabrania `*/feed`.
- **PUK**: karta na liście podaje tylko datę pogrzebu. Dla pogrzebów od dziś wzwyż parser raz pobiera stronę klepsydry (eKlepsydra, do której PUK sam linkuje) i uzupełnia cmentarz oraz godzinę; wynik zostaje w `data/source_cache.json`, dopóki karta jest na liście. Godzina z klepsydry jest przyjmowana tylko przy zgodnej dacie pogrzebu.
- **Parafie do 5 km od ul. Kapelanka.** Jeden parser (`parafia_ogloszenia` / `parafia_intencje`) czyta strony na różnych systemach (WordPress, Joomla, eParafia, własne CMS); różnice opisuje profil źródła w `PARISH_PROFILES`: skąd wziąć dokument (sama strona, najnowszy link ze strony listy, kanał RSS) i gdzie stoi data ogłoszenia (nagłówek tygodnia, nagłówek dokumentu, tytuł wpisu). Ogłoszenie **nie podaje daty zgonu** — rekord ma `date_death: null` i datę ogłoszenia w `date_reported`; ogłoszenia starsze niż 60 dni (archiwa) są pomijane. Nazwiska bywają w bierniku („Bożenę Stępską-Kamińską”) — `Frazy.json` zawiera formy odmienione, więc dopasowanie działa bez normalizacji.
- **Dąbie** publikuje listę bez dat przy wpisach, a **intencje pogrzebowe Borku** — listę zmarłych w kolejności od najnowszego. Datą zgłoszenia jest tam pierwszy przebieg, w którym wpis był widoczny (`data/source_cache.json`); wpisy zastane przy pierwszym odczycie są listą bazową i nie trafiają do okna 7 dni. Pusty wynik takiej listy nie nadpisuje zapisanego stanu.
- **Ewidencja grobów Borku** to publiczny plik JSON, który wyszukiwarka „Znajdź grób” pobiera do przeglądarki w całości. Nazwiska są porównywane po całych członach („Derenda” to inne nazwisko niż „Dereń”). Plik podaje tylko rok zgonu (`year_death`). Wpis pasujący do fraz, ale z rokiem zgonu sprzed ponad roku, jest pomijany jako historyczny.
- **Prywatność.** Repozytorium i GitHub Pages są publiczne, a listy parafialne zawierają dane osób żyjących: adresy („z ul. …”, „– ul. Widok 14”) i zamawiających msze („od …”). Rekord przenosi wyłącznie imię i nazwisko zmarłego albo treść intencji obciętą przed zamawiającym; intencje bez znacznika zmarłego (`+`, `†`, `śp.`) — dziękczynne, za żyjących — są pomijane. Notatka rekordu jest budowana od zera, nigdy z surowej linii ogłoszenia. Dane zmarłych nie podlegają RODO (motyw 27), dane osób żyjących — tak.
- **Tydzień bez zmarłych** to częsty, poprawny stan ogłoszeń. Pusty wynik przy rozpoznanej strukturze (data ogłoszenia, nagłówki dni intencji) jest potwierdzonym brakiem danych (`empty_confirmed`), a bez niej — podejrzeniem zmiany strony, które eskaluje po progu jak w innych źródłach.
- **MB Saletyńskiej** (intencje, 1,4 km od Kapelanki) nie jest źródłem: runnery GitHub Actions dostają tam Cloudflare Managed Challenge (sonda z 2026-10-27). Adres pozostaje w sondzie, żeby dało się sprawdzić, czy blokada ustąpiła.

---

## 4. Pułapki ekstrakcji, których pilnują parsery

Te reguły wynikają z realnych błędów wykrytych na żywych stronach — zmieniając kod, nie cofaj ich:

- **Granice bloków w tekście.** Cheerio skleja tekst sąsiadujących elementów bez separatora (`2026-08-18Cmentarz`). `extractBlockText()` wstawia znaki nowej linii; bez tego regexy z `\b` nie trafiają, a filtrowanie stopek działa na całym dokumencie naraz.
- **`\b` nie zachodzi przy znakach spoza ASCII.** `\bśp\.` nigdy nie dopasuje „Śp.”. Nie dodawaj `\b` przed polskimi literami.
- **Filtrowanie szumu jest dwupoziomowe.** `TECH_NOISE` (ślady kodu) dyskwalifikuje rekord; `BOILERPLATE_LINE` (cookies, „Udostępnij”, Facebook) usuwa wyłącznie pojedynczą linię. Wspólny filtr kasował całe nekrologi przez samo słowo „Facebook” w widżecie udostępniania.
- **Linki zbieraj przed `prepareReadableDocument()`.** Funkcja usuwa `nav`/`header`/`footer`, a w menu bywa jedyny link do treści (Dębniki, `/intencje`).
- **Daty są walidowane kalendarzowo.** `isoFromParts()` odrzuca `31.02`; wcześniej `Date.UTC` po cichu przewijało taką datę na inny dzień.
- **Pętla stron szczegółowych ma budżet czasu.** `DETAIL_FETCH_BUDGET_MS` (120 s) ogranicza sekwencyjny obchód stron szczegółowych jednego źródła; po jego wyczerpaniu pętla zwraca rekordy zebrane do tej pory z `partial: true`. Bez tego jedno powolne źródło (`max_detail_pages` sięga 50) przekraczało `timeout-minutes: 20` całego workflow — a przebieg ubity limitem **nie zapisuje ani danych, ani statusu, ani heartbeatu**, więc awaria staje się niewidoczna. Pusty wynik po wyczerpaniu budżetu ma własny `parser_status: "timeout_budget"`, żeby nie mylić go z regresją parsera. Ten sam budżet (120 s) mają serie zapytań do API ZCK (kolejne dni porządku pogrzebów, lokalizator) i pobieranie stron klepsydr PUK; dodatkowo dwa kolejne zapytania bez żadnej odpowiedzi HTTP przerywają serię. Bez tego 26 zapytań lokalizatora × 3 próby × 20 s przekraczało limit workflow.
- **Data ogłoszenia to nie data zgonu.** Listy „pożegnaliśmy” i „odeszli do Pana” podają tylko datę ogłoszenia — trafia do `date_reported`, nigdy do `date_death`. Tak samo jak u św. Jadwigi, data zgłoszenia nie może udawać daty zdarzenia, którego dotyczy.
- **Adres i zamawiający kończą odczyt.** Z segmentu listy brany jest tylko początkowy ciąg wyrazów pisanych wielką literą („Teresę Banaś z ul. Ludowej” → „Teresę Banaś”), a z intencji — tekst przed „od …”. Nie wydłużaj tych reguł tak, by sięgały dalej: za tą granicą są dane osób żyjących.
- **Lista bazowa zamiast okna czasowego dla ewidencji grobów.** Trafienia fraz nie mają okna czasowego, więc każdy historyczny wpis „Helena Gawin” w ewidencji dawałby alarm. Nowe źródło grobów wdrażaj dopiero po przeglądzie wszystkich jego wyników dla monitorowanych fraz — na wszystkich cmentarzach, nie tylko na tym, od którego zaczęto (w lokalizatorze ZCK czwarty wpis wyszedł dopiero na Woli Duchackiej).
- **Awaryjne `curl` tylko przy odpowiedzi serwera.** Fallback w `scripts/fetch.mjs` obchodzi odrzucenie po nagłówkach (HTTP 403 i statusy przejściowe). Przy zerwaniu połączenia idzie tą samą drogą sieciową i powtarza ten sam wynik, więc jest pomijany — inaczej jeden martwy adres kosztował 9 wywołań sieciowych i do 183 s zamiast 3 wywołań. Ponowienia po zerwaniu połączenia mają też dłuższe odstępy (2 s i 8 s zamiast 0,7 s i 2 s): host, który nie odpowiada, po 700 ms zachowa się tak samo.

---

## 5. Powiadomienia Discord

Wysyłka idzie na `DISCORD_WEBHOOK_URL` (sekret repozytorium). Zachowanie:

- **alert per trafienie** — zgłaszane są wszystkie trafienia w przebiegu, każde z etykietą kategorii (`zgon / wzmianka`, `pogrzeb`, `intencja mszalna (potrzeba)`, `miejsce pochówku`);
- **deduplikacja** po kluczu `kind|nazwisko|źródło|link|daty` — uzupełnienie terminu pogrzebu przez źródło jest nowym zdarzeniem i wywoła kolejne powiadomienie;
- **intencje grupowane** — nowe intencje z jednego źródła w jednym przebiegu idą jedną wiadomością z listą terminów (seria 30 mszy gregoriańskich dawałaby inaczej kilka pingów naraz); każda intencja ma nadal własny klucz deduplikacji;
- **powód zgłoszenia** — rekord z `force_match` (nowa osoba w obserwowanym grobie) niesie w wiadomości linię „Powód zgłoszenia”; wzmianki parafialne — „Data ogłoszenia”, groby z ewidencji Borku — „Rok zgonu”;
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

**Zrzuty stron parafialnych** (`tests/refresh.parafie.test.mjs`) są dodatkowo przycięte i **zanonimizowane**, bo repozytorium jest publiczne: adresy zastąpiono „ul. Przykładowa”, zamawiających mszę — „Jana Zamawiającego”, a intencje za żyjących — „W intencji Parafian”. Archiwa skrócono (Kliny Zacisze: bieżące tygodnie i jeden blok z 2025 r.; Dąbie: lista bieżąca i trzy wpisy po nagłówku „ROK 2026”; Borek: dziesięć pierwszych zmarłych; ewidencja grobów: wycinek pliku). Testy sprawdzają, że żaden rekord nie niesie tych wartości — to jednocześnie dowód, że parser nie przepuszcza adresów ani zamawiających. Zrzuty odpowiedzi API ZCK (`zck_funerals_api_*`, `zck_lokalizator_*`) i kanałów RSS są zapisane bez zmian, z tokenem CSRF zastąpionym przez `TEST-CSRF-TOKEN`.

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

- `data/job.json` → `source_diagnostics`: status HTTP, liczba linków/podstron, liczba rekordów, `parser_status`, licznik pustych przebiegów, licznik niepowodzeń sieciowych (`fail_streak`), `blocked_since`. Dla źródeł ze stronami szczegółowymi dochodzą `visited_links` i `partial` — patrz budżet czasu w §4. Nowsze źródła dodają: ZCK — `days_fetched`/`days_failed` (kolejne dni porządku), lokalizator — `queries`, `queries_failed`, `baseline_matched`, `historical_skipped`, a przy wyniku z pamięci `cached`/`cached_at`; Karawan — `feed_links`, `feed_error`, `list_error`; PUK — `detail_pages`; parafie — `documents`, `deaths`, `intentions`; ewidencja Borku — `not_modified`, `total_records`.
- `data/source_health.json`: źródło zwracające zero rekordów przez 3 kolejne przebiegi jest zgłaszane jako błąd (poza źródłami oznaczonymi `known_empty` oraz przebiegami z potwierdzonym brakiem danych — patrz niżej). Uwaga: licznik zlicza **przebiegi, nie dni** — przy harmonogramie 2×/dobę próg to około półtora dnia.
- Sekcja **Log** w interfejsie pokazuje tę diagnostykę oraz ostrzeżenie, gdy snapshot jest starszy niż 26 h.
- `status` zadania opisuje **kondycję odczytu**, nie liczbę rekordów: tydzień bez pogrzebów w oknie to `done`, a nie `error`.

### Błąd a ostrzeżenie

Nie każda awaria odczytu jest defektem do naprawienia w kodzie. Pipeline rozdziela dwa przypadki:

| | **Błąd** (`source_errors`) | **Ostrzeżenie** (`source_warnings`) |
|---|---|---|
| Co oznacza | regresja parsera, awaria serwera (HTTP 4xx/5xx), ciche zamilknięcie źródła | znana blokada zewnętrzna warstwy anty-botowej (HTTP 403, `parser_status: "blocked"`) **albo** pierwsze niepowodzenie sieciowe |
| Wpływ na `status` | degraduje do `done_with_errors` | **brak** — przebieg kończy się jako `done` |
| Reakcja | poprawka kodu lub zrzutu testowego | zmiana drogi dostępu albo odczekanie kolejnego przebiegu; kod nie ma na to wpływu |
| Widoczność | sekcja Log, `error_message` | sekcja Log (osobna lista), `warning_message`, baner w UI |

Warunkiem potraktowania blokady jako ostrzeżenia jest flaga `external_block_tolerated: true` w definicji źródła. Bez niej HTTP 403 pozostaje zwykłym błędem. Flagę ma obecnie `salwator_grobonet` (czynne) oraz `debniki_intencje` (wyłączone). Wartość ustala definicja w `scripts/nekrolog_core.mjs` — `mergeRequiredSources` nadpisuje nią zapis w `config/sources.json`.

### Awaria sieciowa: przejściowa czy trwała

Osobnej tolerancji podlega **niepowodzenie sieciowe**, czyli stan, w którym żadna odpowiedź HTTP nie dotarła (`http_status: 0` — przeterminowanie, zerwane połączenie, błąd DNS) albo pętla stron szczegółowych wyczerpała budżet czasu (`parser_status: "timeout_budget"`). To stan sieci, nie regresja kodu, i bywa jednorazowy.

- **Pierwsze** takie niepowodzenie jest ostrzeżeniem — status przebiegu pozostaje `done`.
- Od `NETWORK_FAIL_ALERT` kolejnych niepowodzeń (domyślnie 2, `scripts/refresh_static.mjs`) ostrzeżenie wraca do rangi błędu. Przy harmonogramie 2×/dobę daje to około pół doby zwłoki.
- Licznik `fail_streak` w `data/source_health.json` zeruje każdy odczyt, który nie był awarią sieci — także błąd innej natury, żeby seria nie zlepiała przeterminowania połączenia z regresją parsera.

Rozróżnienie **nie obejmuje** odpowiedzi serwera z błędnym statusem: HTTP 404 i 500 pozostają błędem od pierwszego wystąpienia, bo serwer działa i mówi coś konkretnego.

Powód: 2026-08-28 pojedyncze przeterminowanie połączenia do `gabriel24.pl` zdegradowało cały przebieg do `done_with_errors`, choć w następnym przebiegu źródło odpowiadało normalnie. Jedno mrugnięcie sieci nie może wyglądać tak samo jak trwała utrata źródła.

**Tolerancja jest ograniczona w czasie.** Jeżeli blokada trwa dłużej niż `BLOCK_TOLERANCE_DAYS` (domyślnie 14 dni, `scripts/refresh_static.mjs`), ostrzeżenie wraca do rangi błędu z komunikatem wskazującym na potrzebę decyzji. Ma to zapobiec sytuacji, w której trwała utrata źródła chowa się bezterminowo za ostrzeżeniem i status przestaje cokolwiek znaczyć. Wtedy trzeba albo przywrócić dostęp, albo wyłączyć źródło (`enabled: false`).

Flaga tolerancji **nie tłumi** innych awarii tego samego źródła: HTTP 500, zepsuty parser i seria pustych przebiegów nadal są zgłaszane jako błędy.

### Potwierdzony brak danych

Zero rekordów nie zawsze oznacza awarię. ZCK publikuje porządek pogrzebów na jeden dzień i w dni bez ceremonii — typowo w weekend — wypisuje przy każdym cmentarzu „Brak pogrzebów”, zachowując pełną strukturę strony. To poprawna odpowiedź źródła, a nie cisza po awarii.

Parser rozpoznaje ten stan i zwraca `parser_status: "empty_confirmed"`. Taki odczyt **zeruje licznik pustych przebiegów** i nigdy nie degraduje statusu. Wcześniej sobota i niedziela dawały cztery puste przebiegi z rzędu, co przekraczało próg 3 i co tydzień generowało `done_with_errors` z komunikatem o nieistniejącej zmianie struktury strony.

Kolejne dni pobierane z API kalendarza dziedziczą tę regułę: tydzień, w którym każdy dzień ma „Brak pogrzebów”, jest potwierdzonym brakiem danych. Ogłoszenia i intencje parafialne stosują ten sam typ dowodu: rozpoznana data ogłoszenia albo nagłówki dni intencji.

Wyciszenie wymaga **dowodu strukturalnego**: tabele `table.funerals` muszą istnieć i wszystkie zawierać komunikat o braku pogrzebów. Jeżeli tabele znikną — czyli strona faktycznie się zmieni — status wraca do `empty`, licznik rośnie i alarm działa normalnie. Zrzuty regresyjne obu przypadków: `zck_funerals_brak_2026-08-23.html` (dzień pusty) i `zck_funerals_2026-08-18.html` (dzień z pogrzebami).

### Dlaczego to rozróżnienie powstało

Przez kilkadziesiąt kolejnych przebiegów status brzmiał `done_with_errors` z tego samego, nienaprawialnego powodu — blokady Cloudflare na `debniki.sdb.org.pl`. Sygnał uległ wysyceniu: przestał odróżniać stan normalny od realnej regresji parsera, więc prawdziwa awaria innego źródła utonęłaby w szumie.

---

## 9. Ograniczenia i uwagi operacyjne

- Dane zależą od dostępności i struktury zewnętrznych serwisów; zmiana HTML źródła wymaga aktualizacji parsera i zrzutu testowego.
- Żadne skonfigurowane źródło nie wymaga OCR ani obsługi PDF — wszystkie publikują dane tekstem.
- Źródło Facebook pozostaje wyłączone (dostęp wymaga uwierzytelnienia; ocena możliwości włączenia to osobne zadanie).
- Część serwisów chroni się warstwą anty-botową rozstrzygającą po reputacji adresu IP. Odczyt z runnerów GitHub Actions bywa wtedy odrzucany, mimo że to samo żądanie z innego łącza przechodzi — nagłówki i User-Agent nie mają tu znaczenia. **Projekt nie obchodzi takich zabezpieczeń**; blokada jest raportowana jako ostrzeżenie (§8), a nie omijana.
- Harmonogram: GitHub Actions, cron `0 7,19 * * *` UTC, z bramką `npm test` przed `npm run refresh`.
- Wyłączone źródło nie jest przez nic testowane, więc zdjęcie blokady przeszłoby niezauważone. Workflow **Sonda dostępu do źródeł** (`.github/workflows/debniki-probe.yml`, wyłącznie `workflow_dispatch`) wysyła po jednym żądaniu do Dębnik (`/intencje/` i strona główna), do kanału RSS Karawana, do porządku pogrzebów i lokalizatora grobów ZCK (ten sam przepływ z tokenem CSRF co przeglądarka) oraz do stron parafii, w tym wykluczonej MB Saletyńskiej. Wynik trafia do podsumowania przebiegu: kod HTTP, rozmiar, rozpoznana warstwa anty-botowa. Dla Dębnik `200` oznacza, że źródło można włączyć, `403` — że blokada trwa. Sonda niczego nie obchodzi i niczego nie zapisuje: wysyła to samo żądanie co zwykły przebieg i tylko odnotowuje wynik. Przebieg z 2026-10-27: Dębniki i MB Saletyńska — 403 (Cloudflare), pozostałe adresy — 200.
- **Źródła świadomie wykluczone** — dostępne technicznie albo nie, ale bez legalnej drogi odczytu automatycznego. Nie dodajemy ich i nie próbujemy obchodzić blokad:
  - **Polska Press** — `dziennikpolski24.pl`, `gazetakrakowska.pl` (strony „Nekrologi i kondolencje”) i `nekrologi.net`: stopka i regulamin zakazują systematycznego pobierania treści oprogramowaniem bez wyraźnej, pisemnej zgody wydawcy. O zgodę nie występujemy.
  - **Agora** — `nekrologi.wyborcza.pl`: `robots.txt` zastrzega eksplorację tekstów i danych (art. 4 ust. 3 dyrektywy 2019/790, w Polsce art. 26³ ustawy o prawie autorskim).
  - **eCmentarze** (`ecemetery.eu`) i **Grobonet** (`grobonet.com`) — Cloudflare wobec odczytu automatycznego; Grobonet Salwatora pozostaje źródłem tolerowanym do decyzji po progu 14 dni (§8).
  - **Facebook** — treść wymaga logowania.
  - **MB Saletyńskiej**, **Pychowice (salezjanie)**, **kolegiata św. Anny**, **Epitafium** — warstwa anty-botowa (Cloudflare albo hostingowe wyzwanie JS).
  Strażnik w `tests/refresh.snapshot.test.mjs` pilnuje, by adresy wydawców prasy, eCmentarzy i MB Saletyńskiej nie wróciły do definicji źródeł.

---

## 10. Pliki referencyjne

- Szczegółowy opis źródeł: `Instrukcja_odczytu_zrodel_Nekrolog.md`.
- Bieżące dane: `data/latest.json`; status: `data/job.json`; błędy: `data/errors.json`.
- Lista źródeł: `config/sources.json`.
