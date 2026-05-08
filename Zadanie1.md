ZADANIE DLA CODEX — WDROŻENIE POPRAWEK PARSERÓW NA PODSTAWIE Instrukcja_odczytu_zrodel_Nekrolog.md

Repozytorium: CuteLittleGoat/Nekrolog

Cel:
W repo znajduje się plik Instrukcja_odczytu_zrodel_Nekrolog.md. Przeczytaj go bardzo dokładnie i na jego podstawie popraw parsery aplikacji „Nekrolog”, tak aby aplikacja przestała opierać wyniki prawie wyłącznie na źródle „PUK Kraków – Pożegnaliśmy”.

Obecny stan:
Aplikacja działa już w modelu statycznym:
config/sources.json
→ scripts/refresh_static.mjs
→ parsery z scripts/nekrolog_core.mjs
→ data/latest.json, data/job.json, data/errors.json
→ frontend GitHub Pages

Nie przywracaj Firebase.
Nie dodawaj backendu.
Nie dodawaj Playwright/Puppeteer.
Nie dodawaj OCR jako obowiązkowego etapu.
Nie dodawaj logowania ani obchodzenia zabezpieczeń.
Nie przywracaj przycisku „Odśwież”.
Nie zmieniaj głównej architektury statycznej.

Najważniejszy problem:
W scripts/nekrolog_core.mjs realnie działają obecnie tylko:
- parseZckFunerals / parseZckFuneralsHtml dla type: "zck_funerals",
- specjalny parser PUK ukryty w parseGenericHtml dla source.id === "puk_pozegnalismy",
- parseIntentionsPlus, ale żadne źródło z config/sources.json nie używa obecnie typu intencje_plus.

Dla pozostałych źródeł type: "generic_html" obecny kod zwraca pustą listę bez błędu. To jest złe, bo brak błędu nie oznacza, że parser działa.

ZADANIE GŁÓWNE

Na podstawie Instrukcja_odczytu_zrodel_Nekrolog.md:
1. Dodać parsery specyficzne dla źródeł.
2. Zmienić type w config/sources.json na typy specyficzne.
3. Poprawić dispatcher w scripts/refresh_static.mjs albo dodać parseSource(source) w scripts/nekrolog_core.mjs.
4. Dodać testy parserów na fixture HTML.
5. Uruchomić npm test.
6. Uruchomić npm run refresh.
7. Sprawdzić, czy data/latest.json zawiera wpisy również z innych źródeł niż PUK, jeżeli źródła publicznie udostępniają aktualne wpisy.

CZĘŚĆ 1 — PRZECZYTAJ PLIKI

Najpierw przeczytaj:

Instrukcja_odczytu_zrodel_Nekrolog.md
config/sources.json
scripts/refresh_static.mjs
scripts/nekrolog_core.mjs
scripts/fetch.mjs
scripts/date.mjs
scripts/normalize.mjs
tests/refresh.parsers.test.mjs
data/latest.json
data/job.json
data/errors.json
package.json
README.md

Instrukcja_odczytu_zrodel_Nekrolog.md jest dokumentem nadrzędnym dla tej pracy. To ona opisuje, gdzie dokładnie na stronach źródłowych znajdują się dane i jak należy je mapować.

CZĘŚĆ 2 — ZASADY OGÓLNE DLA PARSERÓW

Wszystkie parsery mają zwracać obiekt:

{
  rows: [...],
  error: null albo string
}

Każdy rekord w rows ma mieć możliwie pełną strukturę:

{
  kind: "death" albo "funeral",
  name: "Imię Nazwisko",
  date_death: "YYYY-MM-DD" albo null,
  date_funeral: "YYYY-MM-DD" albo null,
  time_funeral: "HH:MM" albo null,
  place: "miejsce/cmentarz/parafia/kaplica" albo null,
  source_id: source.id,
  source_name: source.name,
  url: "bezpośredni link do wpisu albo strona źródła",
  source_url: source.url,
  note: "krótka informacja dodatkowa" albo null
}

Nie dodawaj priority_hit w parserach. priority_hit jest wyliczany później w refresh_static.mjs na podstawie HELENA_GAWIN_PHRASES.

