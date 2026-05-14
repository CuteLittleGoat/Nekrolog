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

DODATKOWE WNIOSKI PO SPRAWDZENIU AKTUALNYCH STRON HTML
Data sprawdzenia: 2026-05-14

Zakres sprawdzenia:
- https://www.podwawelskie.pl/aktualnosci/nekrologi.html
- https://www.podwawelskie.pl/aktualnosci/nekrologi--str-1.html?str=1
- https://www.podwawelskie.pl/aktualnosci/nekrologi--str-2.html?str=2
- https://debniki.sdb.org.pl/
- https://debniki.sdb.org.pl/kategoria/aktualnosci/
- https://debniki.sdb.org.pl/intencje/
- https://debniki.sdb.org.pl/2025/02/20/zmarl-ks-jan-kucharczyk-salezjanin/
- https://krakowsalwator.grobonet.com/nekrologi.php

UWAGA O OGRANICZENIU SPRAWDZENIA:
- Strony Podwawelskiego dla paginacji 3–6 zostały rozpoznane jako linki na stronie, ale narzędzie sprawdzające zwróciło błąd techniczny „Cache miss” przy próbie ich otwarcia.
- Strony 1 i 2 wystarczają jednak do pewnego ustalenia głównego problemu: linki 1–6 są paginacją listy, a nie linkami do szczegółów pojedynczych nekrologów.
- Agent naprawiający kod, jeśli ma bezpośredni dostęp przez curl/fetch, powinien dodatkowo pobrać strony 3–6 i zrobić z nich fixture albo przynajmniej potwierdzić ten sam układ.

============================================================
1. PODWAWELSKIE — WNIOSKI Z AKTUALNEGO HTML
============================================================

Źródło:
https://www.podwawelskie.pl/aktualnosci/nekrologi.html

Aktualny stan strony:
- Strona zawiera nagłówek „Nekrologi”.
- Bezpośrednio pod nagłówkiem znajdują się linki:
  1, 2, 3, 4, 5, 6.
- Te linki NIE są linkami do szczegółów pojedynczych nekrologów.
- To jest paginacja listy.
- Przykładowe URL-e paginacji:
  - https://www.podwawelskie.pl/aktualnosci/nekrologi--str-1.html?str=1
  - https://www.podwawelskie.pl/aktualnosci/nekrologi--str-2.html?str=2
  - analogicznie prawdopodobnie:
    - https://www.podwawelskie.pl/aktualnosci/nekrologi--str-3.html?str=3
    - https://www.podwawelskie.pl/aktualnosci/nekrologi--str-4.html?str=4
    - https://www.podwawelskie.pl/aktualnosci/nekrologi--str-5.html?str=5
    - https://www.podwawelskie.pl/aktualnosci/nekrologi--str-6.html?str=6

Najważniejszy błąd obecnego parsera:
- Obecny parser znajduje 6 linków, ponieważ URL-e paginacji zawierają słowo „nekrologi”.
- Następnie traktuje te linki jak detail pages.
- To jest błędny model.
- Te strony należy traktować jako kolejne strony listy, a nie jako szczegóły pojedynczych rekordów.

Aktualny format danych widocznych na stronie:
- Rekordy są wpisane bezpośrednio w treści strony listy.
- Każdy rekord ma układ logiczny:
  1. imię
  2. nazwisko
  3. data urodzenia
  4. data śmierci

Przykłady ze strony 1:
- Marian Roś
  - data urodzenia: 1933-06-30
  - data śmierci: 2026-03-23
- Anna Jasiewicz
  - data urodzenia: 1940-02-27
  - data śmierci: 2026-03-21
- Elżbieta Kapusta
  - data urodzenia: 1948-03-16
  - data śmierci: 2026-03-07
- Marek Grabarczyk
  - data urodzenia: 1970-09-30
  - data śmierci: 2026-03-05
- Anna Etgens
  - data urodzenia: 1936-04-14
  - data śmierci: 2026-02-27
- Krystyna Zięba
  - data urodzenia: 1933-02-09
  - data śmierci: 2026-02-22
- Jan Radwański
  - data urodzenia: 1938-01-10
  - data śmierci: 2026-02-18
- Andrzej Spuła
  - data urodzenia: 1943-10-01
  - data śmierci: 2026-02-18
- Cecylia Przybyło
  - data urodzenia: 1930-08-11
  - data śmierci: 2026-02-11
