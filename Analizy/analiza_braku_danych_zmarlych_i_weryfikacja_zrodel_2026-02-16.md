# Analiza ponowna: brak wyświetlania danych zmarłych + weryfikacja źródeł (2026-02-16)

## Prompt użytkownika (kontekst)
> Przeczytaj plik Analizy/analiza_braku_danych_zmarlych_i_weryfikacja_zrodel_2026-02-16.md i przeprowadź ponowną analizę.
> Skasuj Analizy/analiza_braku_danych_zmarlych_i_weryfikacja_zrodel_2026-02-16.md i zastąp go nową analizą.
> Część czynności z Analizy/analiza_braku_danych_zmarlych_i_weryfikacja_zrodel_2026-02-16.md zostało wykonane.
>
> Zostało poprawione Firebase - masz pełen dostęp do odczytu i zapisu to sprawdź czy już wszystko jest tak jak być powinno.
> Dodatkowo masz summary z ostatniej poprawki:
> Summary
>
>     Zaktualizowałem scripts/refresh.mjs, żeby automatycznie normalizować problematyczne źródła z sekcji 5.2: wyłączać par_debniki_contact oraz przepinać podgorki_tynieckie_grobonet na .../nekrologi.php podczas scalania konfiguracji źródeł.
>
>     Dodałem walidację rekordów przed zapisem (isMeaningfulRow), aby odrzucać puste wpisy i nie produkować „placeholderów” bez treści w snapshotach (zalecenie 5.3).
>
>     Dodałem budowanie pola refresh_error na podstawie rzeczywistych błędów parserów (meta), żeby snapshot zawierał diagnostykę przy problemach odświeżania.
>
>     Dodałem skrypt narzędziowy scripts/firebase_apply_recommendations_5.mjs, który realizuje zalecenia 5.1/5.2 przez Firestore REST (czyszczenie list i liczników w Nekrolog_snapshots/latest oraz korekta Nekrolog_config/sources).
>
>     Zmiany zostały zacommitowane (e3a48fb) i utworzyłem PR przez make_pr.
>
>
> Aplikacja w dalszym ciągu nie wyświetla danych - więc pewnie nie wszystkie poprawki zostały wprowadzone.
> Przeprowadź pełną analizę oraz propozycję naprawy.

---

## 1) Co sprawdziłem ponownie

1. **Kod parserów i pipeline odświeżania** (`scripts/refresh.mjs`):
   - normalizacja źródeł,
   - walidacja `isMeaningfulRow`,
   - składanie `refresh_error`,
   - sposób zapisu snapshotu.
2. **Kod frontu** (`app.js`) odpowiedzialny za:
   - odczyt snapshotu/job/config,
   - fallbacki pól (`pickRows`, `resolveName`),
   - logikę komunikatu błędu.
3. **Aktualny stan Firestore (live)** przez REST:
   - `Nekrolog_snapshots/latest`,
   - `Nekrolog_refresh_jobs/latest`,
   - `Nekrolog_config/sources`.
4. **Ręczna weryfikacja URL źródeł** (statusy + dostępność treści, sygnały dla parserów).
5. **Porównanie “co powinno być po nowym `refresh.mjs`” vs “co realnie jest w Firestore”.**

---

## 2) Stan Firebase po ostatnich zmianach — co jest już poprawione

### 2.1 `Nekrolog_config/sources`
W konfiguracji źródeł widocznych jest 5 pozycji i **poprawki z sekcji 5.2 są częściowo obecne**:
- `par_debniki_contact` jest ustawione na `enabled: false` ✅
- `podgorki_tynieckie_grobonet` ma URL `.../nekrologi.php` ✅

Czyli korekty źródeł wykonane wcześniej zostały zapisane.

### 2.2 `Nekrolog_snapshots/latest`
W snapshotcie listy są puste i liczniki są wyzerowane (`deaths_count=0`, `funerals_count=0`) — to odpowiada wykonanym porządkom 5.1 ✅

### 2.3 Nadal problematyczne
`Nekrolog_refresh_jobs/latest` ma nadal:
- `status: error`,
- `ok: false`,
- `error_message: HTTP 404`.

To oznacza, że **mechanizm odświeżania nadal kończy się błędem**, więc snapshot nie jest odtwarzany poprawnymi danymi.

---

## 3) Kluczowa diagnoza: dlaczego aplikacja nadal nic nie pokazuje

### 3.1 Dane „porządkowe” zostały zapisane, ale brak udanego odświeżenia
Aktualny snapshot jest “wyczyszczony” (brak wpisów), ale nie ma późniejszego udanego runu, który uzupełniłby go realnymi rekordami z parserów.

### 3.2 Najważniejsza niezgodność: aktualny writer snapshotu wygląda na inny niż `scripts/refresh.mjs`
W snapshotcie są pola typu `helena_status`, `sources_count`, a **brakuje struktury** spodziewanej po obecnym `refresh.mjs` (`payload`, `data`, pełne `sources`, `target_phrases`, spójny `fallback_summary` z nowego pipeline).

Wniosek praktyczny: bardzo możliwe, że środowisko produkcyjne nadal odpala **stary mechanizm** (lub inny skrypt), a nie aktualny `scripts/refresh.mjs` z repo.

### 3.3 Parsowanie nadal nie da danych nawet po uruchomieniu aktualnego skryptu (bez dalszych poprawek parserów)

