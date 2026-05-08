ZADANIE DLA CODEX — NAPRAWA PARSERÓW ŹRÓDEŁ, W TYM BŁĘDNYCH WPISÓW KARAWAN „GłównaNekrologiFirmaW Służbie”

Repozytorium:
CuteLittleGoat/Nekrolog

Cel:
Napraw parsery aplikacji „Nekrolog” tak, żeby spełniały wcześniejsze wymagania jakościowe i nie generowały błędnych wpisów typu:

GłównaNekrologiFirmaW Służbie

Problem zauważony w UI:
W tabeli „Najbliższe pogrzeby” pojawiają się błędne wpisy:

1. Nazwa:
   GłównaNekrologiFirmaW Służbie

   URL:
   https://karawan.pl/nekrolog/wladyslaw-stozek/

2. Nazwa:
   GłównaNekrologiFirmaW Służbie

   URL:
   https://karawan.pl/nekrolog/elzbieta-rodecka/

Dodatkowo w notatce/treści wpisu pojawia się techniczny śmieć z HTML, np.:

iframe
googletagmanager
clickcease

To trzeba naprawić.

WAŻNE:
Nie przywracaj Firebase.
Nie dodawaj Firestore.
Nie dodawaj backendu.
Nie dodawaj Playwright/Puppeteer.
Nie dodawaj OCR.
Nie dodawaj logowania.
Nie dodawaj przycisku „Odśwież”.
Nie zmieniaj architektury statycznej.

Aplikacja ma nadal działać tak:

config/sources.json
→ scripts/refresh_static.mjs
→ scripts/nekrolog_core.mjs
→ data/latest.json, data/job.json, data/errors.json
→ GitHub Pages

Najważniejsze pliki do przeczytania przed pracą:

- Instrukcja_odczytu_zrodel_Nekrolog.md
- config/sources.json
- scripts/nekrolog_core.mjs
- scripts/refresh_static.mjs
- scripts/fetch.mjs
- scripts/date.mjs
- scripts/normalize.mjs
- tests/refresh.parsers.test.mjs
- data/latest.json
- data/job.json
- data/errors.json
- README.md


CZĘŚĆ 1 — DIAGNOZA OBECNEGO BŁĘDU KARAWAN

Obecny kod ma problem, bo:

1. parseKarawanNekrologi nie jest realnym parserem Karawan.
   Obecnie Karawan jest podpięty do generycznego parseByListAndDetails.

2. parseDetail bierze tekst z całego body strony:
   body.text()

3. Następnie wybiera jako name pierwszy fragment pasujący do wzorca dwóch słów z wielkiej litery.

4. Na stronie Karawan pierwsze pasujące słowa pochodzą z menu/nagłówka:
   Główna Nekrologi Firma W Służbie

5. Dlatego parser zapisuje jako name:
   GłównaNekrologiFirmaW Służbie
   albo podobny sklejony tekst nawigacji.

6. Ponieważ note też jest robione z całego body, do notatki trafiają śmieci techniczne:

   iframe
   googletagmanager
   clickcease
   reklamy
   menu
   header
   footer
   skrypty

To trzeba naprawić u źródła, czyli w parserze, nie przez ukrywanie we frontendzie.


CZĘŚĆ 2 — PIĘĆ GŁÓWNYCH PROBLEMÓW DO NAPRAWY

Napraw wszystkie poniższe problemy.


PROBLEM 1 — Parsery źródeł są tylko aliasami do parsera generycznego

Obecnie Gabriel24, Karawan, Grobonet i Podwawelskie są w praktyce tym samym parserem:

parseGenericList
+
parseDetail
+
parseByListAndDetails

To nie spełnia wymagań.

Wymagane:
Każde źródło ma mieć osobny parser:

- parseGabriel24Nekrologi
- parseKarawanNekrologi
- parseGrobonetNekrologi
- parsePodwawelskieNekrologi
- parseDebnikiSdbPogrzeby
- parseSwJadwigaPogrzebowe
- parsePukPozegnalismy
- parseZckFunerals

