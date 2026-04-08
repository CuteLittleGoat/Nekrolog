# Analiza odświeżania danych – 2026-04-08

## Prompt użytkownika

> Przeprowadź pełną i ultra dokładną analizę kodu aplikacji pod kątem odświeżania danych.
> Jak naciskam przycisk "Odśwież" to log wyświetla:
>
> === Start odświeżania ===
> [2026-04-08T13:05:20.248Z] Kliknięto przycisk Odśwież.
> [2026-04-08T13:05:20.249Z] Poprzedni czas joba: 2026-04-08T12:58:56.274Z
> [2026-04-08T13:05:20.706Z] Błąd wysyłki żądania odświeżenia: Nie udało się uruchomić backendowego odświeżania: NetworkError when attempting to fetch resource.
> [2026-04-08T13:05:20.983Z] Odświeżono widok danych po zakończeniu procesu.
> [2026-04-08T13:05:20.989Z] === Koniec odświeżania ===

---

## 1) Jak działa obecny flow odświeżania

1. Kliknięcie przycisku `#btnReload` wywołuje `runRefresh()` w `app.js`.
2. `runRefresh()`:
   - blokuje przycisk,
   - dopisuje logi „Start odświeżania”,
   - wywołuje `requestRefresh(jobRef)`,
   - przy sukcesie czeka na zmianę joba (`waitForJobChange`),
   - niezależnie od wyniku robi `loadAll()`,
   - odblokowuje przycisk i kończy log.
3. `requestRefresh(jobRef)` w `firebase.js`:
   - wylicza endpoint backendu (`resolveRefreshEndpoint`),
   - wysyła `POST` pod endpoint (`requestRefreshViaBackend`),
   - przy błędzie zapisuje `manual_request_error` do `Nekrolog_refresh_jobs/latest`,
   - rzuca wyjątek do UI.
4. `resolveRefreshEndpoint()` bierze:
   - najpierw `backend.refreshEndpoint`,
   - jeśli puste, składa URL z `projectId + refreshFunctionRegion + refreshFunctionName`.
5. W aktualnym `config.js` `backend.refreshEndpoint` jest pusty, więc używany jest fallback do Cloud Functions.

---

## 2) Dlaczego widzisz dokładnie taki błąd

### Kluczowa obserwacja

Dla obecnej konfiguracji endpoint wylicza się na:

`https://europe-central2-karty-turniej.cloudfunctions.net/requestNekrologRefresh`

Sprawdzenie HTTP z CLI zwraca **404 Not Found** (endpoint nie istnieje pod tym adresem).

### Co to powoduje w przeglądarce

W fetchu przeglądarkowym (cross-origin) odpowiedź bez poprawnych nagłówków CORS jest raportowana jako błąd sieciowy (`NetworkError when attempting to fetch resource`) zamiast czytelnego payloadu 404. Dlatego UI pokazuje dokładnie taki komunikat.

### Dopasowanie do Twojego logu

- „Kliknięto przycisk…” + „Poprzedni czas joba…” – to początek `runRefresh()`.
- Błąd wysyłki – wyjątek z `requestRefresh()` po nieudanym `fetch`.
- „Odświeżono widok…” – `loadAll()` i cleanup wykonywane są zawsze po `catch`.

To zachowanie kodu jest spójne 1:1 z Twoim logiem.

---

## 3) Dodatkowe problemy wykryte w kodzie (niezależne od bieżącego błędu)

### 3.1 Krytyczny bug: niezdefiniowana zmienna `mode`

W `firebase.js` po udanym wywołaniu backendu jest zapis:

```js
trigger: mode === "backend" ? "manual_ui" : "manual_ui_firestore_fallback",
```

`mode` nie jest nigdzie zdefiniowane. Gdy backend zacznie działać, ten fragment rzuci `ReferenceError: mode is not defined` i przerwie flow mimo poprawnej odpowiedzi endpointu.

To bug „ukryty” przez obecny błąd sieciowy.

### 3.2 Niespójność dokumentacji vs implementacji

W dokumentacji jest opisany „frontend fallback do Firestore”, ale aktualny `requestRefresh` wymaga endpointu backendowego i nie ma realnej ścieżki fallback uruchamianej lokalnie przez UI.

Efekt: jeśli endpoint nie istnieje lub jest niedostępny, odświeżenie nie ma planu B.

---

## 4) Warstwa backendowa – co musi istnieć, aby działało

Funkcja `requestNekrologRefresh` (Firebase Functions v2) powinna:

- przyjmować `POST`,
- opcjonalnie walidować `x-refresh-secret`,
- uruchamiać `workflow_dispatch` dla GitHub Actions,
- zwracać 202 przy powodzeniu.

