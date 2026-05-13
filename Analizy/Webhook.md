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
