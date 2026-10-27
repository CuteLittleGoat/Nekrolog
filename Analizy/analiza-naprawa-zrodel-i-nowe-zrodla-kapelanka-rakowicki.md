# Analiza: naprawa problematycznych źródeł i nowe legalne źródła informacji o zgonach i pogrzebach (ul. Kapelanka i Cmentarz Rakowicki)

Data analizy: 2026-10-27 (pomiary na żywo 06:00–07:15 UTC)
Temat analizy: Czy źródła, które przestały działać (Grobonet/Salwator, Dębniki, Facebook) albo działają częściowo, da się naprawić bez obchodzenia zabezpieczeń ustawionych przez właścicieli stron, oraz jakie inne darmowe i legalne źródła informacji o zgonach i pogrzebach są dostępne w okolicy ul. Kapelanka i Cmentarza Rakowickiego (grób Adama Gawina).
Stan repozytorium w chwili analizy: `main`, commit `3782be4` („Refresh Nekrolog data”, przebieg z 2026-10-26 23:03 UTC).

**Aktualizacja 2026-10-27 (wdrożenie):** na polecenie użytkownika wdrożono rekomendacje R1–R7, R9 i R10; R8 zostaje bez zmian w kodzie (decyzja użytkownika). Przebieg wdrożenia, wyniki sondy z runnera i korekty ustaleń tej analizy — §12; zmiany w kodzie — sekcja „Zmiany wykonane w kodzie” na końcu dokumentu. Treść §1–§11 opisuje stan z chwili analizy i nie była przepisywana; nieaktualne zdania mają odsyłacze do §12.

Analiza nawiązuje do wcześniejszych dokumentów w tym folderze: `analiza-status-done-with-errors-cloudflare-debniki.md` (blokada Dębnik, zasada nieobchodzenia zabezpieczeń), `analiza-done-with-errors-gabriel24-timeout-i-debniki-intencje.md` (sonda dostępu Dębnik), `analiza-done-with-errors-sw-jadwiga-zmiana-domeny.md` oraz `analiza-done-with-errors-grobonet-salwator-cloudflare.md` (blokada Grobonetu, próg 14 dni). Zgodnie z poleceniem użytkownika **nie zmieniono kodu aplikacji** — dokument zawiera wyłącznie ustalenia i propozycje.

---

## Najważniejsze w skrócie

1. **Grób Adama Gawina (27.12.1939 – 26.06.2012) jest na Cmentarzu Rakowickim: kwatera LXXIV, rząd 7, miejsce 11.** Potwierdza to oficjalny lokalizator grobów Zarządu Cmentarzy Komunalnych (ZCK). W tym samym grobie spoczywa Henryk Gawin (28.12.1911 – 27.06.1962). Na pozostałych 11 cmentarzach komunalnych i w bazie Salwatora Adama Gawina nie ma.
2. **Grobonet (Salwator) — nic więcej nie da się zrobić bez obchodzenia zabezpieczeń.** Cała strefa `grobonet.com` (także cmentarze w Mogile, Ruszczy i na Podgórkach Tynieckich) odpowiada Cloudflare Managed Challenge na każdy tor sieciowy. Legalna alternatywa dla grobów Salwatora nie istnieje. Ponieważ jednak grób Adama Gawina leży na cmentarzu **komunalnym**, kluczową część roli Grobonetu przejmuje lokalizator ZCK, który działa.
3. **Dębniki — jedyne legalne drogi to sonda z runnera, self-hosted runner albo zgoda parafii.** Blokada nadal zależy od reputacji adresu IP. Workflow „Dębniki – sonda dostępu” **nigdy nie został uruchomiony** (0 przebiegów), więc nie wiadomo, czy runnery GitHub Actions są dziś blokowane. *(Aktualizacja: sondę uruchomiono 2026-10-27 — runner nadal dostaje HTTP 403, §12.1.)*
4. **Największy zysk leży w źródłach już używanych, czytanych dziś tylko w części:**
   - **ZCK publikuje porządek pogrzebów z wyprzedzeniem** (API kalendarza na stronie): na 28.10 są już 22 pogrzeby, w tym 7 na Rakowickim, a aplikacja czyta wyłącznie dzień bieżący (dziś 15, w tym 1 na Rakowickim). ZCK jest zarządcą Rakowickiego, więc jego porządek obejmuje **każdy** pochówek na tym cmentarzu, także gdy msza odbywa się w kościele parafialnym.
   - **Karawan** pokazuje na liście tylko pogrzeby nadchodzące i z ostatnich dwóch dni (dziś 1 nekrolog), a jego kanał RSS — 10 ostatnich nekrologów.
   - **„Podwawelskie” to strona parafii MB Fatimskiej na Os. Podwawelskim (0,4 km od Kapelanki).** Jej „Nekrologi” mają ok. 7 tygodni opóźnienia, ale cotygodniowe ogłoszenia podają na bieżąco „W minionym tygodniu pożegnaliśmy…”.
5. **Nowe legalne źródła w zakresie wskazanym przez użytkownika:** 8 parafii do 5 km od Kapelanki publikuje na bieżąco listy zmarłych parafian, kolejne podają intencje za zmarłych (to przywróciłoby pustą dziś kategorię „potrzeby”). Lokalizator ZCK pozwala obserwować grób na Rakowickim, a parafia MB Zwycięskiej udostępnia ewidencję grobów cmentarza w Borku Fałęckim (aktualizacja 26.10.2026, 9 pochówków osób o nazwisku Gawin).
6. **Prasa i portale ogólnopolskie odpadają z przyczyn prawnych:** Agora (nekrologi Wyborczej) zastrzega eksplorację tekstów i danych, Polska Press (Dziennik Polski, Gazeta Krakowska, nekrologi.net) zakazuje automatycznego pobierania bez zgody. eCmentarze (ecemetery.eu) blokuje odczyt automatyczny.
7. **Uwaga przed jakimkolwiek wdrożeniem:** w lokalizatorze ZCK są już **trzy historyczne wpisy pasujące do monitorowanej frazy** (Helena Gawin zm. 1979, Helena Gawin zm. 2003, Helena de Gawin-Niesłowska zm. 1994). Bezpośrednie podpięcie lokalizatora wywołałoby natychmiast fałszywy alarm na Discordzie — potrzebna jest lista bazowa. *(Korekta: przegląd wszystkich 12 cmentarzy wykazał **cztery** takie wpisy — czwarty to Helena Gawin zm. 1942 na Cmentarzu Wola Duchacka, §12.3.)*

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

Polecenia wdrożeniowe (realizacja: §12 i sekcja „Zmiany wykonane w kodzie”):

