# Analiza: brak wyświetlania danych zmarłych + ręczna weryfikacja źródeł

## Prompt użytkownika (kontekst)
> Przeanalizuj kod aplikacji. Nie wyświetlają się dane zmarłych. Jeżeli trzeba coś poprawić w Firebase to zapisz w Analizy.
> Przeczytaj linki jakie są podane jako źródło. Ręcznie przeczytaj wszystkie informacje o pogrzebach i zgonach. Sprawdź czy aplikacja poprawnie potrafi wyciągnąć dane.

## 1) Co sprawdziłem
- Kod frontu (`app.js`) odpowiedzialny za render list i wybór pól nazwiska (`resolveName`) oraz list (`pickRows`).
- Kod odświeżania (`scripts/refresh.mjs`) i parsery:
  - `parseZckFunerals`
  - `parseIntentionsPlus`
  - `parseGenericHtml`
- Aktualny stan Firestore przez REST API:
  - `Nekrolog_snapshots/latest`
  - `Nekrolog_refresh_jobs/latest`
  - `Nekrolog_config/sources`
- Ręczne odczytanie stron źródłowych (treści pogrzebów/zgonów, gdzie dostępne):
  - `https://www.zck-krakow.pl/funerals`
  - `https://www.ruczaj.diecezja.pl/index.php/aktualnosci/intencje-mszalne`
  - `https://jp2nowyruczaj.pl/informacje-o-parafii/intencje-mszalne/`
  - `https://debniki.sdb.org.pl/kontakt/`
  - `https://klepsydrakrakow.grobonet.com/` (+ sprawdzony `.../nekrologi.php`)

## 2) Główna przyczyna widoku „(brak nazwiska)”
W `Nekrolog_snapshots/latest` znajdują się rekordy z pustymi polami (`name`, `date`, `source_name`, `note`, `source_url` = `""`) oraz liczniki ustawione na `1`.
To powoduje, że front renderuje „wpis” bez danych i dla nazwy pokazuje fallback `(brak nazwiska)`.

Dodatkowo w `Nekrolog_refresh_jobs/latest` status jest `error`, a `error_message` = `HTTP 404`, więc ostatnie odświeżenie nie nadpisało snapshotu poprawnymi danymi.

## 3) Ręczna weryfikacja źródeł i zdolności parserów

### 3.1 ZCK Kraków – porządek pogrzebów
URL: `https://www.zck-krakow.pl/funerals`

Ręcznie odczytana strona zawiera realne wpisy pogrzebów (np. dla dnia `2026-02-16`):
- 9:40 — Jacek Balcerski (Cmentarz Rakowicki)
- 10:20 — Władysława Iwanek (Cmentarz Rakowicki)
- 11:00 — Anna Kuczma (Cmentarz Rakowicki)
- 11:00 — Helena Popoiołek (Cmentarz Rakowicki)
- 11:40 — Marian Zuber (Cmentarz Rakowicki)
- 12:00 — Jan Pietrzyk (Cmentarz Rakowicki)
- 12:20 — Jolanta Śliwa (Cmentarz Rakowicki)
- 13:00 — Maria Styczeń (Cmentarz Rakowicki)
- 13:00 — Artur Kohut (Cmentarz Rakowicki)
- 13:40 — Romana Kończakowska (Cmentarz Rakowicki)
- 10:00 — Marcin Grzybek (Cmentarz Podgórski)
- 11:00 — Krystyna Gajda (Cmentarz Podgórski)
- 12:00 — Tomasz Sobkowiak (Cmentarz Podgórski)
- 14:00 — Marianna Lachowska (Cmentarz Maki Czerwone)
- 10:20 — Małgorzata Wieczorek (Cmentarz Grębałów)
- 11:00 — Zofia Kniżatko (Cmentarz Grębałów)
- 11:40 — Józef Brudz (Cmentarz Grębałów)
- 12:20 — Alicja Skiba (Cmentarz Grębałów)
- 13:00 — Wiesława Dziedzic (Cmentarz Grębałów)
- 13:40 — Jolanta Obek-Pacyga (Cmentarz Grębałów)
- 10:00 — Yasmin Zaki (Cmentarz Komunalny w Podgórkach Tynieckich)

**Wniosek parsera:** obecny parser `parseZckFunerals` oczekuje formatu z przecinkami (`"10:00, Kaplica, Jan Kowalski"`), ale strona ma format bez przecinków (`"10:00 Kaplica Jan Kowalski (lat ...)"`).
Skutek: parser zwraca 0 albo skrajnie mało rekordów.

### 3.2 Parafia Ruczaj – intencje
URL: `https://www.ruczaj.diecezja.pl/index.php/aktualnosci/intencje-mszalne`

Na stronie są liczne wpisy ze znakami `+`/`++` (wzmianki o zmarłych), np. `+Zofia Denik`, `+Stanisław Nosalski`, `+Alina Gryglewska`, `+Wojciech Szymczak` itd.

