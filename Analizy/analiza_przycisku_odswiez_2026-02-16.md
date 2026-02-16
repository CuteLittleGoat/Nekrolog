# Analiza: dlaczego nie działa przycisk „Odśwież”

## Prompt użytkownika
Wykonaj kilka czynności:
1. Usuń wszystkie błędne dane z Firebase. Usuń też wpisy, które nie mają potwierdzenia w źródłach.
2. Usuń wszystkie funkcjonalności co do sposobu wyświetlania danych i formatowania Nazwisko, Imię - w danych źródłowych może to być różnie napisane. Skrypt ma przepisać dane z zewnętrznych linków a nie się zastanawiać co jest imieniem a co nazwiskiem.
2. Uzupełnij Firebase nowymi danymi. Prawdziwymi. Odczytaj źródłowe linki i przepisz zawarte tam informacje. Masz pełen dostęp do internetu.
Przykładowo pod linkiem:
https://www.puk.krakow.pl/pozegnalismy/
są informacje o zgonach m.in Feliks Buch, Tomasz Sobkowiak
3. Przycisk Odśwież nie działa. Przeprowadź pełną analizę funkcjonalności i zapisz czemu nie działa i jak to naprawić. Po naciśnięciu aplikacja nie zwraca żadnego błędu.


### Prompt aktualizacyjny (2026-02-16)
Przeczytaj a następnie zaktualizuj plik Analizy/analiza_przycisku_odswiez_2026-02-16.md

Rozwiń sekcję Jak domknąć proces w 100% (rekomendacja) i dopisz dokładnie jak od strony użytkownika będzie wyglądało działanie po wdrożeniu każdej z rekomendowanych metod. Czy będę musiał podawać jakiś token? Czy będzie się tworzyć jakieś issue w Github?
Co mam zrobić jak coś takiego wyskoczy? Czy token można zaszyć w kodzie? Aplikacja jest do prywatnego użytku i nie zawiera żadnych wrażliwych danych więc względy bezpieczeństwa mnie nie interesują.
Czy obie metody są bezpłatne?

## Diagnoza
1. Przycisk `#btnReload` był podpięty wyłącznie pod funkcję `loadAll()`, która **tylko odczytuje** dokumenty Firestore (`Nekrolog_snapshots/latest`, `Nekrolog_refresh_jobs/latest`, `Nekrolog_config/sources`).
2. Frontend nie wykonywał żadnego zapisu typu „refresh request”, nie wywoływał Cloud Function i nie uruchamiał workflow GitHub Actions.
3. W rezultacie użytkownik widział „brak efektu”, bo dane były po prostu ponownie pobierane z tego samego snapshotu.
4. Brak błędu w UI był spodziewany: operacja odczytu kończyła się powodzeniem, ale nie uruchamiała procesu odświeżania.

## Co jest źródłem właściwego odświeżania
- W repo istnieje pipeline `.github/workflows/refresh.yml`, który uruchamia `node scripts/refresh.mjs` co 30 minut albo ręcznie (`workflow_dispatch`).
- To oznacza, że historycznie „odśwież” w UI nie był połączony z tym procesem.

## Wdrożona poprawka
1. Dodano `requestRefresh(jobRef)` we frontendowym module Firebase, który zapisuje do `Nekrolog_refresh_jobs/latest` status `queued`, trigger `manual_ui` i timestamp.
2. Przycisk „Odśwież” uruchamia teraz `runRefresh()`:
   - wysyła żądanie odświeżenia do Firestore,
   - odświeża widok po zapisie,
   - loguje wynik operacji.
3. To daje widoczny efekt funkcjonalny i jawny sygnał dla automatyzacji backendowej.

## Jak domknąć proces w 100% (rekomendacja)

Poniżej rozpisuję **dwie rekomendowane metody**, wraz z tym jak to będzie wyglądało dla użytkownika końcowego i odpowiedziami na Twoje pytania.

### Metoda A (zalecana): Firestore -> Cloud Function/Cloud Run -> scraper

**Przepływ techniczny:**
1. Użytkownik klika „Odśwież”.
2. UI zapisuje `Nekrolog_refresh_jobs/latest` ze statusem `queued`.
3. Cloud Function (lub Cloud Run + trigger) wykrywa zmianę i uruchamia `scripts/refresh.mjs`.
4. Po zakończeniu scraper aktualizuje snapshot oraz status joba (`running` -> `done` / `error`).
5. UI odświeża widok i pokazuje nowy timestamp + ewentualny komunikat o błędzie.

