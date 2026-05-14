ZADANIE DLA AGENTA AI / CODEX:
Napraw odczyt problematycznych źródeł w repozytorium `CuteLittleGoat/Nekrolog`.

WAŻNE:
- Nie twórz osobnych raportów w repo.
- Nie zmieniaj mechanizmu fraz Heleny / `Frazy.json` w tym zadaniu, chyba że jest to absolutnie konieczne przez konflikt testów.
- Nie wysyłaj testowych powiadomień na Discord.
- Przy uruchamianiu lokalnego refresha ustaw `DISCORD_NOTIFY_ENABLED=false`, żeby nie spamować webhooka.
- Jeśli masz pełny dostęp do internetu, sprawdź aktualny HTML żywych źródeł.
- Jeśli nie masz dostępu do internetu, oprzyj się na istniejących fixture’ach, `data/job.json`, konfiguracji i kodzie parserów.
- Po zmianach uruchom testy: `npm test`.

Repozytorium:
- GitHub: https://github.com/CuteLittleGoat/Nekrolog

KLUCZOWE PLIKI — ŚCIEŻKI WZGLĘDNE I LINKI BEZPOŚREDNIE:

1. Aktualny status ostatniego odświeżenia:
- `data/job.json`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/data/job.json

2. Konfiguracja źródeł:
- `config/sources.json`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/config/sources.json

3. Główna logika parserów i źródeł:
- `scripts/nekrolog_core.mjs`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/nekrolog_core.mjs

4. Pobieranie HTML / fallback curl:
- `scripts/fetch.mjs`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/fetch.mjs

5. Główny refresh statycznych danych:
- `scripts/refresh_static.mjs`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/refresh_static.mjs

6. Testy parserów:
- `tests/refresh.parsers.test.mjs`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/tests/refresh.parsers.test.mjs

7. Aktualne dane wyjściowe aplikacji:
- `data/latest.json`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/data/latest.json

8. Aktualne błędy źródeł:
- `data/errors.json`
- https://github.com/CuteLittleGoat/Nekrolog/blob/main/data/errors.json

AKTUALNY PROBLEM Z `data/job.json`:

Ostatni job ma status:

`done_with_errors`

I zawiera trzy błędy źródeł:

1. `salwator_grobonet`
- Nazwa: `Kraków Salwator – Grobonet`
- URL źródła: https://krakowsalwator.grobonet.com/nekrologi.php
- Błąd: `Kraków Salwator – Grobonet: nie znaleziono linków szczegółów`

2. `debniki_sdb`
- Nazwa: `Parafia św. Stanisława Kostki (Dębniki)`
- URL źródła: https://debniki.sdb.org.pl/
- Błąd: `HTTP 403`

3. `podwawelskie_nekrologi`
- Nazwa: `Podwawelskie – Nekrologi`
- URL źródła: https://www.podwawelskie.pl/aktualnosci/nekrologi.html
- Błąd: `Podwawelskie – Nekrologi: znaleziono 6 linków, ale zero poprawnych rekordów`

CEL ZADANIA:

Napraw mechanizm odczytu tych problematycznych źródeł tak, żeby:
- źródła, które realnie mają dane, były poprawnie parsowane,
- źródła puste nie były błędnie raportowane jako awaria parsera,
- źródła blokujące requesty były raportowane jako `blocked` / `HTTP 403`, ale z lepszą diagnostyką,
- aplikacja nadal działała jako statyczny pipeline GitHub Actions → JSON → frontend,
- istniejące działające źródła nie zostały popsute.

OBECNA ARCHITEKTURA:

Źródła są zdefiniowane w:

`config/sources.json`
https://github.com/CuteLittleGoat/Nekrolog/blob/main/config/sources.json

oraz jako wymagane źródła w:

`scripts/nekrolog_core.mjs`
https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/nekrolog_core.mjs

Refresh działa przez:

`scripts/refresh_static.mjs`
https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/refresh_static.mjs

Parsery są głównie w:

`scripts/nekrolog_core.mjs`
https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/nekrolog_core.mjs

Pobieranie HTML jest w:

`scripts/fetch.mjs`
https://github.com/CuteLittleGoat/Nekrolog/blob/main/scripts/fetch.mjs

PROBLEM 1 — `podwawelskie_nekrologi`

Źródło:
- https://www.podwawelskie.pl/aktualnosci/nekrologi.html

Konfiguracja:
- `id`: `podwawelskie_nekrologi`
- `type`: `podwawelskie_nekrologi`
- obecnie `requires_detail_fetch: true`
- `max_detail_pages: 50`

Aktualny błąd:
- `Podwawelskie – Nekrologi: znaleziono 6 linków, ale zero poprawnych rekordów`