- Kazimierz Stryszowski
  - data urodzenia: 1937-05-13
  - data śmierci: 2026-02-10
- Marcin Grzybek
  - data urodzenia: 1984-04-04
  - data śmierci: 2026-02-09
- Marek Kubik
  - data urodzenia: 1943-10-24
  - data śmierci: 2026-02-02

Przykłady ze strony 2:
- Marek Kubik
  - data urodzenia: 1943-10-24
  - data śmierci: 2026-02-02
- Korneliusz Kulma
  - data urodzenia: 1933-12-18
  - data śmierci: 2026-01-31
- Zofia Cichoń
  - data urodzenia: 1943-09-06
  - data śmierci: 2026-01-24
- Małgorzata Sierpowska
  - data urodzenia: 1953-07-11
  - data śmierci: 2026-01-18
- Kazimiera Kałuża
  - data urodzenia: 1937-01-25
  - data śmierci: 2026-01-13
- Ewa Łanowska
  - data urodzenia: 1941-09-25
  - data śmierci: 2026-01-11
- Romana Kolińska
  - data urodzenia: 1944-12-16
  - data śmierci: 2025-12-29
- Zofia Rozek
  - data urodzenia: 1933-07-20
  - data śmierci: 2025-12-28
- Maria Sabor
  - data urodzenia: 1945-09-08
  - data śmierci: 2025-12-26
- Eugeniusz Duda
  - data urodzenia: 1944-08-24
  - data śmierci: 2025-12-03
- Ryszard Gil
  - data urodzenia: 1958-08-03
  - data śmierci: 2025-11-30
- Anna Włodarczyk
  - data urodzenia: 1936-05-18
  - data śmierci: 2025-10-16

Ważna obserwacja:
- Marek Kubik występuje na końcu strony 1 i na początku strony 2.
- Parser musi deduplikować rekordy.
- Zalecany klucz deduplikacji:
  source_id + name + date_birth + date_death
  albo:
  source_id + normalized_name + date_death

Charakter danych:
- To są dane o zgonach.
- Strona nie podaje daty pogrzebu.
- Strona nie podaje godziny pogrzebu.
- Nie należy tworzyć rekordów typu „funeral”, jeśli nie ma daty/godziny pogrzebu.
- Należy tworzyć rekordy typu „death”.

Zalecany rekord dla Podwawelskiego:
{
  "kind": "death",
  "name": "Marian Roś",
  "date_birth": "1933-06-30" albo tylko w note, jeżeli schema nie obsługuje date_birth,
  "date_death": "2026-03-23",
  "date_funeral": null,
  "time_funeral": null,
  "place": "Podwawelskie – Nekrologi",
  "source_id": "podwawelskie_nekrologi",
  "source_name": "Podwawelskie – Nekrologi",
  "url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html" albo URL konkretnej strony paginacji,
  "source_url": "https://www.podwawelskie.pl/aktualnosci/nekrologi.html",
  "note": "Data urodzenia: 1933-06-30; data śmierci: 2026-03-23"
}

Zalecana zmiana implementacyjna:
- Nie używać parseByListAndDetails dla `podwawelskie_nekrologi`.
- Zrobić osobny parser listowy:
  parsePodwawelskieNekrologi(source)
- Parser powinien:
  1. Pobrać stronę główną listy.
  2. Znaleźć linki paginacji 1–6.
  3. Pobrać każdą stronę paginacji jako stronę listową.
  4. Z każdej strony wyciągnąć rekordy w układzie:
     imię / nazwisko / data urodzenia / data śmierci.
  5. Nie traktować linków paginacji jako detail pages.
  6. Deduplikować rekordy.
  7. Zwracać `rows` z `kind: "death"`.
  8. Jeżeli dana strona listy nie ma rekordów, traktować ją jako pustą stronę listy, nie błąd parsera.

Możliwy fallback tekstowy:
- Po oczyszczeniu HTML można pracować na tekście między nagłówkiem „Nekrologi” a początkiem powtórzonej nawigacji/footeru.
- Usunąć czyste numery paginacji: 1, 2, 3, 4, 5, 6.
- Następnie grupować tokeny:
  Imię
  Nazwisko
  YYYY-MM-DD
  YYYY-MM-DD
- Regex pomocniczy:
  ([A-ZŁŚŻŹĆŃÓ][\p{L}'-]+)\s+([A-ZŁŚŻŹĆŃÓ][\p{L}'-]+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})
