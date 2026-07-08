export default {
  title: "Yapılandırma Sağlığı",
  description:
    "Masaüstü yapılandırmasının denetimi (ortam değişkenleri, config.yaml, modeller). Sohbetin başarısız olmasına neden olan tutarsızlıkları bulur ve güvenli olduğunda tek tıkla düzeltme sunar.",
  rerun: "Denetimi yeniden çalıştır",
  allGood: "Sorun bulunamadı. Yapılandırmanız tutarlı görünüyor.",
  banner: {
    lead: "Yapılandırma sorunları tespit edildi:",
    errors: "{{count}} hata",
    warnings: "{{count}} uyarı",
    infos: "{{count}} not",
    showDetails: "Ayrıntıları göster",
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
    apply: "Düzeltmeyi uygula",
    running: "Uygulanıyor…",
    success: "Düzeltme uygulandı.",
    failure: "Düzeltme başarısız.",
  },
};
