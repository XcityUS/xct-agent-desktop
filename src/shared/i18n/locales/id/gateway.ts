export default {
  title: "Gateway",
  messagingGateway: "Gateway Pesan",
  platforms: "Platform",
  status: "Status",
  running: "Berjalan",
  stopped: "Berhenti",
  working: "Memproses…",
  restart: "Mulai ulang",
  restartFailed:
    "Gagal memulai ulang gateway. Periksa gateway-stderr.log untuk detail.",
  startFailed: "Gateway tidak dapat dimulai.",
  stopFailed: "Gateway tidak dapat dihentikan.",
  startExited: "Gateway sudah dimulai, tetapi berhenti sebelum siap.",
  checkLog: "Periksa log gateway:",
  gatewayHint:
    "Menghubungkan Hermes ke Telegram, Discord, Slack, dan platform lainnya",
} as const;