Parsery mogą używać wspólnych helperów, ale nie mogą być pustymi aliasami do jednego parsera, jeżeli struktura źródła jest inna.


PROBLEM 2 — Parser dat jest za słaby

Obecnie daty są rozpoznawane głównie w formacie numerycznym:

- DD.MM.YYYY
- DD-MM-YYYY
- DD/MM/YYYY

Wymagane:
Rozbuduj parser dat tak, żeby rozpoznawał co najmniej:

- YYYY-MM-DD
- DD.MM.YYYY
- DD-MM-YYYY
- DD/MM/YYYY
- 8 maja 2026
- 08 maja 2026
- 8 maj 2026
- 8 V 2026
- 8.05.2026
- 8.5.2026

Obsłuż polskie miesiące:

- stycznia, styczeń
- lutego, luty
- marca, marzec
- kwietnia, kwiecień
- maja, maj
- czerwca, czerwiec
- lipca, lipiec
- sierpnia, sierpień
- września, wrzesień
- października, październik
- listopada, listopad
- grudnia, grudzień

Zwracaj zawsze format:

YYYY-MM-DD

Jeżeli daty nie da się ustalić, zwróć null.
Nie zgaduj dat.


PROBLEM 3 — parseDetail szuka dat tylko numerycznych i skanuje całe body

Obecny parseDetail jest zbyt agresywny:

- skanuje całe body,
- wybiera pierwszą pasującą nazwę,
- bierze techniczne śmieci do note,
- nie rozróżnia treści właściwej od headera/menu/footera.

Wymagane:
Nie używaj parseDetail jako uniwersalnego parsera dla realnych źródeł.

Jeżeli zostaje helper typu parseDetail, to tylko jako ostrożny fallback, po wcześniejszym:

- usunięciu elementów technicznych,
- zawężeniu do głównego kontenera treści,
- walidacji name,
- walidacji note.

Dodaj helper:

prepareReadableDocument($)

Ma usuwać z DOM:

- script
- style
- iframe
- noscript
- svg
- canvas
- form
- nav
- header
- footer
- aside
- .cookie
- .cookies
- .cookiebar
- .gdpr
- .menu
- .nav
- .navbar
- .breadcrumb
- .breadcrumbs
- .social
- .share
- .ad
- .ads
- .banner
- .popup
- .modal

Dodaj helper:

extractMainText($, selectors)

Ma próbować pobrać tekst z głównego kontenera według listy selektorów.
Jeżeli nic nie pasuje, dopiero wtedy można użyć body, ale po usunięciu elementów technicznych.

Dodaj helper:

cleanTechnicalNoise(text)

Ma usuwać lub odrzucać tekst zawierający:

