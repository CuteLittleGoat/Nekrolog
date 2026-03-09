# Aktualizacja danych Nekrolog (2026-03-09)

## Prompt użytkownika
> Przeczytaj wszystkie dane w źródłach (odczytaj zawartość stron podanych w aplikacji) i zaktualizuj dane w aplikacji.

## Wykonane kroki
1. Uruchomiono skrypt odświeżający dane na podstawie źródeł zapisanych w aplikacji (kolekcja `Nekrolog_config/sources`):
   - `node scripts/refresh_public_firestore.mjs`
2. Skrypt pobrał zawartość stron źródłowych, sparsował wpisy i zapisał zaktualizowany snapshot do Firestore:
   - `Nekrolog_snapshots/latest`
   - `Nekrolog_refresh_jobs/latest`

## Wynik
- Status wykonania: sukces.
- Podsumowanie ze skryptu:
  - `OK. Rows: 78 funerals: 5 deaths: 3`

## Uwagi
- Operacja została wykonana bez zmian w kodzie aplikacji; zaktualizowano dane runtime w Firestore.
