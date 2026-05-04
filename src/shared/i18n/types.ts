export type AppLocale = "en" | "es" | "zh-CN";

export type TranslationTree = {
  [key: string]: string | TranslationTree;
};