- googletagmanager
- gtm-
- clickcease
- iframe
- display:none
- visibility:hidden
- document
- window.
- function(
- var
- const
- let
- cookie
- cookies
- facebook
- pixel
- analytics

Jeżeli note po czyszczeniu nadal zawiera takie fragmenty, wpis należy odrzucić albo note ustawić na null.


PROBLEM 4 — Dębniki SDB ma requires_detail_fetch:true, ale parser nie chodzi po podstronach

W config/sources.json źródło debniki_sdb ma requires_detail_fetch:true.

Wymagane:
parseDebnikiSdbPogrzeby musi:

1. pobrać list_url,

2. znaleźć linki do potencjalnych aktualności/ogłoszeń/intencji,

3. pobrać ograniczoną liczbę podstron,

4. analizować tylko wpisy, które jednoznacznie dotyczą:

   - pogrzebu,
   - mszy świętej pogrzebowej,
   - osoby zmarłej w kontekście pogrzebu.

Nie traktuj zwykłej intencji typu:

+ Jan Kowalski

jako zgonu albo pogrzebu, jeżeli nie ma kontekstu pogrzebowego.


PROBLEM 5 — Testy są zbyt płytkie i nie chronią przed realnymi błędami

Obecnie testy dla Gabriel24, Karawan, Grobonet i Podwawelskie mogą używać tego samego generycznego fixture.
To nie wystarcza.

Wymagane:
Dodaj osobne fixture HTML dla każdego źródła.

Minimum:

- tests/fixtures/karawan_list.html
- tests/fixtures/karawan_detail_wladyslaw_stozek.html
- tests/fixtures/karawan_detail_elzbieta_rodecka.html
- tests/fixtures/gabriel24_list.html
- tests/fixtures/gabriel24_detail.html
- tests/fixtures/grobonet_list.html
- tests/fixtures/grobonet_detail.html
- tests/fixtures/podwawelskie_list.html
- tests/fixtures/podwawelskie_detail.html
- tests/fixtures/debniki_sdb_list.html
- tests/fixtures/debniki_sdb_detail_funeral.html
- tests/fixtures/debniki_sdb_detail_intention_only.html
- tests/fixtures/sw_jadwiga_pogrzebowe_sample.html
- tests/fixtures/zck_sample.html
- tests/fixtures/puk_sample.html

Fixture mogą być skrócone, ale muszą odzwierciedlać realną strukturę źródła opisaną w Instrukcja_odczytu_zrodel_Nekrolog.md.


CZĘŚĆ 3 — SPECJALNA NAPRAWA KARAWAN

To jest najpilniejsza poprawka.

Dodaj prawdziwy parser:

- parseKarawanNekrologi(source)
- parseKarawanNekrologiHtml(text, source)
- parseKarawanDetailHtml(text, source, detailUrl)

Nie podpinaj Karawan do parseByListAndDetails jako pełnego rozwiązania.
Możesz użyć wspólnych helperów, ale parser Karawan ma mieć własne selektory, walidację i fallbacki.

Wymagania dla parseKarawanNekrologi:

1. Pobierz source.list_url albo source.url.

2. Znajdź linki do nekrologów.

3. Linki muszą prowadzić do adresów typu:

   https://karawan.pl/nekrolog/...

4. Odrzuć linki techniczne, menu, social media, politykę prywatności itd.

5. Ogranicz liczbę szczegółów przez source.max_detail_pages albo 50.

6. Pobierz szczegóły sekwencyjnie lub z małą równoległością.

7. Każdy szczegół parsuj przez parseKarawanDetailHtml.

Wymagania dla parseKarawanDetailHtml:

1. Usuń z DOM:

   - script
   - style
   - iframe
   - noscript
   - nav
   - header
   - footer
   - aside
   - form
   - svg
   - canvas
   - reklamy
   - menu
   - breadcrumbs
   - cookie banners

2. Nie używaj całego body.text() jako podstawowego źródła danych.

3. Najpierw znajdź główny kontener treści nekrologu.
   Sprawdź selektory realnej strony Karawan i wpisz je w kodzie.

   Przykładowe kandydaty do sprawdzenia:

   - main
   - article
   - .entry-content
   - .page-content
   - .post-content
   - .single-content
   - .content
   - .nekrolog
   - .nekrolog-content
   - .obituary
   - .obituary-content
   - [class*="nekrolog"]
   - [class*="obituary"]

4. Name wyciągaj w tej kolejności:

   a) najprecyzyjniejszy nagłówek w głównym kontenerze,

   b) h1 w głównym kontenerze,

   c) tytuł strony, ale po usunięciu nazwy serwisu,

   d) tekst alt obrazka nekrologu, jeśli zawiera osobę,

   e) slug z URL jako ostateczny fallback.

   Dla URL:

   https://karawan.pl/nekrolog/wladyslaw-stozek/

   fallback ze sluga powinien dać:

   Wladyslaw Stozek

   albo po polskiej normalizacji, jeśli możliwe:

   Władysław Stożek

   Dla URL:

   https://karawan.pl/nekrolog/elzbieta-rodecka/

   fallback ze sluga powinien dać:

   Elzbieta Rodecka

   albo po polskiej normalizacji, jeśli możliwe:

   Elżbieta Rodecka

