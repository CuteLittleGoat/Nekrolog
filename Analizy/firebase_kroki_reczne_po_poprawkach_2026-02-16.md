# Firebase: kroki ręczne po wdrożeniu poprawek parserów (2026-02-16)

## Prompt użytkownika (kontekst)
> Przeczytaj plik Analizy/analiza_braku_danych_zmarlych_i_weryfikacja_zrodel_2026-02-16.md
> Wdróż wszystkie poprawki.
> Jeżeli coś wymaga konfiguracji w Firebase i sam nie możesz tego zrobić to utwórz mi nowy plik w Analizy i napisz dokładnie co mam zrobić.
> Całą resztę zrób sam.
> Popraw Firebase, popraw kod aplikacji przeprowadź ultra dokładne testy a następnie porównaj wynik testów z ręcznym sprawdzaniem stron.

---

## Co wymaga ręcznego działania po Twojej stronie
W tym środowisku nie mam `FIREBASE_SERVICE_ACCOUNT_JSON`, więc nie mogę wykonać zapisu administracyjnego do Firestore.

### 1) Uruchom workflow odświeżający (po deployu aktualnego kodu)
1. Wejdź: **GitHub → repo Nekrolog → Actions → "Nekrolog Refresh"**.
2. Kliknij **Run workflow** (gałąź z poprawkami).
3. Poczekaj na zakończenie joba `refresh`.

### 2) Zweryfikuj `Nekrolog_refresh_jobs/latest`
W Firestore Console sprawdź dokument:
- kolekcja: `Nekrolog_refresh_jobs`
- dokument: `latest`

Oczekiwane pola:
- `status = "done"`
- `ok = true`
- `error_message = null` (lub brak)
- `writer_name = "scripts/refresh.mjs"`
- `writer_version = "2026-02-16.2"`
- `source_errors` (tablica) obecna tylko gdy część źródeł zwróci błędy HTTP.

### 3) Zweryfikuj `Nekrolog_snapshots/latest`
W Firestore Console sprawdź dokument:
- kolekcja: `Nekrolog_snapshots`
- dokument: `latest`

Oczekiwane pola:
- `writer_name = "scripts/refresh.mjs"`
- `writer_version = "2026-02-16.2"`
- `sources` zawiera poprawione rekordy (normalizacja źródeł)
- `source_errors` zawiera szczegóły błędnych źródeł (`source_id`, `url`, `error`)
- `refresh_error` zawiera złączony skrót błędów
- `recent_deaths` oraz/lub `upcoming_funerals` nie są puste, jeśli źródła zwrócą dane.

### 4) Wymuś korektę źródła kontaktowego Dębniki (jednorazowo)
Jeżeli po refreshu `par_debniki_contact` nadal ma `enabled = true`, ustaw ręcznie:
- `Nekrolog_config/sources` → element `id = "par_debniki_contact"` → `enabled = false`

Ta reguła jest już zaimplementowana w kodzie, więc przy poprawnym uruchamianiu nowego `refresh.mjs` wartość powinna zostać utrzymana automatycznie.

### 5) Jeśli nadal widzisz stary format dokumentów
Jeżeli w `Nekrolog_snapshots/latest` nie ma pól `writer_name/writer_version/source_errors`, to znaczy, że zapis wykonuje **inny (stary) writer**.
Wtedy:
1. Wyłącz stary proces (druga akcja/Cloud Function/cron).
2. Zostaw tylko workflow `Nekrolog Refresh`, który uruchamia `node scripts/refresh.mjs`.