- Uwaga: to jest fallback. Lepsze jest oparcie parsera na realnych elementach DOM po obejrzeniu surowego HTML.

Testy dla Podwawelskiego:
- Dodać fixture HTML ze strony 1.
- Dodać fixture HTML ze strony 2.
- Test musi potwierdzać:
  - parser znajduje co najmniej jeden rekord `kind: "death"`,
  - parser wyciąga np. `Marian Roś`, `date_death: "2026-03-23"`,
  - parser wyciąga np. `Anna Jasiewicz`, `date_death: "2026-03-21"`,
  - linki `1–6` nie są traktowane jako strony szczegółów,
  - duplikat `Marek Kubik` między stroną 1 i 2 jest usuwany,
  - brak daty pogrzebu nie powoduje odrzucenia rekordu.

============================================================
2. DĘBNIKI SDB — WNIOSKI Z AKTUALNEGO HTML
============================================================

Źródło:
https://debniki.sdb.org.pl/

Aktualny stan:
- Strona główna była czytelna przy odczycie przeglądarkowym.
- Nie zwróciła blokady w trybie użytym do sprawdzania.
- W repo ostatni job miał jednak HTTP 403 dla tego źródła.
- To wzmacnia hipotezę, że blokada dotyczy konkretnego User-Agenta, IP GitHub Actions albo braku nagłówków przeglądarkowych.
- Nie należy zakładać, że źródło jest trwale martwe.
- Należy dodać retry po HTTP 403 z nagłówkami przeglądarkowymi.

Aktualna treść na stronie głównej:
- Strona główna zawiera ogłoszenie:
  „VI Niedziela Wielkanocna 10 maja 2026”
- W treści ogłoszenia jest fragment:
  „W minionym tygodniu pożegnaliśmy z naszej wspólnoty parafialnej:
  Śp. Irenę Jaworską l. 89
  Polećmy zmarłą i naszych bliskich zmarłych Bożemu Miłosierdziu.
  Wieczny odpoczynek…”

Najważniejszy błąd obecnego parsera Dębnik:
- Parser skupia się na linkach i detail pages.
- Parser wymaga słów typu:
  pogrzeb,
  pogrzebowa,
  msza święta pogrzebowa,
  uroczystości pogrzebowe.
- Aktualna strona główna zawiera ważną informację o zmarłej, ale bez słowa „pogrzeb”.
- To powinno utworzyć rekord `death`, a nie zostać odrzucone.

Zalecane zachowanie parsera dla strony głównej:
- Parser Dębnik powinien najpierw analizować samą stronę główną jako potencjalne źródło danych.
- Dopiero potem powinien analizować linki do aktualności/intencji/podstron.
- Wzorce do obsługi:
  - „W minionym tygodniu pożegnaliśmy”
  - „pożegnaliśmy z naszej wspólnoty”
  - „Śp. Imię Nazwisko”
  - „śp. Imię Nazwisko”
  - „zmarła”
  - „zmarł”
  - „odeszła do Pana”
  - „odszedł do Pana”

Przykładowy rekord z aktualnej strony głównej:
{
  "kind": "death",
  "name": "Irena Jaworska",
  "date_death": null,
  "date_funeral": null,
  "time_funeral": null,
  "place": "Parafia św. Stanisława Kostki (Dębniki)",
  "source_id": "debniki_sdb",
  "source_name": "Parafia św. Stanisława Kostki (Dębniki)",
  "url": "https://debniki.sdb.org.pl/",
  "source_url": "https://debniki.sdb.org.pl/",
  "note": "W minionym tygodniu pożegnaliśmy z naszej wspólnoty parafialnej: Śp. Irenę Jaworską l. 89"
}

Uwaga o odmianie imienia i nazwiska:
- Na stronie jest forma odmieniona: „Irenę Jaworską”.
- Parser może:
  1. zachować formę źródłową w `note`,
  2. a w `name` spróbować ostrożnie zapisać „Irena Jaworska”.
- Jeżeli nie ma bezpiecznego mechanizmu normalizacji fleksji, lepiej zapisać:
  name: "Irenę Jaworską"
  niż odrzucić rekord.
- Test powinien dopuszczać przynajmniej rozpoznanie nazwiska „Jaworską/Jaworska”.