5. Nigdy nie akceptuj jako name tekstu zawierającego słowa nawigacji:

   - Główna
   - Nekrologi
   - Firma
   - W Służbie
   - Kontakt
   - Oferta
   - Usługi
   - Menu
   - Strona główna
   - Polityka prywatności

Dodaj helper:

isBadNameCandidate(name)

Ma zwracać true dla:

- pustych wartości,
- tekstów krótszych niż dwa słowa,
- tekstów dłuższych niż np. 80 znaków,
- nazw zawierających słowa menu,
- nazw zawierających URL/HTML/iframe/script,
- nazw zawierających googletagmanager albo clickcease.

6. Date_funeral wyciągaj z tekstu głównego kontenera.

   Dla pokazanych błędnych wpisów data i godzina wyglądają na poprawnie wykryte:

   - 2026-05-08 09:00
   - 2026-05-05 11:00

   Zachowaj tę funkcjonalność, ale pobieraj datę z czystego tekstu właściwej treści.

7. Time_funeral wyciągaj przez parseTime.

8. Place wyciągaj z najbliższych fraz zawierających:

   - cmentarz
   - kaplica
   - kościół
   - parafia
   - cm.
   - CMENTARZ
   - KAPLICA

   Ale nie doklejaj do place śmieci technicznych.

   Place nie może zawierać:

   - iframe
   - googletagmanager
   - clickcease
   - document
   - display:none
   - visibility:hidden
   - href=
   - src=

9. Note twórz tylko z oczyszczonego tekstu głównego kontenera.

   Note nie może zawierać:

   - iframe
   - googletagmanager
   - clickcease
   - document
   - display:none
   - visibility:hidden
   - href=
   - src=
   - HTML tagów

10. Jeżeli name jest złe, ale URL zawiera slug /nekrolog/imie-nazwisko/, użyj sluga jako fallback.

    Nie zapisuj:

    GłównaNekrologiFirmaW Służbie

11. Jeżeli name nadal jest złe po fallbackach, pomiń rekord i dodaj warning do error albo debug listy dla źródła Karawan.

12. kind:

    Jeżeli jest data pogrzebu, użyj:

    kind: "funeral"

    Jeżeli jest data zgonu i brak daty pogrzebu, użyj:

    kind: "death"

    Jeżeli są obie daty, można zwrócić death i funeral albo jeden rekord death z date_funeral.
    Preferuj zgodność z resztą aplikacji.


CZĘŚĆ 4 — TESTY DLA BŁĘDU KARAWAN

Dodaj testy, które zabezpieczą dokładnie ten błąd.

Fixture:

- tests/fixtures/karawan_detail_wladyslaw_stozek.html
- tests/fixtures/karawan_detail_elzbieta_rodecka.html

Fixture muszą zawierać celowo elementy nawigacji i śmieci techniczne, np.:

- Główna Nekrologi Firma W Służbie
- iframe
- googletagmanager
- clickcease

oraz właściwą treść nekrologu z:

- nazwą osoby,
- datą pogrzebu,
- godziną,
- miejscem.

Testy muszą sprawdzać:

1. parseKarawanDetailHtml nie zwraca name:

   GłównaNekrologiFirmaW Służbie

2. parseKarawanDetailHtml nie zwraca name zawierającego:

   Główna Nekrologi Firma W Służbie

3. Dla URL:

   https://karawan.pl/nekrolog/wladyslaw-stozek/

   name ma być osobą ze strony albo fallbackiem ze sluga:

   - Wladyslaw Stozek
   - Władysław Stożek
   - albo dokładna forma z realnego HTML.

4. Dla URL:

   https://karawan.pl/nekrolog/elzbieta-rodecka/

   name ma być osobą ze strony albo fallbackiem ze sluga:

   - Elzbieta Rodecka
   - Elżbieta Rodecka
   - albo dokładna forma z realnego HTML.

