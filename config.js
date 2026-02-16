window.NEKROLOG_CONFIG = {
  // Na GitHub Pages (https://<owner>.github.io/<repo>/) aplikacja domyślnie
  // próbuje wykryć owner/repo i uruchamia workflow `refresh-data.yml`.
  // Poniższe opcje są potrzebne tylko gdy chcesz nadpisać to zachowanie.

  // Opcja 1 (lokalnie lub własny backend):
  // forceRefreshUrl: "https://twoj-backend.example.com/api/refresh",

  // Opcja 2 (GitHub Pages): uruchamianie workflow GitHub Actions.
  // Uwaga: tokenu nie commituj do repo. Pozostaw puste `token` i wklej PAT
  // dopiero w przeglądarce po kliknięciu "Wymuś aktualizację".
  // githubRefresh: {
  //   owner: "twoj-login-github",
  //   repo: "Nekrolog",
  //   workflowId: "refresh-data.yml", // nazwa pliku workflow albo ID
  //   ref: "work", // opcjonalnie; domyślnie pobrana zostanie domyślna gałąź repo
  //   token: "", // opcjonalnie; zalecane: pusty w repo
  // },
};
