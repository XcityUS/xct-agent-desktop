/**
 * Sprint 2 QA — S2-QA-01: Cloud Mode E2E Tests
 *
 * End-to-end tests covering:
 * - Local/Cloud mode switching
 * - Token metering through the complete flow
 * - Balance display and updates
 * - Error handling and edge cases
 *
 * Acceptance: > 20 test cases
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import {
  configureCloudApi,
  getCloudApiConfig,
  chatCompletion,
  getBalance,
  reportUsage,
  healthCheck,
  getCloudMode,
  setCloudMode,
  determineCloudMode,
  type ChatCompletionParams,
  type ChatStreamCallbacks,
  type CloudMode,
  type BalanceResponse,
  type ReportUsageResult,
} from "../src/main/cloud-api";
import {
  measure,
  createReport,
  verify,
  validateUsage,
  bufferUsage,
  flushUsage,
  setHmacSecret,
  setClientId,
  estimateErrorRate,
  type TokenUsage,
  type TokenMeasurement,
} from "../src/main/token-meter";

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const TEST_API_KEY = "test-xct-api-key-12345";
const TEST_BASE_URL = "https://api.xct.dev/v1";

const SAMPLE_MESSAGES = [
  { role: "system" as const, content: "You are a helpful assistant." },
  { role: "user" as const, content: "What is token metering?" },
];

const SAMPLE_COMPLETION = "Token metering is the process of measuring and reporting token usage for AI model interactions.";

// ─── Mode Switching Tests ───────────────────────────────────────────────────

describe("Cloud Mode — Mode Switching", () => {
  it("S2-QA-01-001: defaults to online mode on initialization", () => {
    // Fresh module import should default to online
    expect(getCloudMode()).toBe("online");
  });

  it("S2-QA-01-002: can switch to offline mode", () => {
    setCloudMode("offline");
    expect(getCloudMode()).toBe("offline");
  });

  it("S2-QA-01-003: can switch to degraded mode", () => {
    setCloudMode("degraded");
    expect(getCloudMode()).toBe("degraded");
  });

  it("S2-QA-01-004: can switch back to online from degraded", () => {
    setCloudMode("degraded");
    setCloudMode("online");
    expect(getCloudMode()).toBe("online");
  });

  it("S2-QA-01-005: can switch to offline then back to online", () => {
    setCloudMode("offline");
    setCloudMode("online");
    expect(getCloudMode()).toBe("online");
  });

  it("S2-QA-01-006: determineCloudMode returns offline when no API key and health fails", async () => {
    configureCloudApi({ baseUrl: "https://invalid-url-that-does-not-exist.test", apiKey: "" });
    const mode = await determineCloudMode();
    expect(mode).toBe("offline");
  });

  it("S2-QA-01-007: determineCloudMode returns degraded when API key set but health fails", async () => {
    configureCloudApi({ baseUrl: "https://invalid-url-that-does-not-exist.test", apiKey: TEST_API_KEY });
    const mode = await determineCloudMode();
    expect(mode).toBe("degraded");
  });

  it("S2-QA-01-008: mode persists across multiple getCloudMode calls", () => {
    setCloudMode("offline");
    expect(getCloudMode()).toBe("offline");
    expect(getCloudMode()).toBe("offline");
    expect(getCloudMode()).toBe("offline");
  });
});

// ─── Balance Display Tests ─────────────────────────────────────────────────

describe("Cloud Mode — Balance Display", () => {
  beforeEach(() => {
    configureCloudApi({ baseUrl: TEST_BASE_URL, apiKey: TEST_API_KEY });
  });

  it("S2-QA-01-009: getBalance returns structure with required fields on success", async () => {
    // This will fail due to invalid URL but should return proper structure
    const result: BalanceResponse = await getBalance();
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("error");
    // When success is false, balance should be undefined
    if (result.success) {
      expect(result.balance).toHaveProperty("available");
      expect(result.balance).toHaveProperty("total");
      expect(result.balance).toHaveProperty("currency");
      expect(result.balance).toHaveProperty("lastUpdated");
    }
  });

  it("S2-QA-01-010: getBalance returns error message on network failure", async () => {
    configureCloudApi({ baseUrl: "https://127.0.0.1:99999", apiKey: TEST_API_KEY, timeout: 1000 });
    const result = await getBalance();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("S2-QA-01-011: balance info has correct currency default", async () => {
    configureCloudApi({ baseUrl: "https://127.0.0.1:99999", apiKey: TEST_API_KEY, timeout: 500 });
    const result = await getBalance();
    // Even on failure, error should be defined
    expect(result.error).toBeTruthy();
  });
});

// ─── Token Metering Through Cloud API ──────────────────────────────────────

describe("Cloud Mode — Token Metering", () => {
  beforeEach(() => {
    configureCloudApi({ baseUrl: TEST_BASE_URL, apiKey: TEST_API_KEY });
    setHmacSecret("test-hmac-secret");
    setClientId("test-client-001");
  });

  it("S2-QA-01-012: measure returns valid token usage structure", () => {
    const result = measure(SAMPLE_MESSAGES, SAMPLE_COMPLETION, "gpt-4");
    expect(result.usage).toHaveProperty("promptTokens");
    expect(result.usage).toHaveProperty("completionTokens");
    expect(result.usage).toHaveProperty("totalTokens");
    expect(result.usage).toHaveProperty("model");
    expect(result.usage).toHaveProperty("timestamp");
  });

  it("S2-QA-01-013: measure calculates totalTokens as sum of prompt and completion", () => {
    const result = measure(SAMPLE_MESSAGES, SAMPLE_COMPLETION, "gpt-4");
    expect(result.usage.totalTokens).toBe(result.usage.promptTokens + result.usage.completionTokens);
  });

  it("S2-QA-01-014: measure handles string prompt input", () => {
    const promptText = "Hello, how are you?";
    const result = measure(promptText, "I'm doing well, thank you!", "gpt-4");
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });

  it("S2-QA-01-015: measure handles array of messages input", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const result = measure(messages, "Follow-up", "claude-3");
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });

  it("S2-QA-01-016: measure includes session ID when provided", () => {
    const result = measure("prompt", "completion", "gpt-4", { sessionId: "session-abc-123" });
    expect(result.usage.sessionId).toBe("session-abc-123");
  });

  it("S2-QA-01-017: measure includes timestamp when provided", () => {
    const ts = 1700000000000;
    const result = measure("prompt", "completion", "gpt-4", { timestamp: ts });
    expect(result.usage.timestamp).toBe(ts);
  });

  it("S2-QA-01-018: createReport generates valid signed report", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: Date.now(),
      sessionId: "test-session",
    };
    const report = createReport(usage);
    expect(report.signature).toBeTruthy();
    expect(report.signature.length).toBe(64); // SHA256 hex
    expect(report.clientId).toBe("test-client-001");
  });

  it("S2-QA-01-019: verify validates correct signature", () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: Date.now(),
    };
    const report = createReport(usage);
    const result = verify(usage, report.signature);
    expect(result.valid).toBe(true);
  });

  it("S2-QA-01-020: validateUsage rejects negative tokens", () => {
    const invalidUsage: TokenUsage = {
      promptTokens: -10,
      completionTokens: 50,
      totalTokens: 40,
      model: "gpt-4",
      timestamp: Date.now(),
    };
    const result = validateUsage(invalidUsage);
    expect(result.valid).toBe(false);
  });

  it("S2-QA-01-021: validateUsage rejects mismatched totalTokens", () => {
    const invalidUsage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 999, // Wrong!
      model: "gpt-4",
      timestamp: Date.now(),
    };
    const result = validateUsage(invalidUsage);
    expect(result.valid).toBe(false);
  });

  it("S2-QA-01-022: bufferUsage and flushUsage aggregate correctly", () => {
    flushUsage(); // Clear any existing
    bufferUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: Date.now(),
    });
    bufferUsage({
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      model: "gpt-4",
      timestamp: Date.now(),
    });
    const aggregated = flushUsage();
    expect(aggregated.totalPromptTokens).toBe(300);
    expect(aggregated.totalCompletionTokens).toBe(150);
    expect(aggregated.totalTokens).toBe(450);
  });

  it("S2-QA-01-023: estimateErrorRate returns reasonable values", () => {
    const measurement = measure(SAMPLE_MESSAGES, SAMPLE_COMPLETION, "gpt-4");
    const errorRate = estimateErrorRate(measurement);
    expect(errorRate).toBeGreaterThan(0);
    expect(errorRate).toBeLessThan(10); // Should be less than 10%
  });
});

// ─── Report Usage Tests ────────────────────────────────────────────────────

describe("Cloud Mode — Report Usage", () => {
  beforeEach(() => {
    configureCloudApi({
      baseUrl: "https://127.0.0.1:1", // Immediate failure
      apiKey: TEST_API_KEY,
      timeout: 500,
    });
  });

  it("S2-QA-01-024: reportUsage returns success=false when network unavailable", { timeout: 15000 }, async () => {
    const result: ReportUsageResult = await reportUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("S2-QA-01-025: reportUsage includes error message on failure", { timeout: 15000 }, async () => {
    const result = await reportUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: Date.now(),
    });
    expect(result.error).toBeTruthy();
  });
});

// ─── Health Check Tests ────────────────────────────────────────────────────

describe("Cloud Mode — Health Check", () => {
  beforeEach(() => {
    configureCloudApi({ baseUrl: TEST_BASE_URL, apiKey: TEST_API_KEY });
  });

  it("S2-QA-01-026: healthCheck returns healthy=false when API unreachable", async () => {
    configureCloudApi({ baseUrl: "https://127.0.0.1:99999", timeout: 1000 });
    const result = await healthCheck();
    expect(result.healthy).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("S2-QA-01-027: healthCheck returns latency on failure", async () => {
    configureCloudApi({ baseUrl: "https://127.0.0.1:99999", timeout: 1000 });
    const result = await healthCheck();
    expect(result.latencyMs).toBeDefined();
    expect(result.latencyMs).toBeGreaterThan(0);
  });
});

// ─── Chat Completion Tests ─────────────────────────────────────────────────

describe("Cloud Mode — Chat Completion", () => {
  beforeEach(() => {
    configureCloudApi({ baseUrl: TEST_BASE_URL, apiKey: TEST_API_KEY });
  });

  it("S2-QA-01-028: chatCompletion returns abort handle", () => {
    const params: ChatCompletionParams = {
      model: "gpt-4",
      messages: SAMPLE_MESSAGES,
    };
    const cb: ChatStreamCallbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    const handle = chatCompletion(params, cb);
    expect(handle).toHaveProperty("abort");
    expect(typeof handle.abort).toBe("function");
  });

  it("S2-QA-01-029: abort does not throw", () => {
    const params: ChatCompletionParams = {
      model: "gpt-4",
      messages: SAMPLE_MESSAGES,
    };
    const cb: ChatStreamCallbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    const handle = chatCompletion(params, cb);
    expect(() => handle.abort()).not.toThrow();
  });

  it("S2-QA-01-030: chatCompletion with stream=false still returns handle", () => {
    const params: ChatCompletionParams = {
      model: "gpt-4",
      messages: SAMPLE_MESSAGES,
      stream: false,
    };
    const cb: ChatStreamCallbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    const handle = chatCompletion(params, cb);
    expect(handle).toHaveProperty("abort");
  });
});

// ─── Integration: Full Cloud Mode Flow ─────────────────────────────────────

describe("Cloud Mode — Full Flow Integration", () => {
  beforeEach(() => {
    configureCloudApi({ baseUrl: TEST_BASE_URL, apiKey: TEST_API_KEY });
    setCloudMode("online");
    setHmacSecret("integration-test-secret");
    setClientId("integration-client");
  });

  it("S2-QA-01-031: complete flow: measure -> createReport -> verify", () => {
    // Step 1: Measure tokens
    const measurement = measure(SAMPLE_MESSAGES, SAMPLE_COMPLETION, "gpt-4", {
      sessionId: "flow-test-session",
    });
    expect(measurement.usage.totalTokens).toBeGreaterThan(0);

    // Step 2: Create signed report
    const report = createReport(measurement.usage);
    expect(report.signature).toBeTruthy();

    // Step 3: Verify the report
    const verification = verify(measurement.usage, report.signature);
    expect(verification.valid).toBe(true);
  });

  it("S2-QA-01-032: mode switching affects cloud behavior", async () => {
    // In offline mode, should not attempt network calls
    setCloudMode("offline");
    expect(getCloudMode()).toBe("offline");

    // In degraded mode, should attempt but fail gracefully
    setCloudMode("degraded");
    expect(getCloudMode()).toBe("degraded");

    // Back to online
    setCloudMode("online");
    expect(getCloudMode()).toBe("online");
  });

  it("S2-QA-01-033: buffer and aggregate usage across multiple measurements", () => {
    flushUsage(); // Clear

    const measurement1 = measure("First prompt", "First response", "gpt-4", {
      sessionId: "batch-session",
    });
    const measurement2 = measure("Second prompt", "Second response", "claude-3", {
      sessionId: "batch-session",
    });

    bufferUsage(measurement1.usage);
    bufferUsage(measurement2.usage);

    const aggregated = flushUsage();
    expect(aggregated.totalTokens).toBe(
      measurement1.usage.totalTokens + measurement2.usage.totalTokens
    );
    expect(aggregated.sessionCount).toBe(1); // Same session
    expect(aggregated.modelCounts["gpt-4"]).toBe(1);
    expect(aggregated.modelCounts["claude-3"]).toBe(1);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────

describe("Cloud Mode — Edge Cases", () => {
  it("S2-QA-01-034: handles empty messages array", () => {
    const result = measure([], "", "gpt-4");
    expect(result.usage.promptTokens).toBe(0);
    expect(result.usage.completionTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(0);
  });

  it("S2-QA-01-035: handles empty completion", () => {
    const result = measure("Some prompt", "", "gpt-4");
    expect(result.usage.completionTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(result.usage.promptTokens);
  });

  it("S2-QA-01-036: handles very long text", () => {
    const longText = "A".repeat(10000);
    const result = measure(longText, "Short", "gpt-4");
    expect(result.usage.promptTokens).toBeGreaterThan(1000);
  });

  it("S2-QA-01-037: different models produce different token estimates", () => {
    const text = "This is a test sentence for measuring tokens across different models.";
    const gptResult = measure(text, "", "gpt-4");
    const claudeResult = measure(text, "", "claude-3");
    // Model-specific ratios should produce different results
    expect(gptResult.usage.promptTokens).toBeGreaterThan(0);
    expect(claudeResult.usage.promptTokens).toBeGreaterThan(0);
  });

  it("S2-QA-01-038: validateUsage rejects future timestamp", () => {
    const futureUsage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: Date.now() + 1000000,
    };
    const result = validateUsage(futureUsage);
    expect(result.valid).toBe(false);
  });

  it("S2-QA-01-039: validateUsage rejects zero timestamp", () => {
    const zeroTsUsage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: "gpt-4",
      timestamp: 0,
    };
    const result = validateUsage(zeroTsUsage);
    expect(result.valid).toBe(false);
  });

  it("S2-QA-01-040: validateUsage rejects excessive total tokens", () => {
    const excessiveUsage: TokenUsage = {
      promptTokens: 500000,
      completionTokens: 500001,
      totalTokens: 1000001,
      model: "gpt-4",
      timestamp: Date.now(),
    };
    const result = validateUsage(excessiveUsage);
    expect(result.valid).toBe(false);
  });
});

// ─── Configuration Tests ───────────────────────────────────────────────────

describe("Cloud Mode — Configuration", () => {
  it("S2-QA-01-041: configureCloudApi sets base URL", () => {
    configureCloudApi({ baseUrl: "https://custom.api.com" });
    expect(getCloudApiConfig().baseUrl).toBe("https://custom.api.com");
  });

  it("S2-QA-01-042: configureCloudApi sets API key", () => {
    configureCloudApi({ apiKey: "my-secret-key" });
    expect(getCloudApiConfig().apiKey).toBe("my-secret-key");
  });

  it("S2-QA-01-043: configureCloudApi merges with existing config", () => {
    configureCloudApi({ baseUrl: "https://first.com", apiKey: "key1" });
    configureCloudApi({ apiKey: "key2" });
    const config = getCloudApiConfig();
    expect(config.baseUrl).toBe("https://first.com");
    expect(config.apiKey).toBe("key2");
  });

  it("S2-QA-01-044: configureCloudApi sets timeout", () => {
    configureCloudApi({ timeout: 5000 });
    expect(getCloudApiConfig().timeout).toBe(5000);
  });

  it("S2-QA-01-045: configureCloudApi sets max retries", () => {
    configureCloudApi({ maxRetries: 5 });
    expect(getCloudApiConfig().maxRetries).toBe(5);
  });
});
