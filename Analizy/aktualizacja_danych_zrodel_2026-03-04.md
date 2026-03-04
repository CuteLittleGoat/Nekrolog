# Aktualizacja danych Nekrolog (2026-03-04)

## Prompt użytkownika
> Zaktualizuj aplikację o nowe dane odczytane z linków podanych jako źródła.

## Wykonane kroki
1. Uruchomiono publiczny refresh danych do Firestore:
   - `node scripts/refresh_public_firestore.mjs`
2. Skrypt odczytał aktywne źródła z `Nekrolog_config/sources`, pobrał dane z linków źródłowych i zapisał wynik do:
   - `Nekrolog_snapshots/latest`
   - `Nekrolog_refresh_jobs/latest`

## Wynik
- Status wykonania: sukces.
- Podsumowanie ze skryptu:
  - `OK. Rows: 96 funerals: 2 deaths: 1`

## Uwagi
- Próba uruchomienia `npm run refresh` (wersja przez Firebase Admin SDK) nie powiodła się lokalnie z błędem uwierzytelnienia (`UNAUTHENTICATED`).
- Aktualizacja została skutecznie wykonana przez wariant `refresh_public_firestore.mjs`.
