# Analiza: naprawa problematycznych źródeł i nowe legalne źródła informacji o zgonach i pogrzebach (ul. Kapelanka i Cmentarz Rakowicki)

Data analizy: 2026-10-27 (pomiary na żywo 06:00–07:15 UTC)
Temat analizy: Czy źródła, które przestały działać (Grobonet/Salwator, Dębniki, Facebook) albo działają częściowo, da się naprawić bez obchodzenia zabezpieczeń ustawionych przez właścicieli stron, oraz jakie inne darmowe i legalne źródła informacji o zgonach i pogrzebach są dostępne w okolicy ul. Kapelanka i Cmentarza Rakowickiego (grób Adama Gawina).
Stan repozytorium w chwili analizy: `main`, commit `3782be4` („Refresh Nekrolog data”, przebieg z 2026-10-26 23:03 UTC).

Analiza nawiązuje do wcześniejszych dokumentów w tym folderze: `analiza-status-done-with-errors-cloudflare-debniki.md` (blokada Dębnik, zasada nieobchodzenia zabezpieczeń), `analiza-done-with-errors-gabriel24-timeout-i-debniki-intencje.md` (sonda dostępu Dębnik), `analiza-done-with-errors-sw-jadwiga-zmiana-domeny.md` oraz `analiza-done-with-errors-grobonet-salwator-cloudflare.md` (blokada Grobonetu, próg 14 dni). Zgodnie z poleceniem użytkownika **nie zmieniono kodu aplikacji** — dokument zawiera wyłącznie ustalenia i propozycje.

---

## Najważniejsze w skrócie

1. **Grób Adama Gawina (27.12.1939 – 26.06.2012) jest na Cmentarzu Rakowickim: kwatera LXXIV, rząd 7, miejsce 11.** Potwierdza to oficjalny lokalizator grobów Zarządu Cmentarzy Komunalnych (ZCK). W tym samym grobie spoczywa Henryk Gawin (28.12.1911 – 27.06.1962). Na pozostałych 11 cmentarzach komunalnych i w bazie Salwatora Adama Gawina nie ma.
2. **Grobonet (Salwator) — nic więcej nie da się zrobić bez obchodzenia zabezpieczeń.** Cała strefa `grobonet.com` (także cmentarze w Mogile, Ruszczy i na Podgórkach Tynieckich) odpowiada Cloudflare Managed Challenge na każdy tor sieciowy. Legalna alternatywa dla grobów Salwatora nie istnieje. Ponieważ jednak grób Adama Gawina leży na cmentarzu **komunalnym**, kluczową część roli Grobonetu przejmuje lokalizator ZCK, który działa.
3. **Dębniki — jedyne legalne drogi to sonda z runnera, self-hosted runner albo zgoda parafii.** Blokada nadal zależy od reputacji adresu IP. Workflow „Dębniki – sonda dostępu” **nigdy nie został uruchomiony** (0 przebiegów), więc nie wiadomo, czy runnery GitHub Actions są dziś blokowane.
4. **Największy zysk leży w źródłach już używanych, czytanych dziś tylko w części:**
   - **ZCK publikuje porządek pogrzebów z wyprzedzeniem** (API kalendarza na stronie): na 28.10 są już 22 pogrzeby, w tym 7 na Rakowickim, a aplikacja czyta wyłącznie dzień bieżący (dziś 15, w tym 1 na Rakowickim). ZCK jest zarządcą Rakowickiego, więc jego porządek obejmuje **każdy** pochówek na tym cmentarzu, także gdy msza odbywa się w kościele parafialnym.
   - **Karawan** pokazuje na liście tylko pogrzeby nadchodzące i z ostatnich dwóch dni (dziś 1 nekrolog), a jego kanał RSS — 10 ostatnich nekrologów.
   - **„Podwawelskie” to strona parafii MB Fatimskiej na Os. Podwawelskim (0,4 km od Kapelanki).** Jej „Nekrologi” mają ok. 7 tygodni opóźnienia, ale cotygodniowe ogłoszenia podają na bieżąco „W minionym tygodniu pożegnaliśmy…”.
5. **Nowe legalne źródła w zakresie wskazanym przez użytkownika:** 8 parafii do 5 km od Kapelanki publikuje na bieżąco listy zmarłych parafian, kolejne podają intencje za zmarłych (to przywróciłoby pustą dziś kategorię „potrzeby”). Lokalizator ZCK pozwala obserwować grób na Rakowickim, a parafia MB Zwycięskiej udostępnia ewidencję grobów cmentarza w Borku Fałęckim (aktualizacja 26.10.2026, 9 pochówków osób o nazwisku Gawin).
6. **Prasa i portale ogólnopolskie odpadają z przyczyn prawnych:** Agora (nekrologi Wyborczej) zastrzega eksplorację tekstów i danych, Polska Press (Dziennik Polski, Gazeta Krakowska, nekrologi.net) zakazuje automatycznego pobierania bez zgody. eCmentarze (ecemetery.eu) blokuje odczyt automatyczny.
7. **Uwaga przed jakimkolwiek wdrożeniem:** w lokalizatorze ZCK są już **trzy historyczne wpisy pasujące do monitorowanej frazy** (Helena Gawin zm. 1979, Helena Gawin zm. 2003, Helena de Gawin-Niesłowska zm. 1994). Bezpośrednie podpięcie lokalizatora wywołałoby natychmiast fałszywy alarm na Discordzie — potrzebna jest lista bazowa.

---

## 1. Oryginalny pełny prompt użytkownika

```text
Zapoznaj się z repo "Nekrologi".
Zwróć uwagę na problemy, które były opisywane w folderze Analizy/

Zrób mi nową analizę. Chcę, żebyś sprawdził czy problemy ze źródłami da się jakoś naprawić ale bez obchodzenia zabezpieczeń ustawionych przez właścicieli stron/serwerów.
Poszukaj też innych źródeł - poszukaj gdzie w internecie (w tym środowisku masz pełen dostęp do internetu)  mogą być dostępne za darmo i legalnie informacje o zgonach i pogrzebach w Krakowie (w szczególności obszar ok 20km od ulicy Kapelanka).

Jeżeli nie da się nic zrobić z błędnymi źródłami oraz nie znajdziesz innych dostępnych źródeł w internecie to nie szukaj na siłę rozwiązania - napisz, że nic więcej się nie da zrobić.
```

Kolejne polecenia użytkownika przekazane w trakcie pracy (w kolejności otrzymania):

```text
Nie zmieniaj kodu aplikacji. Zrób tylko plik z analizą i wypchnij go na gałąź Main.
```

```text
20km to za dużo. Zawęźmy to do 5-10km.
```

```text
Możesz poszukać też grobu "Adam Gawin" 1939-12-27 - 2012-06-26 -> i skupić się na tym cmentarzu oraz parafiach i domach pogrzebowych, które tam chowają zmarłych.
```

```text
Jego grób jest najprawdopodobniej na Cmentarzu Rakowickim
```

```text
Cmentarz Rakowicki i ulica Kapelanki w Krakowie to dwa główne punkty od których należy zacząć poszukiwania źródeł. Zrób tak, że przeszukaj parafie w promieniu 5km od ulicy Kapelanka oraz domy pogrzebowe/ cmentarze itp w promieniu 10km od ulicy Kapelanka oraz cmentarza Rakowickiego.
```

```text
Pracuj na effort MAX + Ultracode.
```

---

## 2. Zakres analizy i metodyka

### 2.1. Punkty odniesienia i promienie (zakres ostateczny wg użytkownika)

| Punkt | Współrzędne | Uwagi |
|---|---|---|
| ul. Kapelanka | 50.0387 N, 19.9256 E | Osiedle Podwawelskie / Ludwinów / Zakrzówek, Dębniki (geokodowanie OpenStreetMap Nominatim) |
| Cmentarz Rakowicki | 50.0752 N, 19.9525 E | ul. Rakowicka 26; odległość od Kapelanki **4,5 km** |

- **Parafie:** do **5 km** od ul. Kapelanka.
- **Zakłady pogrzebowe, cmentarze itp.:** do **10 km** od ul. Kapelanka **lub** od Cmentarza Rakowickiego.

