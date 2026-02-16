# Analiza funkcjonalności „Wymuś aktualizację”

## Prompt użytkownika (kontekst)

> Przeprowadź pełną analizę funkcjonalności "Wymuś aktualizację".
> Obecnie aktualizacja danych odbywa się tylko poprzez komendę w ChatGPT.
> Jak użytkownik naciska przycisk to zwraca błąd.
> Zaproponuj nowe rozwiązanie pozwalające na aktualizację danych poprzez naciśnięcie przycisku. Bez logowania do Github, bez tworzenia issues w Github.
> Wszystko ma się odbywać automatycznie po naciśnięciu przycisku.
> Jeżeli potrzeba do tego połączenia z Firebase to zapisz to w analizie.
> Pisząc analizę możesz zaproponować całkowicie nowy model działania aplikacji. Jak backendowo to będzie działać mnie, jako użytkownika, nie interesuje.
> Możesz zbudować całą aplikację od początku.
> Aplikacja musi po naciśnięciu przycisku odczytać zawartość monitorowanych stron, zaktualizować dane o śmierciach i pogrzebach oraz wyświetlić status Heleny Gawin (wraz ze wszystkimi odmianami nazwiska).

---

## 1) Stan obecny i diagnoza problemu

### Co działa teraz
- Front (`app.js`) ma przycisk **„Wymuś aktualizację”**, który wywołuje `POST /api/refresh` (a przy `405` próbuje też `GET`).
- Endpoint `/api/refresh` jest zaimplementowany w lokalnym `serve.py` i uruchamia pełny collector (`collector.run(...)`), który odczytuje źródła i zapisuje `data/latest.json`.

### Dlaczego użytkownik widzi błąd po kliknięciu
Najbardziej prawdopodobny realny scenariusz produkcyjny:
1. Aplikacja frontowa działa jako statyczna strona (np. GitHub Pages / CDN / hosting bez backendu).
2. Kliknięcie przycisku wysyła request na `/api/refresh` pod tym samym hostem.
3. Na statycznym hostingu **nie istnieje backend Python (`serve.py`)**, więc `/api/refresh` zwraca 404 / błąd sieci / CORS.
4. Front pokazuje błąd „Nie udało się wymusić aktualizacji”.

Dodatkowo obecny model „aktualizacji przez komendę w ChatGPT” oznacza, że proces odświeżenia danych nie jest uruchamiany przez infrastrukturę aplikacji, tylko przez zewnętrzną czynność ręczną.

Wniosek: przycisk istnieje w UI, ale produkcyjnie nie ma stabilnego, publicznego i automatycznego backendu do obsługi tego kliknięcia.

---

## 2) Wymagania docelowe (z punktu widzenia użytkownika)

Po kliknięciu „Wymuś aktualizację” system ma automatycznie:
1. pobrać monitorowane strony,
2. przeliczyć listę zgonów i pogrzebów,
3. zapisać nowe dane,
4. zwrócić wynik do frontu,
5. pokazać status dotyczący **Heleny Gawin i wariantów nazwiska**,
6. działać **bez logowania do GitHub i bez GitHub Issues**.

---

## 3) Proponowany nowy model działania (rekomendacja)

## Model A (rekomendowany): Front + Backend API + Firebase

To najprostszy, stabilny i „bezobsługowy” model dla użytkownika końcowego.

### Architektura
- **Frontend (statyczny)**: obecne UI (może pozostać prawie bez zmian).
- **Backend API** (Cloud Functions / Cloud Run / inny serverless):
  - `POST /refresh` – uruchamia collector,
  - `GET /latest` – zwraca aktualny snapshot danych.
- **Firebase**:
  - **Firestore** lub **Realtime Database** – przechowywanie snapshotu,
  - opcjonalnie **Cloud Storage** – backup JSON,
  - opcjonalnie **Firebase Hosting** dla frontu.

### Dlaczego Firebase warto użyć
- eliminuje zależność od GitHub jako „silnika aktualizacji”,
- daje prosty backend + storage + hosting w jednym ekosystemie,
- łatwo dodać limitowanie nadużyć i monitoring,
- frontend może mieć natychmiastowy odczyt nowych danych po refreshu.

---

## 4) Przepływ po kliknięciu przycisku (end-to-end)

1. Użytkownik klika **Wymuś aktualizację**.
2. Front wywołuje `POST https://api.twoja-domena.pl/refresh`.
3. Backend:
   - zakłada lock (aby uniknąć równoległych odświeżeń),
   - pobiera wszystkie źródła z `sources.json` (lub z bazy),
   - odpala parsery i filtr dat,
   - wykrywa trafienia „Helena + Gawin” (w tym warianty),
   - buduje payload jak obecny `latest.json`,
   - zapisuje wynik do Firestore (`/snapshots/latest`) + metadane joba,
   - zwraca JSON: `{ok, generated_at, counts, helena_status}`.
4. Front po sukcesie:
   - pobiera `GET /latest` lub używa payloadu odpowiedzi,
   - renderuje zaktualizowane sekcje,
   - pokazuje status „aktualizacja zakończona” + status Heleny Gawin.

Czas odpowiedzi:
- wariant synchroniczny: 5–30 s (zależnie od źródeł),
- wariant asynchroniczny (lepszy UX):
  - `POST /refresh` zwraca `job_id`,
  - front pyta `GET /refresh/{job_id}` aż do `done`,
  - po `done` pobiera `latest`.