```text
Zgadzam się na Twoje rekomendacje. Zacznij od sondy a potem zacznij wdrażać resztę zmian.

R8 - podtrzymuję decyzję. Sprawdzimy za jakiś czas czy blokada się utrzymuje. Jeżeli tak to sprawdzimy przyczynę i być może wyłączymy źródło

R10 - nie będę występować o zgodę. Nie będziemy próbować obchodzić blokad. Wyłącz źródło.
```

```text
masz moją zgodę na wprowadzenie zmian na main (jak już wszystko przygotujesz i przetestujesz).
```

```text
Kontynuuj pracę.
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

Żadna rekomendacja nie została wdrożona (polecenie: „Nie zmieniaj kodu aplikacji”). Kolejność według stosunku korzyści do kosztu i ryzyka. *(Stan z chwili analizy. Wdrożenie: §12.2.)*

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
3. **2026-11-02 ok. 23:00 UTC** — koniec tolerancji blokady Grobonetu. Jeżeli blokada trwa: R8 (wariant C) i R2. *(R2 wdrożono 2026-10-27; R8 — decyzja użytkownika: obserwować, a jeśli blokada się utrzyma, ustalić przyczynę i ewentualnie wyłączyć źródło.)*
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

---

## 12. Wdrożenie rekomendacji (2026-10-27)

Polecenia użytkownika: §1 („Polecenia wdrożeniowe”). Kolejność prac: sonda z runnera (R7), potem R1 → R3 → R2 → R5 → R4 → R6 → R9 oraz dokumentacja R10. R8 bez zmian w kodzie.

### 12.1. Sonda z runnera GitHub Actions (R7)

Workflow „Sonda dostępu do źródeł” (`.github/workflows/debniki-probe.yml`), przebieg `40466662830`, 2026-10-27 07:21–07:22 UTC, gałąź `claude/determined-clarke-psq4cd`, commit `094034f`. Po jednym żądaniu z nagłówkiem `nekrolog-refresh-bot/1.0`; dla ZCK — ten sam przepływ z tokenem CSRF co przeglądarka.

| Adres | HTTP | Warstwa anty-botowa | Wniosek |
|---|---|---|---|
| Dębniki `/intencje/` i `/` | 403 | Cloudflare challenge | blokada trwa, źródła pozostają wyłączone |
| Karawan — kanał RSS | 200 | — | R3 |
| ZCK — strona porządku pogrzebów | 200 | — | R1 |
| ZCK — API kalendarza (2026-10-28) | 200, 22 pozycje | — | R1 |
| ZCK — API lokalizatora (Adam Gawin @ Rakowicki) | 200, 1 grób | — | R2 |
| MB Fatimskiej, św. Józefa, Wola Duchacka, NMP z Lourdes, Kliny Borkowskie, Dąbie, Kliny Zacisze (ogłoszenia) | 200 | — | R4 |
| MB Zwycięskiej (Borek) — ogłoszenia, intencje pogrzebowe, ewidencja grobów (1 276 650 B) | 200 | — | R4, R5, R6 (adres ogłoszeń — patrz §12.3) |
| św. Kingi, Płaszów, Os. Bronowickie, Skotniki (intencje) | 200 | — | R5 |
| **MB Saletyńskiej (intencje)** | **403** | **Cloudflare challenge** | **nie wdrażać** — z kontenera analizy odpowiadała 200 |

Ten sam zestaw z kontenera deweloperskiego dał wyłącznie 200 poza Dębnikami — różnica dla MB Saletyńskiej potwierdza, że o dostępie rozstrzyga reputacja adresu IP i że sonda z runnera była potrzebna przed wdrożeniem.

### 12.2. Co wdrożono

| Rek. | Stan | Zakres |
|---|---|---|
| R1 | wdrożone | ZCK: dzień bieżący ze strony + **7** kolejnych dni z API kalendarza (analiza mówiła o 6 — wybrano 7, żeby objąć całe okno `[dziś, dziś+7]`). Awaria API nie kasuje dnia bieżącego; błąd dopiero, gdy nie udał się żaden kolejny dzień. |
| R2 | wdrożone | Lokalizator ZCK: „Helena Gawin” i „Helena Dereń” na 12 cmentarzach + grób Adama Gawina (25 zapytań), raz na dobę (`min_interval_hours: 20`). Lista bazowa **czterech** wpisów historycznych, drugie zabezpieczenie: wpisy z datą zgonu sprzed ponad roku są pomijane. Nowa osoba w grobie Adama Gawina — rekord `force_match` (alert niezależnie od fraz). |
| R3 | wdrożone | Karawan: kandydaci ze strony listy i z kanału RSS; awaria jednej drogi trafia tylko do diagnostyki. |
| R4 | wdrożone | 8 parafii: MB Fatimskiej, św. Józefa, Wola Duchacka, NMP z Lourdes (kanał RSS), MB Zwycięskiej (najnowsze linki ze strony głównej), Kliny Borkowskie (najnowszy artykuł; także intencje), Dąbie (lista bez dat — data pierwszego odczytu), Kliny Zacisze. Jeden parser sterowany profilami. Rekord bez daty zgonu, z datą ogłoszenia (`date_reported`); bez adresów. |
| R5 | wdrożone | Intencje pogrzebowe Borku (wzmianka o zgonie + terminy mszy) oraz intencje tygodniowe: MB Fatimskiej, św. Kingi, Płaszów, Os. Bronowickie (RSS), Skotniki (RSS), Kliny Zacisze; dodatkowo Kliny Borkowskie w ramach R4. **Bez** MB Saletyńskiej (§12.1) i św. Józefa (na stronie parafii nie znaleziono intencji). Zamawiający i intencje za żyjących nie są zapisywane. |
| R6 | wdrożone | Ewidencja grobów Borku: plik JSON z `If-Modified-Since`, nazwiska porównywane po całych członach („Derenda” ≠ „Dereń”), nowe wpisy oznaczane datą pierwszego odczytu, historyczne trafienia fraz pomijane. |
| R7 | wdrożone | Sonda rozszerzona o adresy R1–R6 i uruchomiona (§12.1). |
| R8 | bez zmian | Decyzja użytkownika: Grobonet zostaje włączony i tolerowany do progu; po nim — ustalenie przyczyny i ewentualne wyłączenie. |
| R9 | wdrożone | PUK: dla pogrzebów od dziś wzwyż jednorazowo strona klepsydry (eKlepsydra) — cmentarz i godzina; maks. 12 stron na przebieg, wynik w pamięci podręcznej źródła. |
| R10 | wdrożone (dokumentacja) | Polska Press bez wniosku o zgodę i bez odczytu; źródła wykluczone opisane w README §9; test-strażnik blokuje ich adresy w definicjach źródeł. Źródło Polska Press nigdy nie istniało w aplikacji — „wyłączenie” oznacza trwałe wykluczenie. |

Zmiany konieczne poza samymi rekomendacjami:

- **`data/source_cache.json`** — stan źródeł między przebiegami (wynik lokalizatora, `Last-Modified` i wpisy ewidencji, pierwsze odczyty wpisów, szczegóły kart PUK); workflow odświeżania commituje ten plik razem z danymi.
- **Budżet czasu serii zapytań** (120 s) i przerwanie po dwóch kolejnych zapytaniach bez odpowiedzi — dla API ZCK i klepsydr PUK. Bez tego zawieszony serwer ZCK mógł wydłużyć przebieg ponad `timeout-minutes: 20`.
- **Okno „Ostatnie zgony / wzmianki”** liczone po `date_death`, a gdy jej brak — po `date_reported`.
- **Discord**: nowe intencje jednego źródła z jednego przebiegu idą jedną wiadomością (seria mszy gregoriańskich); linie „Powód zgłoszenia”, „Data ogłoszenia”, „Rok zgonu”.
- **Interfejs**: data ogłoszenia, rok zgonu i powód zgłoszenia w kartach; nowe typy źródeł intencji; nagłówek sekcji grobów; nowe pola diagnostyki w sekcji Log.

### 12.3. Korekty ustaleń tej analizy

1. **Cztery, a nie trzy historyczne wpisy „Helena Gawin” w lokalizatorze ZCK.** Analiza odpytała „Helena Gawin” tylko na Rakowickim. Pełny przegląd 12 cmentarzy (przebieg z §12.4) wykazał czwarty wpis: **Helena Gawin, ur. 02.02.1868, zm. 20.12.1942, Cmentarz Wola Duchacka, kw. F, rz. 7, m. 13**. Bez korekty pierwszy przebieg produkcyjny wysłałby fałszywy alarm na Discord. Wpis dopisano do listy bazowej, a niezależnie od niej wpisy z datą zgonu sprzed ponad roku są pomijane. „Helena Dereń” — brak wpisów na wszystkich 12 cmentarzach.
2. **Adres ogłoszeń Borku Fałęckiego.** Adres użyty w sondzie (`zwycieska.eparafia.pl/ogloszenia-parafialne(2)`) prowadzi do archiwalnego ogłoszenia dodanego 2021-10-08. Bieżące ogłoszenia mają co tydzień nowy adres (np. `ogloszenia-30-niedziela-zwykla-25-10-2026`, z listą „pożegnaliśmy” z 25.10: Irena Miernik, Józef Śliwa, Jacek Migdałek). Parser startuje ze strony głównej parafii; sondę poprawiono. Wynik sondy (HTTP 200 dla hosta) pozostaje ważny.
3. **`robots.txt` platformy eParafia** (Borek, także używana od 2026-10 św. Jadwiga) zawiera — oprócz `User-agent: *` / `Allow: /` i `Content-Signal: search=yes, ai-train=no, use=reference` — zarządzaną przez Cloudflare sekcję blokującą roboty trenujące modele AI oraz **agentów AI działających w imieniu użytkownika** (m.in. `Claude-User`, `ChatGPT-User`, `Perplexity-User`). §6.1.1 analizy tego nie odnotował. Aplikacja (bot `nekrolog-refresh-bot` uruchamiany według harmonogramu na GitHub Actions) nie jest takim agentem i reguła `User-agent: *` ją dopuszcza. Asystent po zauważeniu reguły (ok. 07:30 UTC) nie pobierał już celowo stron eParafii; zrzuty testowe zbudowano ze stron pobranych wcześniej. Wyjątek — przypadkowy przebieg opisany w §12.4.
4. **MB Saletyńskiej** — §6.3b wymieniał ją wśród źródeł intencji; runner GitHub Actions dostaje tam Cloudflare Managed Challenge (§12.1), więc źródło nie zostało dodane.
5. **św. Józefa** — §6.3 zaliczał ją do parafii publikujących intencje; na stronie parafii nie znaleziono intencji (są tylko ogłoszenia), więc wdrożono wyłącznie listę zmarłych.

### 12.4. Ruch sieciowy podczas wdrożenia

Wszystkie żądania z kontenera asystenta wysyłano z nagłówkiem `nekrolog-refresh-bot/1.0` i bez obchodzenia jakichkolwiek zabezpieczeń.

- **Projektowanie parserów i zrzuty testowe (07:26–07:38 UTC):** po jednym żądaniu GET: 11 stron ogłoszeń i intencji parafii, strona listy i kanał RSS Karawana (07:26), kanał RSS Lourdes i `robots.txt` sześciu serwisów parafialnych (07:29), kanał i bieżący artykuł Klinów Borkowskich (07:32), najnowsze wpisy i kanały intencji Os. Bronowickiego i Skotnik (07:34), intencje MB Fatimskiej i Klinów Zacisze (07:37). Z eParafii, zanim zauważono regułę z §12.3 p. 3: `ogloszenia-parafialne(2)` i `intencje-pogrzebowe-2026` (07:26) oraz `robots.txt` (07:29). Zrzuty testowe Borku pochodzą z pobrań z czasu analizy (strona główna, bieżące ogłoszenia, lista intencji pogrzebowych, plik ewidencji: 06:21–06:44 UTC) i z pobrania strony intencji pogrzebowych o 07:26.
- **Przypadkowy pełny przebieg odświeżania (11:11–11:12 UTC).** Polecenie, które miało jedynie sprawdzić składnię, zaimportowało `scripts/refresh_static.mjs`, a ten moduł wywołuje `main()` przy imporcie. Wykonał się pełny przebieg z nowym kodem: ZCK (strona + 7 zapytań kalendarza; strona + 25 zapytań lokalizatora), PUK (lista + 7 stron klepsydr), Gabriel24 (lista + 12 nekrologów), Karawan (lista + kanał + 10 nekrologów), Podwawelskie (7 stron), św. Jadwiga (`jadwiga.eparafia.pl`), Grobonet (403), strony parafii (ok. 20 żądań) oraz eParafia Borku (strona główna, 2 ogłoszenia, lista i strona intencji pogrzebowych, plik ewidencji ok. 1,2 MB). Zmienna `DISCORD_NOTIFY_ENABLED=false` nie była ustawiona, ale w kontenerze nie ma sekretu `DISCORD_WEBHOOK_URL`, więc powiadomienie zostało pominięte (`skipped_reason: missing_secret_DISCORD_WEBHOOK_URL`) — **na Discord nic nie wysłano**. Zapisane przez przebieg pliki (`data/latest.json`, `job.json`, `errors.json`, `source_health.json`, `source_cache.json`, `config/sources.json`) przywrócono z gita; nic z tego przebiegu nie trafiło do repozytorium. Wynik: 23 z 24 włączonych źródeł sprawne, 0 błędów (Grobonet — tolerowane 403); przebieg ujawnił czwarty historyczny wpis z §12.3 p. 1.
- Poza tym nie uruchamiano odświeżania ani workflow (z wyjątkiem sondy z §12.1). Po zmianach wprowadzonych po przypadkowym przebiegu (lista bazowa, filtr wpisów historycznych, grupowanie intencji, budżet czasu, wstrzykiwany fetcher, ochrona stanu pierwszych odczytów) świadomie nie wykonano drugiego przebiegu na żywo, żeby nie powtarzać ruchu — zmiany te pokrywają testy jednostkowe.

### 12.5. Testy i weryfikacja

- `npm test`: **110/110** (przed wdrożeniem 64). Nowe pliki: `tests/refresh.parafie.test.mjs` (19 testów), `tests/refresh.zck_api.test.mjs` (13); dopisane testy w `fetch.test.mjs` (+3), `refresh.parsers.test.mjs` (+3), `refresh.snapshot.test.mjs` (+6, w tym strażnik źródeł wykluczonych; usunięto test „żadne włączone źródło nie dostarcza już kategorii intention”), `discord_notify.test.mjs` (+3).
- 28 nowych zrzutów w `tests/fixtures/`. Zrzuty stron parafialnych są przycięte i **zanonimizowane** (adresy → „ul. Przykładowa”, zamawiający → „Jana Zamawiającego”, intencje za żyjących → „W intencji Parafian”); testy sprawdzają, że żaden rekord tych wartości nie niesie. Wyniki parserów na zrzutach są identyczne z wynikami na oryginalnych stronach (poza celowo przyciętymi listami).
- Interfejs sprawdzony w Chromium (bez sieci, na danych z przebiegu z §12.4): brak błędów JavaScript; sekcje: 25 wzmianek o zgonach, 90 pogrzebów, 123 intencje, 11 grobów.

### 12.6. Ryzyka i następne kroki po wdrożeniu

1. **Pierwszy przebieg produkcyjny** ustala listy bazowe pierwszych odczytów (Dąbie, intencje pogrzebowe Borku, ewidencja Borku) i zapisuje wynik lokalizatora — wykona pełne 25 zapytań do API lokalizatora. Warto przejrzeć dwa–trzy pierwsze przebiegi (status, ostrzeżenia, sekcja Log).
2. **2026-11-02 ok. 23:00 UTC** — koniec tolerancji blokady Grobonetu; jeśli blokada trwa, status przebiegu wróci do `done_with_errors` (R8 — decyzja użytkownika).
3. **Ponowna sonda za ok. 2 tygodnie** — Dębniki i MB Saletyńskiej (obie zostają w sondzie).
4. Zmiana struktury strony parafii da `empty` zamiast `empty_confirmed` i po trzech przebiegach błąd — zrzuty i profile w `PARISH_PROFILES` trzeba wtedy odświeżyć.
5. Bez zmian: zmierzyć opóźnienie aktualizacji lokalizatora ZCK na dowolnym pogrzebie z porządku ZCK (§10 p. 5).

---

## Zmiany wykonane w kodzie

Numery linii odnoszą się do plików po wdrożeniu. Dla nowych funkcji podano pierwszą linię definicji; „Jest” pokazuje sygnaturę i kluczowe fragmenty (`// …` oznacza pominięty kod).

