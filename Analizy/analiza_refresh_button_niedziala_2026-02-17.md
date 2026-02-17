# Analiza: przycisk „Odśwież” nie działa (UI Nekrolog)

## Prompt użytkownika
> Przeprowadź pełną analizę kodu aplikacji.
> Przycisk "Odśwież" nie działa.
> Po naciśnięci aplikacja chwilę "myśli" a nazwa przycisku zmienia się na "Odświeżanie..."
> Kontrolka Status wyświetla: Status: done_with_errors
> Log na dole wyświetla: snapshot: OK job: OK sources: 13
> Nie zmienia się godzina aktualizacji:
>
> Snapshot: 2026-02-17T14:11:23.492Z
> Job: 2026-02-17T14:11:25.109Z
>
> Przeprowadź pełną i wnikliwą analizę przyczyny.
> Rozpisz krok-po-kroku co powinna robić aplikacja a co robi.
> Masz pełen dostęp do internetu i do Firebase poprzez plik test.json
> Sprawdź poprawność zapisywanych danych - sam odczytaj jeszcze raz wszystkie dane ze źródeł i sprawdź ich poprawność zapisu w Firebase i wyświetlania w aplikacji.
>
> Następnie sprawdź czemu przycisk nie działa i co należy zrobić, żeby funkcjonalność odświeżania danych działała poprawnie przez UI użytkownika.

---

## 1) Co **powinno** dziać się po kliknięciu „Odśwież”

1. UI wywołuje `runRefresh()`.
2. `runRefresh()` blokuje przycisk i zmienia tekst na „Odświeżanie…”.
3. UI woła `requestRefresh(jobRef)`, które:
   - wysyła `POST` na endpoint backendu (`requestRefreshViaBackend`),
   - po sukcesie backendu zapisuje w `Nekrolog_refresh_jobs/latest` pola typu `requested_at`, `trigger=manual_ui`.
4. Backend (`functions/index.mjs`) uruchamia `workflow_dispatch` w GitHub Actions.
5. Workflow uruchamia `scripts/refresh.mjs`, który:
   - pobiera źródła,
   - zapisuje nowy snapshot,
   - aktualizuje status joba.
6. UI powinno odświeżyć widok po zakończeniu joba (najlepiej polling statusu, a nie jednorazowy odczyt).

## 2) Co dzieje się **faktycznie**

1. Kliknięcie przycisku faktycznie zmienia label na „Odświeżanie…”, bo to robi frontend lokalnie.
2. UI wysyła żądanie na fallback endpoint wyliczony jako:
   `https://europe-central2-karty-turniej.cloudfunctions.net/requestNekrologRefresh`.
3. Ten endpoint zwraca **404 Page not found** (zweryfikowane ręcznie `curl`).
4. Ponieważ backend nie przyjmuje żądania, nie ma nowego triggera manualnego i nie ma nowego przebiegu odświeżenia z UI.
5. UI i tak robi `loadAll()` natychmiast po próbie, więc odczytuje te same stare dane (`snapshot` i `job`) — stąd identyczne godziny.
6. Status `done_with_errors` pochodzi z ostatniego harmonogramowego przebiegu (nie z kliknięcia UI), gdzie był błąd źródła Facebook (`ENETUNREACH`).

Wniosek: przycisk „nie działa”, bo backend endpoint jest błędnie skonfigurowany/niedostępny, a UI nie czeka na faktyczne zakończenie joba.

## 3) Weryfikacja danych w Firebase (stan aktualny)

Odczytane dokumenty:
- `Nekrolog_snapshots/latest`: `generated_at=2026-02-17T14:11:23.492Z`.
- `Nekrolog_refresh_jobs/latest`: `finished_at=2026-02-17T14:11:25.109Z`, `status=done_with_errors`, błąd Facebook.
- `Nekrolog_config/sources`: 13 źródeł.

To jest spójne z widokiem UI: `snapshot: OK job: OK sources: 13`.

## 4) Weryfikacja źródeł „na żywo” i porównanie z parserami

Przepuściłem wszystkie źródła przez parsery lokalnie (bez zapisu):
- `zck_funerals`: 19 rekordów,
- `puk_pozegnalismy`: 78 rekordów,
- `par_ruczaj_intencje`: 22 rekordy (wzmianki „+ / †”),
- `par_jp2_intencje`: 34 rekordy (wzmianki „+ / †”),
- większość `generic_html`: 0 rekordów (parser dla nich praktycznie niezaimplementowany),
- `facebook_parafia_debniki`: błąd sieci (`ENETUNREACH`), zgodny z Firestore.

### Krytyczna niespójność

Aktualny kod `scripts/refresh.mjs` ma filtr:
- dla źródeł „intencje” (`isIntentionLikeSource`) **pomija** rekordy typu `death`.

Po odtworzeniu logiki skryptu „jak powinno być teraz” wyszło:
- `recent_deaths=4` (tylko PUK),
- `upcoming_funerals=13`.

Natomiast w zapisanym snapshotcie jest:
- `recent_deaths=60`,
- w tym masowo wpisy z `par_ruczaj_intencje` i `par_jp2_intencje`.

To wskazuje, że produkcyjny przebieg, który zapisał snapshot o 14:11, działał na innej wersji logiki niż lokalny kod repo (albo na innym ref/branch/workflow).