Pierwotny promień 20 km został w trakcie pracy zawężony. Obiekty sprawdzone wcześniej, a leżące poza ostatecznym zakresem (np. zakład w Niepołomicach), odnotowano tylko skrótowo.

### 2.2. Co uznajemy za obchodzenie zabezpieczeń

Zasada obowiązuje od analizy z 2026-08-20 i została potwierdzona w kolejnych analizach. Rozróżnienie zastosowane w tej analizie:

| Dozwolone (nie jest obchodzeniem) | Niedozwolone (jest obchodzeniem albo naruszeniem woli właściciela) |
|---|---|
| Odczyt stron publicznych z jawnym User-Agentem bota, w granicach `robots.txt` | Rozwiązywanie wyzwań Cloudflare / JS („Just a moment…”, „One moment, please…”) przeglądarką headless lub usługą „CAPTCHA solver” |
| Kanały udostępnione przez właściciela (RSS, mapa witryny, publiczne API strony, z którego korzysta jej własny interfejs) | Rotacja adresów IP, proxy rezydencjalne, podszywanie się pod odcisk TLS przeglądarki |
| Przepływ, który wykonuje każda przeglądarka: pobranie strony, tokenu CSRF i ciasteczka sesyjnego, a potem zapytanie, które wysyła sama strona | Szukanie niezabezpieczonych kopii, starych domen, aplikacji mobilnej lub nieudokumentowanego API po to, żeby ominąć blokadę |
| Zmiana punktu wyjścia ruchu na stały, uczciwie oznaczony (self-hosted runner) | Treści za logowaniem (Facebook) i treści, których automatyczne pobieranie wydawca wprost zastrzegł |

Dla porządku: token CSRF chroni użytkowników przed fałszowaniem żądań z cudzych stron. Nie jest kontrolą dostępu — strona wydaje go każdemu odwiedzającemu, również bez logowania.

### 2.3. Metodyka

- Odczyt `data/job.json`, `data/errors.json`, `data/source_health.json`, `data/latest.json`, `config/sources.json`, kodu `scripts/*.mjs`, workflow i wszystkich analiz w `Analizy/`.
- `npm test` → **64/64 pass** (stan bazowy).
- Sondowanie na żywo: `curl` przez proxy kontenera (adres wyjściowy 160.79.106.129) oraz warstwa `fetchText` projektu, czyli `node-fetch` bezpośrednio (adres GCP 136.114.177.226). Wyłącznie żądania odczytu z nagłówkiem `nekrolog-refresh-bot/1.0`, z odstępami 0,4–1,1 s między żądaniami do tego samego serwisu.
- Dla każdego źródła: `robots.txt`, regulamin lub nota prawna (jeśli istnieje), nagłówki serwera, obecność warstwy anty-botowej, struktura danych, aktualność.
- **Parafie:** katalog parafii Archidiecezji Krakowskiej (`diecezja.pl/parafie`, 543 wpisy), współrzędne z map na stronach katalogu (brakujące uzupełnione geokodowaniem adresu), odległość od Kapelanki. Następnie dla 30 parafii do 5 km: strona główna, a potem podstrony „Ogłoszenia”, „Intencje” i „Zmarli”.
- **Zakłady pogrzebowe:** katalogi funer.com.pl („Kraków, 20 km”, 65 wpisów), pozegnaj.pl (18), lista partnerów eKlepsydry z mapą, lista klientów e-nekrologi.com.
- **Cmentarze:** strony ZCK (porządek pogrzebów, lokalizator grobów), strony parafii zarządzających cmentarzami, wyszukiwarki Grobonet i eCmentarze.
- Geokodowanie: OpenStreetMap Nominatim, łącznie ok. 55 zapytań w odstępie 1,1 s, zgodnie z zasadami korzystania z usługi.

**Poza zakresem:** zmiany kodu, konfiguracji i danych (polecenie użytkownika), uruchamianie workflow w repozytorium, wysyłka powiadomień Discord, przebieg `npm run refresh` (nie był potrzebny, bo parsery testowano na pobranych stronach).

---

## 3. Stan wyjściowy (przebieg z 2026-10-26 23:03 UTC)

`status: done`, `sources_healthy: 6/7`, `sources_blocked: 1`, `rows_total: 206`, jedno ostrzeżenie (Grobonet, blokada trwa 7 dni).

| Źródło | Stan | Rekordy | Uwagi z tej analizy |
|---|---|---|---|
| ZCK – porządek pogrzebów | `ok` | 15 | tylko dzień bieżący (§5.6) |
| PUK – Pożegnaliśmy | `ok` | 78 (39 osób) | pogrzeby 30.09–29.10; karty bez daty zgonu (§5.7) |
| Gabriel24 | `ok` | 12 | zgony 07–19.09, publikacja partiami z ok. 4-tygodniowym opóźnieniem (§5.5) |
| Karawan | `ok` | 1 | lista pokazuje tylko część nekrologów (§5.4) |
| Salwator (Grobonet) | `blocked` (ostrzeżenie) | 0 | Cloudflare od 2026-10-19 (§5.1) |
| Podwawelskie | `ok` | 72 | najnowszy zgon 2026-09-07; to strona parafii MB Fatimskiej (§5.7) |
| św. Jadwiga (Krowodrza) | `ok` | 30 | najnowsze zgłoszenie 2026-10-24 |
| Dębniki (ogłoszenia i intencje) | wyłączone | — | Cloudflare, reputacja IP (§5.2) |
| Facebook – Dębniki | wyłączone | — | wymaga logowania (§5.3) |

---

## 4. Grób Adama Gawina i Cmentarz Rakowicki

### 4.1. Ustalenia z lokalizatora grobów ZCK

Lokalizator (`https://www.zck-krakow.pl/locator`) obejmuje 12 cmentarzy komunalnych. Zapytanie „Adam” + „Gawin” wykonano dla każdego z nich (12 zapytań):

| Cmentarz | Wynik |
|---|---|
| **Rakowicki** | **ADAM GAWIN, 27.12.1939 – 26.06.2012, kwatera LXXIV, rząd 7, miejsce 11.** Współpochowany w tym grobie: **HENRYK GAWIN, 28.12.1911 – 27.06.1962** |
| Bronowice, Mydlniki, Podgórski, Stary Podgórski, Prokocim, Wola Duchacka, Pychowice, Kobierzyn-Lubostroń, Maki Czerwone, Prądnik Czerwony, Grębałów | brak wpisów |

Daty urodzenia i zgonu zgadzają się co do dnia z danymi podanymi przez użytkownika.

Dla porównania, w zrzucie wyników Grobonetu dla Salwatora (`tests/fixtures/grobonet_groby_gawin_2026-08-18.html`) jest 12 osób o nazwisku Gawin (m.in. Antoni zm. 1969, Konstanty zm. 2007, Teresa zm. 2013), ale nie ma wśród nich Adama ani żadnej Heleny.

### 4.2. Wpisy pasujące do monitorowanej frazy, które już są w bazie Rakowickiego

Zapytanie „Helena” + „Gawin” dla Rakowickiego zwraca **trzy historyczne pochówki**:

| Osoba | Daty | Grób |
|---|---|---|
| Helena Gawin | 13.08.1931 – 20.10.2003 | kw. LXXII, rz. 20, m. 14 |
| Helena de Gawin-Niesłowska | 16.12.1911 – 11.11.1994 | kw. XXX, rz. 4, m. 16 |
| Helena Gawin | 17.04.1929 – 06.09.1979 | kw. LXIII, rz. 2, m. 30 |

Zapytanie „Helena” + „Dereń” — brak wyników.

**Konsekwencja projektowa:** trafienia fraz w aplikacji są liczone niezależnie od okien czasowych (README §2), więc te trzy rekordy dałyby fałszywy alarm przy pierwszym przebiegu. Każda integracja lokalizatora wymaga listy bazowej znanych rekordów albo filtra po dacie zgonu (rekomendacja R2).

