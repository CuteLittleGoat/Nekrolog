# Analiza opcji wdrożenia PWA dla modułu Main

## Prompt użytkownika
> Przeprowadź analizę opcji zrobienia aplikacji PWA.
> Chciałbym, żeby aplikacja miała ikonę Pliki/Ikona.png
> Chciałbym, żeby aplikacja była ograniczona do widoku użytkownika.
> Chciałbym, żeby była opcja instalacji na urządzeniu jako osobna aplikacja.
> Chciałbym, żeby w aplikacji nie było paska adresu ani interface przeglądarki.
> Aplikacja ma dotyczyć tylko modułu Main.
> Chcę mieć możliwość zablokowania widoku w orientacji pionowej lub poziomej lub zezwolić żeby urządzenie decydowało.

## Cel
Przygotować PWA uruchamiane i instalowane jako osobna aplikacja, skupione wyłącznie na module **Main**, z kontrolą orientacji i bez klasycznego interfejsu przeglądarki.

## Co jest potrzebne technicznie
1. **Web App Manifest** (np. `manifest.webmanifest`) z:
   - `name`, `short_name`
   - `icons` wskazującymi na `Pliki/Ikona.png` (najlepiej wygenerować też warianty 192x192 i 512x512)
   - `display: "standalone"` (lub `fullscreen`/`minimal-ui` zależnie od oczekiwanego efektu)
   - `start_url` i `scope` ograniczające aplikację do modułu Main
   - `orientation` (pion/poziom/any)
2. **Service Worker** dla spełnienia wymogów instalowalności PWA i wsparcia cache/offline.
3. **Integracja w `index.html`**:
   - `<link rel="manifest" ...>`
   - tagi meta dla urządzeń mobilnych (w szczególności iOS i Android)
4. **Routing/scope modułu Main**:
   - wyodrębniona ścieżka (np. `/main/`) albo jawny parametr startowy (np. `/?view=main`)
   - blokada nawigacji poza Main w kontekście PWA.

## Analiza wymagań użytkownika

### 1) Ikona `Pliki/Ikona.png`
- **Możliwe od razu**: użycie istniejącego pliku jako ikony manifestu.
- **Rekomendacja**: dodać też wersje 192/512 PNG (przez konwersję) dla pełnej zgodności sklepów launcherów i przeglądarek.
- **Ryzyko**: pojedynczy rozmiar ikony może obniżyć jakość lub blokować „installability” w części środowisk.

### 2) Ograniczenie do widoku użytkownika (tylko Main)
Opcje:
- **A. Scope + start_url tylko dla Main (rekomendowane)**
  - Przykład: `start_url: "/main/"`, `scope: "/main/"`
  - Plus: PWA naturalnie „zamyka się” w tej części aplikacji.
  - Minus: wymaga spójnego routingu i hostingu tej ścieżki.
- **B. Jeden punkt wejścia + flaga trybu PWA**
  - Przykład: `start_url: "/?app=main"`; kod ukrywa inne moduły.
  - Plus: mniej zmian infrastrukturalnych.
  - Minus: większe ryzyko obejścia przez URL i większa złożoność warunków w UI.

### 3) Instalacja jako osobna aplikacja
- **Tak, standardowo przez PWA install prompt** (Android/Chrome/Edge i desktop Chromium).
- Wymagane: HTTPS + manifest + service worker + odpowiednie ikony.
- iOS: instalacja przez „Dodaj do ekranu początkowego”, z nieco innym UX niż Android.

### 4) Brak paska adresu i interfejsu przeglądarki
- Dla Android/Chromium: `display: "standalone"` zwykle usuwa pasek adresu.
- Dla bardziej „app-like” efektu można rozważyć `display: "fullscreen"` (ale to bardziej agresywny tryb).
- iOS może zachowywać się nieco inaczej zależnie od wersji systemu i Safari.

### 5) Dotyczy tylko modułu Main
- Najczystsza implementacja: dedykowany URL modułu Main i przypięcie manifestu/scope/start_url do tej ścieżki.
- Alternatywnie: wydzielony „entrypoint” HTML tylko dla Main (np. `main.html`) z osobnym manifestem.

### 6) Blokada orientacji (pion/poziom/auto)
Możliwe warianty:
- `orientation: "portrait"`
- `orientation: "landscape"`
- `orientation: "any"` (urządzenie decyduje)

Opcje wdrożenia:
- **Statycznie**: jedna wartość w manifeście na build/środowisko.
- **Konfigurowalnie**: 3 profile manifestu (np. `manifest-portrait`, `manifest-landscape`, `manifest-auto`) wybierane konfiguracją wdrożenia lub podmienianym plikiem.

## Rekomendowana strategia
1. Wydzielić endpoint modułu Main (np. `/main/`).
2. Dodać manifest PWA ze `start_url` i `scope` ustawionymi na `/main/`.
3. Ustawić `display: "standalone"`.
4. Dodać service worker (cache minimalny + wersjonowanie).
5. Przygotować 3 warianty orientacji (lub parametr konfiguracyjny budujący manifest).
6. Podłączyć ikonę `Pliki/Ikona.png` + wygenerowane rozmiary 192/512.
7. Przetestować instalowalność:
   - Android Chrome
   - Desktop Chrome/Edge
   - iOS Safari (Add to Home Screen)

## Ograniczenia i uwagi
- „Brak paska adresu” jest **gwarantowany tylko w kontekście uruchomienia jako zainstalowana aplikacja PWA**, nie w zwykłej karcie przeglądarki.
- iOS ma historycznie bardziej restrykcyjne zachowanie PWA niż Android.
- Sama konfiguracja manifestu nie zastąpi poprawnego podziału aplikacji na moduły — trzeba dopilnować logiki UI/routingu.

## Szacunkowy zakres prac (bez implementacji)
- Przygotowanie manifestu + meta + integracja: **0.5 dnia**
- Service worker + strategia cache: **0.5–1 dnia**
- Wydzielenie/usztywnienie modułu Main: **0.5–1.5 dnia** (zależnie od obecnej architektury)
- Testy instalowalności na urządzeniach: **0.5 dnia**

Łącznie: **ok. 2–3 dni robocze** dla kompletnego i stabilnego wdrożenia.

## Decyzje do potwierdzenia przed implementacją
1. Czy moduł Main ma mieć osobny URL (`/main/`) czy działać pod parametrem?
2. Który domyślny tryb orientacji ma wejść na produkcję: `portrait`, `landscape` czy `any`?
3. Czy preferowany jest `standalone` czy `fullscreen`?