---

## 5) Kontrakt API (propozycja)

### `POST /refresh`
**Response 200**:
```json
{
  "ok": true,
  "job_id": "r_2026_02_16_001",
  "generated_at": "2026-02-16T12:34:56Z",
  "counts": {"deaths": 37, "funerals": 18, "sources": 12},
  "helena_status": {
    "hit": false,
    "hits_count": 0,
    "message": "Brak wpisów dotyczących Heleny Gawin"
  }
}
```

### `GET /latest`
Zwraca aktualny snapshot (format kompatybilny z obecnym `data/latest.json` + `helena_status`).

### `GET /health`
Do monitoringu i diagnostyki.

---

## 6) Status „Helena Gawin” – jak liczyć poprawnie

Obecna logika tokenowa (`helena` + `gawin`) jest dobra jako podstawa i odporna na:
- myślniki,
- brak polskich znaków,
- zamianę kolejności członów.

Rekomendacja rozszerzenia:
- dodatkowa normalizacja form fleksyjnych nazwiska (np. „Gawinowej”, „Gawinówna” – jeżeli pojawiają się w źródłach),
- słownik aliasów/odmian trzymany w konfiguracji,
- pola analizowane: `name`, `note`, `place`, ewentualnie pełen tekst wpisu.

Wynik dla UI:
- `helena_status.hit` (bool),
- `helena_status.hits_count` (int),
- `helena_status.items[]` (opcjonalnie top 3 dopasowania),
- gotowy komunikat dla użytkownika.

---

## 7) Niezawodność i bezpieczeństwo (bez logowania użytkownika)

Ponieważ nie ma logowania użytkowników, trzeba zabezpieczyć endpoint technicznie:
1. **Rate limiting** (np. max 1 refresh / 60 s na IP).
2. **Global lock** odświeżania (już jest koncepcyjnie w `serve.py`, należy zachować).
3. **Timeouty i retry** przy pobieraniu źródeł.
4. **Kolejka zadań** (opcjonalnie), jeśli źródeł będzie dużo.
5. **Cache-Control: no-store** przy `latest`, żeby uniknąć starych danych.
6. **Monitoring błędów** (Sentry/Cloud Logging).

To wszystko działa bez udziału GitHub i bez ręcznej komendy.

---

## 8) Plan wdrożenia krok po kroku

### Etap 1 – API odświeżania
- Przenieść `collector.py` do środowiska uruchamialnego przez HTTP (Cloud Run / Functions).
- Wystawić endpoint `POST /refresh` + `GET /latest`.
- Zapisać wynik do Firebase (Firestore dokument `snapshots/latest`).

### Etap 2 – Frontend
- Ustawić `forceRefreshUrl` oraz `latestDataUrl` na nowe API.
- Dodać obsługę asynchroniczną joba (spinner/progress/status).
- Po sukcesie natychmiast odświeżyć dane na ekranie.

### Etap 3 – Odporność
- Dodać rate limit i lock.
- Dodać logowanie błędów parserów per źródło.
- Dodać fallback: jeśli refresh się nie powiedzie, pokazuj ostatni poprawny snapshot + timestamp.

### Etap 4 – Jakość danych
- Rozszerzyć wykrywanie wariantów nazwiska Heleny Gawin.
- Dodać testy integracyjne parserów i test końcowego payloadu.

---

## 9) Alternatywy (jeśli nie Firebase)

- **Supabase** (Postgres + Edge Functions): podobny model.
- **Własny VPS + cron + API**: większa kontrola, większy narzut utrzymania.
- **AWS Lambda + DynamoDB**: enterprise-ready, ale bardziej złożone wdrożeniowo.

Jeśli priorytetem jest prostota i szybkie wdrożenie: Firebase/Cloud Run będzie najszybszy.

---

## 10) Kryteria akceptacji (Definition of Done)

1. Kliknięcie „Wymuś aktualizację” nie zwraca błędu technicznego.
2. Dane na ekranie zmieniają się po zakończeniu procesu.
3. Użytkownik widzi czas ostatniej aktualizacji.
4. Status Heleny Gawin (i wariantów nazwiska) jest aktualizowany w tym samym cyklu.
5. Rozwiązanie działa bez logowania do GitHub i bez GitHub Issues.
6. Wszystko dzieje się automatycznie po kliknięciu.

---

## 11) Odpowiedź na pytanie „czy potrzebne połączenie z Firebase?”

- **Nie jest obowiązkowe technicznie**, ale
- **jest bardzo sensowne i rekomendowane organizacyjnie** dla tego przypadku:
  - szybkie uruchomienie,
  - proste przechowywanie snapshotu,
  - łatwy backend bez zarządzania serwerem,
  - wygodna integracja ze statycznym frontendem.

---

## 12) Podsumowanie decyzji

Rekomenduję odejście od modelu „manualna komenda w ChatGPT” na rzecz modelu:
**przycisk → publiczne API refresh → collector → zapis snapshotu (Firebase) → natychmiastowe odświeżenie UI**.

To dokładnie spełnia wymaganie pełnej automatyzacji po kliknięciu, bez GitHub logowania i bez tworzenia issues.
