# Analiza alternatywnych sposobów odświeżania danych (bez ingerencji w Firebase) – 2026-04-09

## Prompt użytkownika

> Przeczytaj analizę Analizy/Refresh.md i następnie przygotuj nową. Nic nie zmieniaj w analizie Analizy/Refresh.md
>
> Zaproponuj inne sposoby odświeżania danych - bez ingerencji w Firebase.

---

## Kontekst wejściowy

Po przeczytaniu `Analizy/Refresh.md` oraz obecnego flow (`app.js` + `firebase.js` + skrypty odświeżania) główny punkt ryzyka jest w ścieżce „UI -> endpoint backendowy -> uruchomienie odświeżania”.

W tej analizie proponuję warianty, które **nie wymagają zmian w kolekcjach i konfiguracji Firebase** (bez zmian w `Nekrolog_config`, `Nekrolog_refresh_jobs`, `Nekrolog_snapshots`, bez zmian reguł i infrastruktury Firebase).

---

## Co zostało zmienione w kodzie

Zgodnie z poleceniem:
- **Nie zmieniono żadnego kodu aplikacji**.
- **Nie zmieniono pliku `Analizy/Refresh.md`**.
- Dodano wyłącznie ten nowy dokument analityczny.

---

## Założenia ograniczające („bez ingerencji w Firebase”)

Przyjmuję, że dozwolone są:
- zmiany po stronie GitHub (Actions, workflow, harmonogram),
- zmiany po stronie frontendu (sposób wyzwalania),
- zmiany po stronie zewnętrznego backendu/proxy (poza Firebase),
- zmiany w monitoringu i diagnostyce.

Niedozwolone:
- modyfikacja dokumentów/struktur Firebase jako elementu naprawy,
- zmiany deployu funkcji w Firebase jako warunek działania,
- przebudowa logiki oparta o nowe mechanizmy Firebase.

---

## Alternatywne sposoby odświeżania danych

## 1) „Pull model” bez przycisku: harmonogram GitHub Actions (cron)

### Opis
- Odświeżanie uruchamia się automatycznie co X minut/godzin przez `schedule` w GitHub Actions.
- Frontend tylko odczytuje aktualny snapshot.
- Przycisk „Odśwież” można zastąpić przyciskiem „Sprawdź ponownie dane” (reload widoku), bez triggerowania backendu.

### Zalety
- Brak zależności od CORS, endpointów i ręcznych wywołań HTTP z przeglądarki.
- Najmniejsza liczba punktów awarii w runtime użytkownika.
- Najprostsza operacyjnie diagnostyka (historia uruchomień w Actions).

### Wady
- Brak „natychmiastowego” ręcznego refreshu na żądanie użytkownika.
- Dane mogą być opóźnione o interwał cron.

### Kiedy wybrać
- Gdy priorytetem jest stabilność i przewidywalność, a nie odświeżanie „na klik”.

---

## 2) Ręczny refresh przez `workflow_dispatch` bezpośrednio w GitHub UI

### Opis
- Użytkownik techniczny uruchamia workflow ręcznie w zakładce **Actions**.
- Frontend nie wysyła requestu do endpointu backendowego; użytkownik końcowy tylko odświeża widok danych.

### Zalety
- Zero CORS po stronie aplikacji webowej.
- Brak zależności od endpointu funkcji.
- Kontrola i audyt uruchomień w jednym miejscu (GitHub).

### Wady
- Wymaga dostępu do repo i podstawowej wiedzy operacyjnej.
- Nienadające się do „samodzielnego” użycia przez każdego użytkownika aplikacji.

### Kiedy wybrać
- Dla trybu administracyjnego lub przejściowo, jako bezpieczny fallback operacyjny.

---

## 3) Zewnętrzny lekki backend-proxy (Cloudflare Worker / Vercel Function / Netlify Function)

### Opis
- Frontend wywołuje **zewnętrzny** endpoint (nie Firebase).
- Ten endpoint uruchamia `workflow_dispatch` GitHub Actions i zwraca status.
- Warstwa proxy obsługuje CORS, rate-limit i autoryzację.

