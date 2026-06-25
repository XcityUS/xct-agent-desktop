import { describe, expect, it } from "vitest";
import { estimateCredits, measure } from "./cost-estimator.js";

describe("cost estimator", () => {
  it("returns zero for empty inputs", () => {
    const r = measure("", "", "gpt-4");
    expect(r.promptTokens).toBe(0);
    expect(r.completionTokens).toBe(0);
    expect(r.totalTokens).toBe(0);
    expect(r.credits).toBe(0);
  });

  it("totalTokens equals prompt + completion", () => {
    const r = measure("hello world", "response text here", "gpt-4o");
    expect(r.totalTokens).toBe(r.promptTokens + r.completionTokens);
  });

  it("handles array-of-messages prompt", () => {
    const r = measure(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      "follow up",
      "claude-sonnet",
    );
    expect(r.promptTokens).toBeGreaterThan(0);
  });

  it("credit cost scales with model — opus > sonnet for same payload", () => {
    const a = measure("test prompt content", "test completion", "claude-opus");
    const b = measure(
      "test prompt content",
      "test completion",
      "claude-sonnet",
    );
    expect(a.credits).toBeGreaterThan(b.credits);
  });

  it("llama is cheapest among known models", () => {
    const llama = measure("hello", "world", "llama-3.3");
    const opus = measure("hello", "world", "claude-opus");
    expect(llama.credits).toBeLessThan(opus.credits);
  });

  it("unknown model falls back to default rate", () => {
    // Use a substantial input so the rounded credit cost is non-zero.
    const longText = "sentence about machine learning ".repeat(40);
    const known = measure(longText, longText, "gpt-4o");
    const unknown = measure(longText, longText, "totally-made-up-model");
    // Default rate matches gpt-4o, so credits should be equal.
    expect(unknown.credits).toBe(known.credits);
    expect(unknown.credits).toBeGreaterThan(0);
  });

  it("estimateCredits applies 10% markup", () => {
    // gpt-4 = 30c per 1k input, 60c per 1k output
    // 1k in + 1k out = 30 + 60 = 90c = $0.90 raw
    // *1.1 = $0.99 = 990 credits
    const credits = estimateCredits("gpt-4", 1000, 1000);
    expect(credits).toBe(990);
  });

  it("estimateCredits returns 0 for zero tokens", () => {
    expect(estimateCredits("gpt-4", 0, 0)).toBe(0);
  });

  it("measure returns model echo", () => {
    const r = measure("x", "y", "gpt-4o");
    expect(r.model).toBe("gpt-4o");
  });

  it("does not throw on very long input", () => {
    const long = "x ".repeat(50_000);
    const r = measure(long, "", "gpt-4");
    expect(r.promptTokens).toBeGreaterThan(1000);
  });
});