5. note nie zawiera:

   - iframe
   - googletagmanager
   - clickcease
   - display:none
   - visibility:hidden
   - href=
   - src=

6. place nie zawiera:

   - iframe
   - googletagmanager
   - clickcease
   - display:none
   - visibility:hidden
   - href=
   - src=

7. date_funeral i time_funeral są poprawnie wyciągnięte.


CZĘŚĆ 5 — ROZBUDOWA PARSERÓW POZOSTAŁYCH ŹRÓDEŁ

Na podstawie Instrukcja_odczytu_zrodel_Nekrolog.md popraw też pozostałe parsery.

Gabriel24:

- osobny parser listy,
- osobny parser szczegółu,
- nie OCR,
- obraz tylko jako alt/title/podpis,
- nie skanuj całego body bez zawężenia,
- name z nagłówka/tytułu/alt/sluga,
- daty z tekstu właściwego.

Grobonet / Salwator:

- osobny parser listy,
- osobny parser szczegółu,
- obsłuż linki do szczegółów Grobonet,
- name z właściwego kontenera, tytułu, alt lub sluga,
- daty tylko jawne,
- bez OCR.

Podwawelskie:

- osobny parser listy artykułów,
- osobny parser artykułu,
- data publikacji artykułu nie może automatycznie stać się date_death ani date_funeral,
- date_funeral tylko gdy tekst mówi o pogrzebie/uroczystości,
- date_death tylko gdy tekst mówi o zgonie.

Dębniki SDB:

- parser ma pobierać podstrony, jeśli requires_detail_fetch:true,
- nie traktuj zwykłych intencji jako zgonów,
- tylko pogrzeb/msza pogrzebowa/zmarł/zmarła w odpowiednim kontekście.

Św. Jadwiga:

- kind zawsze "funeral",
- date_funeral z daty mszy pogrzebowej,
- nie twórz death,
- nie przetwarzaj zwykłych intencji bez słowa pogrzeb.

ZCK:

- popraw parser tak, by nie zakładał zbyt sztywnego układu kolejnych linii,
- obsługuj układ jednowierszowy i wielowierszowy,
- brak daty na stronie może użyć fallbacku dzisiejszej daty, ale note musi to jasno zaznaczyć.

PUK:

- nie pogorsz obecnie działającego parsera,
- zachowaj date_death, date_funeral, time_funeral i URL do eklepsydry.


CZĘŚĆ 6 — HELPER DO NORMALIZACJI NAZWY ZE SLUGA

Dodaj helper:

nameFromSlug(url)

Przykłady:

https://karawan.pl/nekrolog/wladyslaw-stozek/
→ Wladyslaw Stozek

https://karawan.pl/nekrolog/elzbieta-rodecka/
→ Elzbieta Rodecka

Wymagania:

- usuń końcowy slash,
- weź ostatni segment URL,
- zamień myślniki na spacje,
- usuń cyfry techniczne, jeśli są,
- każde słowo zaczynaj wielką literą,
- zachowaj nazwiska dwuczłonowe,
- nie używaj sluga, jeśli segment jest techniczny typu:

  - nekrolog
  - pogrzeb
  - aktualnosci
  - category
  - page
  - kontakt


CZĘŚĆ 7 — WALIDACJA REKORDÓW PRZED ZAPISEM

Dodaj helper:

validateParsedRow(row)

Ma sprawdzać:

1. row.name nie jest puste.

2. row.name nie zawiera słów menu.

3. row.name nie zawiera HTML, iframe, script, googletagmanager, clickcease.

4. row.note nie zawiera technicznych śmieci.

5. row.place nie zawiera technicznych śmieci.

6. kind jest death albo funeral.

7. source_id i source_name są ustawione.

8. url jest ustawiony.

W refresh_static.mjs albo w parseSource upewnij się, że błędne rekordy są pomijane przed zapisem do data/latest.json.

