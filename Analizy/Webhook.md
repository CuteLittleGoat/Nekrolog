# Analiza i wdrożenie webhooka Discord

Data analizy: 2026-05-13
Temat analizy: Implementacja powiadomienia Discord dla statusu „Czerwona Helena” z użyciem sekretu `DISCORD_WEBHOOK_URL`.

## Oryginalny pełny prompt użytkownika

Przeczytaj plik Projekt_Webhook.html\n\nUtworzyłem sekret zgodnie z instrukcją. Zaimplementuj powiadomienie Discord zgodnie z plikiem Projekt_Webhook.html (stara nazwa, która może się pojawiać: Nekrolog_Discord_Webhook_Instrukcja_Codex.html). Webhook jest już zapisany jako GitHub Actions secret DISCORD_WEBHOOK_URL. Nie ujawniaj sekretu w kodzie ani w logach.\n\nTreść wiadomości:

\n\n@koza_z_zagrody, @loshumbakos
Zmienił się status Czerwonej Heleny!
Imię/nazwisko w rekordzie: [...]
Źródło: [...]
Link: [...]

\n\nW miejsce [...] podaj dane odczytane w aplikacji.\n\nPo wykonaniu zadania przygotuj plik w Analizy/Webhook.md\nW pliku Analizy/Webhook.md napisz dokładnie co zrobiłeś i jakich zmian w kodzie dokonałeś (zgodnie z pkt 4 pliku AGENTS.md)

## Zakres analizy

- Sprawdzenie wymagań w `Projekt_Webhook.html`.
- Dodanie logiki wykrywania rekordu „Czerwona Helena”.
- Dodanie wysyłki webhooka Discord z użyciem sekretu `DISCORD_WEBHOOK_URL`.
- Dodanie deduplikacji powiadomień między uruchomieniami workflow.
- Podpięcie sekretu do workflow GitHub Actions i commitowania pliku stanu.
- Dodanie testów automatycznych dla nowej logiki.

## Wnioski

- Powiadomienie zostało wdrożone po stronie Node.js (backend refresh), bez ujawniania sekretu w kodzie i bez wypisywania URL webhooka do logów.
- Treść wiadomości została ustawiona dokładnie zgodnie z podanym formatem, a wartości `[...]` pochodzą z danych rekordu (`name`, `source_name`, `url`).
- Deduplikacja działa przez plik stanu `data/discord_notified.json`, więc ten sam rekord nie jest wysyłany wielokrotnie.
- Workflow przekazuje `DISCORD_WEBHOOK_URL` przez `secrets.DISCORD_WEBHOOK_URL`.

## Rekomendacje

- Pozostawić `DISCORD_NOTIFY_ENABLED` jako przełącznik awaryjny (włączony domyślnie) do szybkiego wyłączenia notyfikacji.
- Regularnie sprawdzać wpisy w `data/job.json` pod kątem `discord_notification.skipped_reason`.
- W razie zmiany kryterium dopasowania (obecnie „czerwona helena”), rozszerzyć funkcję dopasowania i testy.

## Ryzyka

- Jeżeli rekordy będą miały nietypowe pola lub brak linku, wiadomość użyje wartości zastępczych („brak danych”).
- Przy zmianach struktury danych źródłowych może być potrzebna korekta detekcji dopasowania.

## Następne kroki

- Zweryfikować działanie na GitHub Actions przez `Run workflow`.
- Potwierdzić, że pierwsze trafienie wysyła wiadomość na Discord, a kolejne uruchomienie bez zmian nie duplikuje powiadomienia.

## Zmiany wykonane w kodzie

### Plik: `scripts/discord_notify.mjs`

Lokalizacja: nowy plik, sekcje funkcji `isCzerwonaHelenaRow`, `buildDiscordMessage`, `notifyCzerwonaHelena`.

Było:

- Brak dedykowanego modułu obsługi webhooka Discord i brak deduplikacji powiadomień.

Jest:

- Dodany moduł z:
  - dopasowaniem rekordu do „Czerwona Helena” (normalizacja tekstu),
  - budową komunikatu Discord w wymaganym formacie,
  - wysyłką webhooka,
  - stanem deduplikacji w `data/discord_notified.json`,
  - bez logowania sekretu URL.