**Wniosek parsera:** `parseIntentionsPlus` najpierw robi `clean($('body').text())`, co usuwa podziały linii, a dopiero potem robi `split(/\n/)`.
Skutek: praktycznie cały dokument staje się jedną „linią”, parser generuje 1 bardzo zanieczyszczony wpis zamiast wielu konkretnych nazwisk.

### 3.3 Parafia JP2 Nowy Ruczaj – intencje
URL: `https://jp2nowyruczaj.pl/informacje-o-parafii/intencje-mszalne/`

Na stronie również jest dużo wpisów `+` (np. `+ Kazimiera Prokocka`, `+ Maria Jakima`, `+ Zofia Dębska`, `+ Włodzimierz Rynkar`, `+ Maria Kaleta`, `+ Wojciech Roczkowski`, `+ Marcin Jurek` itd.).

**Wniosek parsera:** ten sam problem jak wyżej — parser linii `+` jest logicznie uszkodzony przez wcześniejsze „spłaszczenie” białych znaków.

### 3.4 Dębniki
URL (w Firebase): `https://debniki.sdb.org.pl/kontakt/`

Odpowiedź HTTP: `403` (strona blokowana przez ochronę/Cloudflare).

**Wniosek parsera:** dla tego źródła parser regularnie będzie zwracał błąd HTTP.

### 3.5 Klepsydra / Grobonet Podgórki Tynieckie
URL (w Firebase): `https://klepsydrakrakow.grobonet.com/`

Pod URL głównym brak listy nekrologów w treści. Jest odnośnik `nekrologi.php`.
`https://klepsydrakrakow.grobonet.com/nekrologi.php` ładuje stronę „Nekrologi”, ale bez łatwo dostępnej listy wpisów w statycznym HTML (najpewniej inny przepływ nawigacji / dynamiczne ładowanie / formularze).

**Wniosek parsera:** `parseGenericHtml` nie znajdzie tam danych po samym root URL.

## 4) Czy aplikacja poprawnie wyciąga dane?
Krótko: **nie** (obecnie niepoprawnie).

Powody:
1. Snapshot w Firebase ma „puste” rekordy, które front renderuje jako `(brak nazwiska)`.
2. Parser ZCK jest niedopasowany do obecnego formatu HTML (oczekuje przecinków, których już nie ma).
3. Parser `intencje_plus` ma błąd logiczny (utrata podziału linii przed detekcją wpisów `+`).
4. Co najmniej jedno źródło zwraca `403`, inne jest ustawione na URL, który nie zawiera bezpośrednio nekrologów.
5. Ostatni job odświeżania ma status `error` i `HTTP 404`.

## 5) Co poprawić w Firebase (zalecenia)

### 5.1 Natychmiastowe porządki danych
- W `Nekrolog_snapshots/latest` usunąć puste placeholdery i ustawić:
  - `deaths = []`
  - `funerals = []`
  - `recent_deaths = []`
  - `upcoming_funerals = []`
  - `deaths_count = 0`
  - `funerals_count = 0`
- Dopisać pole diagnostyczne `refresh_error` z ostatnim realnym błędem parsera, jeśli występuje.

### 5.2 Korekta źródeł w `Nekrolog_config/sources`
- Zmienić lub wyłączyć źródła problematyczne:
  - `par_debniki_contact` (`.../kontakt/`) — blokada `403` → `enabled: false` albo inne źródło bez blokady.
  - `podgorki_tynieckie_grobonet` — root URL nie daje nekrologów; testować `.../nekrologi.php` lub dedykowany parser.
- Zweryfikować, które źródło daje `HTTP 404` i poprawić URL/wyłączyć źródło.

### 5.3 Dodatkowa walidacja po stronie zapisu
- Przed zapisem snapshotu odfiltrowywać rekordy bez żadnej treści (`name`, `note`, `date*`, `source*`).
- Nie zapisywać „sztucznych” pustych rekordów jako elementów list.

## 6) Co poprawić w kodzie (poza samym Firebase)
1. `parseZckFunerals`: dodać regex pod obecny format tabel (`HH:MM Kaplica|Od bramy|Sala pożegnań Imię Nazwisko (lat N)`).
2. `parseIntentionsPlus`: najpierw pobrać tekst z zachowaniem separatorów bloków/linii (np. `$('body').text('\n')`), dopiero potem `clean` per-linia.
3. Dla źródeł `generic_html` dodać parsery dedykowane tam, gdzie struktura jest stała (Grobonet, konkretne parafie), zamiast jednego ogólnego heurystycznego parsera zdań.
4. W UI rozważyć wyświetlenie `note` jako nazwy awaryjnej, kiedy `name` jest puste.

## 7) Podsumowanie
- Problem „brak danych zmarłych” nie wynika z samego frontu, tylko głównie z jakości danych w snapshotcie + niedopasowanych parserów i problematycznych URL-i źródeł.
- Firebase wymaga korekty danych snapshotu oraz listy źródeł (w szczególności URL-i dających 403/404 i URL-i bez realnych wpisów nekrologów).
