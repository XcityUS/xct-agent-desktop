export default {
  title: "ゲートウェイ",
  messagingGateway: "メッセージングゲートウェイ",
  platforms: "プラットフォーム",
  status: "ステータス",
  running: "稼働中",
  stopped: "停止中",
  working: "処理中…",
  restart: "再起動",
  restartFailed:
    "ゲートウェイの再起動に失敗しました。詳細は gateway-stderr.log を確認してください。",
  startFailed: "ゲートウェイを起動できませんでした。",
  stopFailed: "ゲートウェイを停止できませんでした。",
  startExited: "ゲートウェイは起動しましたが、準備完了前に停止しました。",
  checkLog: "ゲートウェイログを確認してください:",
  gatewayHint:
    "Hermes を Telegram・Discord・Slack などのプラットフォームに接続します",
} as const;