### Zalety
- Odcina frontend od problemów endpointu Firebase.
- Bardzo szybki deploy i łatwa kontrola CORS.
- Możliwość dodać ochronę (token, IP allowlist, podpis HMAC).

### Wady
- Dodatkowy komponent infrastruktury do utrzymania.
- Trzeba bezpiecznie przechowywać sekret/token GitHub poza frontendem.

### Kiedy wybrać
- Gdy potrzebny jest ręczny refresh „na klik” z UI, ale bez zależności od Firebase Functions.

---

## 4) GitHub `repository_dispatch` przez pośrednika nocode/low-code (np. Make/Zapier/Pipedream)

### Opis
- UI wywołuje webhook platformy automatyzującej.
- Platforma uruchamia workflow GitHub (`repository_dispatch` albo `workflow_dispatch`).

### Zalety
- Bardzo szybkie wdrożenie bez utrzymania własnego backendu.
- Gotowe retry i prosty monitoring w narzędziu.

### Wady
- Zależność od zewnętrznego dostawcy i limitów planu.
- Potencjalnie wyższy koszt przy dużej liczbie wywołań.

### Kiedy wybrać
- Gdy liczy się czas wdrożenia i mały nakład developerski.

---

## 5) Model „request queue” poza Firebase (np. GitHub Issue/Comment jako trigger)

### Opis
- Kliknięcie w UI nie uruchamia backendu bezpośrednio, tylko zapisuje żądanie do zewnętrznej kolejki (np. tworzy issue przez API pośrednika).
- Workflow okresowo sprawdza kolejkę i wykonuje refresh.

### Zalety
- Odporność na chwilowe awarie endpointu triggerującego.
- Lepsza widoczność kolejki żądań i historii.

### Wady
- Większa złożoność całego flow.
- Potrzeba mechanizmu deduplikacji i wygaszania żądań.

### Kiedy wybrać
- Gdy spodziewane są częste kliknięcia i potrzebna jest kontrola obciążenia.

---

## Rekomendacja docelowa (bez Firebase)

### Rekomendacja A (najbardziej praktyczna)
1. **Od razu:** włączyć harmonogram `cron` w GitHub Actions (wariant 1).
2. **Dla admina:** zachować ręczny `workflow_dispatch` z panelu GitHub (wariant 2).
3. **Opcjonalnie dla UI „na klik”:** dodać mały proxy endpoint poza Firebase (wariant 3).

To daje szybkie uspokojenie operacyjne i stopniowe dojście do UX „na klik” bez ryzyk CORS/Firebase.

---

## Minimalny plan wdrożenia (kolejność)

1. Ustalić SLA świeżości danych (np. co 15 min / co 1h).
2. Skonfigurować `schedule` w GitHub Actions i monitoring niepowodzeń.
3. W UI zmienić semantykę przycisku z „Uruchom odświeżanie” na „Odśwież widok danych” (bez triggeru backendowego).
4. Dodać „Tryb administratora” z instrukcją ręcznego `workflow_dispatch`.
5. (Opcjonalnie) Wdrożyć zewnętrzny proxy endpoint dla przycisku „Uruchom odświeżanie teraz”.

---

## Ryzyka i jak je ograniczyć

1. **Ryzyko opóźnienia danych (cron):**
   - dobrać sensowny interwał,
   - dodać znacznik „ostatnia aktualizacja” w UI.

2. **Ryzyko nadużycia ręcznego triggera:**
   - rate-limit po stronie proxy,
   - autoryzacja i logowanie wywołań.

3. **Ryzyko awarii workflow GitHub:**
   - alerty na failed run,
   - prosty fallback: ponowny run + instrukcja operacyjna.

---

## Podsumowanie

Da się całkowicie odejść od wrażliwego punktu „frontend -> Firebase endpoint” bez naruszania samego Firebase.

Najbardziej stabilna ścieżka to: **automatyczny refresh po stronie GitHub Actions (cron) + ręczny refresh administracyjny z GitHub UI**, a jeśli potrzebny jest UX „klik i odśwież teraz”, to przez **zewnętrzny proxy endpoint poza Firebase**.
