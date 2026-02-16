# Dokumentacja docelowa: pełna struktura trzech kolekcji Firebase

## Cel dokumentu
Ten dokument opisuje **docelowy model danych** dla nowego projektu, który wykorzystuje trzy kolekcje Firebase:
- `Nekrolog_snapshots`
- `Nekrolog_config`
- `Nekrolog_refresh_jobs`

Opis zawiera:
1. pełną listę pól,
2. typy danych,
3. drzewko struktury,
4. przykładowy kształt dokumentów,
5. kompletną konfigurację `window.NEKROLOG_CONFIG`.

---

## 1) Kolekcja `Nekrolog_snapshots`

### Rola kolekcji
Kolekcja przechowuje aktualny snapshot danych publikowanych przez aplikację: listy zgonów, pogrzebów, źródeł oraz metadane czasu wygenerowania.

### Zalecany dokument roboczy
- **ID dokumentu:** `latest`

### Pełna lista pól i typów

#### Poziom główny dokumentu
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `generated_at` | `string (ISO-8601)` \| `Timestamp` | nie | Czas wygenerowania snapshotu. |
| `updated_at` | `string (ISO-8601)` \| `Timestamp` | nie | Czas ostatniej aktualizacji snapshotu. |
| `deaths` | `Array<Row>` | nie | Lista wpisów typu zgon (wariant główny). |
| `funerals` | `Array<Row>` | nie | Lista wpisów typu pogrzeb (wariant główny). |
| `recent_deaths` | `Array<Row>` | nie | Lista wpisów typu zgon (wariant alternatywny). |
| `upcoming_funerals` | `Array<Row>` | nie | Lista wpisów typu pogrzeb (wariant alternatywny). |
| `sources` | `Array<SourceLite>` | nie | Lista źródeł do wyświetlenia. |
| `payload` | `SnapshotPayload` | nie | Zagnieżdżona kopia snapshotu (wariant zapisu). |
| `data` | `SnapshotPayload` | nie | Zagnieżdżona kopia snapshotu (wariant zapisu). |
| `target_phrases` | `Array<string>` | nie | Lista monitorowanych fraz. |

#### Typ zagnieżdżony: `Row`
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `kind` | `"death" \| "funeral" \| string` | nie | Typ wpisu. |
| `category` | `string` | nie | Alternatywa dla `kind` (jeśli używana). |
| `name` | `string` | nie | Imię i nazwisko osoby. |
| `date_death` | `string (YYYY-MM-DD)` \| `null` | nie | Data zgonu. |
| `date_funeral` | `string (YYYY-MM-DD)` \| `null` | nie | Data pogrzebu. |
| `time_funeral` | `string (HH:mm)` \| `null` | nie | Godzina pogrzebu. |
| `date` | `string` \| `null` | nie | Pole alternatywne dla daty (wariant uproszczony). |
| `place` | `string` | nie | Miejsce (np. parafia, dom pogrzebowy, lokalizacja). |
| `source_id` | `string` | nie | Identyfikator źródła. |
| `source_name` | `string` | nie | Nazwa źródła. |
| `url` | `string` | nie | Link do rekordu źródłowego. |
| `source_url` | `string` | nie | Alternatywa dla `url`. |
| `note` | `string` \| `null` | nie | Dodatkowy opis/notatka. |
| `priority_hit` | `boolean` | nie | Flaga dopasowania wpisu do priorytetowej frazy. |

#### Typ zagnieżdżony: `SourceLite`
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `name` | `string` | nie | Nazwa źródła. |
| `url` | `string` | nie | Link do strony źródła. |
| `distance_km` | `number` | nie | Odległość źródła od punktu odniesienia (km). |
| `enabled` | `boolean` | nie | Flaga aktywności źródła. |

#### Typ zagnieżdżony: `SnapshotPayload`
| Pole | Typ |
|---|---|
| `generated_at` | `string (ISO-8601)` \| `Timestamp` |
| `updated_at` | `string (ISO-8601)` \| `Timestamp` |
| `deaths` | `Array<Row>` |
| `funerals` | `Array<Row>` |
| `recent_deaths` | `Array<Row>` |
| `upcoming_funerals` | `Array<Row>` |
| `sources` | `Array<SourceLite>` |
| `target_phrases` | `Array<string>` |

### Struktura w formie drzewa
```text
Nekrolog_snapshots/
└── latest (Document)
    ├── generated_at: string(ISO-8601) | Timestamp
    ├── updated_at: string(ISO-8601) | Timestamp
    ├── deaths: Row[]
    ├── funerals: Row[]
    ├── recent_deaths: Row[]
    ├── upcoming_funerals: Row[]
    ├── sources: SourceLite[]
    ├── target_phrases: string[]
    ├── payload: SnapshotPayload
    │   ├── generated_at: string(ISO-8601) | Timestamp
    │   ├── updated_at: string(ISO-8601) | Timestamp
    │   ├── deaths: Row[]
    │   ├── funerals: Row[]
    │   ├── recent_deaths: Row[]
    │   ├── upcoming_funerals: Row[]
    │   ├── sources: SourceLite[]
    │   └── target_phrases: string[]
    └── data: SnapshotPayload
        ├── generated_at: string(ISO-8601) | Timestamp
        ├── updated_at: string(ISO-8601) | Timestamp
        ├── deaths: Row[]
        ├── funerals: Row[]
        ├── recent_deaths: Row[]
        ├── upcoming_funerals: Row[]
        ├── sources: SourceLite[]
        └── target_phrases: string[]

Row
├── kind: "death" | "funeral" | string
├── category: string
├── name: string
├── date_death: string(YYYY-MM-DD) | null
├── date_funeral: string(YYYY-MM-DD) | null
├── time_funeral: string(HH:mm) | null
├── date: string | null
├── place: string
├── source_id: string
├── source_name: string
├── url: string
├── source_url: string
├── note: string | null
└── priority_hit: boolean

SourceLite
├── name: string
├── url: string
├── distance_km: number
└── enabled: boolean
```

