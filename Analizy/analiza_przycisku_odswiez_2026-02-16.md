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
Aby kliknięcie faktycznie uruchamiało pełne pobranie danych natychmiast, należy dodać jeden z mechanizmów po stronie backendu:
1. Cloud Function / Cloud Run nasłuchujący zmian `Nekrolog_refresh_jobs/latest` i uruchamiający `scripts/refresh.mjs`.
2. Alternatywnie endpoint HTTP wywołujący GitHub Actions `workflow_dispatch` (z tokenem), który jest odpalany z UI.

Bez jednego z powyższych mechanizmów przycisk będzie sygnalizował „prośbę o odświeżenie”, ale nie wykona scrapera natychmiast.