Nie pozwól, żeby do data/latest.json trafiły rekordy z name:

GłównaNekrologiFirmaW Służbie

Nie pozwól, żeby do data/latest.json trafiły note/place zawierające:

- iframe
- googletagmanager
- clickcease
- display:none
- visibility:hidden


CZĘŚĆ 8 — TESTY OGÓLNE

Rozbuduj tests/refresh.parsers.test.mjs albo dodaj osobne testy.

Wymagane testy:

1. Parser dat:

   - 08.05.2026 → 2026-05-08
   - 8 maja 2026 → 2026-05-08
   - 8 maj 2026 → 2026-05-08
   - 8 V 2026 → 2026-05-08

2. Parser czasu:

   - 9:00 → 09:00
   - 09:00 → 09:00
   - godz. 9.00 → 09:00
   - o 9:00 → 09:00

3. Karawan:

   - nie zwraca GłównaNekrologiFirmaW Służbie,
   - nie ma iframe/googletagmanager/clickcease w note,
   - nie ma iframe/googletagmanager/clickcease w place,
   - poprawnie wyciąga name z realnej treści albo sluga,
   - poprawnie wyciąga date_funeral i time_funeral.

4. Gabriel24:

   - używa własnych fixture, nie generic_detail.html.

5. Grobonet:

   - używa własnych fixture, nie generic_detail.html.

6. Podwawelskie:

   - używa własnych fixture,
   - data publikacji nie jest używana jako data pogrzebu.

7. Dębniki SDB:

   - zwykła intencja + Jan Kowalski bez kontekstu pogrzebu jest pomijana,
   - msza pogrzebowa tworzy funeral.

8. Św. Jadwiga:

   - msza pogrzebowa tworzy funeral, nie death.

9. Walidacja:

   - validateParsedRow odrzuca name zawierające Główna/Nekrologi/Firma W Służbie.
   - validateParsedRow odrzuca note z googletagmanager/clickcease/iframe.

10. parseSource:

    - każdy type z config/sources.json ma obsłużony parser,
    - generic_html dla aktywnego źródła zwraca błąd,
    - Facebook jest disabled i nie jest pobierany przez refresh_static.mjs.


CZĘŚĆ 9 — WORKFLOW

Dodaj do .github/workflows/nekrolog-refresh.yml krok testów przed refresh.

Po:

npm ci

dodaj:

npm test

Dopiero potem:

npm run refresh

Czyli workflow ma mieć kolejność:

1. Checkout
2. Setup Node
3. npm ci
4. npm test
5. npm run refresh
6. commit danych

Jeżeli testy nie przechodzą, workflow nie powinien generować i commitować nowych danych.


CZĘŚĆ 10 — REFRESH I KONTROLA DATA/LATEST.JSON

Po zmianach uruchom lokalnie:

npm test
npm run refresh

Następnie sprawdź data/latest.json.

W data/latest.json nie może wystąpić:

- GłównaNekrologiFirmaW Służbie
- googletagmanager
- clickcease
- <iframe
- iframe
- src
- display:none
- visibility:hidden

Sprawdź szczególnie rekordy z:

source_id: karawan_nekrologi

Dla URL:

https://karawan.pl/nekrolog/wladyslaw-stozek/

rekord nie może mieć:

name = GłównaNekrologiFirmaW Służbie

Dla URL:

https://karawan.pl/nekrolog/elzbieta-rodecka/

rekord nie może mieć:

name = GłównaNekrologiFirmaW Służbie

Jeżeli parser nie potrafi wiarygodnie odczytać właściwego imienia i nazwiska, ma użyć fallbacku ze sluga albo pominąć rekord.

Nie wolno zapisywać menu jako nazwiska.


CZĘŚĆ 11 — FRONTEND

Frontend nie jest głównym źródłem błędu, ale sprawdź app.js.

Upewnij się, że:

1. app.js nadal escapuje wartości przed innerHTML.

2. app.js nie ukrywa problemów parsera przez specjalne if-y.

