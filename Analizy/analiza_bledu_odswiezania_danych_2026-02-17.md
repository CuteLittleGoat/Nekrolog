# Analiza błędu odświeżania danych — 2026-02-17

## Prompt użytkownika
> Przeprowadź analizę błędu i zapisz wnioski

## Kontekst
Podczas próby odświeżenia danych aplikacji skrypt `scripts/refresh.mjs` kończył się błędem `UNAUTHENTICATED` przy komunikacji z Firestore.

## Co sprawdzono
1. Uruchomienie procesu odświeżania z danymi serwisowymi z `test.json`:
   - komenda: `FIREBASE_SERVICE_ACCOUNT_JSON="$(jq -c . test.json)" npm run refresh`
   - wynik: `Error: 16 UNAUTHENTICATED: Request had invalid authentication credentials...`

2. Bezpośredni test uzyskania tokena OAuth przez `firebase-admin` na bazie tych samych danych:
   - komenda:
     `FIREBASE_SERVICE_ACCOUNT_JSON="$(jq -c . test.json)" node --input-type=module -e '...getAccessToken()...'`
   - wynik: `token_err invalid_grant: Invalid JWT Signature.`

## Wnioski (root cause)
Główna przyczyna błędu nie leży w logice `refresh.mjs`, tylko w poświadczeniach z `test.json`.

`Invalid JWT Signature` oznacza, że podpis JWT tworzony prywatnym kluczem z `test.json` jest odrzucany przez Google OAuth. Typowe przyczyny:
- klucz prywatny i `private_key_id` nie są już aktywne (rotacja/usunięcie klucza),
- plik zawiera nieaktualny lub uszkodzony `private_key`,
- konto serwisowe zostało zmienione/usunięte albo klucz został unieważniony.

Wtórny błąd `16 UNAUTHENTICATED` w Firestore jest konsekwencją niemożności uzyskania prawidłowego tokena OAuth.

## Zalecane działania naprawcze
1. Wygenerować nowy klucz JSON dla tego samego konta serwisowego w GCP IAM.
2. Zastąpić zawartość `test.json` nowym plikiem (lub zaktualizować sekret środowiskowy).
3. Zweryfikować, że w projekcie (`project_id` z pliku JSON) jest włączone Firestore API.
4. Zweryfikować role konta serwisowego co najmniej do odczytu/zapisu wymaganych kolekcji:
   - `Nekrolog_config`
   - `Nekrolog_refresh_jobs`
   - `Nekrolog_snapshots`
5. Ponownie uruchomić:
   - `FIREBASE_SERVICE_ACCOUNT_JSON="$(jq -c . test.json)" npm run refresh`

## Ocena ryzyka
Do czasu wymiany poświadczeń odświeżanie danych z poziomu aplikacji będzie stale kończyć się błędem uwierzytelniania i nie zaktualizuje kolekcji docelowych.

---

## Prompt aktualizacyjny użytkownika (po podmianie `test.json`)
> Przeczytaj analizę Analiza błędu odświeżania danych — 2026-02-17
>
> Podmieniłem plik test.json
> Zaktualizuj dane a następnie sprawdź czemu przycisk nie działa i zapisz wnioski w powyższej analizie.
> Status wyświetla queued
> Log na dole nie wyświetla błędów

## Aktualizacja 2026-02-17 (po podmianie `test.json`)

### 1) Weryfikacja poświadczeń i aktualizacja danych
Po podmianie `test.json` uruchomienie:

- `FIREBASE_SERVICE_ACCOUNT_JSON="$(jq -c . test.json)" npm run refresh`

zakończyło się sukcesem (`OK. Rows: 99 funerals: 10 deaths: 1`). To potwierdza, że wcześniejszy błąd `UNAUTHENTICATED` został usunięty i nowe poświadczenia działają poprawnie.

### 2) Stan danych po odświeżeniu
Po refreshu dokumenty w Firestore zostały zaktualizowane:

- `Nekrolog_snapshots/latest` ma świeże `generated_at`/`updated_at`.
- `Nekrolog_refresh_jobs/latest` ma status `done_with_errors` (czyli proces doszedł do końca, ale część źródeł zwróciła błędy/parsowanie nieobsługiwane).

To oznacza, że pipeline odświeżania danych działa.

### 3) Dlaczego przycisk może „nie działać” (status `queued`)
Główna przyczyna to konfiguracja frontendu:

- W `config.js` pole `window.NEKROLOG_CONFIG.backend.refreshEndpoint` jest puste (`""`).

W obecnej implementacji przycisk „Odśwież” opiera się o backendowy endpoint wyzwalający proces (Cloud Function/GitHub workflow). Jeżeli endpoint nie jest ustawiony, frontend nie ma gdzie wysłać żądania uruchomienia i nie uruchomi faktycznego joba po kliknięciu.

Dlatego użytkownik może obserwować:

- status `queued` (pozostałość po wcześniejszym zapisie/żądaniu),
- brak nowych logów błędu „na dole” (bo bez poprawnie skonfigurowanego endpointu nie dochodzi do pełnego wywołania backendu i brak nowego przebiegu, który wygenerowałby szczegółowy błąd wykonania).

### 4) Co poprawić
1. Uzupełnić w `config.js`:
   - `backend.refreshEndpoint` (URL wdrożonej funkcji HTTP, np. `requestNekrologRefresh`),
   - opcjonalnie `backend.refreshEndpointSecret` zgodny z sekretem backendu.
2. Upewnić się, że wdrożona funkcja backendowa ma poprawnie ustawione sekrety GitHub (`GITHUB_TRIGGER_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WORKFLOW_ID`, `GITHUB_WORKFLOW_REF`).
3. Po kliknięciu przycisku sprawdzić, czy status przechodzi sekwencję:
   - `queued` -> `running` -> `done` / `done_with_errors` / `error`.

## Końcowy wniosek
Po wymianie `test.json` odświeżanie danych działa (dane zostały zaktualizowane). Problem z przyciskiem nie wynika już z Firebase credentials, tylko z braku poprawnej konfiguracji backendowego endpointu wyzwalającego refresh z UI.