Wyszukiwarka ZCK dopasowuje nazwisko jako **fragment** (znalazła „de Gawin-Niesłowska” i formę „Gawina”), więc jedno zapytanie „Helena + Gawin” obejmuje też zapisy „Gawin-Dereń” i „Dereń-Gawin”. Zapytanie samym nazwiskiem „Gawin” dla Rakowickiego trafia w limit 30 wyników (komunikat „Za dużo wyników”), dlatego trzeba pytać o imię i nazwisko.

### 4.3. Kto publikuje informacje o pogrzebach na Rakowickim

- **ZCK jest zarządcą cmentarza** i publikuje porządek pogrzebów obejmujący **każdy** pochówek na Rakowickim: ceremonie w kaplicy cmentarnej oraz te, które zaczynają się mszą w kościele parafialnym (pozycja „Od Bramy – ul. Rakowicka 26 A”). Strona kaplicy cmentarnej (`rakowice.katolicki.eu`) w sprawie pogrzebów odsyła wprost do porządku ZCK.
- **Zakłady pogrzebowe** chowają na Rakowickim niezależnie od lokalizacji. Przy samym cmentarzu działają m.in. PUK (ul. Rakowicka 35A, 0,4 km) i Lilia (ul. Rakowicka 39, 0,4 km). Publiczne listy zmarłych mają tylko PUK, Karawan i Gabriel24 (§6.2). Karty PUK prowadzą do stron eKlepsydry, na których podany jest cmentarz, data i godzina pogrzebu (np. „Cmentarz Rakowicki, Rakowicka 26, 29.10.2026, 13:00”).
- **Parafie:** msza pogrzebowa odbywa się w kaplicy cmentarnej albo w parafii zamieszkania zmarłego. Parafia monitorowanej osoby nie jest znana, dlatego istotne są parafie wokół Kapelanki (§6.3).

### 4.4. Kolejność sygnałów przy pogrzebie na Rakowickim

| Etap | Źródło | Opóźnienie względem zgonu |
|---|---|---|
| Nekrolog zakładu pogrzebowego | PUK, Karawan (RSS), Gabriel24 | od 1–2 dni (Gabriel24: do kilku tygodni) |
| Rezerwacja pogrzebu | **ZCK – porządek pogrzebów na kolejne dni** | gdy tylko pogrzeb zostanie wpisany do grafiku; według artykułu Radia Kraków („Wydłuża się czas oczekiwania na pochówek w Krakowie”) na pochówek czeka się 7–14 dni |
| Ogłoszenia parafialne | listy „pożegnaliśmy” (§6.3) | najbliższa niedziela po pogrzebie |
| Wpis w ewidencji grobów | lokalizator ZCK (grób LXXIV/7/11 i nowe wpisy „Helena Gawin”) | po pochówku; opóźnienie aktualizacji lokalizatora nieznane |
| Intencje mszalne | intencje za zmarłych w parafii (§6.3) | tygodnie po pogrzebie (np. msze gregoriańskie) |

---

## 5. Problematyczne źródła — czy da się je naprawić bez obchodzenia zabezpieczeń

### 5.1. Grobonet (Salwator) — nie da się

Stan na 2026-10-27:

| Adres | Tor | Wynik |
|---|---|---|
| `krakowsalwator.grobonet.com/grobonet/start.php?id=wyniki&name=Gawin` | proxy | 403, `cf-mitigated: challenge` |
| to samo | `fetchText` projektu, bezpośrednio z GCP | 403, „Just a moment…” |
| `krakowsalwator.grobonet.com/robots.txt`, `grobonet.com/` | proxy | 403, challenge |
| `krakowmogila.grobonet.com`, `krakowruszcza.grobonet.com`, `klepsydrakrakow.grobonet.com` (Podgórki Tynieckie) | proxy | 403, challenge |

Blokada trwa nieprzerwanie od 2026-10-19 22:50 UTC (ponad 7 dni) i obejmuje wszystkich klientów dostawcy. Sprawdzone drogi alternatywne:

- **Strona parafii Najświętszego Salwatora** (`parafiasalwator.pl`): zakładka cmentarza zawiera wyłącznie formalności pogrzebowe i link do Grobonetu; ogłoszenia i RSS nie wymieniają zmarłych.
- **Lokalizator ZCK** obejmuje tylko cmentarze komunalne. Salwator jest cmentarzem parafialnym.
- **eCmentarze** (`ecemetery.eu`) blokują odczyt automatyczny z obu torów (§6.4).

**Wniosek: dla grobów Salwatora nic więcej nie da się zrobić bez obchodzenia zabezpieczeń.** Zostaje czekanie na zdjęcie blokady albo prośba do dostawcy lub parafii (decyzja użytkownika; analogiczny kontakt z parafią Dębniki został wcześniej odrzucony). Próg tolerancji upływa **2026-11-02 ok. 23:00 UTC** — od tego przebiegu status wróci do `done_with_errors`. Ustalenie z §4.1 zmienia jednak ocenę strat: grób Adama Gawina jest na cmentarzu komunalnym, więc po wyłączeniu Grobonetu jego rolę w praktyce przejmie lokalizator ZCK (R2).

### 5.2. Dębniki (intencje i ogłoszenia) — tylko sonda, self-hosted runner albo zgoda parafii

| Tor | `/intencje/` | `/` | `/robots.txt` |
|---|---|---|---|
| proxy kontenera | 403, challenge | 403, challenge | 200 |
| `fetchText` projektu z adresu GCP | **200** (63 829 B) | **200** (89 662 B) | — |

Kryterium blokady jest bez zmian od sierpnia: reputacja adresu IP. Treść dostępna z adresu, który blokady nie dostaje:

- strona główna: ogłoszenia z 25.10.2026 z frazą „W minionym tygodniu pożegnaliśmy z naszej wspólnoty parafialnej: Śp. …” (jedna osoba) oraz „Intencje na dziś” (4 intencje za zmarłych);
- parser intencji działa (4 rekordy ze strony głównej; wcześniej 29 rekordów z `/intencje`).

Dwa nowe ustalenia:

1. **Workflow „Dębniki – sonda dostępu” (`.github/workflows/debniki-probe.yml`) ma 0 przebiegów** (sprawdzone w GitHub Actions). Pytanie, czy runnery GitHub Actions są dziś blokowane, pozostaje otwarte od 2026-08-29.
2. **Parser ogłoszeń nie jest gotowy na ponowne włączenie.** `parseDebnikiSdbPogrzeby` przechodzi wyłącznie po linkach (2 kandydaty), a samej strony głównej nie analizuje. Gdyby podać mu stronę główną (`parseDebnikiSdbDetailHtml`), powstałby błędny rekord `funeral` z datą ogłoszeń (2026-10-25) jako datą pogrzebu i godziną różańca (17:30) jako godziną pogrzebu. Do ewentualnego powrotu potrzebny jest parser list „pożegnaliśmy” (R4).

Strona salezjańskiego kościoła na Łosiówce (`losiowka.sdb.org.pl`) również odpowiada 403.

**Wniosek:** bez obchodzenia zabezpieczeń zostaje (a) uruchomić istniejącą sondę — jedno żądanie, zero ryzyka; (b) self-hosted runner na łączu domowym, legalny wg analizy z 2026-08-20; (c) prośba do parafii o regułę *Skip* w Cloudflare (wcześniej odrzucona przez użytkownika). Poza tym nic więcej się nie da zrobić. Część luki zapełniają legalnie parafie sąsiednie: MB Fatimskiej (0,4 km) i św. Józefa (1,8 km) publikują dokładnie ten sam typ informacji (§6.3).

### 5.3. Facebook (Dębniki) — bez zmian

Treść wymaga zalogowania, a warunki Meta zabraniają automatycznego zbierania danych bez zgody. Źródło pozostaje wyłączone.

### 5.4. Karawan — da się poprawić (kanał RSS)