### Plik: `scripts/refresh_static.mjs`

Lokalizacja: importy na początku pliku oraz sekcja budowania `job` po wygenerowaniu danych.

Było:

- Skrypt odświeżania generował `latest.json`, `job.json`, `errors.json`, ale nie wykonywał wysyłki Discord.

Jest:

- Dodane wywołanie `notifyCzerwonaHelena(...)` z przekazaniem:
  - `rows: [...recent_deaths, ...upcoming_funerals]`,
  - `webhookUrl: process.env.DISCORD_WEBHOOK_URL`,
  - `enabled: process.env.DISCORD_NOTIFY_ENABLED !== 'false'`.
- Wynik notyfikacji dopisywany do `job.discord_notification`.

### Plik: `.github/workflows/nekrolog-refresh.yml`

Lokalizacja: krok `Run refresh` (env) oraz krok `Commit refreshed data` (lista `git add`).

Było:

- Workflow nie przekazywał `DISCORD_WEBHOOK_URL`.
- Workflow nie commitował pliku stanu notyfikacji.

Jest:

- Dodane env dla kroku `npm run refresh`:
  - `DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}`
  - `DISCORD_NOTIFY_ENABLED: "true"`
- Rozszerzone `git add` o `data/discord_notified.json`.

### Plik: `data/discord_notified.json`

Lokalizacja: nowy plik danych.

Było:

- Brak pliku stanu wysłanych powiadomień.

Jest:

- Utworzony plik z początkową zawartością:
  - `{ "sent_keys": [] }`

### Plik: `tests/discord_notify.test.mjs`

Lokalizacja: nowy plik testowy.

Było:

- Brak testów dla logiki Discord webhook.

Jest:

- Dodane testy:
  - walidacja formatu wiadomości,
  - sprawdzenie wysyłki jednokrotnej i deduplikacji.

# Analiza webhooka Discord po każdym odświeżeniu „Nekrolog”

Data analizy: 2026-05-13  
Temat analizy: Weryfikacja aktualnej logiki dopasowania „Helena Gawin” oraz analiza możliwości wysyłania komunikatu webhook po każdym odświeżeniu danych.

## Oryginalny pełny prompt użytkownika

Przeczytaj plik Analizy/Webhook.md\n\n1. Aplikacja ma w dalszym ciągu szukać "Heleny Gawin" (wraz ze wszystkimi odmianami i sposobem zapisu podwójnego nazwiska). "Zmienił się status Czerwonej Heleny!" to ma być tylko wiadomość wysłana na discord.\n\nSprawdź czy tak jest.\n\n2. Sprawdź czy jest możliwość, żeby webhook wysyłał na discorda wiadomość po każdym odświeżeniu danych w aplikacji "Nekrolog".\nJeżeli nie będzie wpisów pasujących do "Helena Gawin" to ma się pojawić wpis:

\n\nData: [data] [godzina]\nBrak danych dotyczących stanu Helenomatu.

\n\nCzyli zgodnie z aktualnym przebiegiem odświeżanie jest 2x dziennie i powinny być 2x dziennie wpisy ze zmienioną datą i godziną.\n\nDopiero jak aplikacja znajdzie wpis pasujący do Heleny Gawin" (wraz ze wszystkimi odmianami i sposobem zapisu podwójnego nazwiska) to wyśle wiadomość:

\n\n@koza_z_zagrody, @loshumbakos\nZmienił się status Czerwonej Heleny!\nImię/nazwisko w rekordzie: [...]\nŹródło: [...]\nLink: [...]

\n\nPrzeprowadź analizę wprowadzenia takiego rozwiązania.

## Zakres analizy

- Weryfikacja faktycznej logiki wyszukiwania rekordów w odświeżaniu aplikacji.
- Weryfikacja, czy webhook szuka obecnie „Helena Gawin” czy „Czerwona Helena”.
- Weryfikacja harmonogramu odświeżania i momentu wywołania webhooka.
- Ocena możliwości wdrożenia wiadomości „heartbeat” po każdym odświeżeniu.
- Identyfikacja zmian wymaganych do wdrożenia nowego zachowania.

## Wnioski