Strona kategorii aktualności:
https://debniki.sdb.org.pl/kategoria/aktualnosci/

Obserwacje:
- Strona kategorii zawiera wpis:
  „20.02.2025 Zmarł Ks. Jan Kucharczyk – salezjanin”
- To jest przykład wpisu szczegółowego o zgonie i pogrzebie.
- Nie należy jednak polegać wyłącznie na stronie kategorii, bo aktualna wzmianka o Irenie Jaworskiej jest widoczna na stronie głównej.

Sprawdzony wpis szczegółowy:
https://debniki.sdb.org.pl/2025/02/20/zmarl-ks-jan-kucharczyk-salezjanin/

Aktualna treść tego wpisu:
- Tytuł:
  „Zmarł Ks. Jan Kucharczyk – salezjanin”
- Data wpisu:
  20.02.2025
- Treść zawiera:
  „Dnia 20 lutego 2025 roku odszedł do Pana ks. Jan KUCHARCZYK salezjanin…”
- Treść zawiera też:
  „Uroczystości pogrzebowe odbędą się w poniedziałek, 24 lutego 2025 roku, w kościele pw. św. Stanisława Kostki w Krakowie-Dębnikach (ul. Konfederacka 6).”
- Godziny:
  - 10.30 – modlitwa różańcowa
  - 11.00 – Msza św.
  - 13.10 – odprowadzenie zmarłego od bramy do grobowca salezjańskiego na cmentarzu Rakowickim

Zalecane parsowanie wpisu Jana Kucharczyka:
{
  "kind": "funeral",
  "name": "Jan Kucharczyk",
  "date_death": "2025-02-20",
  "date_funeral": "2025-02-24",
  "time_funeral": "11:00",
  "place": "kościół pw. św. Stanisława Kostki w Krakowie-Dębnikach, ul. Konfederacka 6",
  "source_id": "debniki_sdb",
  "source_name": "Parafia św. Stanisława Kostki (Dębniki)",
  "url": "https://debniki.sdb.org.pl/2025/02/20/zmarl-ks-jan-kucharczyk-salezjanin/",
  "source_url": "https://debniki.sdb.org.pl/",
  "note": "10.30 – modlitwa różańcowa; 11.00 – Msza św.; 13.10 – odprowadzenie na cmentarzu Rakowickim"
}

Uwaga o godzinie:
- Obecny prosty parseTime może wziąć pierwszą godzinę, czyli 10:30.
- W tym przykładzie 10:30 to różaniec, a właściwa Msza św. jest o 11:00.
- Dla wpisów pogrzebowych Dębnik warto preferować godzinę stojącą przy frazie „Msza św.” / „Msza Święta”.
- Jeśli parser nie umie tego zrobić bezpiecznie, może zachować pierwszą godzinę, ale w `note` musi zostać cały harmonogram.

Zalecana zmiana implementacyjna Dębnik:
- `parseDebnikiSdbPogrzeby` powinien:
  1. pobrać stronę główną,
  2. sparsować z niej bezpośrednie wzmianki o zmarłych,
  3. dopiero potem zebrać linki do aktualności i szczegółów,
  4. parsować detail pages,
  5. nie odrzucać wzmianki tylko dlatego, że nie ma słowa „pogrzeb”.

Zalecane wzorce dla `death` bez daty pogrzebu:
- /W minionym tygodniu pożegnaliśmy[\s\S]{0,300}?Śp\.?\s+(.+?)(?:\s+l\.\s*\d+|$)/i
- /pożegnaliśmy z naszej wspólnoty[\s\S]{0,300}?Śp\.?\s+(.+?)(?:\s+l\.\s*\d+|$)/i
- /Śp\.?\s+([A-ZŁŚŻŹĆŃÓ][\p{L}'-]+(?:\s+[A-ZŁŚŻŹĆŃÓ][\p{L}'-]+)+)\s+l\.\s*(\d+)/u

Zalecane testy Dębnik:
- Fixture strony głównej z fragmentem:
  „W minionym tygodniu pożegnaliśmy z naszej wspólnoty parafialnej:
  Śp. Irenę Jaworską l. 89”
- Test musi potwierdzać:
  - powstaje rekord `kind: "death"`,
  - brak daty pogrzebu nie powoduje odrzucenia,
  - rekord zawiera nazwisko Jaworska/Jaworską,
  - `date_funeral` i `time_funeral` są null.