Opis problemu:
Obecny parser traktuje źródło jak listę linków do szczegółów. Funkcja listująca znajduje 6 linków, ale detail-parser nie potrafi zbudować żadnego poprawnego rekordu. Istnieje duże prawdopodobieństwo, że znalezione linki to nie linki do pojedynczych nekrologów, tylko paginacja albo linki archiwalne/listowe.

Do sprawdzenia:
- Czy strona zawiera rekordy bezpośrednio na stronie listy.
- Czy linki `1, 2, 3, 4, 5, 6` są paginacją.
- Czy każda strona paginacji zawiera wiele rekordów.
- Czy rekord składa się z imienia, nazwiska, daty urodzenia i daty śmierci.
- Czy źródło w ogóle zawiera dane o pogrzebach, czy tylko dane o zgonach.

Proponowana naprawa:
1. Nie używaj tu ślepo modelu `parseByListAndDetails`, jeśli żywy HTML pokazuje rekordy na stronie listy.
2. Zrób parser listowy dla `podwawelskie_nekrologi`.
3. Jeśli są strony paginacji, pobierz je jako kolejne strony listy, nie jako detail pages.
4. Dla każdego poprawnego wpisu utwórz rekord typu:

{
  kind: "death",
  name: "Imię Nazwisko",
  date_death: "YYYY-MM-DD" albo null,
  date_funeral: null,
  time_funeral: null,
  place: "Podwawelskie – Nekrologi",
  source_id: "podwawelskie_nekrologi",
  source_name: "Podwawelskie – Nekrologi",
  url: "adres strony/paginacji albo szczegółu, jeśli istnieje",
  source_url: "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  note: "krótki opis / daty / informacja o źródle"
}

5. Jeżeli strona ma datę urodzenia i datę śmierci, zapisz datę śmierci jako `date_death`, a datę urodzenia ewentualnie w `note`.
6. Nie udawaj pogrzebu, jeśli źródło nie podaje daty/godziny pogrzebu.

Testy:
- Dodaj fixture HTML dla strony listy Podwawelskiego.
- Test powinien potwierdzać, że parser wyciąga co najmniej jeden rekord `kind: "death"`.
- Test powinien potwierdzać poprawne `name` i `date_death`.
- Test powinien potwierdzać, że paginacja nie jest traktowana jako detail page pojedynczego nekrologu.

PROBLEM 2 — `debniki_sdb`

Źródło:
- https://debniki.sdb.org.pl/

Konfiguracja:
- `id`: `debniki_sdb`
- `type`: `debniki_sdb_pogrzeby`
- obecnie `requires_detail_fetch: true`
- `max_detail_pages: 30`

Aktualny błąd:
- `HTTP 403`

Opis problemu:
GitHub Actions / obecny fetch dostaje HTTP 403. To może oznaczać blokadę nietypowego user-agenta, blokadę IP GitHub Actions, wymóg nagłówków przeglądarkowych albo ochronę antybotową.

Dodatkowy problem logiczny:
Obecny parser Dębnik koncentruje się na linkach/podstronach związanych z pogrzebem, zmarłymi, nekrologami, aktualnościami lub intencjami. Detail-parser wymaga treści typu `pogrzeb`, `pogrzebowa`, `msza święta pogrzebowa`, `uroczystości pogrzebowe`. Tymczasem realna strona parafialna może podawać informacje w formie ogłoszenia, np. „W minionym tygodniu pożegnaliśmy...” oraz imię i nazwisko zmarłej osoby, bez konkretnej daty pogrzebu.

Do sprawdzenia:
- Czy 403 występuje tylko w GitHub Actions, czy także lokalnie.
- Czy 403 znika po użyciu przeglądarkowego User-Agent.
- Czy trzeba dodać `Accept-Language: pl-PL,pl;q=0.9,en;q=0.8`.
- Czy trzeba dodać `Referer`.
- Czy strona ładuje treść statycznie w HTML, czy dynamicznie.
- Czy informacje o zmarłych znajdują się na stronie głównej, w ogłoszeniach, czy w podstronach.

Proponowana naprawa pobierania:
1. W `scripts/fetch.mjs` dodaj możliwość fallbacku z nagłówkami przeglądarkowymi.
2. Nie zmieniaj globalnie wszystkiego agresywnie, jeśli może to popsuć inne źródła.
3. Możesz dodać drugą próbę po HTTP 403:

User-Agent: Mozilla/5.0 ...
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: pl-PL,pl;q=0.9,en;q=0.8
Referer: origin źródła

4. Jeśli mimo tego źródło nadal zwraca 403, raportuj je jako zablokowane, a nie jako parser broken.

