# Analiza komunikatu PAT przy przycisku „Wymuś aktualizację”

## Prompt użytkownika
> „Przeanalizuj kod aplikacji. Naciśnięcie przycisku "Wymuś aktualizację" skutkuje pojawieniem się komunikatu "Brak tokenu GitHub do uruchomienia aktualizacji. Wklej PAT z uprawnieniem Actions: Read and write (token zostanie zapamiętany tylko w tej sesji karty)." To ja mam tam wpisać?”

## Wnioski
- Tak — w obecnej konfiguracji aplikacji to użytkownik klikający „Wymuś aktualizację” ma wkleić **własny GitHub Personal Access Token (PAT)**.
- Mechanizm działa tak:
  1. Front-end wykrywa konfigurację „GitHub Pages” i próbuje uruchomić workflow `refresh-data.yml` przez GitHub API.
  2. Jeśli nie ma tokenu ustawionego w `NEKROLOG_CONFIG.githubRefresh.token` ani w `sessionStorage`, aplikacja pokazuje `prompt(...)` z prośbą o wklejenie PAT.
  3. Token jest zapisywany wyłącznie w `sessionStorage` (`nekrolog_github_token`), więc działa tylko do zamknięcia karty/sesji.
- Wymagane uprawnienie tokenu to **Actions: Read and write** (zgodnie z komunikatem i komentarzem konfiguracji).

## Potwierdzenie w kodzie
- `app.js`: funkcja `getGithubToken()` pobiera token z konfiguracji, potem z `sessionStorage`, a na końcu pyta użytkownika przez `window.prompt(...)` i zapisuje wynik w sesji.
- `app.js`: `forceRefresh()` przy aktywnej konfiguracji GitHub wywołuje `dispatchGithubRefresh()`, które bez tokenu rzuca błąd.
- `config.js`: komentarz explicite mówi, by nie commitować tokenu i wkleić go dopiero po kliknięciu „Wymuś aktualizację”.

## Kontekst UX/Security
- To rozwiązanie jest celowe z punktu widzenia bezpieczeństwa publicznego front-endu (nie trzymamy sekretu na stałe w repo).
- Jeśli to ma być przycisk „dla każdego użytkownika”, obecny model jest niewygodny — sensowniejszy jest backendowy endpoint `/api/refresh`, który uruchamia aktualizację po stronie serwera bez ujawniania PAT w przeglądarce.
