# Analiza komunikatu PAT przy przycisku „Wymuś aktualizację”

## Prompt użytkownika (oryginalny)
> „Przeanalizuj kod aplikacji. Naciśnięcie przycisku "Wymuś aktualizację" skutkuje pojawieniem się komunikatu "Brak tokenu GitHub do uruchomienia aktualizacji. Wklej PAT z uprawnieniem Actions: Read and write (token zostanie zapamiętany tylko w tej sesji karty)." To ja mam tam wpisać?”

## Dodatkowa prośba użytkownika
> „Zaktualizuj plik o więcej informacji o PAT. Skąd go wziąć? Czy można go na stałe zaszyć w kodzie? Aplikacja jest do prywatnego użytku jednej osoby i nie potrzebuje zabezpieczeń.”

## Wnioski
- Tak — w obecnej konfiguracji aplikacji to użytkownik klikający „Wymuś aktualizację” ma wkleić **własny GitHub Personal Access Token (PAT)**.
- Mechanizm działa tak:
  1. Front-end wykrywa konfigurację „GitHub Pages” i próbuje uruchomić workflow `refresh-data.yml` przez GitHub API.
  2. Jeśli nie ma tokenu ustawionego w `NEKROLOG_CONFIG.githubRefresh.token` ani w `sessionStorage`, aplikacja pokazuje `prompt(...)` z prośbą o wklejenie PAT.
  3. Token jest zapisywany wyłącznie w `sessionStorage` (`nekrolog_github_token`), więc działa tylko do zamknięcia karty/sesji.
- Wymagane uprawnienie tokenu to **Actions: Read and write** (zgodnie z komunikatem i komentarzem konfiguracji).

## Skąd wziąć PAT (krok po kroku)
1. Zaloguj się do GitHub na koncie, które ma dostęp do repozytorium.
2. Wejdź w: **Settings → Developer settings → Personal access tokens**.
3. Wybierz jeden z typów tokenu:
   - **Fine-grained token** (zalecany): ograniczasz token do konkretnego repo.
   - **Classic token**: prostszy, ale szerszy i mniej precyzyjny.
4. Dla fine-grained:
   - ustaw dostęp tylko do repo `Nekrolog`,
   - nadaj uprawnienia do akcji repozytorium (co najmniej możliwość uruchamiania workflow).
5. Skopiuj wygenerowany token i wklej go w oknie prompt po kliknięciu „Wymuś aktualizację”.
6. Jeśli token przestanie działać (401/403), aplikacja usuwa go z `sessionStorage` i poprosi o ponowne wklejenie.

## Czy można na stałe zaszyć token w kodzie?
### Technicznie: tak
- Kod wspiera to przez pole `NEKROLOG_CONFIG.githubRefresh.token`.
- Jeśli wpiszesz tam token, prompt nie będzie się pojawiał.

### Praktycznie: tylko przy bardzo świadomej decyzji
- Jeżeli token trafi do pliku śledzonego przez git i zostanie wypchnięty do zdalnego repo (nawet prywatnego), nadal jest to sekret zapisany „na stałe” w historii commitów.
- W Twoim scenariuszu „1 osoba, prywatnie” jest to wykonalne, ale nadal kruche operacyjnie (token może wygasnąć, może się zmienić, łatwo go przypadkiem ujawnić np. przez zrzut ekranu/log).

## Najprostsze podejścia dla prywatnego użytku jednej osoby
1. **Obecny model (prompt + sessionStorage)**
   - Bez zmian w kodzie.
   - Najmniej ryzykowne i szybkie.

2. **Stały token lokalnie, bez commita**
   - Uzupełnij `githubRefresh.token` lokalnie.
   - Nie commituj tego pliku (lub trzymaj token w lokalnym, ignorowanym pliku konfiguracyjnym).
   - Dla jednej osoby to zwykle najlepszy kompromis wygody i bezpieczeństwa.

3. **Stały token zacommitowany do repo**
   - Działa, ale to najmniej zalecana opcja.
   - Jeśli już: ustaw bardzo wąski zakres uprawnień i krótki termin ważności tokenu.

## Potwierdzenie w kodzie
- `app.js`: funkcja `getGithubToken()` pobiera token z konfiguracji, potem z `sessionStorage`, a na końcu pyta użytkownika przez `window.prompt(...)` i zapisuje wynik w sesji.
- `app.js`: `forceRefresh()` przy aktywnej konfiguracji GitHub wywołuje `dispatchGithubRefresh()`, które bez tokenu rzuca błąd.
- `app.js`: przy błędach 401/403 token sesyjny jest usuwany (`sessionStorage.removeItem("nekrolog_github_token")`).
- `config.js`: komentarz explicite mówi, by nie commitować tokenu i wkleić go dopiero po kliknięciu „Wymuś aktualizację”.

## Rekomendacja dla obecnego przypadku
- Ponieważ aplikacja jest prywatna i dla jednej osoby: możesz używać promptu albo ustawić token lokalnie „na stałe”, ale **poza commitami**.
- Jeśli chcesz maksymalnej wygody, najprościej dodać lokalny plik z nadpisaniem `NEKROLOG_CONFIG.githubRefresh.token` i ignorować go w `.gitignore`.