Parser powinien zwracać error tylko wtedy, gdy:
- pobranie strony się nie udało,
- źródło aktywne nie ma zaimplementowanego parsera,
- struktura strony ewidentnie nie pasuje do oczekiwanej i parser nie jest w stanie jej obsłużyć.

Parser nie powinien zwracać error, gdy:
- strona działa,
- parser ją przeanalizował,
- ale aktualnie nie ma wpisów.

W takim przypadku:
{
  rows: [],
  error: null
}

CZĘŚĆ 3 — DODAJ WSPÓLNE HELPERY W scripts/nekrolog_core.mjs

Dodaj lub popraw helpery:

clean(value)
absoluteUrl(baseUrl, href)
stripHtmlNoise(text)
parseTime(text)
parsePolishDate(text, fallbackYear)
parseIsoOrPolishDate(text)
normalizeDateToISO(date)
normalizeName(text)
compactNote(parts)
collectTextLines($, rootSelector)
uniqueRows(rows)
extractDetailLinks($, source, options)
fetchDetailsSequentially(urls, limit)

Wymagania:

1. parseTime(text)
Ma rozpoznawać:
- 8:00
- 08:00
- godz. 8.00
- godzina 8:00
- o 8:00

Zwracaj zawsze HH:MM.

2. parsePolishDate(text)
Ma rozpoznawać co najmniej:
- YYYY-MM-DD
- DD.MM.YYYY
- DD-MM-YYYY
- DD/MM/YYYY
- 8 maja 2026
- 8 maj 2026
- 08 maja 2026
- 8 V 2026, jeśli łatwo dodać

Obsłuż polskie miesiące:
stycznia, styczeń
lutego, luty
marca, marzec
kwietnia, kwiecień
maja, maj
czerwca, czerwiec
lipca, lipiec
sierpnia, sierpień
września, wrzesień
października, październik
listopada, listopad
grudnia, grudzień

Zwracaj YYYY-MM-DD albo null.

3. normalizeName(text)
Ma usuwać:
- śp.
- Ś.P.
- + na początku
- † na początku
- nadmiarowe spacje
- teksty typu „lat 80”, „przeżywszy 80 lat”, jeśli są doklejone do nazwiska

Nie usuwaj członów nazwiska z myślnikiem.

4. absoluteUrl(baseUrl, href)
Ma obsługiwać linki względne.

5. uniqueRows(rows)
Dedup po kluczu:
source_id + name + date_funeral + time_funeral + date_death + url

Jeżeli url jest pusty, dedup po:
source_id + name + date_funeral + time_funeral + date_death

CZĘŚĆ 4 — ZMIEŃ ARCHITEKTURĘ WYBORU PARSERA

Preferowane rozwiązanie:
Dodaj w scripts/nekrolog_core.mjs funkcję:

async function parseSource(source) {
  switch (source.type) {
    case "zck_funerals":
      return parseZckFunerals(source);
    case "puk_pozegnalismy":
      return parsePukPozegnalismy(source);
    case "gabriel24_nekrologi":
      return parseGabriel24Nekrologi(source);
    case "karawan_nekrologi":
      return parseKarawanNekrologi(source);
    case "grobonet_nekrologi":
      return parseGrobonetNekrologi(source);
    case "podwawelskie_nekrologi":
      return parsePodwawelskieNekrologi(source);
    case "debniki_sdb_pogrzeby":
      return parseDebnikiSdbPogrzeby(source);
    case "sw_jadwiga_pogrzebowe":
      return parseSwJadwigaPogrzebowe(source);
    case "intencje_plus":
      return parseIntentionsPlus(source);
    case "generic_html":
      return parseGenericHtml(source);
    default:
      return { rows: [], error: `Nieznany parser type=${source.type}` };
  }
}

Następnie w scripts/refresh_static.mjs zamień obecny blok:

if (s.type === 'zck_funerals') ...
else if ...
else ...

na:

parsed = await parseSource(s);

Dzięki temu wybór parserów będzie utrzymywany w jednym miejscu.