- Strona `karawan.pl/nekrologi/` pokazuje wyłącznie „nadchodzące pogrzeby… oraz te, które odbyły się ostatnio” (nagłówek „Pogrzeby, które odbyły się wczoraj i przedwczoraj”). 27.10 jest tam **1 nekrolog**, a strona `/page/2/` pokazuje ten sam.
- Kanał `https://karawan.pl/nekrologi/feed/` (RSS, `application/rss+xml`) zawiera **10 nekrologów** opublikowanych 19–23.10.2026, z linkami do tych samych stron `/nekrolog/<slug>/`, które czyta istniejący parser szczegółów.
- `robots.txt` Karawana niczego nie zabrania (`Disallow:` puste).

Parser widzi dziś ok. 1/10 tego, co Karawan opublikował w ostatnim tygodniu. To osłabia też wykrywanie fraz, bo rekord znika z listy dwa dni po pogrzebie. Poprawka jest legalna i niewielka (R3).

### 5.5. Gabriel24 — nie da się przyspieszyć

- Lista: 12 nekrologów (zgony 07–19.09.2026, pogrzeby do 25.09).
- Mapa witryny (`nekrologi-sitemap2.xml`): ostatnia modyfikacja (`lastmod`) tych wpisów to **2026-10-14 09:10–09:26**, czyli Gabriel24 publikuje partiami z ok. 4-tygodniowym opóźnieniem.
- `robots.txt` zabrania `*/feed` (kanał zwraca zresztą HTTP 500). REST API (`/wp-json/`, dozwolone) nie udostępnia typu „nekrolog”.

Opóźnienie leży po stronie źródła. Wartość Gabriel24 to wyszukiwanie fraz w historii, a nie okno 7-dniowe.

### 5.6. ZCK — da się rozszerzyć (porządek pogrzebów na kolejne dni)

Strona `/funerals` ma kalendarz. Wybór daty wysyła `POST /funerals/api` z datą `"RRRR-MM-DD"` (JSON) i tokenem CSRF z nagłówka strony, a w odpowiedzi przychodzi fragment HTML o **tej samej strukturze** co strona (`h4 strong` z datą, nagłówki cmentarzy, `table.funerals` z `td.funeral-time/place/label`). Pomiar z 27.10:

| Dzień | Pogrzeby ogółem | w tym Rakowicki | Uwagi |
|---|---|---|---|
| 27.10 (strona, dziś czytana) | 15 | 1 | Kaplica |
| 28.10 (API) | 22 | 7 | m.in. 10 na Prądniku Czerwonym, 2 na Podgórkach Tynieckich |
| 30.10 (API) | 17 | 6 | 5 × Kaplica, 1 × „Od Bramy – ul. Rakowicka 26 A” |
| 02.11 (API) | 0 | 0 | 13 × „Brak pogrzebów” |

- `robots.txt` ZCK: `User-agent: * / Disallow:` (bez ograniczeń). Nie znaleziono regulaminu ograniczającego korzystanie z serwisu. ZCK to jednostka budżetowa Gminy Miejskiej Kraków.
- Token CSRF i ciasteczko `_frontendCSRF` strona wydaje każdemu odwiedzającemu. Odtworzenie tego przepływu to dokładnie to, co robi przeglądarka (§2.2), a nie obchodzenie zabezpieczenia.

Efekt rozszerzenia (R1): sekcja „Najbliższe pogrzeby” obejmie kilkadziesiąt zamiast kilkunastu pozycji, a pogrzeb na Rakowickim (także monitorowanej osoby) zostanie zauważony **w dniu wpisania do grafiku**, a nie dopiero w dniu ceremonii.

### 5.7. PUK, Podwawelskie, św. Jadwiga — działają, z uwagami

- **PUK:** 39 kart (pogrzeby 30.09–29.10.2026), bez paginacji. Karty nie podają daty zgonu. Strony szczegółów (eKlepsydra, linkowane publicznie przez PUK) podają cmentarz, datę i godzinę — można by oznaczać pogrzeby na Rakowickim (R9, opcjonalnie).
- **Podwawelskie:** domena `podwawelskie.pl` należy do **parafii MB Fatimskiej, Os. Podwawelskie, ul. Komandosów 18 — 0,4 km od Kapelanki** (najbliższa parafia w całym katalogu). Sekcja „Nekrologi” ma ok. 7 tygodni opóźnienia (najnowszy zgon 2026-09-07), ale „Ogłoszenia duszpasterskie” tej samej parafii zawierają na bieżąco (25.10.2026) „W minionym tygodniu pożegnaliśmy: + …” (R4).
- **św. Jadwiga (Krowodrza, 5,0 km):** działa (najnowsze zgłoszenie 2026-10-24). Katalog diecezji podaje jeszcze stary adres `swietajadwiga.diecezja.pl`, który nie działa.

### 5.8. Obserwacja poboczna (z analizy Grobonetu, rekomendacja E)

Rekord Karawana lub Gabriel24 z datą zgonu i datą pogrzebu jest zawsze `kind: death`, więc pogrzeb na Rakowickim z tych źródeł nie trafia do „Najbliższych pogrzebów”. Po wdrożeniu R1 ma to mniejsze znaczenie, bo ten sam pogrzeb pokaże porządek ZCK.

---

## 6. Nowe źródła — wyniki przeglądu

### 6.1. Cmentarze (do 10 km od Kapelanki lub Rakowickiego)

Odległości w km; „ok.” oznacza przybliżenie bez geokodowania.

| Cmentarz | Zarządca | Kapelanka | Rakowicki | Pogrzeby online | Wyszukiwarka grobów | Ocena |
|---|---|---|---|---|---|---|
| **Rakowicki** | ZCK | 4,5 | 0 | ZCK: dziś + kolejne dni (API) | lokalizator ZCK | ★ kluczowy (grób Adama Gawina) |
| Podgórski / Stary Podgórski | ZCK | 2,5 / 2,4 | 4,3 / 3,7 | ZCK | lokalizator ZCK | ✓ |
| Pychowice | ZCK | 1,9 | 6,1 | ZCK | lokalizator ZCK | ✓ |
| Wola Duchacka | ZCK | 3,2 | 6,4 | ZCK | lokalizator ZCK | ✓ |
| Kobierzyn-Lubostroń / Maki Czerwone | ZCK | 3,9 | 8,3 | ZCK | lokalizator ZCK | ✓ |
| Bronowice | ZCK | 7,4 | 6,1 | ZCK | lokalizator ZCK | ✓ |
| Prokocim | ZCK | 6,1 | 7,1 | ZCK | lokalizator ZCK | ✓ |
| Mydlniki | ZCK | 8,0 | 8,0 | ZCK | lokalizator ZCK | ✓ |
| Prądnik Czerwony (Batowice) | ZCK | 7,8 | 3,3 | ZCK | lokalizator ZCK | ✓ |
| Grębałów | ZCK | 11,8 | 8,4 | ZCK | lokalizator ZCK | ✓ |
| Podgórki Tynieckie | cmentarz komunalny (strona i krematorium: Klepsydra, `cmentarzkrakow.pl`) | 7,3 | 11,5 | ZCK (sekcja „Cmentarz Komunalny w Podgórkach Tynieckich”) | Grobonet — 403 | pogrzeby ✓, groby ✗ |
| Salwatorski | parafia Najśw. Salwatora | ok. 2,3 | ok. 4,1 | brak | Grobonet — 403 | ✗ |
| Mogilski | parafia w Mogile (cystersi) | ok. 9,4 | ok. 7,0 | brak | Grobonet — 403 | ✗ |
| **Borek Fałęcki** (parafialny) | parafia MB Zwycięskiej | 3,2 | 7,7 | brak (ale parafia publikuje intencje pogrzebowe, §6.3) | **eParafia, publiczny plik JSON** | ★ nowy (§6.1.1) |
| Bieżanów „Mała Góra” (parafialny) | parafia Narodzenia NMP | 7,5 | 8,7 | brak | listy grobów według kwater (statyczne strony, lata do 2026) | ✓ (niski priorytet) |
| Tyniec (parafialny) | parafia śś. Piotra i Pawła | 8,8 | 12,2 | brak | nie znaleziono | ✗ |
| Ewangelicki (ul. Rakowicka 19) | parafia ewangelicko-augsburska św. Marcina | ok. 4,4 | ok. 0,3 | brak (ogłoszenia bez zmarłych) | brak | ✗ |
| Nowy Cmentarz Żydowski (ul. Miodowa 55) | Gmina Wyznaniowa Żydowska | ok. 2,6 | ok. 2,5 | brak | brak | ✗ |

