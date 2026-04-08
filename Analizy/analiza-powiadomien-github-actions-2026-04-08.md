# Analiza: lawina powiadomień email z GitHub Actions (Nekrolog)

## Prompt użytkownika
"Otrzymuję ogromną ilość powiadomień email dotyczącą problemów z tym repo. Sprawdź co to jest, czemu samo się robi oraz dlaczego ciągle wywala błąd."

## Co generuje maile
Maile pochodzą z **GitHub Actions** dla workflow o nazwie **"Nekrolog Refresh"**.

Plik workflow:
- `.github/workflows/refresh.yml`

W tym pliku jest harmonogram:
- `cron: "*/30 * * * *"` → uruchamianie **co 30 minut**

To tłumaczy, dlaczego „samo się robi” i dlaczego powiadomień jest bardzo dużo.

## Dlaczego ciągle failuje
Workflow uruchamia skrypt:
- `node scripts/refresh.mjs`

Skrypt wymaga sekretu środowiskowego:
- `FIREBASE_SERVICE_ACCOUNT_JSON`

W kodzie jest twarde wymaganie:
- funkcja `mustEnv(name)` rzuca błąd `Brak env: FIREBASE_SERVICE_ACCOUNT_JSON`, jeśli zmienna nie jest ustawiona.

Lokalna reprodukcja błędu (bez ustawionego sekretu) daje dokładnie taki błąd:
- `Error: Brak env: FIREBASE_SERVICE_ACCOUNT_JSON`

To bardzo prawdopodobnie jest główna przyczyna stałych faili na CI: workflow startuje z crona, ale nie ma dostępnego poprawnego sekretu (nieustawiony, literówka, zły scope environment/repository, lub niepoprawny JSON w sekrecie).

## Dodatkowa obserwacja
W repo są **dwa podobne workflowy**:
1. `.github/workflows/refresh.yml` (co 30 min, nazwa: "Nekrolog Refresh")
2. `.github/workflows/nekrolog-refresh.yml` (co 4h15)

To zwiększa liczbę uruchomień i potencjalnych błędów/powiadomień, jeżeli oba są aktywne.

## Rekomendacje naprawy
1. Sprawdzić i poprawić sekret repo:
   - `Settings -> Secrets and variables -> Actions -> FIREBASE_SERVICE_ACCOUNT_JSON`
   - wartość musi być poprawnym JSON-em konta serwisowego Firebase.
2. Ograniczyć spam:
   - tymczasowo wyłączyć harmonogram `*/30 * * * *` lub
   - wyłączyć/usunąć zdublowany workflow.
3. Ujednolicić tylko jeden workflow odświeżania, aby nie dublować uruchomień.
4. (Opcjonalnie) dodać „guard” na początku joba: jeżeli sekretu brak, zakończyć z czytelnym komunikatem i bez ciężkiej części procesu.
