export default {
  title: "Estado de la configuración",
  description:
    "Auditoría de la configuración del escritorio (variables de entorno, config.yaml, modelos). Detecta inconsistencias que suelen causar fallos en el chat, con correcciones de un clic cuando es seguro aplicarlas automáticamente.",
  rerun: "Volver a ejecutar auditoría",
  allGood: "No se detectaron problemas. Tu configuración parece consistente.",
  banner: {
    lead: "Problemas de configuración detectados:",
    errors: "{{count}} error(es)",
    warnings: "{{count}} advertencia(s)",
    infos: "{{count}} nota(s)",
    showDetails: "Mostrar detalles",
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
    apply: "Aplicar corrección",
    running: "Aplicando…",
    success: "Corrección aplicada.",
    failure: "La corrección falló.",
  },
};
