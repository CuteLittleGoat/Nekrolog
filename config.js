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