---

## 2) Kolekcja `Nekrolog_config`

### Rola kolekcji
Kolekcja przechowuje konfigurację źródeł danych wykorzystywanych przez projekt.

### Zalecany dokument roboczy
- **ID dokumentu:** `sources`

### Pełna lista pól i typów

#### Poziom główny dokumentu
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `sources` | `Array<SourceConfig>` | tak | Lista źródeł monitorowania. |

#### Typ zagnieżdżony: `SourceConfig`
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `id` | `string` | tak | Unikalny identyfikator źródła. |
| `name` | `string` | tak | Nazwa źródła do prezentacji. |
| `type` | `string` | tak | Typ/parser źródła (klasa obsługi). |
| `url` | `string` | tak | URL źródła. |
| `enabled` | `boolean` | nie | Flaga aktywności źródła (domyślnie aktywne, jeśli brak). |
| `distance_km` | `number` | nie | Odległość źródła od punktu odniesienia. |
| `coords` | `GeoPointLike` | nie | Współrzędne źródła. |

#### Typ zagnieżdżony: `GeoPointLike`
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `lat` | `number` | nie | Szerokość geograficzna. |
| `lon` | `number` | nie | Długość geograficzna. |

### Struktura w formie drzewa
```text
Nekrolog_config/
└── sources (Document)
    └── sources: SourceConfig[]
        └── SourceConfig
            ├── id: string
            ├── name: string
            ├── type: string
            ├── url: string
            ├── enabled: boolean
            ├── distance_km: number
            └── coords: GeoPointLike
                ├── lat: number
                └── lon: number
```

---

## 3) Kolekcja `Nekrolog_refresh_jobs`

### Rola kolekcji
Kolekcja przechowuje stan zadania odświeżenia danych oraz metadane jego wykonania.

### Zalecany dokument roboczy
- **ID dokumentu:** `latest`

### Pełna lista pól i typów
| Pole | Typ | Wymagane | Opis |
|---|---|---:|---|
| `status` | `"running" \| "done" \| "error" \| string` | nie | Aktualny status odświeżenia. |
| `trigger` | `"button" \| string` | nie | Źródło wyzwolenia odświeżenia. |
| `updated_at` | `Timestamp` \| `string (ISO-8601)` | nie | Czas ostatniej modyfikacji wpisu joba. |
| `started_at` | `Timestamp` \| `string (ISO-8601)` | nie | Czas rozpoczęcia odświeżenia. |
| `finished_at` | `Timestamp` \| `string (ISO-8601)` | nie | Czas zakończenia odświeżenia. |
| `ok` | `boolean` \| `null` | nie | Flaga powodzenia. |
| `error_message` | `string` | nie | Komunikat błędu przy statusie `error`. |

### Struktura w formie drzewa
```text
Nekrolog_refresh_jobs/
└── latest (Document)
    ├── status: "running" | "done" | "error" | string
    ├── trigger: "button" | string
    ├── updated_at: Timestamp | string(ISO-8601)
    ├── started_at: Timestamp | string(ISO-8601)
    ├── finished_at: Timestamp | string(ISO-8601)
    ├── ok: boolean | null
    └── error_message: string
```

---

## Konfiguracja projektu (`window.NEKROLOG_CONFIG`)

```js
window.NEKROLOG_CONFIG = {
  // Lokalny backend do wymuszania odświeżenia danych.
  // Domyślnie aplikacja korzysta z /api/refresh.
  // forceRefreshUrl: "https://twoj-backend.example.com/api/refresh",

  // Firebase Web SDK (projekt: karty-turniej).
  firebaseConfig: {
    apiKey: "AIzaSyBjSijsTEvkOF9oTPOf3FgTf3zCcM59rQY",
    authDomain: "karty-turniej.firebaseapp.com",
    projectId: "karty-turniej",
    storageBucket: "karty-turniej.firebasestorage.app",
    messagingSenderId: "716608782712",
    appId: "1:716608782712:web:27d29434f013a5cf31888d",

    // Istniejące kolekcje z poprzedniego projektu.
    tablesCollection: "Tables",
    gamesCollection: "Tables",
    gameDetailsCollection: "rows",
    userGamesCollection: "UserGames",

    // Kolekcje dedykowane dla Nekrolog.
    nekrologConfigCollection: "Nekrolog_config",
    nekrologRefreshJobsCollection: "Nekrolog_refresh_jobs",
    nekrologRefreshJobDocId: "latest",
    nekrologSnapshotsCollection: "Nekrolog_snapshots",
    nekrologSnapshotDocId: "latest",
  },
};
```

---

## Minimalna mapa wdrożeniowa (dla nowego projektu)
1. Utwórz kolekcje: `Nekrolog_snapshots`, `Nekrolog_config`, `Nekrolog_refresh_jobs`.
2. Utwórz dokumenty:
   - `Nekrolog_snapshots/latest`
   - `Nekrolog_config/sources`
   - `Nekrolog_refresh_jobs/latest`
3. Wypełnij dokumenty zgodnie z typami pól z tej dokumentacji.
4. Skonfiguruj frontend przez `window.NEKROLOG_CONFIG` dokładnie jak w sekcji powyżej.
5. Traktuj pola alternatywne (`deaths`/`recent_deaths`, `funerals`/`upcoming_funerals`, `payload`, `data`) jako dopuszczalne warianty kontraktu danych.
