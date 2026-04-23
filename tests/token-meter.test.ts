import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  measure,
  createReport,
  verify,
  verifyReport,
  validateUsage,
  bufferUsage,
  flushUsage,
  setHmacSecret,
  getHmacSecret,
  setClientId,
  getClientId,
  estimateErrorRate,
  type TokenUsage,
  type UsageReport,
  type MessageLike,
} from "../src/main/token-meter";

// ─── measure ─────────────────────────────────────────────────────────────────

describe("measure", () => {
  it("measures tokens for simple string prompt", () => {
    const result = measure("Hello, world!", "Response text", "gpt-4");
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBe(
      result.usage.promptTokens + result.usage.completionTokens,
    );
  });

  it("measures tokens for array of messages", () => {
    const messages: MessageLike[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const result = measure(messages, "Follow-up question", "claude-3");
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });

  it("handles empty strings", () => {
    const result = measure("", "", "gpt-4");
    expect(result.usage.promptTokens).toBe(0);
    expect(result.usage.completionTokens).toBe(0);
  });

  it("uses model-specific token ratios", () => {
    const text = "This is a test sentence for measuring tokens.";
    const gptResult = measure(text, "", "gpt-4");
    const claudeResult = measure(text, "", "claude-3");
    // Different models have different ratios, results may vary
    expect(gptResult.usage.promptTokens).toBeGreaterThan(0);
    expect(claudeResult.usage.promptTokens).toBeGreaterThan(0);
  });

  it("includes metadata in measurement", () => {
    const result = measure("prompt", "completion", "test-model", {
      sessionId: "session-123",
      timestamp: 1700000000000,
    });
    expect(result.usage.sessionId).toBe("session-123");
    expect(result.usage.timestamp).toBe(1700000000000);
    expect(result.encoding).toBe("cl100k_base");
    expect(result.promptCharacterCount).toBe(6);
    expect(result.completionCharacterCount).toBe(10);
  });

  it("defaults timestamp when not provided", () => {
    const before = Date.now();
    const result = measure("prompt", "completion", "test-model");
    const after = Date.now();
    expect(result.usage.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.usage.timestamp).toBeLessThanOrEqual(after);
  });

  it("handles code-heavy content", () => {
    const code = "function test() { return 42; } const x = test();";
    const result = measure(code, "Exported", "hermes-agent");
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });
});

// ─── HMAC Signature ──────────────────────────────────────────────────────────

describe("HMAC Signature", () => {
  beforeEach(() => {
    setHmacSecret("test-secret-key");
    setClientId("test-client");
  });

  it("generates non-empty signature", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const report = createReport(usage);
    expect(report.signature).toBeTruthy();
    expect(report.signature.length).toBe(64); // SHA256 hex
  });

  it("generates different signatures for different usages", () => {
    const usage1: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const usage2: TokenUsage = {
      promptTokens: 200,
      completionTokens: 50,
      totalTokens: 250,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const report1 = createReport(usage1);
    const report2 = createReport(usage2);
    expect(report1.signature).not.toBe(report2.signature);
  });

  it("verifies valid signature", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const report = createReport(usage);
    const result = verify(usage, report.signature);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid signature", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const result = verify(usage, "invalid-signature-that-is-64-chars-long-to-match-sha256-hex-format");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects tampered usage", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const report = createReport(usage);

    // Tamper with usage
    const tamperedUsage = { ...usage, promptTokens: 999 };
    const result = verify(tamperedUsage, report.signature);
    expect(result.valid).toBe(false);
  });

  it("rejects empty signature", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const result = verify(usage, "");
    expect(result.valid).toBe(false);
  });

  it("allows verification without secret set", () => {
    setHmacSecret("");
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const result = verify(usage, "any-signature");
    expect(result.valid).toBe(true); // Skips verification
  });
});

// ─── Usage Report ────────────────────────────────────────────────────────────

describe("Usage Report", () => {
  beforeEach(() => {
    setHmacSecret("test-secret");
    setClientId("test-client");
  });

  afterEach(() => {
    setClientId("");
  });

  it("creates report with usage and signature", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
      sessionId: "session-123",
    };
    const report = createReport(usage);
    expect(report.usage).toEqual(usage);
    expect(report.signature).toBeTruthy();
    expect(report.reportedAt).toBeGreaterThan(0);
    expect(report.clientId).toBe("test-client");
  });

  it("verifies valid report", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 1700000000000,
    };
    const report = createReport(usage);
    const result = verifyReport(report);
    expect(result.valid).toBe(true);
  });

  it("rejects report with no signature", () => {
    const report: UsageReport = {
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        model: "test-model",
        timestamp: 1700000000000,
      },
      signature: "",
      reportedAt: Date.now(),
      clientId: "test-client",
    };
    const result = verifyReport(report);
    expect(result.valid).toBe(false);
  });
});