3. app.js może wyświetlać note, ale note ma już być oczyszczona po stronie parsera.

4. app.js nie wykonuje HTML z note.

Nie naprawiaj tego błędu wyłącznie we frontendzie.
Źródłem prawdy jest data/latest.json.


CZĘŚĆ 12 — README I DOKUMENTACJA

Zaktualizuj README.md krótko:

1. Parsery mają walidację rekordów.

2. Parser Karawan ma ochronę przed odczytem menu jako nazwiska.

3. Dane techniczne z HTML, np. GTM/clickcease/iframe, są usuwane przed zapisem.

4. npm test jest uruchamiany w workflow przed refresh.

Opcjonalnie dopisz na końcu Instrukcja_odczytu_zrodel_Nekrolog.md sekcję:

Stan wdrożenia poprawek parserów

Wpisz tam:

- Karawan: dodany parser szczegółowy, usuwanie menu/technicznych śmieci, fallback nameFromSlug.
- Gabriel24/Grobonet/Podwawelskie: osobne parsery, bez aliasów do generic.
- Dębniki SDB: detail fetch i ostrożne traktowanie intencji.
- Daty: obsługa polskich miesięcy.
- Testy: osobne fixture dla źródeł.


CZĘŚĆ 13 — KRYTERIA AKCEPTACJI

Zadanie jest skończone dopiero, gdy:

1. parseKarawanNekrologi nie jest zwykłym aliasem do parseByListAndDetails.

2. parseKarawanDetailHtml nie używa całego body.text() jako podstawowego źródła name.

3. parseKarawanDetailHtml usuwa header/nav/footer/script/iframe/noscript przed analizą.

4. name nie może zawierać Główna/Nekrologi/Firma/W Służbie.

5. note/place nie mogą zawierać googletagmanager/clickcease/iframe/display:none/visibility:hidden.

6. Dla URL wladyslaw-stozek parser zwraca właściwą osobę albo fallback ze sluga, nigdy menu.

7. Dla URL elzbieta-rodecka parser zwraca właściwą osobę albo fallback ze sluga, nigdy menu.

8. Parser dat obsługuje polskie miesiące.

9. Dębniki SDB, jeśli ma requires_detail_fetch:true, faktycznie pobiera i analizuje podstrony.

10. Gabriel24, Karawan, Grobonet i Podwawelskie nie są tylko aliasami do jednego generycznego parsera.

11. Testy mają osobne fixture dla źródeł.

12. npm test przechodzi.

13. npm run refresh przechodzi.

14. .github/workflows/nekrolog-refresh.yml uruchamia npm test przed npm run refresh.

15. data/latest.json nie zawiera GłównaNekrologiFirmaW Służbie.

16. data/latest.json nie zawiera googletagmanager/clickcease/iframe w note albo place.

17. data/errors.json nie zawiera błędów dla obsłużonych parserów, chyba że strona realnie jest niedostępna.

18. Facebook pozostaje enabled:false.

19. Aplikacja nadal działa bez Firebase i bez backendu.


CZĘŚĆ 14 — FINALNA ODPOWIEDŹ CODEX

Po wykonaniu pracy podsumuj:

1. Jak naprawiono błąd Karawan.

2. Jakie selektory/kontenery są używane dla Karawan.

3. Czy rekordy wladyslaw-stozek i elzbieta-rodecka nie mają już nazwy GłównaNekrologiFirmaW Służbie.

4. Jak zabezpieczono parser przed menu/header/footer.

5. Jak usuwane są googletagmanager/clickcease/iframe.

6. Jak rozbudowano parser dat.

7. Jak poprawiono parsery Gabriel24/Grobonet/Podwawelskie/Dębniki/Św. Jadwiga.

8. Jakie testy dodano.

9. Wynik npm test.

10. Wynik npm run refresh.

11. Czy workflow uruchamia npm test przed refresh.

12. Czy data/latest.json jest czyste od błędnych nazw i technicznego HTML.
