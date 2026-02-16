# Analiza: co jest potrzebne do wdrożenia Metody B

## Prompt użytkownika
Przeczytaj plik Analizy/analiza_przycisku_odswiez_2026-02-16.md a następnie napisz mi czy ja coś muszę zrobić, żebyś wdrożył:\nMetoda B: UI -> backendowy endpoint -> GitHub Actions workflow_dispatch\n\nJeżeli nie powstaje żaden issue to skłaniam się ku tej opcji.

## Odpowiedź
Krótko: **tak, potrzebuję od Ciebie 2 decyzji konfiguracyjnych**, ale nie musisz nic robić ręcznie w codziennym użyciu aplikacji.

### Co Ty musisz zrobić jednorazowo
1. Potwierdzić, gdzie ma działać endpoint backendowy (np. Cloud Run / Cloud Function / inny serwer).
2. Dodać lub pozwolić mi dodać sekret z tokenem GitHub po stronie backendu (token z uprawnieniem do uruchamiania workflow, bez umieszczania go w UI).

### Czego nie musisz robić
- Nie musisz wpisywać tokena w aplikacji.
- Nie musisz ręcznie odpalać workflow w GitHubie.
- Nie musisz tworzyć issue (i domyślnie nie będzie się tworzyć żadne issue).

### Co mogę wdrożyć po Twojej zgodzie
- Endpoint `POST /refresh` po stronie backendu.
- Wywołanie GitHub Actions `workflow_dispatch` dla `refresh.yml`.
- Podpięcie przycisku „Odśwież” w UI do tego endpointu.
- Prosty status w UI (np. „wysłano żądanie”, „błąd”).

### Wniosek
Jeśli akceptujesz powyższe 2 punkty (hosting endpointu + sekret tokena), to **możemy wdrażać Metodę B** i to jest spójny wybór z Twoim założeniem „bez issue”.
