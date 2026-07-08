import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

import { modelConfigBaseUrlForProvider } from "./Models";

describe("modelConfigBaseUrlForProvider", () => {
  it("preserves explicit custom local-provider URLs when syncing the active model", () => {
    expect(
      modelConfigBaseUrlForProvider("ollama", " http://localhost:11435/v1 "),
    ).toBe("http://localhost:11435/v1");
    expect(
      modelConfigBaseUrlForProvider("lmstudio", "http://127.0.0.1:2234/v1"),
    ).toBe("http://127.0.0.1:2234/v1");
    expect(
      modelConfigBaseUrlForProvider("atomicchat", "http://localhost:1338/v1"),
    ).toBe("http://localhost:1338/v1");
  });

  it("keeps remote built-in providers on backend canonical URL substitution", () => {
    expect(
      modelConfigBaseUrlForProvider("deepseek", "https://proxy.local/v1"),
    ).toBe("");
  });

  it("preserves custom provider URLs", () => {
    expect(
      modelConfigBaseUrlForProvider("custom", " https://custom.local/v1 "),
    ).toBe("https://custom.local/v1");
  });
});