#### a) ZCK (`parseZckFunerals`) — parser nadal niedopasowany
Kod szuka formatu z przecinkami:
- `HH:MM, Miejsce, Imię Nazwisko`

Aktualna strona ZCK ma strukturę blokową/liniową:
- `HH:MM` + osobna linia miejsca + osobna linia nazwiska (`(lat N)`).

Efekt: parser zwraca 0 wierszy dla ZCK (sprawdzone).

#### b) `intencje_plus` (`parseIntentionsPlus`) — błąd logiczny nadal obecny
Kod robi:
- `clean($('body').text())` (spłaszcza wszystkie białe znaki),
- potem `split(/[\n\r]+/)`.

Po `clean` nie ma już sensownych podziałów linii, więc parser wykrywa zwykle **1 gigantyczną linię** zamiast wielu wpisów `+`/`†`.

Weryfikacja ręczna:
- Ruczaj: obecnie ~35 wzmiankowych linii z `+`/`†`, parser w obecnej logice daje 1.
- JP2: obecnie ~29 wzmiankowych linii z `+`/`†`, parser w obecnej logice daje 1.

---

## 4) Weryfikacja źródeł HTTP (tu i teraz)

Dla zestawu aktualnie skonfigurowanych źródeł z Firebase (`zck`, `ruczaj`, `jp2`, `debniki kontakt`, `grobonet`) odpowiedzi HTTP są obecnie 200.

To ważne: błąd `HTTP 404` w `Nekrolog_refresh_jobs/latest` prawdopodobnie:
1. jest z wcześniejszego przebiegu i nie został nadpisany udanym runem,
2. albo pochodzi z innego źródła/ścieżki uruchomieniowej niż te 5 URL,
3. albo pochodzi z innego executora (stary kod/inna akcja), nie z aktualnej lokalnej konfiguracji.

---

## 5) Dlaczego UI pokazuje „brak wpisów” mimo poprawionego Firebase

UI działa zgodnie z danymi:
- jeśli `recent_deaths` i `upcoming_funerals` są puste, wyświetla „Brak wpisów w oknie czasowym”,
- jeśli jest `job.error_message` albo `snapshot.refresh_error`, log pokazuje przyczynę.

Czyli front nie jest głównym problemem — problemem jest brak poprawnie napełnionego snapshotu po udanym refreshu.

---

## 6) Propozycja naprawy (plan wykonawczy)

### Etap A — ustalenie i unifikacja jedynego „writera” do Firestore (priorytet 1)
1. Ustalić, **który proces faktycznie zapisuje** `Nekrolog_refresh_jobs/latest` i `Nekrolog_snapshots/latest` (GitHub Action, Cloud Function, inny skrypt).
2. Wyłączyć/stoppować stary writer, zostawić **jedną ścieżkę**: `scripts/refresh.mjs`.
3. Dodać do job payload np. `writer_version`/`writer_name` dla jednoznacznej diagnostyki.

Bez tego kolejne poprawki parserów mogą lądować w repo, ale nie trafiać do produkcji.

### Etap B — naprawa parserów (priorytet 1)
1. **ZCK:** przepisać parser na sekwencję linii/elementów (`godzina -> miejsce -> osoba`) zamiast regexu z przecinkami.
2. **intencje_plus:** pobierać tekst z separatorem (`$('body').text('\n')`) i dopiero czyścić per-linia.
3. Dodać twarde testy parserów na fixture HTML dla:
   - ZCK,
   - Ruczaj,
   - JP2.

### Etap C — diagnostyka błędów 404 (priorytet 2)
1. W `refresh_error` odkładać błędy per źródło (`source_id + status + final_url`).
2. W `job.error_message` oprócz skrótu (`HTTP 404`) zapisać też listę źródeł, które poległy.
3. W UI dodać podgląd szczegółów ostatniego odświeżenia (np. 5 ostatnich errorów źródeł).

### Etap D — operacja po wdrożeniu parserów (priorytet 1)
1. Ręcznie uruchomić workflow `Nekrolog Refresh` (`workflow_dispatch`).
2. Zweryfikować po runie:
   - `Nekrolog_refresh_jobs/latest.status = done`,
   - `ok = true`,
   - `error_message = null`.
3. Sprawdzić snapshot:
   - `upcoming_funerals` i/lub `recent_deaths` niepuste,
   - `refresh_error` puste lub zawiera tylko ostrzeżenia, nie krytyczne błędy.

---

## 7) Priorytety naprawy (krótko)

1. **Najpierw:** upewnić się, że produkcja używa właściwego `refresh.mjs` (jeden writer).
2. **Następnie:** naprawić parser ZCK i parser `intencje_plus`.
3. **Na końcu:** dołożyć telemetrykę błędów i testy fixture, żeby problem nie wracał.

---

## 8) Końcowy wniosek

Część poprawek Firebase została wykonana poprawnie (czyszczenie snapshotu + korekty 2 źródeł), ale to **nie rozwiązuje braku danych**, ponieważ:
- refresh kończy się statusem `error` (`HTTP 404`),
- realny writer danych najpewniej nie jest zsynchronizowany z aktualnym kodem w repo,
- dwa kluczowe parsery nadal logicznie nie wydobywają danych ze stron, które faktycznie je zawierają.

Dlatego potrzebna jest jednocześnie: unifikacja procesu odświeżania + poprawa parserów.
