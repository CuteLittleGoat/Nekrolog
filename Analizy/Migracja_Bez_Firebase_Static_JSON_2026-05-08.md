# Migracja bez Firebase — static JSON

## Cleanup po review

Prompt użytkownika:
ZADANIE DLA CODEX — CLEANUP PO MIGRACJI „Nekrolog” NA STATYCZNE JSON + POPRAWKI UX

Wykonane działania:
- usunięto stare pliki Firebase i workflow legacy,
- usunięto martwe style po panelu ręcznego odświeżania,
- poprawiono renderowanie wpisów na frontendzie (fakty, notatka, link, badge trafienia),
- wyłączono źródło Facebook – Parafia Dębniki (`enabled: false`),
- uruchomiono `npm test`,
- uruchomiono `npm run refresh`.