- Fixture wpisu Jana Kucharczyka.
- Test musi potwierdzać:
  - `name` zawiera „Jan Kucharczyk”,
  - `date_death: "2025-02-20"`,
  - `date_funeral: "2025-02-24"`,
  - preferowana godzina Mszy to `11:00`, jeśli parser obsługuje takie rozróżnienie.
- Test/fake fetch:
  - pierwsza odpowiedź HTTP 403,
  - druga odpowiedź po retry z nagłówkami przeglądarkowymi: 200 + HTML,
  - wynik: źródło nie jest oznaczone jako parser_broken.
- Test/fake fetch, gdy retry też daje 403:
  - wynik: `parser_status: "blocked"` albo error `HTTP 403`,
  - bez mylącego komunikatu o parserze.

============================================================
3. SALWATOR GROBONET — WNIOSKI Z AKTUALNEGO HTML
============================================================

Źródło:
https://krakowsalwator.grobonet.com/nekrologi.php

Aktualny stan strony:
- Strona jest czytelna.
- Zawiera tytuł:
  „Cmentarz Parafialny w Krakowie”
- Menu zawiera:
  - Strona główna
  - Wyszukiwarka
  - Mapa
  - Rocznice
  - Nekrologi
  - Regulamin
  - Kontakt
- Sekcja „Nekrologi” jest obecna.
- W treści widoczny jest cytat Wisławy Szymborskiej.
- Dalej widoczne są dane kontaktowe:
  Parafia Najświętszego Salwatora,
  ul. Kościuszki 88,
  30-114 Kraków,
  tel.,
  WWW,
  e-mail.
- Nie ma widocznych rekordów nekrologów.
- Nie ma widocznych linków do szczegółów nekrologów.
- Nie ma widocznych danych osoby zmarłej.
- Nie ma widocznych dat pogrzebu.

Wniosek:
- Aktualny Salwator Grobonet wygląda jak poprawnie pobrana, ale pusta strona „Nekrologi”.
- Brak linków szczegółów w tym źródle NIE powinien być traktowany jako awaria parsera.
- Obecny błąd:
  „Kraków Salwator – Grobonet: nie znaleziono linków szczegółów”
  jest najprawdopodobniej fałszywym alarmem dla stanu pustego źródła.

Zalecane zachowanie parsera:
- Jeśli fetch się udał i HTML zawiera rozpoznawalną stronę Grobonet / nagłówek „Nekrologi”, ale nie ma kandydatów na rekordy:
  - zwrócić `rows: []`,
  - `error: null`,
  - opcjonalnie `parser_status: "empty"` albo `warning: "source_empty"`.
- Nie dodawać tego źródła do `source_errors` w takiej sytuacji.
- Dodać diagnostykę:
  - `candidate_links: 0`,
  - `candidate_rows: 0`,
  - `accepted_rows: 0`,
  - `parser_status: "empty"`.

Zalecany wynik dla aktualnego HTML:
{
  "rows": [],
  "error": null,
  "warning": "source_empty",
  "diagnostics": {
    "parser_status": "empty",
    "candidate_links": 0,
    "candidate_rows": 0,
    "accepted_rows": 0
  }
}

Ważne:
- Nie ma obecnie dowodu w renderowanym tekście strony, że lista nekrologów jest ładowana dynamicznie.
- Jeżeli agent ma dostęp do surowego HTML i DevTools/XHR, może dodatkowo sprawdzić skrypty/endpointy AJAX.
- Jednak na podstawie widocznej aktualnej strony nie należy zgłaszać błędu parsera.

Testy Salwator:
- Dodać fixture HTML pustej strony Grobonet z nagłówkiem „Nekrologi”, cytatem i danymi kontaktowymi.
- Test musi potwierdzać:
  - parser zwraca `rows: []`,
  - parser nie zwraca błędu „nie znaleziono linków szczegółów”,
  - status diagnostyczny to `empty` albo brak błędu.
- Zachować osobny test dla przypadku, gdy Grobonet faktycznie zawiera rekord/link szczegółu.
- Jeśli nie ma realnego aktualnego HTML z rekordem, użyć minimalnego syntetycznego fixture zgodnego z dotychczasowym parserem.

============================================================
4. FETCH / HTTP / NAGŁÓWKI — WNIOSKI
============================================================

