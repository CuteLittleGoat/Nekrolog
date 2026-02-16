window.NEKROLOG_CONFIG = {
  // Opcja 1 (lokalnie lub własny backend):
  // forceRefreshUrl: "https://twoj-backend.example.com/api/refresh",

  // Opcja 2 (GitHub Pages): uruchamianie workflow GitHub Actions.
  // Uwaga: tokenu nie commituj do repo. Pozostaw puste `token` i wklej PAT
  // dopiero w przeglądarce po kliknięciu "Wymuś aktualizację".
  // githubRefresh: {
  //   owner: "twoj-login-github",
  //   repo: "Nekrolog",
  //   workflowId: "refresh-data.yml", // nazwa pliku workflow albo ID
  //   ref: "work", // gałąź z której publikujesz GitHub Pages
  //   token: "", // opcjonalnie; zalecane: pusty w repo
  // },
};
