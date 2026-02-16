# Prompt użytkownika
"W logu aplikacja zwraca błąd. Aplikacja nie wyświetla danych.
Zrób dwie rzeczy:
1. Przeprowadź ultra dokładną analizę kodu i Firebase i sprawdź czemu dane się nie zapisują
2. Ręcznie przeczytaj wszystkie linki i wprowadź dane do Firebase, żeby pojawiły się w aplikacji."

# Ultra dokładna analiza – przyczyna problemu

## 1) Warstwa aplikacji (frontend)
- Aplikacja czyta 3 dokumenty: snapshot (`latest`), job (`latest`) i sources (`sources`) z kolekcji skonfigurowanych w `window.NEKROLOG_CONFIG.firebaseConfig`.
- Lista nekrologów/pogrzebów renderuje się wyłącznie gdy `recent_deaths` lub `upcoming_funerals` mają rekordy z treścią.
- Jeśli oba zbiory są puste, UI pokazuje "Brak wpisów w oknie czasowym" i wpisuje do logu błąd z `refresh_error`/`error_message`.

## 2) Warstwa odświeżania (refresh worker)
- Worker zapisuje `running` -> później `done`/`error` do `*_refresh_jobs/latest`.
- Snapshot (`*_snapshots/latest`) powstaje tylko po udanym odczycie źródeł i parsowaniu.
- W badanym stanie snapshot istniał, ale `deaths=0`, `funerals=0`, `recent_deaths=0`, `upcoming_funerals=0`.
- `refresh_error` zawierał łańcuch błędów sieciowych (`ENOTFOUND`, `ENETUNREACH`) dla praktycznie wszystkich źródeł.

## 3) Firebase – stan danych
- W kolekcjach `Nekrolog_*` dokumenty istniały, ale dane biznesowe były puste (0 rekordów).
- W kolekcjach `Nekrologi_*` (docelowych według instrukcji projektu) dokumentów wcześniej nie było.

## 4) Wniosek root-cause
- Główna przyczyna to awarie sieci po stronie środowiska uruchomieniowego refresha (DNS/routing do źródeł), a nie błąd renderowania UI.
- Efekt: pipeline zapisuje statusy/błędy, ale nie zapisuje użytecznych rekordów wpisów.
- Dodatkowo repo miało konfigurację kolekcji na `Nekrolog_*`, podczas gdy instrukcja operacyjna projektu wskazuje `Nekrologi_*`.

# Ręczne odczytanie linków i seed danych do Firebase
Przeprowadzono ręczny odczyt źródeł poprzez pobranie HTML i wyciągnięcie treści z sekcji nekrologów/pogrzebów. Następnie ręcznie zapisano dane do:
- `Nekrologi_config/sources`
- `Nekrologi_snapshots/latest`
- `Nekrologi_refresh_jobs/latest`

Zakres ręcznie wprowadzonych rekordów:
- `deaths`: 7
- `funerals`: 6
- `recent_deaths`: 4
- `upcoming_funerals`: 6
- `sources`: 9 (wszystkie linki z polecenia)

Uwagi techniczne z ręcznego odczytu:
- `debniki.sdb.org.pl` zwracał ekran ochronny "Just a moment" (anti-bot) dla klienta CLI.
- część serwisów podaje dane dynamicznie, więc do snapshotu dodano także rekordy typu notatka tekstowa (z URL źródła i opisem).

# Co zostało poprawione w kodzie
- Przełączono nazwy kolekcji i komunikaty referencyjne z `Nekrolog_*` na `Nekrologi_*`, aby aplikacja czytała dane z poprawnej przestrzeni kolekcji projektu.

# Rekomendacje dalsze
1. Uruchamiać refresh z hosta z pełnym egresem DNS/HTTPS (bez blokad `ENOTFOUND/ENETUNREACH`).
2. Dodać health-check sieci do joba przed parsowaniem (fail-fast z diagnostyką).
3. Dla źródeł anty-bot dodać fallback: mirror/API/manual queue.
4. Dodać alarm, gdy `recent_deaths + upcoming_funerals == 0` przez >1 cykl.