Ważne:
generic_html nie może już udawać, że obsługuje wszystkie strony.
Jeżeli zostaje generic_html, to:
- może obsługiwać tylko naprawdę generyczne przypadki,
- albo powinien zwracać błąd typu „Brak parsera specyficznego dla source_id=...”, gdy source.id nie jest obsługiwany.

CZĘŚĆ 5 — ZMIEŃ config/sources.json

Zmień typy źródeł z generic_html na typy specyficzne.

Docelowo:

zck_funerals:
type: "zck_funerals"
enabled: true
dodaj:
list_url: "https://www.zck-krakow.pl/funerals"
requires_detail_fetch: false
requires_ocr: false
requires_pdf: false

puk_pozegnalismy:
type: "puk_pozegnalismy"
enabled: true
dodaj:
list_url: "https://www.puk.krakow.pl/pozegnalismy/"
requires_detail_fetch: true
requires_ocr: false
requires_pdf: false

gabriel_nekrologi:
type: "gabriel24_nekrologi"
enabled: true
dodaj:
list_url: "https://www.gabriel24.pl/nekrologi/"
requires_detail_fetch: true
requires_ocr: false
requires_pdf: false
max_detail_pages: 50

karawan_nekrologi:
type: "karawan_nekrologi"
enabled: true
dodaj:
list_url: "https://karawan.pl/nekrologi/"
requires_detail_fetch: true
requires_ocr: false
requires_pdf: false
max_detail_pages: 50

salwator_grobonet:
type: "grobonet_nekrologi"
enabled: true
dodaj:
list_url: "https://krakowsalwator.grobonet.com/nekrologi.php"
base_url: "https://krakowsalwator.grobonet.com/"
requires_detail_fetch: true
requires_ocr: false
requires_pdf: false
max_detail_pages: 50

debniki_sdb:
type: "debniki_sdb_pogrzeby"
enabled: true
dodaj:
list_url: "https://debniki.sdb.org.pl/"
requires_detail_fetch: true
requires_ocr: false
requires_pdf: false
max_detail_pages: 30

podwawelskie_nekrologi:
type: "podwawelskie_nekrologi"
enabled: true
dodaj:
list_url: "https://www.podwawelskie.pl/aktualnosci/nekrologi.html"
requires_detail_fetch: true
requires_ocr: false
requires_pdf: false
max_detail_pages: 50

sw_jadwiga_pogrzebowe:
type: "sw_jadwiga_pogrzebowe"
enabled: true
dodaj:
list_url: "https://swietajadwiga.diecezja.pl/parafia/msze-swiete-pogrzebowe"
requires_detail_fetch: false
requires_ocr: false
requires_pdf: false

facebook_parafia_debniki:
type: "generic_html"
enabled: false
zostaw disabled. Nie implementuj parsera Facebooka.

Zaktualizuj też REQUIRED_SOURCES w scripts/nekrolog_core.mjs, żeby domyślne typy i enabled były zgodne z config/sources.json.
Szczególnie:
facebook_parafia_debniki musi mieć enabled: false również w REQUIRED_SOURCES, żeby odtworzenie configu nie włączyło Facebooka.

CZĘŚĆ 6 — PARSER ZCK

Popraw parseZckFuneralsHtml.

Wnioski z Instrukcja_odczytu_zrodel_Nekrolog.md:
- ZCK to źródło kind: "funeral".
- Dane są widoczne jako tekst HTML.
- Nie ma podstron szczegółowych.
- Lista jest logicznie: data dnia, cmentarz, godzina, kaplica/miejsce, imię i nazwisko.
- Obecny parser za bardzo zakłada, że godzina, miejsce i nazwisko są dokładnie w kolejnych elementach.
- Dodaj fallback daty: jeżeli na stronie nie ma daty, użyj dzisiejszej daty lokalnej jako date_funeral i dopisz w note, że data pochodzi z fallbacku.

Wymagania:
1. Parser ma zbierać linie tekstowe z body.
2. Ma śledzić currentDate i currentCemetery.
3. Ma rozpoznawać godziny w linii.
4. Ma obsługiwać warianty:
   - godzina w osobnej linii, miejsce w następnej, nazwisko w kolejnej,
   - godzina, miejsce i nazwisko w jednej linii,
   - godzina i miejsce w jednej linii, nazwisko w następnej.