1. **Aktualnie NIE jest tak, jak opisano w wymaganiu (pkt 1).**  
   Główna logika aplikacji (filtrowanie i budowa zestawu danych) nadal używa fraz „Helena Gawin” i jej wariantów (`HELENA_GAWIN_PHRASES`). Natomiast webhook Discord ma osobną logikę i szuka frazy „czerwona helena”, a nie „Helena Gawin”.

2. **Tekst „Zmienił się status Czerwonej Heleny!” jest obecnie treścią wysyłanej wiadomości na Discord i to jest poprawne jako format komunikatu.**  
   Problemem nie jest sam tekst wiadomości, tylko kryterium wykrycia rekordu wyzwalającego wysyłkę.

3. **Odświeżanie 2x dziennie jest już ustawione.**  
   Workflow uruchamia się według CRON `0 7,19 * * *` (07:00 i 19:00 UTC), co daje dwa planowe uruchomienia na dobę.

4. **Webhook nie wysyła obecnie wpisu po każdym odświeżeniu.**  
   Obecny mechanizm wysyła wiadomość tylko przy dopasowaniu i dodatkowo deduplikuje po kluczu rekordu (`already_notified`). Dla braku dopasowania zwraca stan `no_match`, ale nie wysyła nic na Discord.

5. **Wdrożenie „2 wpisy dziennie zawsze” jest technicznie możliwe bez zmiany architektury.**  
   Najprościej rozszerzyć moduł `scripts/discord_notify.mjs` o tryb „heartbeat/no-match notification” i wywoływać go przy każdym refreshu, gdy brak dopasowania.

## Rekomendacje

1. **Ujednolicić kryterium dopasowania webhooka z logiką aplikacji:**
   - albo użyć `HELENA_GAWIN_PHRASES` bezpośrednio w `discord_notify.mjs`,
   - albo przekazywać do `notify...` gotową listę wariantów/funkcję `textMatchesAny`.

2. **Dodać drugi typ komunikatu Discord (heartbeat):**
   - gdy brak dopasowania, wysłać:
     - `Data: YYYY-MM-DD HH:mm`
     - `Brak danych dotyczących stanu Helenomatu.`

3. **Nie deduplikować heartbeatów po treści rekordu.**
   Heartbeat powinien być wysyłany przy każdym odświeżeniu (2x dziennie wg harmonogramu), więc deduplikacja dla tego typu wiadomości musi być wyłączona albo oparta o znacznik uruchomienia (`job.started_at`/`job.finished_at`).

4. **Zostawić deduplikację dla komunikatu alarmowego („Zmienił się status…”).**
   Dzięki temu to samo znalezione ogłoszenie nie będzie spamowane przy kolejnych refreshach.

5. **Dodać testy automatyczne:**
   - przypadek `no_match` => wysyłka heartbeat,
   - przypadek `match` => wysyłka alertu z danymi rekordu,
   - przypadek ponownego `match` z tym samym rekordem => brak ponownej wysyłki alertu.

## Ryzyka

- Różnica stref czasowych: workflow działa w UTC; jeśli oczekiwane są godziny lokalne PL, trzeba jawnie formatować datę/czas (np. `Europe/Warsaw`) w treści heartbeat.
- Potencjalny nadmiar powiadomień przy ręcznych uruchomieniach workflow (`workflow_dispatch`) – heartbeat wyśle się także wtedy, o ile nie doda się warunku ograniczającego.
- W przypadku czasowej niedostępności Discord webhook część heartbeatów może nie dojść; warto zapisywać status w `job.json` (co już częściowo jest robione przez `discord_notification`).

## Następne kroki

1. Zmienić logikę dopasowania w `scripts/discord_notify.mjs` z „czerwona helena” na warianty „Helena Gawin” (zgodne z `HELENA_GAWIN_PHRASES`).
2. Dodać wysyłkę heartbeat przy `no_match` z datą i godziną odświeżenia.
3. Rozdzielić typy powiadomień (`alert_match`, `heartbeat_no_match`) i zasady deduplikacji.
4. Dodać testy jednostkowe dla nowego przebiegu.
5. Zweryfikować działanie na dwóch kolejnych uruchomieniach harmonogramu.
