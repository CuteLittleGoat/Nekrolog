# Analiza: pełna struktura trzech kolekcji Firebase

## Prompt użytkownika
"Zapisz mi pełną strukturę trzech kolekcji w Firebase w nowym pliku \"Analizy\""

## Zakres analizy
Poniżej opisuję strukturę 3 kolekcji używanych przez moduł Nekrolog:
- `Nekrolog_snapshots`
- `Nekrolog_config`
- `Nekrolog_refresh_jobs`

---

## 1) Kolekcja `Nekrolog_snapshots`

### Przeznaczenie
Przechowuje snapshot danych do wyświetlenia w UI (zgony, pogrzeby, źródła, timestamp wygenerowania).

### Dokument główny używany przez aplikację
- ID preferowane: `latest` (konfigurowalne przez `nekrologSnapshotDocId`, domyślnie `latest`)
- Fallback: gdy `latest` nie istnieje, aplikacja pobiera do 25 dokumentów i wybiera najnowszy po `generated_at`/`updated_at`.

### Struktura dokumentu (pełna, wg kodu + danych)
```json
{
  "generated_at": "ISO-8601 string | Timestamp",
  "updated_at": "ISO-8601 string | Timestamp",

  "deaths": [Row],
  "funerals": [Row],

  "recent_deaths": [Row],
  "upcoming_funerals": [Row],

  "sources": [
    {
      "name": "string",
      "url": "string",
      "distance_km": "number",
      "enabled": "boolean"
    }
  ],

  "payload": {
    "generated_at": "ISO-8601 string | Timestamp",
    "updated_at": "ISO-8601 string | Timestamp",
    "deaths": [Row],
    "funerals": [Row],
    "recent_deaths": [Row],
    "upcoming_funerals": [Row],
    "sources": [
      {
        "name": "string",
        "url": "string",
        "distance_km": "number",
        "enabled": "boolean"
      }
    ]
  },

  "data": {
    "generated_at": "ISO-8601 string | Timestamp",
    "updated_at": "ISO-8601 string | Timestamp",
    "deaths": [Row],
    "funerals": [Row],
    "recent_deaths": [Row],
    "upcoming_funerals": [Row],
    "sources": [
      {
        "name": "string",
        "url": "string",
        "distance_km": "number",
        "enabled": "boolean"
      }
    ]
  }
}
```

### Struktura `Row`
```json
{
  "kind": "death | funeral | wpis",
  "name": "string",
  "date_death": "YYYY-MM-DD | null",
  "date_funeral": "YYYY-MM-DD | null",
  "time_funeral": "HH:mm | null",
  "place": "string",
  "source_name": "string",
  "source_id": "string",
  "url": "string",
  "source_url": "string",
  "note": "string | null",
  "priority_hit": "boolean",

  "category": "string",
  "date": "string"
}
```

### Uwagi implementacyjne
- Aplikacja normalizuje rekordy i akceptuje warianty pól: `kind`/`category`, `url`/`source_url`, `date` jako fallback dla `date_death` lub `date_funeral`.
- W warstwie prezentacji obsługiwane są zarówno pary `deaths/funerals`, jak i `recent_deaths/upcoming_funerals`.

---

## 2) Kolekcja `Nekrolog_config`

### Przeznaczenie
Konfiguracja źródeł monitoringu używana przez UI.

### Dokument główny używany przez aplikację
- ID preferowane: `sources` (konfigurowalne przez `nekrologConfigDocId`, domyślnie `sources`)

### Struktura dokumentu (wg kodu + pliku `sources.json`)
```json
{
  "sources": [
    {
      "id": "string",
      "name": "string",
      "type": "string",
      "url": "string",
      "enabled": "boolean",
      "distance_km": "number",
      "coords": {
        "lat": "number",
        "lon": "number"
      }
    }
  ]
}
```

### Uwagi implementacyjne
- UI filtruje źródła po `enabled !== false`.
- Gdy konfiguracja nie zawiera `sources`, UI może użyć fallbacku `sources` ze snapshotu.

---

## 3) Kolekcja `Nekrolog_refresh_jobs`

### Przeznaczenie
Sygnał/stan wymuszonego odświeżania danych (trigger z przycisku i status joba).

### Dokument główny używany przez aplikację
- ID preferowane i wymagane przez reguły zapisu: `latest` (konfigurowalne przez `nekrologRefreshJobDocId`, domyślnie `latest`)

### Struktura dokumentu (wg zapisu w `writeRefreshJob` i `forceRefresh`)
```json
{
  "status": "running | done | error",
  "trigger": "button",
  "updated_at": "Timestamp",

  "started_at": "Timestamp",
  "finished_at": "Timestamp",

  "ok": "boolean | null",
  "error_message": "string"
}
```

### Uwagi implementacyjne
- Zapisy wykonywane z `set(..., { merge: true })`, więc dokument może być częściowo uzupełniany etapami.
- Reguły Firestore dopuszczają zapis tylko do dokumentu o ID `latest`.

---

## Podsumowanie relacji między kolekcjami
- `Nekrolog_snapshots/latest` -> główne dane biznesowe do renderowania.
- `Nekrolog_config/sources` -> lista źródeł (preferowana względem źródeł ze snapshotu).
- `Nekrolog_refresh_jobs/latest` -> stan operacji odświeżania i sygnał dla backendu/automatyzacji.