### Plik: `.github/workflows/debniki-probe.yml`

Lokalizacja: cały plik (commit `094034f`) oraz linie 112–113 i 119–121 (commit wdrożeniowy)

Było:

```yaml
name: Dębniki – sonda dostępu
# … jedno żądanie GET do https://debniki.sdb.org.pl/intencje/ i raport kodu odpowiedzi
```

Jest:

```yaml
name: Sonda dostępu do źródeł
# … po jednym żądaniu: Dębniki (/intencje/ i /), kanał RSS Karawana, ZCK (strona,
# API kalendarza i lokalizatora — przepływ z tokenem CSRF), strony parafii
probe "MB Zwycięskiej (Borek) – strona główna (ogłoszenia)" "https://zwycieska.eparafia.pl/" "R4"
probe "MB Saletyńskiej – intencje (wykluczone)" "https://krakow.saletyni.pl/intencje/" "R5, wykluczone"
```

### Plik: `.github/workflows/nekrolog-refresh.yml`

Lokalizacja: linia 50 (krok „Commit refreshed data”)

Było:

```yaml
git add data/latest.json data/job.json data/errors.json data/discord_notified.json data/source_health.json config/sources.json
```

Jest:

```yaml
git add data/latest.json data/job.json data/errors.json data/discord_notified.json data/source_health.json data/source_cache.json config/sources.json
```