#### 6.1.1. Ewidencja grobów cmentarza w Borku Fałęckim

Wyszukiwarka „Znajdź grób” na stronie parafii MB Zwycięskiej pobiera do przeglądarki cały publiczny plik `https://zwycieska.eparafia.pl/clients/_krakow_mbzwyciezkiej/_upload/strona_3955/pio_2480.txt` (JSON) i filtruje go lokalnie. Pobrano go raz — dokładnie tak, jak robi to przeglądarka przy każdym wyszukiwaniu.

- **10 366 rekordów**, pola: `IdGrobu`, `Imie`, `Nazwisko`, `NrKwatery`, `NrGrobu`, `RokZgonu` (tylko rok).
- `Last-Modified: 2026-10-26 15:39 GMT` — plik jest aktualizowany na bieżąco. 206 rekordów z rokiem zgonu 2026.
- `robots.txt` eParafii: `Allow: /` (zablokowane wyłącznie `/images/`, `/private/`, `/panel`, kalendarz), `Content-Signal: search=yes, ai-train=no`.
- **Pochówki osób o nazwisku Gawin (9 osób w 6 grobach)** — do oceny przez użytkownika, czy chodzi o tę samą rodzinę:

| Grób (kwatera/nr) | Pochowani (rok zgonu) |
|---|---|
| 4/22 | Janina (2003), Ryszard (2012), Eugeniusz (2019) |
| 9/89 | Katarzyna (1978), Irena (2014) |
| 14/124 | Zuzanna (2007) |
| 30/106 | Adela (2014), Wojciech (2017) |
| 35/31 | Genowefa (2009) |

Brak Heleny i brak nazwiska Dereń (rekordy „Derenda” to inne nazwisko).

### 6.2. Zakłady pogrzebowe (do 10 km od Kapelanki lub Rakowickiego)

| Zakład | Lokalizacja (odległość od Kapelanki / Rakowickiego) | Publiczna lista zmarłych | Ocena |
|---|---|---|---|
| **PUK** | Rakowicka 35A (4,4 / 0,4), Strzelców 28 (7,4 / 2,9), Wapienna 13 (2,6 / 4,2) | tak — „Pożegnaliśmy” (karty eKlepsydry) | używane |
| **Karawan** | Bieżanowska 24 (4,5 / 6,1) i oddziały | tak — lista + **RSS** | używane, do poprawy (R3) |
| **Gabriel** | Wrocławska 8 (4,1 / 1,4) | tak — z opóźnieniem | używane |
| Lilia | św. Łazarza 21 (2,9 / 1,8), Rakowicka 39 (4,4 / 0,4), Bronowicka 19 (4,5 / 3,5) | nie (partner eKlepsydry; na stronie tylko artykuły) | ✗ |
| Archanioł | Grzegórzecka 27 i in. | nie (oferta nekrologów prasowych) | ✗ |
| Sacramentum | os. Szklane Domy 1 | nie (opis usługi „Klepsydry”) | ✗ |
| Kruk | Modlniczka, Wola Justowska | nie (wzory klepsydr) | ✗ |
| Epitafium | Kraków, kilka oddziałów | nie da się sprawdzić — hostingowe wyzwanie JS („One moment, please…”) | ✗ (nie obchodzimy) |
| Cmentarz Komunalny i Krematorium Klepsydra | Wielogórska 16 (7,4 / 11,6) | nie (wspomnienia znanych osób; groby w Grobonecie) | ✗ |
| Cordia, Lejda, Irys, Kalia, Lete (Kwiecista 32, Dębniki), Memento Mori, Morfon, Rekordia, Róża, Sacrum, Sacrum-Bras, Stela, Mądry, Certus, Gawlik, Korona, Kres, Vladex i in. | Kraków i okolice | w katalogach brak stron WWW; dla sprawdzonych nazw (m.in. Memento Mori, Lete, Kalia) wyszukiwarka nie znalazła stron z nekrologami | ✗ |
| AGAWA, Stachyra (Skawina) | ok. 10 / 14 | brak (strona AGAWY szczątkowa) | granica zakresu |

Poza zakresem, dla porządku: Chyra (Niepołomice, 20,9 km) ma listę na tej samej wtyczce co Karawan, ale ostatni nekrolog pochodzi z lipca 2025.

Wspólne platformy: **e-nekrologi.com** (wtyczka `bb-nekrologi`, z której korzystają Karawan i Gabriel) nie prowadzi własnej listy, a w Krakowie ma tylko tych dwóch klientów. **eKlepsydra** (PUK) udostępnia powiadomienia wyłącznie osobom, które otrzymały link od rodziny. Jej wyszukiwarki „wspomnień” nie należy przeszukiwać; korzystać można tylko z tego, co PUK sam publikuje na swojej stronie.

### 6.3. Parafie do 5 km od Kapelanki (30 parafii z katalogu diecezji)

#### a) Publikują cotygodniowe listy zmarłych parafian

| Parafia | km | Gdzie | Format |
|---|---|---|---|
| **MB Fatimskiej, Os. Podwawelskie** | 0,4 | `https://www.podwawelskie.pl/aktualnosci/ogloszenia-duszpasterskie-1.html` (+ obecne „Nekrologi”) | „W minionym tygodniu pożegnaliśmy: + … i + …” — co tydzień, bieżące (25.10.2026) |
| **św. Józefa, Podgórze** | 1,8 | `https://jozef.diecezja.pl/ogloszenia-parafialne/` | „W minionym tygodniu pożegnaliśmy z naszej wspólnoty parafialnej: Ś.p … z ul. …” (w tym tygodniu 5 osób, z ulicą) |
| **Zmartwychwstania Pańskiego, Wola Duchacka** | 3,3 | `https://wola1.xcr.pl/ogloszenia.html` | „W ostatnim czasie, z naszej wspólnoty parafialnej, odeszli do wieczności: śp. …” |
| **NMP z Lourdes (ul. Misjonarska)** | 3,7 | `https://misjonarska.pl/category/ogoszenia/` (wpisy tygodniowe) | „W minionym tygodniu odeszła do wieczności: …” |
| **MB Zwycięskiej, Borek Fałęcki** | 4,6 | ogłoszenia (`zwycieska.eparafia.pl/ogloszenia-…`), **intencje pogrzebowe** (`…/intencje-pogrzebowe(3)/intencje-pogrzebowe-2026`), ewidencja grobów (§6.1.1) | „W minionym tygodniu pożegnaliśmy z naszej wspólnoty: śp. …” (25.10: trzy osoby); lista „+ Imię Nazwisko” z terminami mszy, najnowsze na górze |
| **św. Jadwigi Królowej, Kliny Borkowskie** | 4,6 | `https://kliny.katolicki.eu/index.php/aktualnosci/ogloszenia-i-intencje.html` | „W ostatnim czasie z naszej wspólnoty parafialnej odeszli do wieczności śp. …” |
| **św. Stanisława BM, Dąbie** | 4,8 | `https://www.parafia.dabiekrakow.pl/biezace/odeszli-do-pana` (osobna podstrona) | „W ostatnim czasie pożegnaliśmy:” — 368 wpisów „† Imię Nazwisko – ul. …”, strona z datą 27.10.2026, bez dat przy wpisach |
| **św. Rafała Kalinowskiego, Kliny Zacisze** | 4,8 | `https://www.kalinowski.malopolska.pl/2026/03/ogloszenia-parafialne/` (strona zbiorcza, ogłoszenia do 25.10.2026) | „W minionym tygodniu pożegnaliśmy śp. … z ul. …” (15 wystąpień w archiwum) |
| św. Jadwigi Królowej, Krowodrza | 5,0 | `jadwiga.eparafia.pl` | już używane |

Wszystkie powyższe witryny w `robots.txt` blokują wyłącznie części administracyjne. Za Cloudflare stoi tylko eParafia (Borek), ale ta sama platforma obsługuje św. Jadwigę, którą runnery GitHub Actions czytają bez przeszkód w każdym przebiegu. Pozostałe to zwykły hosting (nginx, LiteSpeed, Apache).

