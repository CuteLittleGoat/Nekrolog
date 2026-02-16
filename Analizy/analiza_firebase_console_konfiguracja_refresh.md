# Instrukcja konfiguracji Firebase Console dla funkcji „Wymuś aktualizację”

## Prompt użytkownika (kontekst)

> Przeczytaj Analizy/analiza_wymus_aktualizacje.md
> Napisz mi co dokładnie mam zrobić w Firebase console. Jaką kolekcję utworzyć. Jakie dokuments i fields ma zawierać.

---

## Cel konfiguracji

Poniżej jest **minimalna i konkretna konfiguracja Firestore**, która odpowiada modelowi z analizy `analiza_wymus_aktualizacje.md`:
- przycisk „Wymuś aktualizację” uruchamia backend,
- backend zapisuje nowy snapshot,
- frontend odczytuje aktualny dokument,
- opcjonalnie można śledzić historię jobów.

---

## Co dokładnie utworzyć w Firebase Console

## 1) Włącz Firestore
1. Wejdź do **Firebase Console** → wybierz projekt.
2. Z menu po lewej: **Build → Firestore Database**.
3. Kliknij **Create database**.
4. Tryb: na start **Production mode** (zalecane).
5. Wybierz region (np. `europe-central2` lub inny zgodny z backendem).

---

## 2) Utwórz kolekcję `snapshots`
1. W Firestore kliknij **Start collection**.
2. **Collection ID**: `snapshots`
3. **Document ID**: `latest`

W dokumencie `snapshots/latest` dodaj pola:

- `generated_at` (Timestamp) – czas wygenerowania snapshotu.
- `updated_at` (Timestamp) – czas zapisu dokumentu.
- `schema_version` (Number) – np. `1`.
- `deaths_count` (Number) – liczba rekordów zgonów.
- `funerals_count` (Number) – liczba rekordów pogrzebów.
- `sources_count` (Number) – liczba sprawdzonych źródeł.
- `deaths` (Array of Maps) – lista rekordów zgonów.
- `funerals` (Array of Maps) – lista rekordów pogrzebów.
- `helena_status` (Map) – status wykrycia Heleny Gawin.
- `refresh_ok` (Boolean) – czy ostatnie odświeżenie zakończyło się sukcesem.
- `refresh_error` (String) – pusty string lub komunikat błędu.

### Struktura mapy `helena_status`
Wewnątrz pola mapy `helena_status` dodaj:
- `hit` (Boolean)
- `hits_count` (Number)
- `message` (String)
- `items` (Array of Maps) – opcjonalnie top dopasowania

### Struktura elementu w `deaths[]` / `funerals[]` (Map)
Każdy wpis (mapa) powinien mieć przynajmniej:
- `name` (String)
- `date` (String)
- `place` (String)
- `source_name` (String)
- `source_url` (String)
- `note` (String)
- `category` (String) – np. `death` albo `funeral`

> Uwaga praktyczna: Firestore ma limit 1 MiB na dokument. Jeżeli danych będzie dużo, przenieś pełne listy do podkolekcji (`snapshots/latest/deaths_items/*`, `snapshots/latest/funerals_items/*`) lub do Cloud Storage, a w `latest` trzymaj tylko podsumowanie + najnowsze rekordy.

---

## 3) (Zalecane) Utwórz kolekcję `refresh_jobs`
Ta kolekcja pozwala śledzić status kliknięcia przycisku „Wymuś aktualizację”.

1. Kliknij **Start collection**.
2. **Collection ID**: `refresh_jobs`
3. **Document ID**: auto-ID (lub własny, np. `r_2026_02_16_001`).

Pola dokumentu joba:
- `created_at` (Timestamp)
- `started_at` (Timestamp)
- `finished_at` (Timestamp)
- `status` (String) – `queued` | `running` | `done` | `error`
- `trigger` (String) – np. `button`
- `requested_by_ip_hash` (String) – opcjonalnie (do anty-spamu)
- `ok` (Boolean)
- `error_message` (String)
- `stats` (Map)
  - `deaths_count` (Number)
  - `funerals_count` (Number)
  - `sources_count` (Number)
- `helena_status` (Map)
  - `hit` (Boolean)
  - `hits_count` (Number)
  - `message` (String)

---

## 4) (Opcjonalnie) Kolekcja `config`
Jeżeli chcesz trzymać konfigurację źródeł w bazie, utwórz:

- Kolekcja: `config`
- Dokument: `sources`

Pola:
- `updated_at` (Timestamp)
- `enabled` (Boolean)
- `sources` (Array of Maps), gdzie każdy element ma:
  - `name` (String)
  - `url` (String)
  - `enabled` (Boolean)
  - `parser` (String)

---

## 5) Minimalne reguły Firestore (na start)
W **Firestore → Rules** ustaw reguły zgodnie z architekturą:
- frontend ma **tylko odczyt** `snapshots/latest`,
- zapis do `snapshots` i `refresh_jobs` wykonuje tylko backend (admin SDK / service account).

Przykładowo (schematycznie):
- `allow read: if true;` dla `snapshots/latest`
- `allow write: if false;` dla klienta

Backend działający na Admin SDK i tak ominie reguły klienta, ale zasada „no write from browser” jest kluczowa.

---

## 6) Kolejność działań w Firebase Console (checklista)
1. Włącz Firestore.
2. Utwórz `snapshots/latest` z polami powyżej.
3. Utwórz `refresh_jobs` (dla historii i statusów).
4. (Opcjonalnie) Utwórz `config/sources`.
5. Ustaw reguły tylko-do-odczytu dla `snapshots/latest` z frontu.
6. Podłącz backend tak, aby po refreshu zapisywał:
   - nowy stan do `snapshots/latest`,
   - wpis joba do `refresh_jobs`.

To jest dokładnie minimalny model danych potrzebny, żeby przycisk „Wymuś aktualizację” działał automatycznie i stabilnie.