5. place ma łączyć miejsce/kaplicę z cmentarzem.
6. date_death zawsze null.
7. source_url ma być ustawione.
8. note może zawierać surowy fragment, np. "ZCK: <cmentarz>, <kaplica>".

Dodaj test fixture dla ZCK, obejmujący co najmniej:
- układ trzy-liniowy,
- układ jednowierszowy,
- brak daty na stronie i fallback do dzisiejszej daty.

CZĘŚĆ 7 — PARSER PUK

Obecny parser PUK działa najlepiej, ale jest schowany w parseGenericHtml.
Wydziel go do osobnych funkcji:

parsePukPozegnalismy(source)
parsePukPozegnalismyHtml(text, source)

Wymagania:
1. Zachowaj obecnie działającą logikę.
2. Nie pogorsz danych w data/latest.json.
3. Rekordy PUK powinny mieć:
   kind: "death"
   name
   date_death
   date_funeral
   time_funeral
   place
   source_id
   source_name
   url
   source_url
   note
4. Jeżeli obecny parser potrafi pobrać linki do nekrolog.eklepsydra.pl, zachowaj to.
5. Zmień source type na "puk_pozegnalismy".
6. parseGenericHtml nie powinien już mieć specjalnego if dla PUK albo powinien delegować do parsePukPozegnalismy.

Dodaj test fixture PUK z przykładowym wpisem w strukturze podobnej do obecnego data/latest.json.

CZĘŚĆ 8 — PARSER GABRIEL24

Dodaj:

parseGabriel24Nekrologi(source)
parseGabriel24NekrologiHtml(text, source)
parseGabriel24DetailHtml(text, source, detailUrl)

Wnioski z instrukcji:
- Gabriel24 może mieć listę nekrologów i podstrony szczegółowe.
- Część danych może być graficzna.
- Nie zakładaj OCR.
- Pobieraj tekst z listy i szczegółów.
- Jeżeli dane są tylko w obrazie, użyj tylko tekstowych metadanych dostępnych w HTML: tytuł, alt, podpis, nazwa linku, opis.

Minimalny algorytm:
1. Pobierz list_url.
2. Znajdź linki do wpisów/nekrologów.
3. Użyj absoluteUrl.
4. Ogranicz liczbę szczegółów do source.max_detail_pages albo 50.
5. Pobierz szczegóły.
6. Dla każdego szczegółu:
   - name z tytułu, nagłówka, alt obrazka albo tekstu linku,
   - date_death z tekstu typu „zmarł/zmarła dnia ...”,
   - date_funeral z tekstu typu „pogrzeb/uroczystości pogrzebowe odbędą się ...”,
   - time_funeral z tekstu,
   - place z tekstu przy „cmentarz”, „kaplica”, „kościół”,
   - note jako krótki wycinek tekstu źródłowego.
7. Jeżeli znajdziesz tylko nazwisko i brak dat, możesz zwrócić rekord death z datami null tylko wtedy, gdy wpis jednoznacznie jest nekrologiem. Taki rekord nie trafi do recent_deaths bez daty, chyba że note zostanie uznane przez refresh_static. Unikaj śmieciowych rekordów.

Dodaj testy:
- lista z linkami do szczegółów,
- szczegół tekstowy z datą śmierci i datą pogrzebu,
- szczegół z obrazem i alt, bez OCR.

CZĘŚĆ 9 — PARSER KARAWAN

Dodaj:

parseKarawanNekrologi(source)
parseKarawanNekrologiHtml(text, source)
parseKarawanDetailHtml(text, source, detailUrl)

Wnioski:
- Źródło wymaga parsera specyficznego.
- Spodziewany model: lista/karty nekrologów plus podstrony szczegółowe.
- Nie zakładaj, że wszystko jest na liście.
- Pobieraj szczegóły, jeśli są linki.

Minimalny algorytm:
1. Pobierz list_url.
2. Znajdź linki do nekrologów.
3. Odfiltruj linki spoza domeny i linki techniczne.
4. Pobierz szczegóły.
5. Ekstrahuj name, date_death, date_funeral, time_funeral, place, note.
6. kind zwykle "death", chyba że strona podaje wyłącznie termin ceremonii bez daty zgonu — wtedy można użyć "funeral".
7. Dedup.