### Plik: `scripts/fetch.mjs`

Lokalizacja: linie 210–270, nowe funkcje `readSetCookies` i `createHttpSession` (przed eksportem)

Było:

```js
// brak — fetchText obsługiwał wyłącznie GET bez ciasteczek
```

Jest:

```js
export function createHttpSession({ timeoutMs = 20000, fetchImpl = fetch, retryDelaysMs = RETRY_DELAYS_MS } = {}) {
  const jar = new Map();
  async function request(url, { method = "GET", headers = {}, body } = {}) {
    // … nagłówek bota, ciasteczka z Set-Cookie odsyłane w kolejnych żądaniach,
    // ponowienia tylko dla statusów przejściowych i zerwanych połączeń (304/4xx bez ponowień)
    return { ...last, attempts, error: last.error ? `${last.error} (prób: ${attempts})` : null };
  }
  return { request, cookies: jar };
}
```

### Plik: `scripts/nekrolog_core.mjs`

Lokalizacja: linia 2 (import)

Było:

```js
import { fetchText } from "./fetch.mjs";
```

Jest:

```js
import { fetchText, createHttpSession } from "./fetch.mjs";
```

Lokalizacja: linie 11–28, `REQUIRED_SOURCES` — ZCK, nowy lokalizator, Karawan

Było:

```js
{ id:"zck_funerals", /* … */ list_url:"https://www.zck-krakow.pl/funerals", ...DEFAULT_FLAGS },
{ id:"karawan_nekrologi", /* … */ list_url:"https://karawan.pl/nekrologi/", requires_detail_fetch:true, /* … */ },
```

Jest:

```js
{ id:"zck_funerals", /* … */ list_url:"https://www.zck-krakow.pl/funerals", api_url:"https://www.zck-krakow.pl/funerals/api", days_ahead:7, ...DEFAULT_FLAGS },
{ id:"zck_lokalizator", name:"ZCK Kraków – Lokalizator grobów", type:"zck_lokalizator", url:"https://www.zck-krakow.pl/locator", /* … */ api_url:"https://www.zck-krakow.pl/locator/api", min_interval_hours:20, ...DEFAULT_FLAGS },
{ id:"karawan_nekrologi", /* … */ list_url:"https://karawan.pl/nekrologi/", feed_url:"https://karawan.pl/nekrologi/feed/", requires_detail_fetch:true, /* … */ },
```

Lokalizacja: linie 53–79, `REQUIRED_SOURCES` — 17 nowych źródeł po `facebook_parafia_debniki`

Było:

```js
  { id:"facebook_parafia_debniki", /* … */ enabled:false, distance_km:2.5 }
];
```

Jest:

```js
  { id:"facebook_parafia_debniki", /* … */ enabled:false, distance_km:2.5 },
  { id:"podwawelskie_ogloszenia", /* … */ type:"parafia_ogloszenia", /* … */ },
  // … jozef_ogloszenia, wola_duchacka_ogloszenia, lourdes_ogloszenia (feed_url), borek_ogloszenia,
  // kliny_borkowskie_ogloszenia, dabie_odeszli, zacisze_ogloszenia (parafia_ogloszenia),
  // podwawelskie_intencje, kinga_intencje, plaszow_intencje, bronowickie_intencje (feed_url),
  // skotniki_intencje (feed_url), zacisze_intencje (parafia_intencje),
  { id:"borek_intencje_pogrzebowe", type:"eparafia_intencje_pogrzebowe", /* … */ },
  { id:"borek_ewidencja_grobow", type:"eparafia_ewidencja_grobow", /* … */ data_url:"https://zwycieska.eparafia.pl/clients/_krakow_mbzwyciezkiej/_upload/strona_3955/pio_2480.txt", search_terms:["Gawin","Dereń"], ...DEFAULT_FLAGS }
];
```

Lokalizacja: linia 121, nowa funkcja `daysFromRef`

Było:

```js
// brak
```

Jest:

```js
const daysFromRef=(iso,referenceIso)=>{ /* … */ return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/86400000):null;};
```

Lokalizacja: linia 218, funkcja `parseByListAndDetails`

Było:

```js
async function parseByListAndDetails(source,forceFuneral,listParser,detailParser){
  const r=await fetchText(source.list_url||source.url);
  if(!r.ok) return {rows:[],error:r.error||`HTTP ${r.status}`, /* … */};
  const links=listParser(r.text,source).slice(0,source.max_detail_pages||50);
```

Jest:

```js
async function parseByListAndDetails(source,forceFuneral,listParser,detailParser,{extraCandidates=null,fetcher=fetchText}={}){
  const r=await fetcher(source.list_url||source.url);
  const extra=extraCandidates?await extraCandidates(source,fetcher):null;
  const extraLinks=extra?.links||[];
  if(!r.ok&&!extraLinks.length) return {rows:[],error:r.error||`HTTP ${r.status}`, /* … */};
  const links=uniq([...(r.ok?listParser(r.text,source):[]),...extraLinks],x=>x.url).slice(0,source.max_detail_pages||50);
  // … diagnostyka feed_links / feed_error / list_error; fetcher przekazywany do fetchDetailRows
```

Lokalizacja: linie 248–267, nowe funkcje `parseRssItems`, `parseKarawanFeedXml`, `karawanFeedCandidates`

Było:

```js
// brak
```

Jest:

```js
function parseRssItems(xml){
  const $=cheerio.load(xml,{xml:true});
  // … {title, link, pubDate, html: content:encoded || description} dla każdego <item>
}
const parseKarawanFeedXml=(xml)=>uniq(parseRssItems(xml).map(i=>i.link).filter(u=>KARAWAN_DETAIL.test(u)).map(url=>({url})),x=>x.url);
async function karawanFeedCandidates(source,fetcher=fetchText){ /* … */ }
```

Lokalizacja: linia 283, funkcja `parseZckFuneralsHtml`

Było:

```js
function parseZckFuneralsHtml(text,source){
  // …
  const pageDate=headings.map(firstIsoDate).find(Boolean)||null;
```

Jest:

```js
function parseZckFuneralsHtml(text,source,{fallbackDate=null}={}){
  // …
  const pageDate=headings.map(firstIsoDate).find(Boolean)||fallbackDate||null;
```

Lokalizacja: linie 334–378, nowe funkcje `zckCsrfToken`, `addDaysIso`, `pause`, `zckPageDate`, `requestSeriesGuard`, `zckApiHeaders` i stałe `ZCK_REQUEST_GAP_MS` (400 ms), `ZCK_API_BUDGET_MS` (120 s)

Było:

```js
// brak
```

Jest:

```js
function zckCsrfToken(html){ /* … */ return clean($('meta[name="csrf-token"]').attr('content'))||null; }
function requestSeriesGuard(budgetMs){
  // … stopReason(): 'timeout_budget' po budżecie, 'network' po 2 kolejnych zapytaniach ze statusem 0
}
function zckApiHeaders(token,referer){ return { /* … */ 'x-csrf-token':token, 'x-requested-with':'XMLHttpRequest', referer }; }
```

Lokalizacja: linia 380, funkcja `parseZckFunerals`

Było:

```js
async function parseZckFunerals(source){
  const r=await fetchText(source.list_url||source.url);
  // …
  const rows=parseZckFuneralsHtml(r.text,source);
  const status=rows.length?'ok':(zckConfirmsNoFunerals(r.text)?'empty_confirmed':'empty');
  return {rows,error:null,diagnostics:{http_status:r.status,accepted_rows:rows.length,parser_status:status}};
}
```

Jest:

```js
async function parseZckFunerals(source,{session=createHttpSession(),gapMs=ZCK_REQUEST_GAP_MS,budgetMs=ZCK_API_BUDGET_MS}={}){
  const r=await session.request(pageUrl);
  const rows=[...parseZckFuneralsHtml(r.text,source)];
  // … dla d=1…days_ahead: POST api_url z JSON.stringify(dzień), nagłówek X-CSRF-Token,
  // parseZckFuneralsHtml(a.text,source,{fallbackDate:day}); budżet i przerwanie serii;
  // błąd tylko gdy nie udał się żaden kolejny dzień (rekordy dnia bieżącego zostają);
  // 'empty_confirmed', gdy każdy dzień ma „Brak pogrzebów”
}
```