#### b) Publikują tylko intencje mszalne za zmarłych („+ Imię Nazwisko”)

| Parafia | km | Gdzie |
|---|---|---|
| MB Saletyńskiej (ul. Cegielniana) | 1,4 | `https://krakow.saletyni.pl/intencje/` |
| św. Kingi | 3,4 | `https://kinga.diecezja.krakow.pl/ogloszenia/` (intencje w ogłoszeniach) |
| NSPJ, Płaszów (sercanie) | 4,2 | `https://www.krakow.sercanie.pl/parafia/intencje-mszy-sw` |
| św. Wojciecha, Os. Bronowickie | 4,5 | `https://swwojciech.com/category/intencje-mszalne/` (wpisy tygodniowe) |
| MB Różańcowej, Skotniki | 4,9 | `http://parafiaskotniki.pl/category/intencje-mszy-sw/` (wpisy tygodniowe) |

Intencje publikują też parafie z tabeli a): Podwawelskie, św. Józef, Borek (osobno intencje pogrzebowe), Kliny Borkowskie i Kliny Zacisze. Intencja „+ Helena Gawin” (np. msze gregoriańskie zamawiane po pogrzebie) to silny sygnał dla monitorowanej osoby, a kategoria `intention` („potrzeby”) nie ma dziś żadnego dostawcy.

#### c) Nie publikują informacji o zmarłych (strona główna i podstrony ogłoszeń/intencji)

Najśw. Salwatora (1,7), Wniebowzięcia NMP — Mariacka (2,7), NSPJ Łagiewniki (2,8), MB Królowej Polski — Nowy Ruczaj (3,7), Podwyższenia Krzyża — Kurdwanów (4,0), MB Różańcowej — Piaski Nowe (4,3), Chrystusa Króla — Przegorzały (4,4), NSPJ — Piaski Wielkie (4,8), MB Dobrej Rady — Prokocim (5,0). W Łagiewnikach i Prokocimiu menu generuje skrypt, więc sprawdzono stronę główną i typowe ścieżki ogłoszeń.

#### d) Zablokowane przez warstwę anty-botową — nie obchodzimy

| Parafia | km | Blokada |
|---|---|---|
| św. Stanisława Kostki, Dębniki | 1,1 | Cloudflare Managed Challenge (§5.2) |
| NSPJ, Pychowice (salezjanie) | 2,6 | hostingowe wyzwanie JS „One moment, please…” (openresty) |
| św. Anny (kolegiata) | 2,7 | jak wyżej |

#### e) Strona niedostępna

MB Nieustającej Pomocy — Podgórze, redemptoryści (1,3; domena nie odpowiada), Archikatedra Wawelska (1,9; HTTP 500), parafia greckokatolicka (2,5; domena nie odpowiada), Opatrzności Bożej — Swoszowice (5,0; domena nie odpowiada). Wyszukiwarka nie znalazła nowych adresów.

Kościoły rektoralne, klasztorne i bazyliki (40 z 70 obiektów do 5 km) nie publikują zmarłych świeckich. Wyjątkiem są informacje o zmarłych zakonnikach, np. u reformatów.

### 6.4. Portale ogólnopolskie i prasa

| Serwis | Co oferuje | Status prawny / techniczny | Ocena |
|---|---|---|---|
| nekrologi.wyborcza.pl (Agora) | największy serwis nekrologów prasowych | `robots.txt` zawiera **zastrzeżenie eksploracji tekstów i danych** na podstawie art. 4 ust. 3 dyrektywy 2019/790 (w Polsce art. 26³ ustawy o prawie autorskim) | ✗ |
| dziennikpolski24.pl, gazetakrakowska.pl `/nekrologi/` (Polska Press) | strony dzienne „Nekrologi i kondolencje z …” z **pełnym tekstem** (nazwisko, data zgonu, termin i miejsce pogrzebu, np. „w kaplicy na Cmentarzu Rakowickim”) | stopka każdej strony: systematyczne pobieranie treści „przy użyciu oprogramowania… (screen scraping / web scraping)” bez wyraźnej zgody Polska Press jest niedozwolone; nota wydawnicza powołuje się na ustawę o ochronie baz danych i zwalczaniu nieuczciwej konkurencji | ✗ bez pisemnej zgody |
| nekrologi.net (Polska Press) | ogólnopolski serwis anonsów rodzinnych gazet regionalnych | regulamin: baza danych „nie może być w żaden sposób wykorzystywana… bez uprzedniego uzyskania wyraźnej pisemnej zgody” | ✗ bez pisemnej zgody |
| ecemetery.eu / eCmentarze | ogólnopolska baza nekrologów i ewidencji grobów, także cmentarzy komunalnych Krakowa | `robots.txt` dopuszcza odczyt (`Allow: /`, zastrzeżenie tylko `ai-train=no`), ale Cloudflare zwraca 403 „Attention Required!” na **oba** tory | ✗ (blokada) |
| Grobonet (grobonet.com i subdomeny) | wyszukiwarki grobów Salwatora, Mogiły, Ruszczy, Podgórek Tynieckich | Cloudflare Managed Challenge | ✗ |
| funer.com.pl „Nekrologi Kraków” | epitafia zakładane przez rodziny, sortowane po popularności | dostępne, ale nieaktualne — najnowszy zgon na pierwszej stronie: 03.01.2026 | ✗ (bez wartości dla okien) |
| nekrolog.pl | nowy portal nekrologów | dla Krakowa 2 wpisy redakcyjne | ✗ (znikoma liczba) |
| e-nekrologi.com, pozegnaj.pl, mementis.com.pl, zakladypogrzebowe.com | platforma wtyczek / katalogi firm | bez list zmarłych | nie dotyczy |

Media z treścią w pełni tekstową (Polska Press) to jedyne źródło prasowe, które technicznie nadawałoby się do odczytu. Byłoby legalne wyłącznie po uzyskaniu pisemnej zgody wydawcy (decyzja użytkownika, R10).

### 6.5. Rejestry publiczne

Akty zgonu nie są publiczne: Prawo o aktach stanu cywilnego ogranicza wydawanie odpisów do osób uprawnionych. Gminy ościenne nie publikują porządków pogrzebów na cmentarzach komunalnych (wyszukiwanie dla Skawiny i Wieliczki nic nie dało; po zawężeniu zakresu obie leżą zresztą poza nim). Innego darmowego, państwowego źródła danych o zgonach w Krakowie nie ma.

---

## 7. Wnioski

1. **Grób Adama Gawina jest na Cmentarzu Rakowickim (kw. LXXIV, rz. 7, m. 11), razem z Henrykiem Gawinem.** Rakowicki jest cmentarzem komunalnym, więc wszystkie pochówki na nim widać w dwóch legalnie dostępnych narzędziach ZCK: porządku pogrzebów i lokalizatorze grobów.
2. **Grobonet:** nic więcej nie da się zrobić bez obchodzenia zabezpieczeń. Dotyczy to też innych cmentarzy parafialnych na tej platformie (Salwator, Mogiła, Ruszcza) i grobów na Podgórkach Tynieckich.
3. **Dębniki:** jedyne legalne drogi to sonda (nigdy nieuruchomiona), self-hosted runner albo zgoda parafii. Nawet po odzyskaniu dostępu parser ogłoszeń wymaga przebudowy.
4. **Facebook:** bez zmian, niedostępny legalnie.
5. **Karawan i ZCK da się legalnie i tanio rozszerzyć.** Karawan: RSS zamiast samej listy (10 zamiast 1 nekrologu). ZCK: kolejne dni porządku pogrzebów (już dziś widać 22 pogrzeby z 28.10 i 17 z 30.10 obok 15 dzisiejszych — to wczesne ostrzeżenie dla Rakowickiego).
6. **Gabriel24** publikuje partiami z ok. 4-tygodniowym opóźnieniem — tego nie da się zmienić po stronie aplikacji.
7. **W zakresie wskazanym przez użytkownika istnieją nowe, darmowe i legalne źródła:** 8 parafii z cotygodniowymi listami zmarłych (w tym najbliższa Kapelance MB Fatimskiej — 0,4 km — której strona jest już źródłem), intencje za zmarłych w kolejnych parafiach, lokalizator grobów ZCK i ewidencja grobów w Borku Fałęckim.
8. **Prasa i duże portale odpadają z przyczyn prawnych** (zastrzeżenie TDM Agory, zakaz scrapingu Polska Press) albo technicznych (eCmentarze, Grobonet).
9. **Lokalizator ZCK zawiera trzy historyczne wpisy „Helena Gawin”** na Rakowickim. Bez listy bazowej każda integracja natychmiast wywoła fałszywy alarm.
10. **Listy parafialne zawierają dane osób żyjących** (adresy domów w Dąbiu, u św. Józefa i na Klinach Zacisze; nazwiska zamawiających msze w intencjach). Repozytorium i GitHub Pages są publiczne, więc dane trzeba ograniczać do imienia i nazwiska zmarłego (§9).

