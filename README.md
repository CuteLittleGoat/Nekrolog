# Nekrolog (tryb statyczny)

Aplikacja **Nekrolog** agreguje nekrologi i intencje mszalne z wielu niezależnych źródeł internetowych, normalizuje dane do wspólnego formatu JSON i prezentuje je w prostym interfejsie statycznym (HTML/CSS/JS), bez backendu aplikacyjnego.

Projekt działa w modelu:
1. **Pobierz surowe dane ze źródeł** (różne strony WWW),
2. **Wydobądź rekordy parserami źródłowymi**,
3. **Oczyść i ujednolić pola**,
4. **Zapisz wynik do plików statycznych** (`data/latest.json`, `data/errors.json`),
5. **Wyświetl wynik po stronie przeglądarki**.

Dzięki temu aplikację można uruchomić lokalnie lub opublikować jako statyczną stronę bez utrzymywania serwera API.

---

## 1. Architektura rozwiązania

Najważniejsze elementy repozytorium:

- `scripts/refresh_static.mjs` – główny skrypt odświeżania danych (pipeline ETL do JSON).
- `scripts/fetch.mjs` – pobieranie treści źródłowych przez HTTP.
- `scripts/normalize.mjs` – normalizacja rekordów i pól dat/opisów.
- `scripts/nekrolog_core.mjs` – logika wspólna dla przetwarzania rekordów.
- `parsers.js` – parsery specyficzne dla źródeł (nie ma jednego parsera uniwersalnego).
- `config/sources.json` – lista i konfiguracja źródeł.
- `data/latest.json` – bieżący wynik odświeżenia (używany przez frontend).
- `data/errors.json` – błędy i problemy napotkane podczas odświeżania.
- `app.js`, `index.html`, `styles.css` – warstwa prezentacji (interfejs statyczny).

Aplikacja jest celowo podzielona na warstwę pozyskiwania/transformacji i warstwę wyświetlania, co ułatwia diagnostykę błędów parserów i niezależne rozwijanie UI.

---

## 2. Przepływ danych – krok po kroku

### Krok A: Start procesu odświeżania
Uruchomienie `npm run refresh` wywołuje `scripts/refresh_static.mjs`, który inicjuje pełne odświeżenie danych.

### Krok B: Odczyt konfiguracji źródeł
Skrypt czyta `config/sources.json` i przygotowuje listę aktywnych źródeł do pobrania.

### Krok C: Pobranie HTML/treści
Dla każdego źródła wykonywane są zapytania HTTP. Treść jest przekazywana do parsera przypisanego do danego typu źródła.

### Krok D: Parsowanie rekordów
Parsery w `parsers.js` wydobywają dane semantyczne (np. imię i nazwisko zmarłego, daty, miejsce ceremonii, treść nekrologu, link źródłowy).

Ważne założenia:
- parsery mają mechanizmy filtrujące „śmieci techniczne” (np. fragmenty skryptów/analityki),
- parsery są dostrojone do konkretnych struktur HTML,
- część źródeł graficznych jest wspierana bez OCR (z ograniczeniami jakości),
- źródła Facebook pozostają wyłączone (`disabled`) ze względu na niestabilność i ograniczenia dostępu.

### Krok E: Normalizacja
Rekordy przechodzą przez normalizację:
- ujednolicenie nazw pól,
- porządkowanie dat,
- czyszczenie nadmiarowych białych znaków i artefaktów,
- odrzucanie niepoprawnych lub pustych rekordów.

### Krok F: Walidacja jakości
Dodatkowe reguły walidacyjne ograniczają ryzyko błędnych wpisów. Przykładowo parser Karawan posiada ochronę przed potraktowaniem elementów menu jako danych osoby oraz fallback oparty o slug (`nameFromSlug`).

### Krok G: Zapis wyników
Po zakończeniu procesu zapis:
- poprawnych rekordów do `data/latest.json`,
- błędów/ostrzeżeń do `data/errors.json`.

Frontend czyta dane bezpośrednio z plików JSON.

---

## 3. Dlaczego parsery per źródło?

Strony zakładów pogrzebowych i cmentarzy różnią się:
- strukturą DOM,
- nazewnictwem klas,
- sposobem paginacji,
- sposobem osadzania treści (w tym ramki i elementy dynamiczne).

Z tego powodu zastosowano parsery dedykowane, które zapewniają:
- wyższą skuteczność ekstrakcji,
- łatwiejsze naprawy po zmianach po stronie źródła,
- mniejsze ryzyko utraty rekordów przez zbyt ogólne heurystyki.

---

## 4. Frontend i prezentacja danych

Interfejs (plik `index.html` + logika `app.js`) działa jako lekki klient:
- pobiera `data/latest.json`,
- renderuje listę rekordów,
- może filtrować/sortować dane (zgodnie z implementacją w `app.js`),
- prezentuje informacje źródłowe i daty w sposób czytelny dla użytkownika końcowego.

Style (`styles.css`) odpowiadają za układ i czytelność listy nekrologów/intencji.

---

## 5. Testy i jakość

Projekt zawiera testy parserów i scenariuszy odświeżania (`tests/*.test.mjs`) oraz zestaw fixture HTML (`tests/fixtures/*`).

Rekomendowany workflow pracy:
1. `npm test` – najpierw walidacja parserów,
2. `npm run refresh` – dopiero po przejściu testów aktualizacja danych.

To podejście redukuje ryzyko nadpisania `data/latest.json` niepoprawnymi rekordami.

---

## 6. Uruchomienie lokalne

```bash
npm install
npm test
npm run refresh
python3 -m http.server 8000
```

Po uruchomieniu serwera statycznego aplikacja jest dostępna pod adresem lokalnym (np. `http://localhost:8000`).

---

## 7. Ograniczenia i uwagi operacyjne

- Dane zależą od dostępności i struktury zewnętrznych serwisów.
- Zmiana HTML źródła może wymagać aktualizacji parsera.
- Nie wszystkie źródła graficzne dają pełną ekstrakcję bez OCR.
- Część błędów jest spodziewana i raportowana w `data/errors.json` (np. chwilowa niedostępność strony).

---

## 8. Pliki referencyjne

- Szczegółowy opis źródeł: `Instrukcja_odczytu_zrodel_Nekrolog.md`.
- Bieżące dane: `data/latest.json`.
- Raport błędów: `data/errors.json`.
- Lista źródeł: `config/sources.json`.