// ─── Usage Validation ────────────────────────────────────────────────────────

describe("validateUsage", () => {
  it("accepts valid usage", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now(),
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(true);
  });

  it("rejects negative prompt tokens", () => {
    const usage: TokenUsage = {
      promptTokens: -1,
      completionTokens: 50,
      totalTokens: 49,
      model: "test-model",
      timestamp: Date.now(),
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("prompt");
  });

  it("rejects negative completion tokens", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: -50,
      totalTokens: 50,
      model: "test-model",
      timestamp: Date.now(),
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("completion");
  });

  it("rejects mismatched total tokens", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 200, // Wrong!
      model: "test-model",
      timestamp: Date.now(),
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");
  });

  it("rejects excessive total tokens", () => {
    const usage: TokenUsage = {
      promptTokens: 500000,
      completionTokens: 500001,
      totalTokens: 1000001,
      model: "test-model",
      timestamp: Date.now(),
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds");
  });

  it("rejects future timestamp", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now() + 100000, // Future
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("timestamp");
  });

  it("rejects zero timestamp", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: 0,
    };
    const result = validateUsage(usage);
    expect(result.valid).toBe(false);
  });
});

// ─── Usage Buffering ─────────────────────────────────────────────────────────

describe("Usage Buffering", () => {
  afterEach(() => {
    flushUsage(); // Clear buffer
  });

  it("buffers usage", () => {
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now(),
    });
    const aggregated = flushUsage();
    expect(aggregated.totalPromptTokens).toBe(100);
    expect(aggregated.totalCompletionTokens).toBe(50);
    expect(aggregated.totalTokens).toBe(150);
  });

  it("aggregates multiple usages", () => {
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "model-a",
      timestamp: Date.now(),
    });
    bufferUsage({
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      model: "model-b",
      timestamp: Date.now(),
    });
    const aggregated = flushUsage();
    expect(aggregated.totalPromptTokens).toBe(300);
    expect(aggregated.totalCompletionTokens).toBe(150);
    expect(aggregated.totalTokens).toBe(450);
    expect(aggregated.modelCounts["model-a"]).toBe(1);
    expect(aggregated.modelCounts["model-b"]).toBe(1);
    expect(aggregated.sessionCount).toBe(0);
  });

  it("counts unique sessions", () => {
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now(),
      sessionId: "session-a",
    });
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now(),
      sessionId: "session-b",
    });
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now(),
      sessionId: "session-a", // Duplicate
    });
    const aggregated = flushUsage();
    expect(aggregated.sessionCount).toBe(2); // Only 2 unique sessions
  });

  it("clears buffer after flush", () => {
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "test-model",
      timestamp: Date.now(),
    });
    flushUsage();
    const aggregated = flushUsage();
    expect(aggregated.totalTokens).toBe(0);
  });
});

// ─── Error Rate Estimation ───────────────────────────────────────────────────

describe("estimateErrorRate", () => {
  it("returns a positive error rate", () => {
    const measurement = measure("Hello world", "Response", "gpt-4");
    const errorRate = estimateErrorRate(measurement);
    expect(errorRate).toBeGreaterThan(0);
  });

  it("returns a reasonable error rate", () => {
    const measurement = measure("Hello world", "Response", "gpt-4");
    const errorRate = estimateErrorRate(measurement);
    expect(errorRate).toBeLessThan(10); // Less than 10%
  });

  it("handles short text with higher error", () => {
    const short = measure("Hi", "", "gpt-4");
    const long = measure("This is a much longer piece of text to measure tokens accurately.", "", "gpt-4");
    const shortError = estimateErrorRate(short);
    const longError = estimateErrorRate(long);
    // Short text typically has higher error rate
    expect(shortError).toBeGreaterThanOrEqual(longError);
  });
});

// ─── Client ID ───────────────────────────────────────────────────────────────

describe("Client ID", () => {
  it("defaults to empty string", () => {
    expect(getClientId()).toBe("");
  });

  it("can set and get client ID", () => {
    setClientId("my-client-123");
    expect(getClientId()).toBe("my-client-123");
  });

  it("persists across calls", () => {
    setClientId("persistent-client");
    const id1 = getClientId();
    const id2 = getClientId();
    expect(id1).toBe(id2);
  });
});