Lokalizacja: linie 426–569, nowa sekcja „ZCK: lokalizator grobów” — stałe `ZCK_LOCATOR_QUERIES`, `ZCK_LOCATOR_SKIP_GRAVEYARDS`, `ZCK_LOCATOR_BASELINE` (4 wpisy), `ZCK_LOCATOR_HISTORICAL_DAYS` (365), `ZCK_WATCHED_GRAVES`; funkcje `parseZckGraveyards`, `zckGraveRow`, `zckLocatorRows` (linia 490), `parseZckLokalizator` (linia 528)

Było:

```js
// brak
```

Jest:

```js
const ZCK_LOCATOR_BASELINE=[
  {graveyard:'2',name:'HELENA',surname:'GAWIN',birthday:'13.08.1931',date:'20.10.2003',grave:'LXXII/20/14'},
  {graveyard:'2',name:'HELENA',surname:'DE GAWIN-NIESŁOWSKA',birthday:'16.12.1911',date:'11.11.1994',grave:'XXX/4/16'},
  {graveyard:'2',name:'HELENA',surname:'GAWIN',birthday:'17.04.1929',date:'06.09.1979',grave:'LXIII/2/30'},
  {graveyard:'8',name:'HELENA',surname:'GAWIN',birthday:'02.02.1868',date:'20.12.1942',grave:'F/7/13'}
];
const ZCK_WATCHED_GRAVES=[{graveyard:'2',name:'Adam',surname:'Gawin',birthday:'27.12.1939',date:'26.06.2012',grave:'LXXIV/7/11',
  known_extra:[{name:'HENRYK',surname:'GAWIN',birthday:'28.12.1911',date:'27.06.1962'}]}];
function zckLocatorRows(source,results,{baselineKeys=ZCK_BASELINE_KEYS,watched=ZCK_WATCHED_GRAVES,referenceIso=todayIso()}={}){
  // … wpisy z listy bazowej i z datą zgonu sprzed ponad roku pomijane; obserwowany grób → rekord
  // informacyjny; każda nowa osoba w nim → rekord z force_match i match_reason
}
async function parseZckLokalizator(source,{session=createHttpSession(),gapMs=ZCK_REQUEST_GAP_MS,budgetMs=ZCK_API_BUDGET_MS,/* … */}={}){
  // … strona z tokenem i listą cmentarzy, POST /locator/api {name,surname,birthdate,deathdate,graveyard};
  // 404 = brak wyników; każde nieudane zapytanie → błąd (niepełny przegląd)
}
```

Lokalizacja: linie 590–645, sekcja „PUK” — nowe funkcje `parseEklepsydraEventsHtml`, `enrichPukFromDetails`, stała `PUK_DETAILS_PER_RUN` (12); zmieniona `parsePukPozegnalismy`

Było:

```js
async function parsePukPozegnalismy(source){
  const r=await fetchText(source.list_url||source.url);
  // …
  const rows=parsePukPozegnalismyHtml(r.text,source);
  return {rows,error:null,diagnostics:{http_status:r.status,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
}
```

Jest:

```js
async function parsePukPozegnalismy(source,{state=null,fetcher=fetchText,referenceIso=todayIso(),gapMs=ZCK_REQUEST_GAP_MS}={}){
  const r=await fetcher(source.list_url||source.url);
  // …
  const rows=parsePukPozegnalismyHtml(r.text,source);
  const {details,fetched}=await enrichPukFromDetails(source,rows,{state,fetcher,referenceIso,gapMs});
  return {rows,state:{details},error:null,diagnostics:{http_status:r.status,detail_pages:fetched,accepted_rows:rows.length,parser_status:rows.length?'ok':'empty'}};
}
```

Lokalizacja: linia 690, `parseKarawanNekrologi`

Było:

```js
const parseKarawanNekrologi=(s)=>parseByListAndDetails(s,false,parseKarawanNekrologiHtml,parseKarawanDetailHtml);
```

Jest:

```js
const parseKarawanNekrologi=(s,{fetcher=fetchText}={})=>parseByListAndDetails(s,false,parseKarawanNekrologiHtml,parseKarawanDetailHtml,{extraCandidates:karawanFeedCandidates,fetcher});
```

Lokalizacja: linie 908–1217, nowa sekcja „Parafie: ogłoszenia i intencje” — stałe `PARISH_MAX_AGE_DAYS` (60), `INTENTION_WINDOW` (−7…+31 dni), `PARISH_PROFILES` (linia 1070, 14 profili); funkcje `inferYear`, `parseLooseDate` (934), `leadingName`, `extractDeathNames` (979), `findDeathListNames` (987), `cleanIntentionText` (1019), `intentionDayHeading`, `extractIntentions` (1034), `parishLatestLinks`, `fetchParishDocuments` (1097), `documentLines`, `applyFirstSeen` (1130), `personKey`, `parishRowsFromDocument` (1143), `parseParishSource` (1195)

Było:

```js
// brak
```

Jest:

```js
const PARISH_PROFILES={
  podwawelskie_ogloszenia:{fetch:'page',deaths:true,dates:'headings',heading:/^(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]\s/},
  // … 13 kolejnych profili: fetch 'page' | 'latest_link' | 'feed'; dates 'headings' | 'document' | 'first_seen'
};
function extractDeathNames(text){
  // … znaczniki śp./Ś.p/+/† → '†', koniec zdania listy, z każdego segmentu tylko początkowy ciąg
  // wyrazów pisanych wielką literą (adres i reszta zdania zostają za granicą)
}
function cleanIntentionText(text){
  // … obcięcie zamawiającego („od …”) i intencji za żyjących („oraz w int. …”)
}
async function parseParishSource(source,{fetcher=fetchText,state=null,referenceIso=todayIso()}={}){
  // … rekordy death z date_reported (bez date_death) i intention z date_intention/time_intention;
  // 'empty_confirmed' przy rozpoznanej strukturze bez wpisów; stan pierwszych odczytów dla list bez dat
}
```

Lokalizacja: linie 1218–1270, nowa sekcja „Borek Fałęcki: intencje pogrzebowe (eParafia)” — `parseEparafiaIntencjePogrzeboweHtml` (1223), `latestYearLink`, `parseEparafiaIntencjePogrzebowe` (1258)

Było:

```js
// brak
```

Jest:

```js
const EPARAFIA_FUNERAL_TERM=/^(?:\d{1,2}\.\s+)?(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:r\.?)?\s*(?:godz\.?\s*)?(\d{1,2}[:.]\d{2})?/u;
function parseEparafiaIntencjePogrzeboweHtml(html,source,pageUrl,referenceIso=todayIso()){
  // … „+ Imię Nazwisko” → death; linie terminów → intention (wyłącznie data i godzina, bez zamawiających)
}
```

