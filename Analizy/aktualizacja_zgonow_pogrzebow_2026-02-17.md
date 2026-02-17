# Aktualizacja danych nekrologów i pogrzebów – 2026-02-17

## Prompt użytkownika
"Zaktualizowałem test.json
Przeczytaj dane ze źródeł i zapisz nowe zgony i pogrzeby w aplikacji.
Nie wymyślaj danych, tylko przeczytaj linki podane jako źródła."

## Wykonane kroki
1. Uruchomiono odświeżenie danych skryptem `scripts/refresh.mjs` z poświadczeniami z `test.json`.
2. Skrypt pobrał dane wyłącznie ze skonfigurowanych źródeł i zapisał wynik do kolekcji:
   - `Nekrolog_snapshots/latest`
   - `Nekrolog_refresh_jobs/latest`
3. Zweryfikowano zapis po odświeżeniu przez bezpośredni odczyt dokumentów z Firestore.

## Wynik odświeżenia
- `Rows`: 153
- `upcoming_funerals`: 13
- `recent_deaths`: 60
- `deaths` (łącznie): 95
- `funerals` (łącznie): 58
- Status joba: `done_with_errors` (ok = true)

## Uwagi
- Wystąpił błąd dostępu do źródła Facebook (`ENETUNREACH`), więc to źródło zwróciło `source_error`.
- Pozostałe źródła zostały przetworzone, a dane zapisane w aplikacji.
