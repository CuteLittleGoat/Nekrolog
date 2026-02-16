# Analiza problemu: brak danych w aplikacji i nieskuteczne odświeżanie

## Prompt użytkownika
"Sprawdź poprawność działania aplikacji.
Wyświetla \"Brak wyników z monitorowanych źródeł.\". Przycisk \"Aktualizuj dane\" nie powoduje odświeżenia danych i cały czas wyświetla \"Aktualizacja: 16.02.2026, 08:36:31\"
Ogólnie nie pokazuje danych. Przykładowo aplikacja w sekcji \"Nadchodzące pogrzeby\" nic nie pokazuje a na stronie https://karawan.pl/nekrologi/ (jedna z monitorowanych stron) ma informację o odbywającym się dziś pogrzebie - screen w załączniku.
Przeprowadź analizę czemu aplikacja nie pobiera danych oraz co zrobić, żeby to naprawić."

## Co sprawdziłem
1. Uruchomienie collectora (`python3 collector.py`) i weryfikacja, czy dane faktycznie się zapisują do `data/latest.json`.
2. Weryfikacja frontendu (`app.js`), co robi przycisk odświeżania i skąd pobiera dane.
3. Weryfikacja parsera źródła Karawan (`parse_funeral_home`), dlaczego nie wyciąga pogrzebu mimo że wpis istnieje.
4. Porównanie regexów parsera z rzeczywistą treścią nekrologu na Karawan.

## Ustalenia (przyczyny)

### 1) Przycisk „Odśwież/Aktualizuj dane” **nie uruchamia collectora**
Frontend po kliknięciu wykonuje tylko `fetch('./data/latest.json', { cache: 'no-store' })`.
To oznacza: przycisk jedynie ponownie pobiera aktualny plik JSON z serwera, ale **nie generuje nowego JSON-a**.

Skutek: jeśli `data/latest.json` na serwerze jest stary, czas aktualizacji pozostaje stary, a użytkownik widzi niezmienione dane.

### 2) Dane z Karawan nie wpadają przez błędy regexów w parserze
W `parse_funeral_home` są 3 problemy:

- **Rozpoznawanie imienia i nazwiska**: regex zakłada format „Imię Nazwisko” (małe litery po wielkiej), a Karawan często publikuje pełne dane WIELKIMI LITERAMI (np. „JOLANTA ŚLIWA”). W efekcie rekord bywa odrzucany już na etapie listy.
- **Data zgonu**: regex ma postać `(zm\.|data zgonu...)(data)` bez `\s*` pomiędzy grupami, więc tekst „zm. 05.02.2026” nie pasuje.
- **Data pogrzebu**: regex wymaga „data pogrzebu” albo „pogrzeb:” bez dodatkowych słów. W realnym tekście jest np. „Pogrzeb dziś: 16.02.2026”, więc też nie pasuje.

Skutek: nawet gdy wpis istnieje, parser zwraca `deaths=0 funerals=0` dla `karawan_nekrologi`.

### 3) Status „Brak wyników z monitorowanych źródeł” pojawia się, gdy JSON ma puste listy
Komunikat ten wynika wyłącznie z zawartości `recent_deaths` i `upcoming_funerals`.
Jeżeli plik na serwerze został wcześniej wygenerowany błędnie/pusto albo jest przestarzały i pusty, aplikacja pokaże dokładnie taki status.

## Co zrobić, żeby naprawić

### A. Naprawić parser Karawan (priorytet)
W `parse_funeral_home`:
1. Zmienić regex imienia i nazwiska na wariant obsługujący wersaliki i polskie znaki.
2. Dodać opcjonalne białe znaki po `zm.` (`zm\.\s*...`).
3. Rozszerzyć regex pogrzebu o warianty „pogrzeb dziś”, „pogrzeb jutro”, itp.
4. Dodać test/regresję na realnym przykładzie tekstu Karawan (np. fragment z „Śp. JOLANTA ŚLIWA ... Pogrzeb dziś: ...”).

### B. Rozdzielić dwa typy odświeżania
Obecny przycisk to „odśwież widok”, nie „aktualizuj dane z internetu”. Warto:
1. Zmienić etykietę przycisku na „Odśwież widok” **albo**
2. Dodać backend endpoint `/refresh`, który uruchomi `collector.py` i dopiero potem zwróci status/nowy JSON.

W statycznym hostingu (np. GitHub Pages) endpointu nie da się uruchomić — wtedy aktualizacja danych musi być realizowana przez CI/cron, który commit-uje nowy `data/latest.json`.

### C. Dodać monitorowanie jakości pobierania
1. Po każdym przebiegu collectora logować liczbę rekordów na źródło i alertować, gdy wcześniej było >0 a teraz 0.
2. Opcjonalnie zapisywać `last_successful_fetch_per_source` i pokazywać to w UI.

## Krótki plan wdrożenia
1. Poprawki regexów w `parse_funeral_home`.
2. Test parsera na próbce Karawan.
3. Re-run collectora i weryfikacja, że `karawan_nekrologi` zwraca >0.
4. Uspójnienie nazwy/przeznaczenia przycisku odświeżania.
5. (Jeśli hosting statyczny) automatyzacja aktualizacji `data/latest.json` w CI.