Lokalizacja: linie 1271–1322, nowa sekcja „Borek Fałęcki: ewidencja grobów (eParafia)” — `ewidencjaMatches`, `parseEwidencjaGrobowJson` (1281), `parseEparafiaEwidencjaGrobow` (1289)

Było:

```js
// brak
```

Jest:

```js
async function parseEparafiaEwidencjaGrobow(source,{session=createHttpSession({timeoutMs:30000}),state=null,referenceIso=todayIso()}={}){
  // … If-Modified-Since z zapisanego Last-Modified; 304 → zapisane wpisy; nazwiska po całych członach;
  // wpis pasujący do fraz z rokiem zgonu sprzed ponad roku pomijany; rok zgonu w year_death
}
```

Lokalizacja: linie 1346–1376, sekcja „Warstwa wspólna” — nowe `isPriorityHit`, `deathWindowDate`, `reuseCachedResult`, `nextSourceCacheEntry`, `INTENTION_SOURCE_TYPES`; zmienione `isIntentionLikeSource`

Było:

```js
const isIntentionLikeSource=(s)=>s?.type==='debniki_intencje'||s?.type==='intencje_plus';
```

Jest:

```js
const isPriorityHit=(row,phrases=HELENA_GAWIN_PHRASES)=>row?.force_match===true||rowMatchesPhrases(row,phrases);
const deathWindowDate=(row)=>row?.date_death||row?.date_reported||null;
function reuseCachedResult(source,entry,now=Date.now()){ /* … wynik z pamięci w oknie min_interval_hours */ }
function nextSourceCacheEntry(source,previous,parsed,now=new Date()){ /* … błąd odczytu nie nadpisuje stanu */ }
const INTENTION_SOURCE_TYPES=['debniki_intencje','intencje_plus','parafia_intencje','eparafia_intencje_pogrzebowe'];
const isIntentionLikeSource=(s)=>INTENTION_SOURCE_TYPES.includes(s?.type);
```

Lokalizacja: linia 1510, funkcja `parseSource`

Było:

```js
async function parseSource(source){
  switch(source.type){
    case 'zck_funerals':return parseZckFunerals(source);
    case 'puk_pozegnalismy':return parsePukPozegnalismy(source);
    // …
    case 'sw_jadwiga_pogrzebowe':return parseSwJadwigaPogrzebowe(source);
```

Jest:

```js
async function parseSource(source,context={}){
  const state=context.state??null;
  switch(source.type){
    case 'zck_funerals':return parseZckFunerals(source);
    case 'zck_lokalizator':return parseZckLokalizator(source);
    case 'puk_pozegnalismy':return parsePukPozegnalismy(source,{state});
    // …
    case 'sw_jadwiga_pogrzebowe':return parseSwJadwigaPogrzebowe(source);
    case 'parafia_ogloszenia':
    case 'parafia_intencje':return parseParishSource(source,{state});
    case 'eparafia_intencje_pogrzebowe':return parseEparafiaIntencjePogrzebowe(source,{state});
    case 'eparafia_ewidencja_grobow':return parseEparafiaEwidencjaGrobow(source,{state});
```

Lokalizacja: linia 1533, lista eksportów — dopisane nowe funkcje i stałe (m.in. `parseZckLokalizator`, `parseParishSource`, `PARISH_PROFILES`, `ZCK_LOCATOR_BASELINE`, `isPriorityHit`, `reuseCachedResult`, `nextSourceCacheEntry`, `INTENTION_SOURCE_TYPES`).

### Plik: `scripts/refresh_static.mjs`

Lokalizacja: linie 4–25 (import), 34 (`CACHE_PATH`), 117–143 (pętla źródeł), 163, 190–200, 230

Było:

```js
      let parsed;
      try {
        parsed = await parseSource(s);
      } catch (error) { /* … */ }
// …
        allRows.push({ ...r, priority_hit: rowMatchesPhrases(r, targetPhrases) });
// …
    const recent_deaths = deaths.filter((r) => inWindow(r.date_death, deathStart, deathEnd));
    recent_deaths.sort((a,b)=> (b.date_death||'').localeCompare(a.date_death||''));
```

Jest:

```js
const CACHE_PATH = 'data/source_cache.json';
// …
      const cacheEntry = previousCache?.[s.id] || null;
      let parsed = reuseCachedResult(s, cacheEntry);
      if (!parsed) {
        try {
          parsed = await parseSource(s, { state: cacheEntry?.state ?? null });
        } catch (error) { /* … */ }
      }
      const nextEntry = nextSourceCacheEntry(s, cacheEntry, parsed);
      if (nextEntry) sourceCache[s.id] = nextEntry;
// …
        allRows.push({ ...r, priority_hit: isPriorityHit(r, targetPhrases) });
// …
    const recent_deaths = deaths.filter((r) => inWindow(deathWindowDate(r), deathStart, deathEnd));
    recent_deaths.sort((a,b)=> (deathWindowDate(b)||'').localeCompare(deathWindowDate(a)||''));
// … sortowanie trafień uwzględnia date_reported; zapis: await writeJson(CACHE_PATH, sourceCache);
```

### Plik: `scripts/discord_notify.mjs`

Lokalizacja: linie 67–71 (`buildDiscordMessage`), 90 i 110 (nowe `buildIntentionGroupMessage`, `groupHitsForSending`), 222–256 (`notifyCzerwonaHelena`), 267 (eksport)

Było:

```js
  const details = [];
  if (row?.date_death) details.push(`Data zgonu: ${cleanValue(row.date_death)}`);
// …
  for (const hit of hits) {
    // … jedna wiadomość na każde nowe trafienie
    const post = await postDiscordWebhook(webhookUrl, buildDiscordMessage(hit, mentionIds), fetchImpl, mentionIds);
```

Jest:

```js
  const details = [];
  if (row?.match_reason) details.push(`Powód zgłoszenia: ${cleanValue(row.match_reason)}`);
  if (row?.date_death) details.push(`Data zgonu: ${cleanValue(row.date_death)}`);
  if (!row?.date_death && row?.year_death) details.push(`Rok zgonu: ${cleanValue(row.year_death)}`);
  if (row?.date_reported) details.push(`Data ogłoszenia: ${cleanValue(row.date_reported)}`);
// …
  for (const group of groupHitsForSending(fresh)) {
    // … nowe intencje jednego źródła — jedna wiadomość z listą terminów; klucz każdej intencji zapisywany osobno
    const message = group.length > 1 ? buildIntentionGroupMessage(group, mentionIds) : buildDiscordMessage(group[0], mentionIds);
```

