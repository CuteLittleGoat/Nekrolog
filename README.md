# Nekrolog (tryb statyczny)

Frontend działa statycznie na GitHub Pages i czyta wyłącznie:
- `data/latest.json`
- `data/job.json`
- `data/errors.json`
- `config/sources.json`

Odświeżanie danych realizuje GitHub Actions (`Nekrolog refresh`):
- cron: `17 * * * *` (co godzinę)
- ręcznie: GitHub → Actions → Nekrolog refresh → Run workflow

Źródło `Facebook – Parafia Dębniki` pozostaje w `config/sources.json`, ale domyślnie jest wyłączone, bo publiczne pobieranie Facebooka z GitHub Actions bywa niestabilne.

Dane są nadal aktualizowane wyłącznie przez GitHub Actions.

Nie ma aktywnego flow Firebase / Firestore ani przycisku ręcznego odświeżania.

## Lokalnie
```bash
npm install
npm run refresh
python3 -m http.server 8000
```

Konfiguracja źródeł: `config/sources.json`.