---

## 8. Rekomendacje

Żadna rekomendacja nie została wdrożona (polecenie: „Nie zmieniaj kodu aplikacji”). Kolejność według stosunku korzyści do kosztu i ryzyka.

### R1. ZCK: porządek pogrzebów na 7 dni naprzód *(priorytet 1)*

- Przepływ: `GET https://www.zck-krakow.pl/funerals` (token z `<meta name="csrf-token">` i ciasteczko `_frontendCSRF`), potem `POST https://www.zck-krakow.pl/funerals/api` z treścią `"RRRR-MM-DD"`, nagłówkami `Content-Type: application/json` i `X-CSRF-Token` — dla dni D+1 … D+6. To 6 dodatkowych żądań na przebieg.
- Odpowiedź ma strukturę strony, więc da się użyć istniejącego `parseZckFuneralsHtml`. Dzień, w którym wszystkie tabele mają „Brak pogrzebów”, to `empty_confirmed` dla tego dnia, nie awaria.
- Testy: zrzuty odpowiedzi API (dzień z pogrzebami i dzień pusty) w `tests/fixtures/`.
- `fetchText` nie obsługuje dziś ciasteczek ani zapytań POST — potrzebna osobna, mała funkcja pobierająca.

### R2. ZCK: lokalizator grobów zamiast Grobonetu dla cmentarzy komunalnych *(priorytet 1 — najpóźniej przy decyzji o Grobonecie 2026-11-02)*

- Przepływ: `GET https://www.zck-krakow.pl/locator`, potem `POST https://www.zck-krakow.pl/locator/api` z `{"name":"Helena","surname":"Gawin","birthdate":"","deathdate":"","graveyard":"<id>"}`. Identyfikatory: 2 Rakowicki, 3 Bronowice, 4 Mydlniki, 5 Podgórski, 6 Stary Podgórski, 7 Prokocim, 8 Wola Duchacka, 9 Pychowice, 10 Kobierzyn-Lubostroń, 11 Maki Czerwone, 12 Prądnik Czerwony, 13 Grębałów (14 = Podgórki Tynieckie, przekierowanie do Grobonetu). HTTP 404 oznacza „brak wyników”, nie błąd. Limit: 30 wyników.
- Zakres zapytań: „Helena + Gawin” i „Helena + Dereń” na 12 cmentarzach — maks. 24 żądania. Wystarczy raz na dobę, bo ewidencja nie zmienia się z godziny na godzinę.
- **Obowiązkowa lista bazowa:** trzy znane wpisy z §4.2 (imię, nazwisko, daty, kwatera/rząd/miejsce) wykluczone z alertów. Alert tylko dla wpisu nowego względem bazy.
- **Obserwacja grobu Adama Gawina:** zapytanie „Adam + Gawin”, cmentarz 2. Pole `extra` (współpochowani) zawiera dziś jedną osobę (Henryk Gawin). Pojawienie się nowej osoby w tym grobie to bardzo silny sygnał.
- Rekordy jako `kind: grave`, link do lokalizatora. Opóźnienie aktualizacji lokalizatora po pochówku jest nieznane — warto je zmierzyć na dowolnym świeżym pogrzebie z porządku ZCK.

### R3. Karawan: kanał RSS *(priorytet 1, mała zmiana)*

Lista kandydatów z `https://karawan.pl/nekrologi/feed/` (10 pozycji) zamiast samej strony listy albo obok niej. Linki prowadzą do `/nekrolog/<slug>/`, więc istniejący parser szczegółów działa bez zmian. Nie stosować tego do Gabriel24 — jego `robots.txt` zabrania `*/feed`.

### R4. Parafie do 5 km: cotygodniowe listy zmarłych *(priorytet 2)*

- Źródła: MB Fatimskiej (Os. Podwawelskie), św. Józefa (Podgórze), Wola Duchacka, NMP z Lourdes, MB Zwycięskiej (Borek Fałęcki), Kliny Borkowskie, Dąbie (strona „Odeszli do Pana”), Kliny Zacisze (§6.3a).
- Jeden konfigurowalny parser zamiast ośmiu osobnych: adres strony, wzorzec początku listy (`pożegnaliśmy|odeszli do wieczności|odeszła do wieczności`), separatory nazwisk (`,`, ` i `, `+`, `†`, `Ś.p.`), koniec akapitu. Witryny działają na różnych systemach (WordPress, Joomla, eParafia, własne CMS), więc dla każdej potrzebny zrzut regresyjny.
- Rekord: `kind: death`, `name`, **bez daty zgonu** — data ogłoszenia to nie data zgonu (por. pułapka św. Jadwigi w README §3). Data ogłoszenia może trafić do `note` albo osobnego pola.
- **Zapisywać wyłącznie imię i nazwisko zmarłego** — bez „z ul. …” i bez adresów z listy Dąbia (§9).
- Odmiana nazwisk: listy bywają w bierniku („śp. Irenę …”). `Frazy.json` ma już formy odmienione, więc dopasowanie działa bez normalizacji.

### R5. Intencje za zmarłych — przywrócenie kategorii „potrzeby” *(priorytet 2)*

- Najlepsze źródło: **intencje pogrzebowe MB Zwycięskiej** — lista „+ Imię Nazwisko” zmarłych parafian z datami i godzinami mszy. Dają jednocześnie wzmiankę o zgonie (`death`) i intencje (`intention`) w oknie `[dziś, dziś+7]`.
- Intencje tygodniowe z §6.3b oraz parafii z §6.3a. Istniejący `parseDebnikiIntencjeHtml` rozpoznaje format „godzina + Imię Nazwisko” i może posłużyć za wzór.
- **Nie zapisywać zamawiających** („od Wojciecha …”, „od rodziny …”) — to dane osób żyjących.
- Po wdrożeniu komunikat pustej sekcji „potrzeby” w `app.js` zmieni się sam, ale `INTENTION_SOURCE_TYPES` trzeba rozszerzyć o nowy typ.

### R6. Ewidencja grobów w Borku Fałęckim *(priorytet 2)*

Raz na dobę pobierać `pio_2480.txt` z nagłówkiem `If-Modified-Since` (serwer podaje `Last-Modified`, więc bez zmian nie trzeba pobierać 1,2 MB). Porównywać z listą bazową (klucz `IdGrobu` + `Imie` + `Nazwisko`) i zgłaszać nowe wpisy z nazwiskiem Gawin lub Dereń. Plik zawiera tylko rok zgonu.

### R7. Dębniki: uruchomić sondę i dopiero potem decydować *(priorytet 1 jako decyzja, koszt zerowy)*

Jedno ręczne uruchomienie workflow „Dębniki – sonda dostępu” (GitHub → Actions → „Dębniki – sonda dostępu” → Run workflow).

- **200** → można włączyć `debniki_intencje` (zmiana jednego pola w obu plikach). Ogłoszeń nie włączać przed przebudową parsera (§5.2, R4).
- **403** → zostaje self-hosted runner albo prośba do parafii. Poza tym nic więcej się nie da zrobić.