### Plik: `app.js`

Lokalizacja: funkcja `renderFacts` (linie 80–110), lista diagnostyki w `renderStatus` (linie 262–265), `loadAll` (linie 313–322)

Było:

```js
  const INTENTION_SOURCE_TYPES = ["debniki_intencje", "intencje_plus"];
  // … komunikat: „Brak źródła intencji — jedyny dostawca (Parafia Dębniki) jest wyłączony …”
  renderList("graves", graves, "grave", phraseVariants, "Brak grobów w bazie dla monitorowanych nazwisk.");
```

Jest:

```js
    if (!row?.date_death && row?.date_reported) facts.push(`<div class="fact"><strong>Ogłoszono:</strong> ${formatDate(row.date_reported)}</div>`);
    if (!row?.date_death && row?.year_death) facts.push(`<div class="fact"><strong>Rok zgonu:</strong> ${esc(row.year_death)}</div>`);
  if (row?.match_reason) facts.push(`<div class="fact warnText"><strong>Powód zgłoszenia:</strong> ${esc(row.match_reason)}</div>`);
// … w logu: dokumenty=, kolejne dni=, zapytania=, wynik z …
  const INTENTION_SOURCE_TYPES = ["debniki_intencje", "intencje_plus", "parafia_intencje", "eparafia_intencje_pogrzebowe"];
  renderList("graves", graves, "grave", phraseVariants, "Brak grobów monitorowanych nazwisk w dostępnych ewidencjach.");
```

### Plik: `index.html`

Lokalizacja: linia 11 (nagłówek sekcji grobów)

Było:

```html
<h2>Groby monitorowanych nazwisk (baza Grobonet – bez okna czasowego)</h2>
```

Jest:

```html
<h2>Groby monitorowanych nazwisk (lokalizator ZCK, ewidencja Borku Fałęckiego, Grobonet – bez okna czasowego)</h2>
```

### Plik: `config/sources.json`

Lokalizacja: wpisy `zck_funerals` i `karawan_nekrologi` oraz koniec listy

Było:

```json
"list_url": "https://www.zck-krakow.pl/funerals",
"list_url": "https://karawan.pl/nekrologi/",
// … 10 źródeł
```

Jest:

```json
"list_url": "https://www.zck-krakow.pl/funerals",
"api_url": "https://www.zck-krakow.pl/funerals/api",
"days_ahead": 7,
"list_url": "https://karawan.pl/nekrologi/",
"feed_url": "https://karawan.pl/nekrologi/feed/",
// … 27 źródeł: 17 nowych dopisanych przez mergeRequiredSources (zapisane wartości istniejących źródeł bez zmian)
```

### Pliki testów

Lokalizacja: `tests/refresh.parafie.test.mjs` (nowy, 19 testów), `tests/refresh.zck_api.test.mjs` (nowy, 13 testów), dopisane testy na końcu `tests/fetch.test.mjs` (3), `tests/refresh.parsers.test.mjs` (3), `tests/discord_notify.test.mjs` (3), w `tests/refresh.snapshot.test.mjs` test „kategoria intention ma znów dostawców” zamiast poprzedniego oraz testy strażnika źródeł wykluczonych, `isPriorityHit`, `deathWindowDate`, pamięci podręcznej źródeł; test zgodności adresów obejmuje też `feed_url`, `api_url`, `data_url`

Było:

```js
test('żadne włączone źródło nie dostarcza już kategorii intention', () => {
  const intencje = REQUIRED_SOURCES.filter((s) => s.enabled !== false && s.type === 'debniki_intencje');
  assert.equal(intencje.length, 0);
});
```

Jest:

```js
test('kategoria intention ma znów dostawców — parafie zamiast zablokowanych Dębnik', () => {
  const intencje = REQUIRED_SOURCES.filter((s) => s.enabled !== false && isIntentionLikeSource(s));
  assert.ok(intencje.length >= 5);
  assert.ok(!intencje.some((s) => s.type === 'debniki_intencje'));
});
```

### Pliki zrzutów testowych (`tests/fixtures/`)

Lokalizacja: 28 nowych plików

Było:

```text
17 zrzutów (stan z 2026-08-18 – 2026-10-05)
```

Jest:

```text
ZCK: zck_funerals_2026-10-27.html, zck_funerals_api_2026-10-28.html, zck_funerals_api_brak_2026-11-02.html,
     zck_lokalizator_2026-10-27.html, zck_lokalizator_helena_gawin_2_2026-10-27.json, zck_lokalizator_adam_gawin_2_2026-10-27.json
Karawan: karawan_feed_2026-10-27.xml, karawan_list_2026-10-27.html; PUK: eklepsydra_szczegoly_2026-10-27.html
Parafie (przycięte i zanonimizowane): podwawelskie_ogloszenia, jozef_ogloszenia, wola_duchacka_ogloszenia,
     lourdes_ogloszenia_feed, borek_strona_glowna, borek_ogloszenia (2026-10-25), kliny_borkowskie_lista,
     kliny_borkowskie_ogloszenia (2026-10-25), dabie_odeszli, zacisze_ogloszenia, podwawelskie_intencje, kinga_intencje,
     plaszow_intencje, bronowickie_intencje_feed, skotniki_intencje_feed, zacisze_intencje,
     borek_intencje_pogrzebowe_lista, borek_intencje_pogrzebowe_2026, borek_ewidencja_grobow (2026-10-26)
```

### Dokumentacja (`README.md`, `Instrukcja_odczytu_zrodel_Nekrolog.md`)

Lokalizacja: README §1, §2, §3, §4, §5, §6, §8, §9; Instrukcja §0 (nowy podrozdział §0.1)

Było:

```text
README: kategoria intention „brak czynnego źródła”; sonda „Dębniki – sonda dostępu” (jedno żądanie);
Instrukcja §0: „kategoria intention nie ma obecnie żadnego dostawcy”
```

Jest:

```text
README: opis sesji HTTP i data/source_cache.json, okno wzmianek po date_reported, force_match, tabela 27 źródeł,
reguły prywatności, lista bazowa lokalizatora, pułapki (data ogłoszenia ≠ data zgonu, adres/zamawiający kończą odczyt,
przegląd wszystkich cmentarzy przed wdrożeniem ewidencji), grupowanie intencji na Discordzie, anonimizacja zrzutów,
nowe pola diagnostyki, sonda rozszerzona, źródła świadomie wykluczone (Polska Press, Agora, eCmentarze, Grobonet,
Facebook, MB Saletyńskiej i in.). Instrukcja §0.1: zmiany w źródłach istniejących i tabela 17 nowych źródeł.
```
