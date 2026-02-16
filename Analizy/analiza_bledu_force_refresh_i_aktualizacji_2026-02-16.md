# Pełna analiza błędu „Nie udało się wymusić aktualizacji: HTTP 404” oraz aktualizacji z 16.02.2026 09:06:07

## Prompt użytkownika
> Aplikacja zwraca błąd: "Nie udało się wymusić aktualizacji: HTTP 404. Sprawdź konfigurację NEKROLOG_CONFIG.forceRefreshUrl dla GitHub Pages." po użyciu przycisku "Wymuś aktualizację".
> Przeprowadź pełną analizę błędu oraz możliwości jego wyeliminowania. Dodatkowo sprawdź w jaki sposób została wykonana aktualizacja z 16.02.2026, 09:06:07, która wyświetla się w aplikacji.

## 1) Diagnoza mechanizmu błędu

### 1.1 Co robi front-end po kliknięciu „Wymuś aktualizację”
W `app.js`:
- URL API jest brany z `NEKROLOG_CONFIG.forceRefreshUrl`, a gdy brak konfiguracji, używany jest fallback `"/api/refresh"`.
- Funkcja `forceRefresh()` wysyła `POST` na ten endpoint.
- Gdy otrzyma `405`, robi fallback `GET`.
- Gdy odpowiedź nie jest OK, pokazuje dokładnie komunikat o błędzie i sugestię konfiguracji `NEKROLOG_CONFIG.forceRefreshUrl`.

Wniosek: komunikat `HTTP 404` oznacza, że endpoint wywołany przez front-end nie istnieje pod skonfigurowanym adresem.

### 1.2 Co jest skonfigurowane domyślnie
W `config.js` nie ma ustawionego `forceRefreshUrl` (jest tylko komentarz przykładowy), więc realnie działa fallback do `"/api/refresh"`.

To jest poprawne wyłącznie wtedy, gdy ta sama instancja serwera obsługuje również API refresh.

### 1.3 Gdzie endpoint faktycznie istnieje
W repo endpoint `/api/refresh` obsługuje wyłącznie `serve.py`:
- `POST /api/refresh`
- `GET /api/refresh`

Jeśli aplikacja jest serwowana jako statyczna (np. GitHub Pages), ten endpoint nie istnieje, więc wynik to 404 (lub inny błąd metody w zależności od serwera statycznego).

### 1.4 Potwierdzenie testami lokalnymi
Przeprowadzono testy:
- Serwer statyczny (`python -m http.server`):
  - `POST /api/refresh` → 501 (metoda nieobsługiwana),
  - `GET /api/refresh` → 404 (brak ścieżki).
- Serwer aplikacyjny (`python serve.py`):
  - `POST /api/refresh` → 200 + JSON `{ "ok": true, "generated_at": ... }`.

Wniosek końcowy: błąd użytkownika jest spójny z uruchomieniem front-endu bez backendu `serve.py` albo z brakiem ustawienia `forceRefreshUrl` na działające API poza GitHub Pages.

---

## 2) Możliwości eliminacji błędu

### Opcja A (najprostsza lokalnie / self-host): uruchamiać przez `serve.py`
- Start: `python serve.py`
- Front i API działają z jednego hosta (`/api/refresh` istnieje), więc nie trzeba zmieniać `config.js`.

### Opcja B (zalecana dla GitHub Pages): osobny backend API + ustawienie `forceRefreshUrl`
- Front pozostaje statyczny na GitHub Pages.
- Backend (np. ten sam kod w osobnym serwisie) wystawia `/api/refresh`.
- W `config.js` ustawić pełny URL, np.:
  - `forceRefreshUrl: "https://twoj-backend.example.com/api/refresh"`
- Upewnić się, że backend ma CORS dla domeny front-endu.

### Opcja C (UX / bezpieczeństwo): degradacja funkcji „Wymuś aktualizację”
- Dodać „health-check” endpointu przy starcie UI.
- Gdy endpoint niedostępny (404/5xx/CORS), wyłączyć przycisk i pokazać czytelny status „instancja tylko do odczytu”.
- Pozostawić aktywne tylko „Odśwież widok” (`data/latest.json`).

### Opcja D (architektura bez runtime API): tylko pipeline CI aktualizuje `data/latest.json`
- Usunąć/ukryć przycisk „Wymuś aktualizację” w deployu statycznym.
- Aktualizacje danych robić harmonogramem CI, który commit/publishuje nowe `data/latest.json`.

---

## 3) Jak została wykonana aktualizacja widoczna jako „16.02.2026, 09:06:07”

### 3.1 Skąd bierze się czas w UI
UI pokazuje `generated_at` z `data/latest.json`, konwertując do strefy `pl-PL` (`toLocaleString("pl-PL")`).

W pliku znajduje się:
- `"generated_at": "2026-02-16T08:06:07.494239+00:00"`

To odpowiada lokalnie (CET, UTC+1) właśnie `16.02.2026, 09:06:07`.

### 3.2 Co mówi historia Git
Dla `data/latest.json` commit z tą zmianą to:
- `0155c62` z datą commita `2026-02-16 09:08:49 +0100`.
- W diffie tego commita `generated_at` zmienia się z `07:36:31+00:00` na `08:06:07.494239+00:00`.

To oznacza, że dane zostały wygenerowane tuż przed commitem, a następnie zapisane do repo.

### 3.3 Jak technicznie generowany jest ten timestamp
W `collector.py` timestamp powstaje przez:
- `datetime.now(timezone.utc).isoformat()`
- i jest zapisywany do `data/latest.json`.

Zatem aktualizacja z 09:06:07 została wykonana przez uruchomienie collectora (bezpośrednio lub przez endpoint `/api/refresh`, który woła `collector.run(...)`), a następnie wynik został zacommitowany do repozytorium.

Najbardziej prawdopodobny przebieg:
1. Uruchomiono `collector.py` (lub `POST /api/refresh` na `serve.py`).
2. Wygenerowano `data/latest.json` z UTC `08:06:07`.
3. Około 2 min później wykonano commit `0155c62` z tym plikiem.

---

## 4) Rekomendacja docelowa

Dla GitHub Pages:
1. Wdrożyć osobny backend refresh (Opcja B).
2. Ustawić `NEKROLOG_CONFIG.forceRefreshUrl` na pełny URL backendu.
3. Dodać UX fallback (Opcja C), żeby nie pokazywać użytkownikowi technicznego błędu przy braku API.

Dla środowisk lokalnych i serwerów Python:
- uruchamiać przez `serve.py` i nie korzystać ze statycznego hostingu bez backendu.

## 5) Konkluzja
Błąd `HTTP 404` nie wynika z parsera danych ani z uszkodzonego `data/latest.json`, tylko z braku endpointu `/api/refresh` pod adresem, na który strzela front-end. Aktualizacja widoczna jako `16.02.2026, 09:06:07` pochodzi z wartości UTC zapisanej przez `collector.py` i utrwalonej commitem `0155c62`.