## 5) Dlaczego użytkownik widzi brak zmiany godzin

Bezpośrednia przyczyna:
- żądanie refresh z UI nie dociera do działającego endpointu (404),
- UI po krótkiej animacji czyta stare dane,
- nie ma polling/retry po backendowym `queued`.

Pośrednia przyczyna:
- nawet gdyby dispatch działał, obecny frontend nie monitoruje stanu joba do czasu realnej zmiany `updated_at`.

## 6) Co trzeba zrobić, żeby UI odświeżanie działało poprawnie

### A. Naprawić endpoint backendu
1. Ustawić **prawdziwy URL funkcji 2nd gen** w `config.js` jako `backend.refreshEndpoint` (nie polegać na fallbacku `cloudfunctions.net`).
2. Jeśli endpoint ma sekret, ustawić zgodne `backend.refreshEndpointSecret`.
3. Potwierdzić ręcznie `POST` -> `202/ok` i czy uruchamia się właściwy workflow.

### B. Zweryfikować, że backend odpala właściwy workflow/ref
1. Sprawdzić sekrety funkcji: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WORKFLOW_ID`, `GITHUB_WORKFLOW_REF`.
2. Upewnić się, że wskazują repo i gałąź z aktualnym `scripts/refresh.mjs`.
3. Dodać w job doc np. `dispatched_workflow_id`, `dispatched_ref`, `dispatch_ts`, żeby łatwo diagnozować.

### C. Poprawić UX przycisku
1. Po `requestRefresh` uruchomić polling `Nekrolog_refresh_jobs/latest` co np. 3–5 s.
2. Zatrzymać polling, gdy:
   - `status` przejdzie z `running` do `done/done_with_errors/error`,
   - lub `updated_at` zmieni się względem wartości startowej.
3. Dopiero wtedy zrobić końcowe `loadAll()` i odblokować przycisk.
4. W logu pokazać wyraźnie: „dispatch accepted”, „job running”, „job finished”.

### D. Poprawić jakość danych
1. Dopisać parsery dla realnych `generic_html` źródeł (obecnie prawie wszystkie zwracają 0 i często bez błędu, co maskuje brak danych).
2. Utrzymać filtr usuwający „intencje” z listy zgonów (żeby nie było śmieciowych rekordów).
3. Rozważyć oznaczanie źródeł z 0 rekordów przez dłuższy czas jako `warning`, żeby to było widoczne operacyjnie.

## 7) Podsumowanie przyczyny

- Główna przyczyna „przycisk nie działa”: **nieprawidłowy endpoint backendu (404)** + brak monitorowania zakończenia asynchronicznego joba w UI.
- Dodatkowy problem systemowy: **niespójność wersji logiki refresh między kodem repo a tym, co aktualnie zapisuje snapshoty w produkcji**.

---

## Aktualizacja po dodatkowym zgłoszeniu (2026-02-17)

### Prompt użytkownika
> Przeczytaj plik: Analizy/analiza_refresh_button_niedziala_2026-02-17.md
>
> Niespójność danych może wynikać z tego, że została zmieniona logika zapisu zgonów. Nie są teraz brane pod uwagę intencje. To kawałek summary ze zmiany:
>
> Summary
>
>     Dodałem wykrywanie źródeł „intencyjnych” (Intencje, Msze w intencji) w nowej funkcji isIntentionLikeSource, bazując na id, name, url i type źródła. Dzięki temu mechanizm rozpoznaje strony, które nie powinny zasilać sekcji najnowszych zgonów.
>
>     Zmieniłem agregację w refresh.mjs: dla wykrytych źródeł intencyjnych wpisy kind === "death" są pomijane już na etapie zbierania rekordów (allRows), więc nie trafiają później do deaths / recent_deaths (okno do 7 dni wstecz pozostaje bez zmian).
>
>     Wyeksportowałem helper isIntentionLikeSource i rozszerzyłem testy parserów o przypadki potwierdzające, że źródło typu „Msze w intencji” jest wykrywane jako intencyjne, a zwykłe źródło pogrzebowe — nie.
>
>
> Jeżeli to jest ta niespójność to wprowadź proponowane poprawki a następnie zaktualizuj plik z analizą.

### Ocena
Tak — to bardzo prawdopodobnie jest główne źródło niespójności listy `recent_deaths` względem oczekiwanych danych.

### Wprowadzone poprawki
1. Potwierdzono i utrzymano filtr źródeł intencyjnych (`isIntentionLikeSource`) podczas budowania `allRows`.
2. Dodano dodatkowe zabezpieczenie na poziomie rekordu: nowa funkcja `isIntentionLikeRow(row)` wykrywa treści intencyjne po polach wpisu (`name`, `note`, `source_name`, `url`).
3. Agregacja w `refresh.mjs` została rozszerzona o warunek: wpis `kind === "death"` jest odrzucany, gdy źródło **lub sam rekord** wygląda na intencyjny.
4. Testy parserów rozszerzono o przypadki dla `isIntentionLikeRow` (pozytywny i negatywny), aby ograniczyć ryzyko regresji.

### Znaczenie operacyjne
Ta poprawka redukuje ryzyko „przecieku” wpisów intencyjnych do `recent_deaths` nawet wtedy, gdy źródło ma niejednoznaczny `id/type`, ale sam tekst wpisu wskazuje na intencje.
