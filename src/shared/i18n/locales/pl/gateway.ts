export default {
  title: "Bramka",
  messagingGateway: "Bramka komunikacyjna",
  platforms: "Platformy",
  status: "Status",
  running: "Działa",
  stopped: "Zatrzymana",
  working: "Przetwarzanie…",
  restart: "Uruchom ponownie",
  restartFailed:
    "Nie udało się ponownie uruchomić bramki. Szczegóły znajdziesz w gateway-stderr.log.",
  startFailed: "Nie udało się uruchomić bramki.",
  stopFailed: "Nie udało się zatrzymać bramki.",
  startExited:
    "Bramka została uruchomiona, ale zatrzymała się przed osiągnięciem gotowości.",
  checkLog: "Sprawdź dziennik bramki:",
  gatewayHint:
    "Łączy Hermes z Telegramem, Discordem, Slackiem i innymi platformami",
} as const;