Dodaj testy na fixture listy i szczegółu.

CZĘŚĆ 10 — PARSER GROBONET / SALWATOR

Dodaj:

parseGrobonetNekrologi(source)
parseGrobonetNekrologiHtml(text, source)
parseGrobonetDetailHtml(text, source, detailUrl)

Wnioski:
- Kraków Salwator używa Grobonet.
- Grobonet może mieć powtarzalny schemat, więc parser powinien być możliwie ogólny dla stron typu nekrologi.php.
- Lista może być paginowana.
- Szczegóły mogą być na osobnych linkach.
- Dane mogą zawierać tekst i/lub grafikę.
- Bez OCR.

Minimalny algorytm:
1. Pobierz list_url, np. nekrologi.php.
2. Znajdź linki do szczegółów:
   - href zawierające nekrolog,
   - href zawierające id,
   - href prowadzące do szczegółu wpisu,
   - zgodnie z tym, co opisuje Instrukcja_odczytu_zrodel_Nekrolog.md.
3. Obsłuż linki względne.
4. Pobierz szczegóły, limit max_detail_pages.
5. Z detalu wyciągnij:
   - name z nagłówka, tytułu, alt obrazka, podpisu albo kluczowego tekstu,
   - date_death,
   - date_funeral,
   - time_funeral,
   - place,
   - note.
6. Jeżeli lista ma wystarczające dane bez detalu, też je wykorzystaj.
7. Nie pobieraj obrazów i nie wykonuj OCR.
8. Jeżeli daty są tylko na grafice, rekord może być częściowy albo pominięty, zgodnie z instrukcją.

Dodaj testy:
- lista Grobonet z linkiem szczegółowym,
- szczegół tekstowy,
- szczegół z obrazkiem alt.

CZĘŚĆ 11 — PARSER PODWAWELSKIE

Dodaj:

parsePodwawelskieNekrologi(source)
parsePodwawelskieNekrologiHtml(text, source)
parsePodwawelskieDetailHtml(text, source, detailUrl)

Wnioski:
- Źródło jest stroną aktualności/nekrologów.
- Nekrologi mogą być artykułami.
- Data publikacji artykułu nie jest automatycznie datą zgonu ani pogrzebu.
- Trzeba wejść w artykuł, jeżeli lista zawiera tylko tytuł.

Minimalny algorytm:
1. Pobierz list_url.
2. Znajdź linki do artykułów nekrologicznych.
3. Preferuj linki/tytuły zawierające:
   - nekrolog,
   - zmarł,
   - zmarła,
   - śp,
   - pogrzeb.
4. Pobierz szczegóły.
5. W szczególe:
   - name z tytułu lub pierwszych akapitów,
   - date_death tylko jeśli jest jawnie podana jako data zgonu,
   - date_funeral tylko jeśli jest jawnie podana jako data pogrzebu/uroczystości,
   - time_funeral z tekstu,
   - place z tekstu przy cmentarz/kaplica/kościół,
   - note jako krótki fragment.
6. Nie używaj daty publikacji jako date_death ani date_funeral, chyba że tekst wyraźnie mówi, że to data pogrzebu lub zgonu.

Dodaj testy:
- lista artykułów,
- artykuł z datą publikacji i osobną datą pogrzebu,
- test potwierdzający, że data publikacji nie trafia automatycznie do date_death/date_funeral.

CZĘŚĆ 12 — PARSER PARAFIA DĘBNIKI SDB

Dodaj:

parseDebnikiSdbPogrzeby(source)
parseDebnikiSdbPogrzebyHtml(text, source)
parseDebnikiSdbDetailHtml(text, source, detailUrl)

Wnioski:
- To źródło jest ryzykowne.
- Parafia może publikować informacje w aktualnościach, ogłoszeniach, intencjach albo PDF-ach.
- Nie traktuj każdej intencji mszalnej jako zgon.
- Źródło ma dawać wpis tylko wtedy, gdy tekst wyraźnie mówi o pogrzebie, zmarłym/zmarłej albo mszy pogrzebowej.

