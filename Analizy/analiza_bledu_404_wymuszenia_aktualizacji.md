# Analiza błędu 404 dla przycisku „Wymuś aktualizację”

## Prompt użytkownika
> Po użyciu przycisku do wymuszenia aktualizacji aplikacja zwraca błąd Nie udało się wymusić aktualizacji: HTTP 404
> Przeprowadź analizę przyczyny oraz zaproponuj rozwiązanie

## Objaw
Po kliknięciu przycisku „Wymuś aktualizację” front-end wyświetla komunikat:
- `Nie udało się wymusić aktualizacji: HTTP 404`

## Co robi front-end
W `app.js` funkcja `forceRefresh()` wywołuje endpoint `FORCE_REFRESH_URL = "/api/refresh"` metodą `POST`, a przy `405` próbuje `GET`.

Wniosek: żeby funkcja działała, serwer HTTP musi wystawiać endpoint `/api/refresh`.

## Co robi backend
W `serve.py` endpoint `/api/refresh` jest zaimplementowany:
- `do_POST` obsługuje `POST /api/refresh`
- `do_GET` obsługuje `GET /api/refresh`

Dla innych ścieżek zwracany jest `404`.

## Najbardziej prawdopodobna przyczyna
Aplikacja jest uruchamiana w trybie statycznym (np. przez prosty serwer plików / hosting statyczny), a nie przez `serve.py`.
W takim trybie:
- `index.html`, `app.js`, `data/latest.json` mogą się ładować,
- ale endpoint `/api/refresh` nie istnieje,
- więc żądanie z front-endu zwraca `HTTP 404`.

To tłumaczy dokładnie obserwowany komunikat.

## Proponowane rozwiązanie

### Opcja A (najprostsza operacyjnie): uruchamiać aplikację przez `serve.py`
1. Startować aplikację komendą:
   - `python serve.py`
2. Wchodzić przez:
   - `http://localhost:8000`

Dzięki temu endpoint `/api/refresh` będzie dostępny i przycisk zacznie działać.

### Opcja B (gdy hosting statyczny jest wymagany): rozdzielić backend od frontendu
1. Wystawić osobny backend API (np. ten sam kod z `serve.py` jako osobna usługa).
2. Zmienić `FORCE_REFRESH_URL` na pełny adres API (np. `https://api.twoja-domena.pl/api/refresh`).
3. Dodać CORS po stronie backendu.

### Opcja C (UX fallback): ukryć/wyłączyć przycisk, gdy API nie istnieje
Dodać detekcję dostępności endpointu i:
- jeśli `/api/refresh` odpowiada `404`, wyłączyć przycisk,
- pokazać informację „Ta instancja działa w trybie tylko do odczytu (bez backendu odświeżania)”.

To nie naprawia backendu, ale eliminuje mylący komunikat dla użytkownika.

## Rekomendacja
Najlepszy stosunek koszt/efekt: **Opcja A** w środowisku lokalnym lub serwerowym, gdzie można uruchomić Pythona.
Jeżeli musi pozostać hosting statyczny (np. GitHub Pages), wdrożyć **Opcję B** i jako zabezpieczenie UX dodatkowo **Opcję C**.
