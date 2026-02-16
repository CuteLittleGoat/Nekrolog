# Analiza śladów autora / nicku / GitHub (2026-02-16)

## Prompt użytkownika
"Planuję aplikację udostępnić innej osobie, żeby ta wrzuciła na ogólnodostępną domenę. Sprawdź bardzo dokładnie czy gdziekolwiek w kodzie są informacje o tym, że ja to robiłem. Jest gdzieś mój nick albo odnośnik do github?"

## Zakres analizy
- Przeszukanie plików projektu (bez katalogu `.git`) pod kątem:
  - odnośników do GitHub/GitLab/Bitbucket,
  - potencjalnych podpisów autora (`author`, `created by`, `made by`, `copyright`),
  - linków do profili i serwisów społecznościowych.
- Dodatkowo sprawdzenie metadanych repozytorium w `.git`, bo tam czasem zostaje URL z nickiem.

## Użyte polecenia
1. `rg -n -S --glob '!.git/**' "github|gitlab|bitbucket|author|copyright|created by|made by|noreply|linkedin|twitter|x.com|instagram|tiktok|youtube|discord|telegram|patreon|buymeacoffee|ko-fi" .`
2. `rg -n --glob '!.git/**' -e 'https?://[^\s)"\]`>]+' -e 'git@[^\s]+' .`
3. `cat .git/config`
4. `cat .git/FETCH_HEAD | sed -n '1,5p'`

## Wyniki
### 1) Pliki aplikacji (kod + dane + zasoby) — **brak Twojego nicku i brak linku do Twojego GitHuba**
- W kodzie frontend/backend (`index.html`, `app.js`, `styles.css`, `collector.py`, `serve.py`), konfiguracji źródeł (`sources.json`) i danych (`data/latest.json`) nie ma wpisu z Twoim nickiem ani odnośnika do repo/profilu GitHub.
- Wykryte URL-e dotyczą wyłącznie monitorowanych źródeł nekrologów/parafii oraz localhost.

### 2) Jedyny ślad „github” w plikach projektu (poza `.git`)
- `Pliki/Przykładowy update_yml.txt` zawiera techniczny adres bota CI:
  - `obits-bot@users.noreply.github.com`
- To nie wskazuje Twojego nicku, ale samo słowo `github` tam występuje.

### 3) Metadane repozytorium `.git` — **tu jest nick i link do GitHub**
- W `.git/FETCH_HEAD` jest URL:
  - `https://github.com/CuteLittleGoat/Nekrolog`
- To nie jest część kodu aplikacji renderowanego na stronie, ale jest to ślad repozytorium lokalnego.

## Wniosek końcowy
- **W samym kodzie aplikacji:** nie znalazłem Twojego nicku ani linku do Twojego GitHuba.
- **W metadanych Git (`.git/FETCH_HEAD`):** jest URL z nickiem `CuteLittleGoat`.

## Rekomendacja przed przekazaniem dalej
- Jeśli przekazujesz aplikację jako paczkę do wdrożenia, przekaż ją **bez folderu `.git`**.
- Jeśli chcesz usunąć nawet techniczne wzmianki o `github` z plików pomocniczych, rozważ edycję/usunięcie `Pliki/Przykładowy update_yml.txt`.