Minimalny algorytm:
1. Pobierz stronę główną.
2. Znajdź linki do podstron/artykułów, które wyglądają na:
   - aktualności,
   - ogłoszenia,
   - pogrzeb,
   - zmarł/zmarła,
   - śp,
   - intencje, ale tylko jeśli instrukcja wskazuje, że są tam msze pogrzebowe.
3. Pobierz ograniczoną liczbę szczegółów, max_detail_pages.
4. Przetwarzaj tylko tekst HTML.
5. Pomijaj PDF-y, chyba że są łatwo linkowane — wtedy zapisz informację w note lub warning, ale nie dodawaj parsera PDF.
6. Rekord twórz tylko, gdy tekst zawiera jasne słowa:
   - pogrzeb,
   - uroczystości pogrzebowe,
   - msza święta pogrzebowa,
   - zmarł,
   - zmarła,
   - śp.
7. Jeżeli tekst jest tylko intencją typu „+ Jan Kowalski”, nie twórz death. Można utworzyć funeral tylko wtedy, gdy kontekst mówi „msza pogrzebowa” albo „pogrzeb”.
8. Jeżeli brak aktualnych wpisów, zwróć rows: [], error: null.

Dodaj testy:
- tekst z prawdziwym pogrzebem,
- tekst intencji „+ Jan Kowalski” bez pogrzebu — ma zostać pominięty,
- tekst mszy pogrzebowej — ma dać kind: "funeral".

CZĘŚĆ 13 — PARSER PARAFIA ŚW. JADWIGI

Dodaj:

parseSwJadwigaPogrzebowe(source)
parseSwJadwigaPogrzeboweHtml(text, source)

Wnioski:
- To źródło dotyczy mszy świętych pogrzebowych.
- Dane należy traktować jako kind: "funeral", nie "death".
- Nie wpisuj date_death, chyba że strona jawnie podaje datę śmierci.
- Strona prawdopodobnie zawiera listę/tabelę mszy pogrzebowych z datą, godziną i nazwiskiem.

Minimalny algorytm:
1. Pobierz list_url.
2. Zbierz linie albo wiersze tabel/list.
3. Dla każdego wpisu:
   - name z tekstu zmarłego/zmarłej,
   - date_funeral z daty mszy/pogrzebu,
   - time_funeral z godziny,
   - place: source.name albo konkretne miejsce, jeśli podane,
   - kind: "funeral",
   - note: "Msza święta pogrzebowa: <krótki tekst>".
4. Nie twórz death.
5. Pomijaj zwykłe intencje bez słów pogrzeb/msza pogrzebowa, jeśli występują.

Dodaj testy:
- tabela z datą, godziną i nazwiskiem,
- lista tekstowa,
- intencja bez pogrzebu pominięta.

CZĘŚĆ 14 — PARSER GABRIEL / KARAWAN / GROBONET / PODWAWELSKIE A OBRAZY

Nie dodawaj OCR.

Jeżeli dane są tylko na grafice:
1. Spróbuj odczytać:
   - alt obrazka,
   - title,
   - podpis,
   - nazwę pliku,
   - nagłówek strony,
   - tekst obok obrazka.
2. Jeżeli z tych danych da się ustalić nazwisko i daty, zbuduj rekord.
3. Jeżeli nie da się ustalić dat, nie zgaduj.
4. W note można zapisać:
   "Dane częściowe; pełna treść prawdopodobnie w grafice."
5. Nie pobieraj obrazów i nie wykonuj OCR.

CZĘŚĆ 15 — PAGINACJA I DETAIL FETCH

Dla źródeł z podstronami szczegółowymi:
- pobieraj tylko pierwszą stronę listy, chyba że Instrukcja_odczytu_zrodel_Nekrolog.md wskazuje stabilny mechanizm paginacji,
- jeżeli paginacja jest prosta i stabilna, można pobrać 2–3 pierwsze strony,
- nie rób nieskończonych pętli,
- limituj liczbę detali przez source.max_detail_pages,
- domyślny limit: 50,
- pobieraj sekwencyjnie lub z bardzo małą równoległością,
- nie przeciążaj stron.

