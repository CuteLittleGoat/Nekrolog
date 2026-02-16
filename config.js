window.NEKROLOG_CONFIG = {
  // Opcja 1 (lokalnie lub własny backend):
  // forceRefreshUrl: "https://twoj-backend.example.com/api/refresh",

  // Opcja 2 (zalecane na GitHub Pages, bez PAT):
  // Aplikacja domyślnie wykrywa owner/repo i po kliknięciu "Wymuś aktualizację"
  // otwiera gotowe Issue na GitHub z etykietą refresh-request.
  // Wystarczy kliknąć "Submit new issue".
  // githubIssueRefresh: {
  //   owner: "twoj-login-github",
  //   repo: "Nekrolog",
  //   labels: ["refresh-request"],
  //   titlePrefix: "[refresh-request]",
  // },

  // Opcja 3 (zaawansowane, nadal możliwe): bezpośredni workflow_dispatch przez API.
  // Wymaga tokenu PAT i nie jest domyślnie używane.
  // githubRefresh: {
  //   owner: "twoj-login-github",
  //   repo: "Nekrolog",
  //   workflowId: "refresh-data.yml",
  //   ref: "work",
  //   token: "", // opcjonalnie; NIE commituj sekretów
  // },
};
