# Nekrolog (tryb statyczny)

Aplikacja używa parserów specyficznych dla źródeł (nie jednego parsera ogólnego).
Szczegółowa instrukcja źródeł: `Instrukcja_odczytu_zrodel_Nekrolog.md`.
Źródła graficzne są obsługiwane częściowo bez OCR.
Facebook pozostaje disabled.

## Lokalnie
```bash
npm install
npm test
npm run refresh
python3 -m http.server 8000
```

- Parsery walidują rekordy i odrzucają techniczne śmieci (GTM/clickcease/iframe).
- Parser Karawan ma ochronę przed odczytem menu jako nazwiska oraz fallback nameFromSlug.
- Workflow uruchamia `npm test` przed `npm run refresh`.