Proponowana naprawa parsera:
1. Parser Dębnik powinien obsługiwać nie tylko pogrzeby, ale też wzmianki o zgonach.
2. Dodaj wykrywanie tekstów typu:
   - `W minionym tygodniu pożegnaliśmy`
   - `pożegnaliśmy z naszej wspólnoty`
   - `Śp. Imię Nazwisko`
   - `śp. Imię Nazwisko`
   - `zmarła`
   - `zmarł`
3. Jeśli brak daty pogrzebu, twórz rekord:

{
  kind: "death",
  name: "Imię Nazwisko",
  date_death: null,
  date_funeral: null,
  time_funeral: null,
  place: "Parafia św. Stanisława Kostki (Dębniki)",
  source_id: "debniki_sdb",
  source_name: "Parafia św. Stanisława Kostki (Dębniki)",
  url: "adres strony, na której znaleziono wzmiankę",
  source_url: "https://debniki.sdb.org.pl/",
  note: "fragment ogłoszenia"
}

4. Jeśli jest data/godzina pogrzebu, twórz `kind: "funeral"`.
5. Nie odrzucaj automatycznie wzmianki tylko dlatego, że nie zawiera słowa `pogrzeb`.

Testy:
- Dodaj fixture HTML z ogłoszeniem typu `W minionym tygodniu pożegnaliśmy ... Śp. Irenę Jaworską l. 89`.
- Test powinien potwierdzać, że parser tworzy rekord `kind: "death"` z nazwiskiem.
- Test powinien potwierdzać, że brak daty pogrzebu nie powoduje odrzucenia rekordu.
- Dodaj test/fake fetch dla HTTP 403 i fallbacku nagłówków, jeśli łatwo to wydzielić.

PROBLEM 3 — `salwator_grobonet`

Źródło:
- https://krakowsalwator.grobonet.com/nekrologi.php

Konfiguracja:
- `id`: `salwator_grobonet`
- `type`: `grobonet_nekrologi`
- obecnie `requires_detail_fetch: true`
- `max_detail_pages: 50`
- `base_url`: https://krakowsalwator.grobonet.com/

Aktualny błąd:
- `Kraków Salwator – Grobonet: nie znaleziono linków szczegółów`

Opis problemu:
Obecny parser Grobonetu oczekuje linków szczegółów zawierających wzorce typu `nekrolog`, `osoba=`, `id=`, `index.php?s=`, `klepsydra` albo `nekrologi.php?`. Jeśli strona działa, ale aktualnie nie pokazuje żadnych nekrologów, aplikacja raportuje to jako błąd. To może być fałszywy alarm.

Do sprawdzenia:
- Czy żywa strona rzeczywiście zawiera listę nekrologów.
- Czy lista jest ładowana dynamicznie przez JavaScript / AJAX.
- Czy są endpointy XHR/API używane przez Grobonet.
- Czy strona pokazuje jedynie pustą sekcję `Nekrologi`, bez aktualnych wpisów.
- Czy brak linków powinien oznaczać `source_empty`, a nie `source_broken`.

Proponowana naprawa:
1. Rozróżnij trzy stany:
   - strona niedostępna / HTTP error,
   - strona dostępna, ale brak aktualnych rekordów,
   - strona zawiera rekordy, ale parser ich nie potrafi odczytać.
2. Jeśli HTML odpowiada 200, zawiera stronę Grobonetu i sekcję `Nekrologi`, ale nie zawiera linków/rekordów, zwróć pustą listę bez błędu albo z ostrzeżeniem typu `source_empty`.
3. Nie traktuj samego braku linków jako awarii, jeśli źródło może być po prostu puste.
4. Jeśli odkryjesz endpoint AJAX/API, użyj go zamiast skrobania pustej strony, ale zrób to ostrożnie i dodaj test.

Proponowany model zwrotu:
- Jeśli strona jest pusta, wynik parsera powinien być logicznie poprawny:

{
  rows: [],
  error: null,
  warning: "source_empty"
}

albo, jeśli aktualny model nie obsługuje warningów:

{
  rows: [],
  error: null
}

5. Jeśli obecna architektura wymaga informacji diagnostycznej, dodaj `source_warnings` albo `source_statuses` do `job.json`, ale nie psuj kompatybilności frontendu.

Testy:
- Dodaj fixture HTML pustej strony Grobonetu.
- Test powinien potwierdzać, że pusta strona Grobonetu nie daje błędu `nie znaleziono linków szczegółów`.
- Dodaj fixture z przykładowym rekordem Grobonetu, jeśli masz aktualny HTML.
- Test powinien potwierdzać, że parser nadal umie wydobyć rekord, jeśli rekordy istnieją.

PROBLEM 4 — `scripts/fetch.mjs` i diagnostyka HTTP

Opis problemu:
Jeżeli fallback `curl` jest używany, trzeba sprawdzić, czy nie maskuje realnych kodów HTTP. Jeżeli `curl` zwraca treść strony błędu, ale kod zapisuje `status: 200`, diagnostyka będzie fałszywa.