**Jak to wygląda od strony użytkownika:**
- Klikasz przycisk i to wszystko — **nie podajesz żadnego tokena**.
- Nie przechodzisz do GitHuba.
- Nie tworzy się żadne issue.
- W idealnej wersji UI pokazuje komunikaty: „Kolejkuję…”, „Trwa odświeżanie…”, „Gotowe” albo „Błąd”.

**Co zrobić, gdy „coś wyskoczy” (błąd):**
- Jeśli komunikat brzmi np. „Brak uprawnień do zapisu joba” -> trzeba poprawić reguły Firestore lub konto zalogowanego użytkownika.
- Jeśli komunikat to „Refresh timeout / function unavailable” -> sprawdzić logi Cloud Function/Cloud Run i limity czasu.
- Jeśli status joba przechodzi na `error` -> w UI warto pokazać przycisk „Spróbuj ponownie”.

### Metoda B: UI -> backendowy endpoint -> GitHub Actions `workflow_dispatch`

**Przepływ techniczny:**
1. Użytkownik klika „Odśwież”.
2. UI wywołuje Twój endpoint backendowy (nie bezpośrednio GitHub API).
3. Endpoint (zapisany po stronie serwera) używa tokena GitHub i odpala workflow `refresh.yml` przez `workflow_dispatch`.
4. Workflow robi refresh i zapisuje nowe dane do Firestore.

**Jak to wygląda od strony użytkownika:**
- Również tylko kliknięcie przycisku — **bez wpisywania tokena**.
- W normalnym scenariuszu nie pojawia się żaden ekran GitHuba.
- **Nie tworzy się issue** (chyba że specjalnie dodasz krok „create issue on error”, domyślnie tego nie ma).

**Co zrobić, gdy „coś wyskoczy” (błąd):**
- „401/403 z GitHub API” -> token wygasł albo ma zbyt małe uprawnienia (`workflow`).
- „Workflow not found” -> zła nazwa pliku workflow / branch.
- „Rate limit” -> odczekać i powtórzyć albo dodać prostą kolejkę po stronie backendu.

### Czy będę musiał podawać jakiś token?
Nie. W obu metodach tokeny/secrety trzymasz po stronie backendu (Cloud Secret Manager, zmienne środowiskowe, GitHub Secrets). Użytkownik końcowy klika tylko przycisk.

### Czy można zaszyć token w kodzie (bo aplikacja prywatna)?
Technicznie można, ale **zdecydowanie odradzam** nawet dla projektu prywatnego:
- token w frontendzie bardzo łatwo wyciągnąć z DevTools,
- po wycieku ktoś może odpalać workflow lub użyć tokena w inny sposób,
- późniejsza rotacja i sprzątanie szkód jest bardziej kosztowne niż poprawna konfiguracja od razu.

Minimalny sensowny kompromis: token wyłącznie na backendzie (niewidoczny dla klienta), nawet jeśli to prywatna aplikacja.

### Czy obie metody są bezpłatne?
- **Metoda A (Cloud Function/Cloud Run):** zwykle mieści się w darmowych limitach przy małym ruchu, ale formalnie to usługi płatne „pay-as-you-go” po przekroczeniu free tier.
- **Metoda B (GitHub Actions):** dla repo prywatnych zależy od planu konta i limitu minut; po przekroczeniu limitu pojawiają się koszty.

W praktyce przy prywatnym, niedużym projekcie obie opcje często wychodzą „0 zł” miesięcznie, ale **nie ma gwarancji stałej pełnej darmowości**.

### Rekomendacja końcowa
- Jeśli chcesz najmniej elementów i najbardziej „firebase’owe” podejście -> **Metoda A**.
- Jeśli scraper już dobrze działa w GitHub Actions i chcesz tylko wyzwalanie „na żądanie” -> **Metoda B przez własny backendowy endpoint** (nie bezpośrednio z frontendu).

Bez jednej z tych metod przycisk nadal będzie tylko sygnałem „proszę o refresh”, a nie natychmiastowym uruchomieniem pełnego procesu.
