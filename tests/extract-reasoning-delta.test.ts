import { describe, it, expect } from "vitest";
import { extractReasoningDelta } from "../src/main/hermes";

/**
 * `extractReasoningDelta` pulls the streaming reasoning / thinking text
 * out of one SSE `delta` object so the chat-send path can forward it to
 * the renderer on a dedicated channel — fixing the "reasoning only
 * appears after window focus change" UX bug from issue #352.
 *
 * Two field names matter in practice:
 *   - `reasoning_content` (DeepSeek reasoning models)
 *   - `reasoning` (OpenAI o1/o3-style streams, some OpenRouter routes)
 *
 * Everything else returns `""` so the caller can skip forwarding without
 * a null check.
 */

describe("extractReasoningDelta", () => {
  it("pulls DeepSeek-shaped `reasoning_content`", () => {
    expect(
      extractReasoningDelta({
        reasoning_content: "Let me think step by step…",
      }),
    ).toBe("Let me think step by step…");
  });

  it("pulls OpenAI-style `reasoning`", () => {
    expect(extractReasoningDelta({ reasoning: "Analysing the request." })).toBe(
      "Analysing the request.",
    );
  });

  it("prefers `reasoning_content` over `reasoning` when both are present", () => {
    // Real responses occasionally include both (a gateway adding a
    // second alias). Pick the canonical DeepSeek field so we don't
    // double up if the caller is also tee'ing the other field.
    expect(
      extractReasoningDelta({
        reasoning_content: "deepseek-shaped",
        reasoning: "openai-shaped",
      }),
    ).toBe("deepseek-shaped");
  });

  it("returns empty for a delta that only carries content (no reasoning)", () => {
    expect(extractReasoningDelta({ content: "Hello there" })).toBe("");
  });

  it("returns empty for an empty reasoning field", () => {
    expect(extractReasoningDelta({ reasoning_content: "" })).toBe("");
    expect(extractReasoningDelta({ reasoning: "" })).toBe("");
  });

  it("ignores non-string reasoning fields defensively", () => {
    expect(extractReasoningDelta({ reasoning_content: null })).toBe("");
    expect(extractReasoningDelta({ reasoning: 42 })).toBe("");
    expect(extractReasoningDelta({ reasoning: { nested: "value" } })).toBe("");
  });

  it("returns empty for non-object inputs (malformed chunks)", () => {
    expect(extractReasoningDelta(null)).toBe("");
    expect(extractReasoningDelta(undefined)).toBe("");
    expect(extractReasoningDelta("a string")).toBe("");
    expect(extractReasoningDelta(123)).toBe("");
  });

  it("handles multi-line reasoning content as a single chunk", () => {
    // Streamed reasoning often arrives as small fragments (a few
    // characters at a time), but a whole-step delta is also possible
    // — both should pass through unchanged.
    const multiLine = "Step 1: parse the question\nStep 2: pick a tool";
    expect(extractReasoningDelta({ reasoning_content: multiLine })).toBe(
      multiLine,
    );
  });
});
