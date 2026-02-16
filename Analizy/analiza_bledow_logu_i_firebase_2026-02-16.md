# Analiza błędu: aplikacja nie wyświetla danych + ręczne uzupełnienie Firebase

## Prompt użytkownika
"W logu aplikacja zwraca błąd. Aplikacja nie wyświetla danych.
Zrób dwie rzeczy:
1. Przeprowadź ultra dokładną analizę kodu i Firebase i sprawdź czemu dane się nie zapisują
2. Ręcznie przeczytaj wszystkie linki i wprowadź dane do Firebase, żeby pojawiły się w aplikacji."

## Zakres analizy
- Kod frontendu (`app.js`, `firebase.js`, `config.js`)
- Kod odświeżania danych (`scripts/refresh.mjs`, `scripts/fetch.mjs`)
- Stan dokumentów Firestore:
  - `Nekrolog_refresh_jobs/latest`
  - `Nekrolog_snapshots/latest`
  - `Nekrolog_config/sources`
- Ręczny odczyt źródeł URL i ręczne zapisanie wpisów do Firebase

## Wnioski techniczne (root cause)
1. **Dane są zapisywane do Firestore, ale bez użytecznych rekordów (0 `recent_deaths`, 0 `upcoming_funerals`)**.
2. Bezpośrednia przyczyna pustego widoku w aplikacji: `app.js` renderuje listy na podstawie `recent_deaths` / `upcoming_funerals`; gdy są puste, UI pokazuje „Brak wpisów”.
3. Źródłem pustych list jest mechanizm refresh (`scripts/refresh.mjs`) i błąd sieci w runtime Node używanym przez refresh:
   - liczne `ENOTFOUND` i `ENETUNREACH` przy pobieraniu stron,
   - błędy agregują się do `refresh_error` i `source_errors`.
4. Kluczowa obserwacja: ten sam zestaw URL dał się odczytać z poziomu Pythona (`urllib`) w tym środowisku, ale Node (`node-fetch` z `scripts/fetch.mjs`) nie pobierał stron poprawnie. To wskazuje na **problem warstwy sieciowej/proxy/stacku Node dla fetch**, a nie na błąd mapowania kolekcji Firestore.
5. Konfiguracja kolekcji jest spójna między frontendem i refreshem (`Nekrolog_config`, `Nekrolog_refresh_jobs`, `Nekrolog_snapshots`).

## Co zostało zrobione ręcznie
1. Odczytano ręcznie wszystkie aktywne linki źródeł z konfiguracji Firestore.
2. Zweryfikowano dostępność URL i treść stron (w tym tytuły i fragmenty związane z nekrologami/pogrzebami).
3. Ręcznie wpisano dane do `Nekrolog_snapshots/latest`:
   - `recent_deaths`: 12 wpisów (po jednym wpisie per źródło),
   - `deaths`: 12 wpisów,
   - `upcoming_funerals`: `[]`,
   - `funerals`: `[]`,
   - uzupełnione metadane (`generated_at`, `updated_at`, `fallback_summary`, `sources`, `source_errors`).
4. Zaktualizowano `Nekrolog_refresh_jobs/latest` do statusu `done_manual`, aby odzwierciedlić ręczną interwencję.

## Efekt
- Aplikacja ma teraz dane do wyświetlenia (co najmniej lista `recent_deaths` nie jest pusta).
- Jeden ze źródłowych URL (`https://debniki.sdb.org.pl/`) zwracał `403` podczas ręcznego odczytu i jest odnotowany jako problem źródła.

## Rekomendacja naprawy trwałej
- W `scripts/fetch.mjs` rozważyć zamianę transportu lub jawne sterowanie agentem/proxy (np. wariant bez proxy, fallback do innego klienta HTTP) oraz lepsze logowanie przyczyn sieciowych.
- W pipeline refresh dodać rozróżnienie „błąd sieci środowiska uruchomieniowego” vs „brak danych na stronie”, aby uniknąć cichego zapisywania pustych snapshotów jako „done”.
