# Migracja bez Firebase na statyczne JSON (2026-05-08)

## Prompt użytkownika
„Zgodnie z rekomendacją rezygnuję z przycisku. Przygotuj mi instrukcję dla agenta AI (Codex od OpenAI), żeby wykonał wszystkie niezbędne czynności (przebudowa frontend i backend).”

## Decyzja
- rezygnacja z Firebase/Firestore,
- usunięcie przycisku odświeżania,
- przejście na statyczne JSON,
- aktualizacja wyłącznie przez GitHub Actions.

## Zmienione pliki
app.js, index.html, styles.css, package.json, package-lock.json, scripts/nekrolog_core.mjs, scripts/refresh_static.mjs, config/sources.json, data/*.json, workflow, README.

## Co zmieniono
- frontend: ładowanie statycznych JSON przez fetch,
- skrypty: refaktor parserów do core + nowy refresh_static,
- workflow: cron + workflow_dispatch + commit danych,
- dane: źródła i pliki data,
- dokumentacja: README + ten raport.

## Testy
- npm test
- npm run refresh

## Manual refresh po migracji
GitHub → Actions → Nekrolog refresh → Run workflow.