Jeżeli funkcja nie jest wdrożona pod dokładną nazwą/regionem/projektem wynikającymi z `config.js`, UI zawsze będzie wpadać w błąd wysyłki.

---

## 5) Najbardziej prawdopodobna przyczyna root-cause (priorytety)

1. **Brak wdrożonej funkcji pod URL fallbackowym** (potwierdzone 404 z CLI).
2. Ewentualnie wdrożenie w innym regionie/projekcie/nazwie funkcji.
3. Potencjalnie zły `backend.refreshEndpoint` (tu akurat pusty, więc nie dotyczy bezpośrednio).
4. Potencjalny błąd sekretu (`x-refresh-secret`) – to dałoby raczej 401 (też mógłby wyglądać jak network error w fetch przez CORS), ale najpierw i tak trzeba mieć istniejący endpoint.

---

## 6) Co poprawić, żeby to było stabilne

1. Ustawić jawny `backend.refreshEndpoint` na faktyczny URL wdrożonej funkcji (zamiast liczyć tylko na fallback składany z pól).
2. Naprawić bug `mode is not defined` w `firebase.js`.
3. Ujednolicić dokumentację z rzeczywistym kodem (czy fallback Firestore istnieje czy nie).
4. Dodać diagnostykę w UI:
   - log resolved endpointu przed fetch,
   - log rozpoznania typu błędu (network/cors/http).
5. (Opcjonalnie) Dodać retry/backoff przy błędach chwilowych.

---

## 7) Minimalna checklista operacyjna

1. Zweryfikować deploy funkcji `requestNekrologRefresh` w `europe-central2` dla projektu `karty-turniej`.
2. Jeśli funkcja ma inny URL, wpisać go do `config.js -> backend.refreshEndpoint`.
3. Ustawić `backend.refreshEndpointSecret` zgodnie z `REFRESH_ENDPOINT_SECRET` (jeżeli sekret jest wymagany).
4. Po naprawie endpointu przetestować ponownie – i od razu poprawić `mode` w `firebase.js`, bo inaczej pojawi się nowy błąd wykonania po sukcesie HTTP.

---

## 8) Wynik końcowy analizy

Aktualne niepowodzenie „Odśwież” nie wynika z samego przycisku/UI, tylko z warstwy endpointu backendowego (niedostępny lub nieistniejący URL fallbackowy). Dodatkowo kod zawiera niezależny błąd (`mode`), który ujawni się natychmiast po przywróceniu dostępności endpointu.

---

# Historia zmian – 2026-04-08 (wdrożenie poprawek po analizie)

## Prompt użytkownika

> Przeczytaj analizę Analizy/Refresh.md a następnie wprowadź rekomendowane poprawki.
> Następnie zaktualizuj analizę Analizy/Refresh.md o informację co zostało poprawione. Plik Analizy/Refresh.md ma być pełną historią zmian i poprawek związanych z odświeżaniem.

## Co zostało poprawione w kodzie

1. **Naprawiono krytyczny błąd `mode is not defined`** w `firebase.js`:
   - zapis triggera po udanym żądaniu jest teraz stały: `trigger: "manual_ui"`.
   - usunięto martwą/niepoprawną referencję do nieistniejącej zmiennej `mode`.

2. **Dodano dokładniejszą diagnostykę błędów wywołania backendu**:
   - `fetch` jest opakowany obsługą błędu sieci/CORS i zwraca jednoznaczny komunikat zawierający endpoint.
   - przy błędzie HTTP komunikat zawiera status + endpoint + skrócony payload odpowiedzi.

3. **Rozszerzono ślad diagnostyczny w Firestore (`Nekrolog_refresh_jobs/latest`)**:
   - przy błędzie zapisywane jest `manual_request_endpoint`,
   - przy sukcesie czyszczony jest błąd i również zapisywany jest `manual_request_endpoint`.

4. **Ujednolicono dokumentację z implementacją** (`BACKEND_GITHUB_SETUP.md`):
   - usunięto nieaktualny opis o „fallbacku do zapisu Firestore z UI”,
   - doprecyzowano, że UI działa przez endpoint backendowy (jawny lub składany z region/projectId/functionName).

## Uwagi operacyjne po poprawkach

- Poprawki usuwają błąd wykonania po stronie frontendu i poprawiają debugowanie, ale **nie zastępują poprawnej konfiguracji/deployu endpointu**.
- Jeżeli endpoint nadal zwraca 404 lub jest niedostępny, UI nadal pokaże błąd, ale teraz z dokładniejszą informacją diagnostyczną (w logu i w dokumencie joba).
