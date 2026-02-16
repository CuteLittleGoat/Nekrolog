# Backend refresh endpoint (Firebase Function -> GitHub Actions)

Docelowy endpoint backendowy powinien działać jako **Firebase Cloud Function 2nd gen** (technicznie uruchamiana na Cloud Run), żeby zachować jedno repozytorium GitHub jako źródło kodu i automatyzacji.

## Co zostało dodane

- Funkcja HTTP: `requestNekrologRefresh` (`functions/index.mjs`), która:
  - przyjmuje `POST`,
  - opcjonalnie weryfikuje nagłówek `x-refresh-secret`,
  - uruchamia `workflow_dispatch` w GitHub API.
- Workflow GitHub Actions: `.github/workflows/nekrolog-refresh.yml`.
- Frontend fallback:
  - jeżeli `NEKROLOG_CONFIG.backend.refreshEndpoint` jest ustawione, UI woła backend,
  - jeżeli nie, zostaje dotychczasowy tryb (zapis do Firestore).

## Sekrety backendowe (Firebase Functions Secrets)

Ustaw sekrety komendami:

```bash
firebase functions:secrets:set GITHUB_TRIGGER_TOKEN
firebase functions:secrets:set GITHUB_OWNER
firebase functions:secrets:set GITHUB_REPO
firebase functions:secrets:set GITHUB_WORKFLOW_ID
firebase functions:secrets:set GITHUB_WORKFLOW_REF
firebase functions:secrets:set REFRESH_ENDPOINT_SECRET
```

Wartości:
- `GITHUB_TRIGGER_TOKEN` – token GitHub z uprawnieniem do uruchamiania workflow (`actions:write` dla repo).
- `GITHUB_OWNER` – właściciel repo.
- `GITHUB_REPO` – nazwa repo.
- `GITHUB_WORKFLOW_ID` – np. `nekrolog-refresh.yml`.
- `GITHUB_WORKFLOW_REF` – gałąź, np. `main`.
- `REFRESH_ENDPOINT_SECRET` – własny sekret endpointu (nie token GitHub), wysyłany w `x-refresh-secret`.

## Sekrety GitHub Actions

W repo GitHub ustaw:

- `FIREBASE_SERVICE_ACCOUNT_JSON` – JSON konta serwisowego używanego przez `scripts/refresh.mjs`.

## Deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:requestNekrologRefresh
```

Następnie ustaw w `config.js`:

- `backend.refreshEndpoint` – URL wdrożonej funkcji,
- `backend.refreshEndpointSecret` – ten sam sekret co `REFRESH_ENDPOINT_SECRET`.