CZĘŚĆ 16 — REFRESH_STATIC

W scripts/refresh_static.mjs:

1. Importuj parseSource zamiast pojedynczych parserów, jeśli dodasz parseSource.
2. W pętli po źródłach używaj:
   parsed = await parseSource(s)
3. Zachowaj istniejące okna czasowe:
   - zgony: dziś -7 dni do dziś,
   - pogrzeby: dziś do dziś +7 dni.
4. Zachowaj source_errors.
5. Zachowaj priority_hit.
6. Zachowaj zapis:
   - data/latest.json
   - data/job.json
   - data/errors.json
7. Zachowaj sourceLite z mergedSources, nie z enabled, żeby źródła disabled były widoczne w frontendzie.
8. Upewnij się, że source_errors nie zawiera błędów dla źródeł disabled.

CZĘŚĆ 17 — TESTY

Rozbuduj tests/refresh.parsers.test.mjs albo dodaj nowe pliki testowe.

Nie dodawaj testów zależnych od internetu.

Dodaj katalogi/fixtures, jeśli potrzeba:
tests/fixtures/zck_sample.html
tests/fixtures/puk_sample.html
tests/fixtures/gabriel24_list.html
tests/fixtures/gabriel24_detail.html
tests/fixtures/karawan_list.html
tests/fixtures/karawan_detail.html
tests/fixtures/grobonet_list.html
tests/fixtures/grobonet_detail.html
tests/fixtures/podwawelskie_list.html
tests/fixtures/podwawelskie_detail.html
tests/fixtures/debniki_sdb_sample.html
tests/fixtures/sw_jadwiga_pogrzebowe_sample.html

Fixture mogą być krótkimi, realistycznymi fragmentami HTML zgodnymi ze strukturą opisaną w Instrukcja_odczytu_zrodel_Nekrolog.md. Jeżeli pobierasz realny HTML publicznej strony, skróć go do minimalnego fragmentu potrzebnego do testu.

Testy powinny sprawdzać:

1. ZCK:
- układ godzina/miejsce/nazwisko,
- date_funeral,
- time_funeral,
- place,
- kind: funeral.

2. PUK:
- date_death,
- date_funeral,
- time_funeral,
- url szczegółu,
- kind: death.

3. Gabriel24:
- lista → link szczegółu,
- szczegół → rekord,
- brak OCR.

4. Karawan:
- lista → link szczegółu,
- szczegół → rekord.

5. Grobonet:
- lista → link szczegółu,
- szczegół → rekord.

6. Podwawelskie:
- data publikacji nie jest automatycznie date_death/date_funeral,
- jawna data pogrzebu jest odczytywana.

7. Dębniki SDB:
- zwykła intencja „+ Jan Kowalski” bez kontekstu pogrzebu jest pomijana,
- msza pogrzebowa daje kind: funeral.

8. Św. Jadwiga:
- msza pogrzebowa daje kind: funeral,
- name/date/time są odczytane.

9. Dispatcher:
- parseSource wybiera poprawny parser dla każdego type.

10. Generic:
- generic_html nie ukrywa braku parsera dla aktywnego nieobsługiwanego źródła.

Uruchom:
npm test

CZĘŚĆ 18 — URUCHOM REFRESH I SPRAWDŹ WYNIKI

Po testach uruchom:

npm run refresh

Następnie sprawdź:

data/latest.json
data/job.json
data/errors.json

W data/latest.json sprawdź:
1. Czy są zachowane pola:
   generated_at
   updated_at
   deaths
   funerals
   recent_deaths
   upcoming_funerals
   fallback_summary
   sources
   target_phrases
   source_errors
   refresh_error
   writer_name
   writer_version
   payload
   data

2. Czy sources zawiera wszystkie źródła, także facebook_parafia_debniki jako enabled:false.

3. Czy rows mają source_id i source_name.

4. Czy jeżeli są publiczne aktualne dane, pojawiają się source_id inne niż puk_pozegnalismy, np.:
   zck_funerals
   gabriel_nekrologi
   karawan_nekrologi
   salwator_grobonet
   podwawelskie_nekrologi
   debniki_sdb
   sw_jadwiga_pogrzebowe