Warto rozszerzyć sondę o adresy nowych źródeł z R1–R6 (po jednym żądaniu), żeby przed wdrożeniem potwierdzić, że runnery GitHub Actions nie są przez nie blokowane. Z tego środowiska nie da się tego rozstrzygnąć.

### R8. Grobonet: decyzja 2026-11-02 *(priorytet 1, termin)*

Jeżeli blokada trwa: wariant C z analizy Grobonetu (wyłączenie źródła, zachowanie flagi `external_block_tolerated`). Kategorię `grave` dla cmentarzy komunalnych przejmie R2, a dla Borku R6. Groby Salwatora (12 historycznych wpisów Gawin) pozostaną znane wyłącznie ze zrzutu z 2026-08-18.

### R9. PUK: oznaczanie cmentarza z kart eKlepsydry *(priorytet 3, opcjonalnie)*

Strony szczegółów podają cmentarz, datę i godzinę pogrzebu. Pobierać tylko karty nowe względem poprzedniego przebiegu (pamięć podręczna), żeby nie generować 39 żądań do eKlepsydry dwa razy na dobę.

### R10. Polska Press: tylko za pisemną zgodą *(priorytet 3, decyzja użytkownika)*

Dzienne strony nekrologów Dziennika Polskiego i Gazety Krakowskiej mają pełny tekst, często z miejscem pogrzebu na Rakowickim. Wydawca wprost zakazuje automatycznego pobierania bez zgody. Jeżeli użytkownik chce z nich korzystać, legalna droga to wniosek o zgodę (zakres: kilka stron dziennie, cel niekomercyjny, bez publikacji treści). Bez zgody — nie.

### Czego nie robić — bez zmian

Bez obchodzenia blokad Cloudflare i hostingowych wyzwań JS (Grobonet, Dębniki, Łosiówka, eCmentarze, Pychowice, kolegiata św. Anny, klaryski, bernardynki, Epitafium), bez proxy rezydencjalnych i rotacji IP, bez przeszukiwania eKlepsydry, bez Facebooka, bez prasy, której wydawcy zastrzegli prawa.

---

## 9. Ryzyka

| Ryzyko | Prawdopodobieństwo | Skutek | Ograniczenie |
|---|---|---|---|
| Fałszywy alarm z historycznych wpisów „Helena Gawin” w lokalizatorze ZCK | **pewne** bez listy bazowej | powiadomienie Discord o zmarłej w 1979, 1994 lub 2003 r. | lista bazowa / filtr daty (R2) |
| Publikacja danych osób żyjących (adresy, zamawiający msze) w publicznym `data/latest.json` | wysokie przy nieostrożnym parserze | naruszenie prywatności (RODO chroni osoby żyjące; dane zmarłych są poza RODO — motyw 27) | zapisywać wyłącznie imię i nazwisko zmarłego (R4, R5) |
| Koszt utrzymania kilkunastu małych parserów parafialnych | średnie | ciche zamilknięcie po zmianie strony | jeden konfigurowalny parser, zrzuty regresyjne, istniejący mechanizm `empty_streak` |
| Obciążenie małych serwerów parafialnych | niskie | prośba o zaprzestanie lub blokada | 1 żądanie na stronę na przebieg, jawny User-Agent, poszanowanie `robots.txt` |
| Runnery GitHub Actions blokowane przez nowe źródła | nieznane (tylko eParafia jest za Cloudflare, a tam działa św. Jadwiga) | źródło niedostępne w produkcji | rozszerzenie sondy przed wdrożeniem (R7) |
| ZCK zmieni API kalendarza lub lokalizatora | niskie–średnie | utrata rozszerzenia | zrzuty i testy; strona dnia bieżącego pozostaje drogą zapasową |
| Ocena przepływu z tokenem CSRF jako „obchodzenia” | niskie | spór interpretacyjny | przepływ identyczny z przeglądarką; jawne oznaczenie bota; przy sprzeciwie ZCK — wyłączenie |
| Blokada Grobonetu trwała | średnie | `done_with_errors` od 2026-11-02 | R8 + R2 |
| Opóźnienie aktualizacji lokalizatora ZCK | nieznane | wpis grobu po kilku dniach lub tygodniach | lokalizator jako potwierdzenie; wczesny sygnał z porządku ZCK (R1) |
| Osoba o tym samym imieniu i nazwisku (zbieżność) | niskie | alert o innej osobie | alert z linkiem do źródła; weryfikacja przez człowieka |

Ryzyko prawne obchodzenia zabezpieczeń (dla porządku): ominięcie zabezpieczenia w celu uzyskania dostępu do informacji może być rozważane w świetle art. 267 § 1 Kodeksu karnego, a pobieranie wbrew zastrzeżeniu wydawcy — w świetle ustawy o ochronie baz danych i art. 26³ ustawy o prawie autorskim. Rekomendacje R1–R9 tych obszarów nie dotykają.

---

## 10. Następne kroki

1. **Decyzja użytkownika**, które rekomendacje wdrożyć. Proponowana kolejność: R7 (sonda, zero kosztu) → R1 → R3 → R2 (razem z decyzją R8) → R5 → R4 → R6 → R9.
2. **Przed wdrożeniem** — jedno ręczne uruchomienie sondy z runnera, rozszerzonej o nowe adresy (R7).
3. **2026-11-02 ok. 23:00 UTC** — koniec tolerancji blokady Grobonetu. Jeżeli blokada trwa: R8 (wariant C) i R2.
4. **2026-11-08 – 2026-11-15** — zaplanowana wcześniej kontrola Grobonetu (instrukcja w §10 analizy Grobonetu) pozostaje aktualna.
5. Przy wdrażaniu R2: zmierzyć opóźnienie aktualizacji lokalizatora ZCK na dowolnym pogrzebie z porządku ZCK.
6. Opcjonalnie: wniosek do Polska Press o zgodę (R10) i ponowna próba ustalenia nowych adresów stron redemptorystów (Podgórze) i parafii w Swoszowicach.
7. Po wdrożeniu dowolnej rekomendacji — dopisać do tego pliku sekcję „Zmiany wykonane w kodzie” zgodnie z `AGENTS.md` §4.

---

## 11. Czynności wykonane podczas analizy

- **Nie zmieniono kodu, konfiguracji ani danych aplikacji.** Do repozytorium trafia wyłącznie ten plik, na gałąź `main`, zgodnie z poleceniem użytkownika.
- `npm ci` (katalog `node_modules/` jest w `.gitignore`) i `npm test` → 64/64 pass.
- Nie uruchamiano `npm run refresh` ani żadnego workflow. Nie wysłano żadnego powiadomienia Discord.
- Parsery projektu uruchomiono lokalnie, bez sieci, na pobranej stronie głównej Dębnik (§5.2).
- Ruch sieciowy: wyłącznie żądania odczytu z nagłówkiem `nekrolog-refresh-bot/1.0` (Nominatim: `nekrolog-analysis/1.0`), z odstępami 0,4–1,1 s między żądaniami do tego samego serwisu. Największe serie: katalog diecezji (16 stron listy + ok. 320 stron parafii), strony parafii (ok. 150 żądań do ok. 60 różnych serwisów), Nominatim (ok. 55), funer.com.pl (ok. 70), pozegnaj.pl (19). ZCK: 17 zapytań do API lokalizatora (12 × „Adam Gawin”, po jednym „Gawin”, „Helena Gawin” i „Helena Dereń” na Rakowickim oraz 2 nieudane próby: bez tokenu i bez wskazania cmentarza) i 3 zapytania do kalendarza pogrzebów (28.10, 30.10, 02.11).
- Nie obchodzono żadnego zabezpieczenia. Strony z wyzwaniem anty-botowym odnotowano i pominięto. Tak jak w poprzednich analizach, wyłącznie diagnostycznie (żeby ustalić kryterium blokady) użyto drugiego toru sieciowego — bezpośrednio z adresu GCP: dla Dębnik (strona główna i `/intencje/`, przeszły) oraz dla eCmentarzy (jedno żądanie, zablokowane). Żadne z tych danych nie trafiły do aplikacji.
- Pliki robocze (pobrane strony, skrypty pomocnicze) pozostały poza repozytorium, w katalogu tymczasowym sesji.