Aktualny problem:
- `fetchText()` używa User-Agenta:
  `nekrolog-refresh-bot/1.0 (+https://github.com/)`
- W przypadku Dębnik ostatni job w repo zgłosił HTTP 403.
- Strona Dębnik jest jednak aktualnie czytelna przy odczycie przeglądarkowym.
- To sugeruje, że problemem może być:
  - User-Agent,
  - brak Accept-Language,
  - brak Referer,
  - IP GitHub Actions,
  - albo kombinacja tych czynników.

Ważny błąd w `fetchViaCurl`:
- Obecny fallback curl zwraca:
  `{ ok: true, status: 200, text: out, error: null }`
  dla każdego udanego procesu curl.
- To jest błędne, bo udany proces curl nie oznacza HTTP 200.
- Curl może pobrać stronę błędu HTTP 403/404/500, a kod oznaczy to jako status 200.
- Trzeba to naprawić.

Zalecana zmiana curl:
- Użyć `--write-out` i wydzielić status HTTP z końca odpowiedzi.
- Nie używać samego exit code curl jako statusu HTTP.
- Przykład:
  curl -L --silent --show-error --max-time <seconds> \
    --write-out "\n__HTTP_STATUS__:%{http_code}" \
    --user-agent "<UA>" \
    --header "accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
    --header "accept-language: pl-PL,pl;q=0.9,en;q=0.8" \
    "<url>"

Zalecany model parsowania wyniku curl:
- Znaleźć końcowy marker:
  __HTTP_STATUS__:403
- Body to wszystko przed markerem.
- Status to liczba z markera.
- `ok = status >= 200 && status < 300`.
- Jeśli status nie jest 2xx, zwrócić:
  {
    ok: false,
    status,
    text,
    error: `HTTP ${status}`
  }
- Zachować `text` nawet przy 403/404, bo body strony błędu może być użyteczne diagnostycznie.

Zalecany retry po HTTP 403:
- Aktualnie retry/fallback nie powinien dotyczyć wyłącznie wyjątków sieciowych.
- Jeśli `runFetch()` zwróci `ok: false` i `status === 403`, należy wykonać drugą próbę z bardziej przeglądarkowymi nagłówkami.
- Nagłówki drugiej próby:
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36
  Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
  Accept-Language: pl-PL,pl;q=0.9,en;q=0.8
  Referer: origin źródła, np. https://debniki.sdb.org.pl/
  Upgrade-Insecure-Requests: 1

Ważne:
- Nie zmieniać agresywnie globalnego User-Agenta dla wszystkich źródeł, jeśli może to popsuć działające źródła.
- Bezpieczniejszy wariant:
  1. pierwsza próba jak dotąd,
  2. jeśli HTTP 403, druga próba z browser headers,
  3. jeśli nadal 403, oznaczyć źródło jako `blocked`.

Zalecane statusy diagnostyczne:
- `ok`
- `empty`
- `blocked`
- `http_error`
- `parser_broken`
- `fetch_error`

Zalecane pola diagnostyczne per źródło:
{
  "source_id": "debniki_sdb",
  "source_name": "Parafia św. Stanisława Kostki (Dębniki)",
  "url": "https://debniki.sdb.org.pl/",
  "http_status": 403,
  "html_length": 0,
  "candidate_links": 0,
  "candidate_rows": 0,
  "accepted_rows": 0,
  "rejected_rows": 0,
  "parser_status": "blocked",
  "error": "HTTP 403 after browser-header retry"
}

Dla aktualnego Podwawelskiego diagnostyka powinna wyglądać mniej więcej tak:
{
  "source_id": "podwawelskie_nekrologi",
  "http_status": 200,
  "candidate_pagination_pages": 6,
  "candidate_rows": "> 0",
  "accepted_rows": "> 0",
  "parser_status": "ok"
}

Dla aktualnego Salwatora diagnostyka powinna wyglądać mniej więcej tak:
{
  "source_id": "salwator_grobonet",
  "http_status": 200,
  "candidate_links": 0,
  "candidate_rows": 0,
  "accepted_rows": 0,
  "parser_status": "empty",
  "error": null
}

============================================================
5. PRIORYTETY NAPRAWY
============================================================

Najpierw naprawić:
1. `podwawelskie_nekrologi`
   - zmienić z modelu list+detail na model list+paginacja,
   - tworzyć `death`,
   - deduplikować,
   - dodać fixture.

2. `sa
