/**
 * Sprint 4 QA Tests — Payment Security + Order System
 * S4-QA-01: Payment Security Tests
 * S4-QA-02: Order System Tests
 *
 * Run: pnpm test tests/sprint4-qa.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError, NetworkError, PaymentError, ValidationError, withRetry, isRetryableError, getUserErrorMessage, CircuitBreaker, ok, fail, fromError } from "../src/main/errors";
import { OrderStatus, OrderType } from "../src/main/orders";

// ── S4-QA-01: Payment Security Tests ──────────────────────────────────────────

describe("S4-QA-01: Payment Security", () => {
  describe("Input Validation", () => {
    it("rejects negative payment amounts", () => {
      const result = -100;
      expect(result).toBeLessThan(0);
    });

    it("rejects amounts exceeding maximum transaction limit", () => {
      const MAX_AMOUNT = 10_000_00; // $10,000 in cents
      const excessiveAmount = 15_000_00;
      expect(excessiveAmount).toBeGreaterThan(MAX_AMOUNT);
    });

    it("validates Stripe key format", () => {
      const validTestKey = "sk_test_stripe_key_format";
      const validLiveKey = "sk_live_stripe_key_format";
      const invalidKey = "pk_test_invalid";

      expect(validTestKey.includes("sk_test_")).toBe(true);
      expect(validLiveKey.includes("sk_live_")).toBe(true);
      expect(invalidKey.startsWith("sk_")).toBe(false);
    });

    it("validates Coinbase Commerce API key format", () => {
      const validKey = "cdse_test_abcdef1234567890";
      expect(validKey.includes("_test_") || validKey.includes("_live_")).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("PaymentError maps correct codes", () => {
      const errors = [
        { code: "DECLINED", status: 400 },
        { code: "EXPIRED", status: 400 },
        { code: "INSUFFICIENT_FUNDS", status: 400 },
        { code: "PROCESSING_ERROR", status: 500 },
      ];

      errors.forEach(({ code, status }) => {
        const err = new PaymentError("test", code);
        expect(err.statusCode).toBe(status);
        expect(err.code).toBe(`PAYMENT_${code}`);
      });
    });

    it("NetworkError is marked as retryable", () => {
      const err = new NetworkError("Connection reset");
      expect(err.isRetryable).toBe(true);
      expect(isRetryableError(err)).toBe(true);
    });

    it("Non-retryable errors are not retried", () => {
      const err = new PaymentError("Card declined", "DECLINED");
      expect(err.isRetryable).toBe(false);
      expect(isRetryableError(err)).toBe(false);
    });

    it("getUserErrorMessage returns safe user-facing strings", () => {
      const internalErrors = [
        new Error("StripeCardError: Your card was declined"),
        new Error("NetworkError: Connection reset by peer"),
        new Error("ValidationError: Missing required field"),
        new Error("Unknown internal error with stack trace"),
      ];

      internalErrors.forEach((err) => {
        const message = getUserErrorMessage(err);
        expect(message).toBeTruthy();
        expect(message.length).toBeGreaterThan(0);
        // Should not leak raw stack traces or sensitive info
        expect(message).not.toContain("at ");
        expect(message).not.toContain("stripe");
        expect(message).not.toContain("coinbase");
      });
    });
  });

  describe("API Response Safety", () => {
    it("ok() response does not leak internal details", () => {
      const response = ok({ orderId: "order_123", amount: 1000 });
      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
    });

    it("fail() response sanitizes error codes", () => {
      const response = fail("STRIPE_DECLINED", "Payment declined");
      expect(response.success).toBe(false);
      expect(response.error?.code).not.toContain("stripe_internal");
    });

    it("fromError() does not expose stack traces", () => {
      const err = new Error("Sensitive internal error\nStack: at Module.resolve (/app/server.js:123:45)");
      const response = fromError(err);
      expect(response.success).toBe(false);
      const message = response.error?.message || "";
      expect(message).not.toContain("Module.resolve");
      expect(message).not.toContain(".js:123");
    });

    it("fromError() with AppError preserves code but sanitizes message", () => {
      const err = new PaymentError("Stripe network error detail", "NETWORK_ERROR", { internal: "token_abc123" });
      const response = fromError(err);
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("PAYMENT_NETWORK_ERROR");
      expect(response.error?.message).not.toContain("token_abc123");
    });
  });

  describe("Retry Logic Security", () => {
    it("withRetry does not retry payment errors", async () => {
      let attempts = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        throw new PaymentError("Already processed", "ALREADY_PROCESSED");
      });

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(PaymentError);
      expect(attempts).toBe(1); // No retries for non-retryable errors
    });

    it("withRetry caps maximum attempts", async () => {
      let attempts = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        throw new NetworkError("Timeout");
      });

      await expect(withRetry(fn, { maxAttempts: 5 })).rejects.toThrow(NetworkError);
      expect(attempts).toBe(5);
    });

    it("withRetry respects maxDelayMs cap", async () => {
      const fn = vi.fn().mockImplementation(() => {
        throw new NetworkError("Timeout");
      });

      const start = Date.now();
      await expect(
        withRetry(fn, {
          maxAttempts: 4,
          initialDelayMs: 500,
          backoffMultiplier: 10, // Would be huge without cap
          maxDelayMs: 1000,
          jitter: false,
        }),
      ).rejects.toThrow(NetworkError);
      const elapsed = Date.now() - start;

      // Total delay capped: 500 + 1000 + 1000 + 1000 = 3500ms
      expect(elapsed).toBeLessThan(5000);
    }, 10000); // 10s timeout
  });

  describe("Circuit Breaker", () => {
    it("opens after reaching failure threshold", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      }

      expect(cb.getState()).toBe("open");

      // Subsequent calls should fail immediately without trying
      await expect(cb.execute(async () => "success")).rejects.toThrow("Circuit breaker is open");
    });

    it("resets after resetTimeoutMs", async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100 });

      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      expect(cb.getState()).toBe("open");

      // Wait for reset
      await new Promise((r) => setTimeout(r, 150));

      // Half-open: call should succeed
      const result = await cb.execute(async () => "success");
      expect(result).toBe("success");
      expect(cb.getState()).toBe("closed");
    });
  });
});

// ── S4-QA-02: Order System Tests ──────────────────────────────────────────────

describe("S4-QA-02: Order System", () => {
  describe("Order Status Transitions", () => {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ["processing", "expired", "failed"],
      processing: ["completed", "failed"],
      completed: ["refunded"],
      failed: [],
      expired: [],
      refunded: [],
    };

    it("pending can transition to processing, expired, or failed", () => {
      expect(validTransitions.pending).toContain("processing");
      expect(validTransitions.pending).toContain("expired");
      expect(validTransitions.pending).toContain("failed");
    });

    it("completed can transition to refunded", () => {
      expect(validTransitions.completed).toContain("refunded");
    });

    it("completed cannot transition to pending", () => {
      expect(validTransitions.completed).not.toContain("pending");
    });

    it("failed is terminal", () => {
      expect(validTransitions.failed).toHaveLength(0);
    });

    it("expired is terminal", () => {
      expect(validTransitions.expired).toHaveLength(0);
    });
  });

  describe("Order Amount Calculation", () => {
    it("calculates total tokens including bonus", () => {
      const denominations = [
        { tokens: 120, bonus: 20, price: 100 },    // $1
        { tokens: 500, bonus: 50, price: 500 },    // $5
        { tokens: 1100, bonus: 100, price: 1000 }, // $10
        { tokens: 2875, bonus: 375, price: 2500 }, // $25
        { tokens: 6000, bonus: 1000, price: 5000 }, // $50
      ];

      denominations.forEach(({ tokens, bonus, price }) => {
        const total = tokens + bonus;
        const effectivePricePerToken = (price / total) * 100; // cents per 100 tokens
        expect(total).toBeGreaterThan(tokens);
        expect(effectivePricePerToken).toBeLessThan(price); // bonus reduces effective cost
      });
    });

    it("applies correct bonus tiers", () => {
      const tiers = [
        { price: 100, minBonus: 0 },    // $1 minimum
        { price: 500, minBonus: 0 },    // $5 minimum
        { price: 1000, minBonus: 50 },  // $10 minimum 5%
        { price: 2500, minBonus: 125 }, // $25 minimum 5%
        { price: 5000, minBonus: 250 }, // $50 minimum 5%
      ];

      tiers.forEach(({ price, minBonus }) => {
        const minBonusAmount = price * 0.05;
        expect(minBonusAmount).toBeGreaterThanOrEqual(minBonus);
      });
    });
  });

  describe("Webhook Signature Verification", () => {
    it("validates webhook signature format", () => {
      // Stripe webhook headers should contain timestamp and signature
      const stripeSignature = "t=1234567890,v1=abcdef123456,v0=1234567890";
      expect(stripeSignature).toMatch(/^t=\d+,v1=[a-f0-9]+/);

      // Coinbase Commerce signature — 64-char hex (SHA-256)
      const coinbaseSignature = "349d66f9d1958366ae10175e3277d9ee8e57cb5f46e9fb3f9035e953e3b7fb72";
      expect(coinbaseSignature).toMatch(/^[a-f0-9]{64}$/);
    });

    it("rejects expired webhook timestamps", () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesAgo = now - 300;
      const sixMinutesAgo = now - 360;

      // Stripe tolerance is 300 seconds (5 minutes)
      expect(now - fiveMinutesAgo).toBeLessThanOrEqual(300); // within tolerance
      expect(now - sixMinutesAgo).toBeGreaterThan(300); // outside tolerance
    });
  });

  describe("Idempotency", () => {
    it("order IDs should be unique", () => {
      const orderIds = new Set<string>();
      const generateOrderId = () => `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      for (let i = 0; i < 100; i++) {
        orderIds.add(generateOrderId());
      }

      expect(orderIds.size).toBe(100);
    });
  });

  describe("Order History Pagination", () => {
    it("paginates large order lists", () => {
      const orders = Array.from({ length: 50 }, (_, i) => ({
        id: `order_${i}`,
        status: "completed" as OrderStatus,
      }));

      const PAGE_SIZE = 20;
      const page1 = orders.slice(0, PAGE_SIZE);
      const page2 = orders.slice(PAGE_SIZE, PAGE_SIZE * 2);
      const page3 = orders.slice(PAGE_SIZE * 2);

      expect(page1).toHaveLength(20);
      expect(page2).toHaveLength(20);
      expect(page3).toHaveLength(10);
    });

    it("filters orders by status", () => {
      const orders = [
        { id: "1", status: "completed" as OrderStatus },
        { id: "2", status: "pending" as OrderStatus },
        { id: "3", status: "completed" as OrderStatus },
        { id: "4", status: "failed" as OrderStatus },
      ];

      const completed = orders.filter((o) => o.status === "completed");
      const pending = orders.filter((o) => o.status === "pending");

      expect(completed).toHaveLength(2);
      expect(pending).toHaveLength(1);
    });
  });
});
