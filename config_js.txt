window.NEKROLOG_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyBjSijsTEvkOF9oTPOf3FgTf3zCcM59rQY",
    authDomain: "karty-turniej.firebaseapp.com",
    projectId: "karty-turniej",
    storageBucket: "karty-turniej.firebasestorage.app",
    messagingSenderId: "716608782712",
    appId: "1:716608782712:web:27d29434f013a5cf31888d",

    tablesCollection: "Tables",
    gamesCollection: "Tables",
    gameDetailsCollection: "rows",
    userGamesCollection: "UserGames",

    nekrologConfigCollection: "Nekrolog_config",
    nekrologRefreshJobsCollection: "Nekrolog_refresh_jobs",
    nekrologRefreshJobDocId: "latest",
    nekrologSnapshotsCollection: "Nekrolog_snapshots",
    nekrologSnapshotDocId: "latest",
  },

  // Okno czasowe (dni)
  windowDaysBack: 7,
  windowDaysForward: 7
};
