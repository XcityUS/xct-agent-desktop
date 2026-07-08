export default {
  title: "Diagnóstico de configuração",
  description:
    "Auditoria à configuração do desktop (variáveis de ambiente, config.yaml, modelos). Apresenta inconsistências que costumam causar falhas no chat, com correcções automáticas onde é seguro aplicá-las.",
  rerun: "Repetir auditoria",
  allGood: "Nenhum problema detectado. A configuração parece consistente.",
  banner: {
    lead: "Problemas de configuração detectados:",
    errors: "{{count}} erro(s)",
    warnings: "{{count}} aviso(s)",
    infos: "{{count}} nota(s)",
    showDetails: "Mostrar detalhes",
  },
  apiKeyBanner: {
    lead: "API Server Key not set — chat will fail.",
    setNow: "SET NOW",
  },
  apiKeyModal: {
    title: "Set API Server Key",
    description:
      "API_SERVER_KEY is required for the Hermes gateway to authenticate requests. Set it now to enable chat.",
    label: "API Server Key",
    placeholder: "sk-… or any secret",
    autoGenerate: "Auto-generate",
    hint: "You can paste your own key or generate a random UUID.",
  },
  fix: {
    apply: "Aplicar correcção",
    running: "A aplicar…",
    success: "Correcção aplicada.",
    failure: "A correcção falhou.",
  },
};