5. Czy data/errors.json nie zawiera błędów typu:
   Nieznany parser type=...
   Brak parsera specyficznego...
dla źródeł, które miały zostać obsłużone.

6. Czy Facebook nie jest pobierany i nie generuje błędu.

CZĘŚĆ 19 — README I DOKUMENTACJA

Zaktualizuj README.md krótko:

1. Aplikacja używa parserów specyficznych dla źródeł.
2. Instrukcja źródeł jest w Instrukcja_odczytu_zrodel_Nekrolog.md.
3. Źródła graficzne są obsługiwane tylko częściowo bez OCR.
4. Facebook pozostaje disabled.
5. Lokalny test:
   npm test
6. Lokalny refresh:
   npm run refresh

Nie usuwaj Instrukcja_odczytu_zrodel_Nekrolog.md.

Opcjonalnie dopisz na końcu Instrukcja_odczytu_zrodel_Nekrolog.md sekcję „Stan wdrożenia parserów”, ale nie przepisuj całego dokumentu.

CZĘŚĆ 20 — RZECZY, KTÓRYCH NIE WOLNO ROBIĆ

Nie dodawaj Firebase.
Nie dodawaj Firestore.
Nie dodawaj Cloudflare/Vercel/Netlify proxy.
Nie dodawaj przycisku „Odśwież”.
Nie dodawaj sekretów.
Nie dodawaj tokenów.
Nie dodawaj logowania do Facebooka.
Nie obchodź zabezpieczeń antybotowych.
Nie dodawaj OCR jako obowiązkowej zależności.
Nie dodawaj Playwright/Puppeteer, chyba że użytkownik później wyraźnie o to poprosi.
Nie traktuj intencji mszalnych jako zgonów.
Nie używaj daty publikacji artykułu jako daty śmierci albo pogrzebu bez wyraźnego potwierdzenia w treści.
Nie zgaduj dat.
Nie generuj sztucznych rekordów.

CZĘŚĆ 21 — KRYTERIA AKCEPTACJI

Zadanie jest skończone dopiero, gdy:

1. Instrukcja_odczytu_zrodel_Nekrolog.md została przeczytana i wykorzystana.
2. config/sources.json ma typy specyficzne zamiast generic_html dla obsługiwanych źródeł.
3. REQUIRED_SOURCES w scripts/nekrolog_core.mjs jest zgodne z config/sources.json.
4. Facebook jest enabled:false w config i REQUIRED_SOURCES.
5. scripts/nekrolog_core.mjs zawiera parseSource(source).
6. scripts/refresh_static.mjs używa parseSource(source).
7. Istnieją parsery:
   parsePukPozegnalismy
   parseGabriel24Nekrologi
   parseKarawanNekrologi
   parseGrobonetNekrologi
   parsePodwawelskieNekrologi
   parseDebnikiSdbPogrzeby
   parseSwJadwigaPogrzebowe
   oraz poprawiony parseZckFunerals
8. parseGenericHtml nie maskuje już braku parserów dla aktywnych źródeł.
9. Dodano testy fixture dla nowych parserów.
10. npm test przechodzi.
11. npm run refresh działa.
12. data/latest.json zachowuje kompatybilną strukturę.
13. data/errors.json nie pokazuje „Nieznany parser type” dla obsługiwanych źródeł.
14. source_errors nie zawiera błędu Facebooka.
15. Jeżeli strony publicznie udostępniają aktualne dane, data/latest.json zawiera wpisy także z innych źródeł niż PUK.
16. README jest zaktualizowane.

CZĘŚĆ 22 — FINALNA ODPOWIEDŹ CODEX

Po wykonaniu pracy podsumuj:

1. Jakie pliki zmieniono.
2. Jakie parsery dodano.
3. Jakie typy źródeł ustawiono w config/sources.json.
4. Czy Facebook pozostał disabled.
5. Ile testów parserów dodano.
6. Wynik npm test.
7. Wynik npm run refresh.
8. Jakie source_id pojawiły się w data/latest.json po refreshu.
9. Jakie błędy, jeśli jakiekolwiek, pozostały w data/errors.json.
10. Czy aplikacja nadal działa bez Firebase i bez backendu.