Do sprawdzenia:
- Jak `fetchText()` obsługuje HTTP statusy.
- Jak działa fallback curl.
- Czy `curl` przekazuje prawdziwy HTTP status do kodu.
- Czy błędy 403, 404, 500 są prawidłowo widoczne w `job.json`.

Proponowana naprawa:
1. Jeśli curl nie zwraca realnego statusu, zmień wywołanie na model z `--write-out`, np.:

curl -L --silent --show-error --max-time ... --write-out "\n__HTTP_STATUS__:%{http_code}"

2. Rozdziel body od statusu.
3. Zwracaj strukturę:

{
  ok: status >= 200 && status < 300,
  status,
  text,
  error
}

4. Nie oznaczaj automatycznie każdego udanego procesu curl jako HTTP 200.
5. Dodaj test, który symuluje HTML strony błędu i realny status 403.

PROBLEM 5 — diagnostyka parserów

Obecnie `job.json` pokazuje błędy źródeł, ale diagnostyka jest dość uboga. Przy awarii trudno odróżnić:
- brak HTML,
- HTTP 403,
- brak linków,
- linki są, ale są paginacją,
- rekordy są, ale walidacja je odrzuca,
- źródło jest po prostu puste.

Proponowana poprawka:
Dodaj lekką diagnostykę per źródło, np. w `job.json` lub osobnym polu kompatybilnym z frontendem:

{
  source_id: "podwawelskie_nekrologi",
  http_status: 200,
  html_length: 123456,
  candidate_links: 6,
  candidate_rows: 12,
  accepted_rows: 0,
  rejected_rows: 12,
  parser_status: "source_broken"
}

Nie musi to być dokładnie ten kształt, ale po refreshu powinno być jasne, dlaczego źródło nie dało rekordów.

Sugerowane statusy:
- `ok`
- `empty`
- `blocked`
- `http_error`
- `parser_broken`
- `fetch_error`

WYMAGANIA KOŃCOWE:

1. `podwawelskie_nekrologi`
- Nie powinno już kończyć się błędem `znaleziono 6 linków, ale zero poprawnych rekordów`, jeśli strona zawiera rekordy listowe.
- Jeśli zawiera dane, rekordy powinny trafić do `data/latest.json`.
- Jeśli zawiera tylko paginację, parser ma traktować paginację jako kolejne listy, nie detail pages.

2. `debniki_sdb`
- Jeśli problemem jest tylko User-Agent/nagłówki, dodaj fallback i pobieraj stronę.
- Jeśli nadal jest 403, raportuj to czytelnie jako blokadę.
- Parser ma umieć utworzyć rekord `death` z ogłoszenia o zmarłej/zmarłym, nawet bez daty pogrzebu.

3. `salwator_grobonet`
- Brak aktualnych nekrologów nie powinien być raportowany jako błąd parsera.
- Pusta, ale poprawnie pobrana strona powinna dawać `rows: []` i brak błędu albo status `empty`.
- Jeśli istnieje prawdziwy endpoint z rekordami, można go wykorzystać, ale tylko po sprawdzeniu i dodaniu testu.

4. Fetch/diagnostyka
- HTTP statusy muszą być wiarygodne.
- Fallback curl nie może udawać HTTP 200 dla stron błędu.
- `job.json` powinien jasno pokazywać, co stało się z każdym problematycznym źródłem.

5. Testy
- Zaktualizuj lub dodaj testy w:
  - `tests/refresh.parsers.test.mjs`
  - ewentualnie osobnym pliku testowym dla fetch/diagnostyki.
- Uruchom:
  - `npm test`

6. Zakres zmian
- Nie ruszaj Discord webhooka, poza ewentualnym ustawieniem `DISCORD_NOTIFY_ENABLED=false` przy lokalnych testach.
- Nie ruszaj `Frazy.json` ani normalizacji fraz w tym zadaniu.
- Nie przebudowuj frontendu, chyba że trzeba tylko wyświetlić nowy status diagnostyczny bez psucia obecnego widoku.
- Zachowaj kompatybilność istniejących pól `data/latest.json`, `data/job.json`, `data/errors.json`.

KRYTERIUM AKCEPTACJI:

Po wykonaniu zadania:
- `npm test` przechodzi.
- `podwawelskie_nekrologi` nie zgłasza już błędu wynikającego z mylenia paginacji z detail pages.
- `debniki_sdb` ma albo działający fetch z fallbackiem nagłówków, albo czytelny status `blocked`.
- `salwator_grobonet` rozróżnia puste źródło od zepsutego parsera.
- Statusy/błędy źródeł w `data/job.json` są bardziej diagnostyczne niż obecnie.
