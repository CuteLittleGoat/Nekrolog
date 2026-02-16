# Analiza działania przycisku „Odśwież widok”

## Prompt użytkownika
> Przeprowadź analizę i odpowiedz na pytanie do czego służy przycisk "odśwież widok"?

## Wniosek
Przycisk **„Odśwież widok”** służy do ponownego wczytania danych z lokalnego pliku `data/latest.json` i odświeżenia elementów interfejsu (listy zmarłych, listy pogrzebów, liczników, listy źródeł i statusu). Nie uruchamia zbierania nowych danych ze źródeł zewnętrznych.

## Uzasadnienie techniczne
1. W `index.html` przycisk ma identyfikator `refreshBtn` i etykietę „Odśwież widok”.
2. W `app.js` kliknięcie `refreshBtn` wywołuje funkcję `refresh()`.
3. `refresh()` wykonuje `fetch(DATA_URL, { cache: "no-store" })`, gdzie `DATA_URL` to `./data/latest.json`.
4. Po pobraniu JSON funkcja `render(data)` aktualizuje widok strony.
5. W komunikacie błędu znajduje się wprost informacja, że „ten przycisk tylko odświeża widok”, a aktualizacja danych wymaga uruchomienia `collector.py`.
6. Za faktyczne wymuszenie aktualizacji danych odpowiada osobny przycisk „Wymuś aktualizację”, który wywołuje endpoint `POST /api/refresh`.
