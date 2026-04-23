/**
 * Retry + Exception Handling System
 * Sprint 4: S4-BE-03
 *
 * Exponential backoff retry with jitter.
 * Maps common errors to user-friendly messages.
 */

// ── Error Types ──────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isRetryable: boolean = false,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", 503, true, context);
    this.name = "NetworkError";
  }
}

const STATUS_CODE_MAP: Record<string, number> = {
  DECLINED: 400,
  EXPIRED: 400,
  INSUFFICIENT_FUNDS: 400,
  ALREADY_PROCESSED: 400,
  NETWORK_ERROR: 503,
  PROCESSING_ERROR: 500,
};

export class PaymentError extends AppError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    const statusCode = STATUS_CODE_MAP[code] ?? 400;
    super(message, `PAYMENT_${code}`, statusCode, false, context);
    this.name = "PaymentError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, false, context);
    this.name = "ValidationError";
  }
}

// ── Retry Configuration ───────────────────────────────────────────────────────

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
  jitter: true,
};

// ── Retry Logic ─────────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  config: Required<RetryConfig>,
): number {
  const exponentialDelay =
    config.initialDelayMs *
    Math.pow(config.backoffMultiplier, attempt - 1);

  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  if (!config.jitter) return cappedDelay;

  // Full jitter: random between 0 and cappedDelay
  return Math.floor(Math.random() * cappedDelay);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isRetryable;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors are retryable
    if (
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("network") ||
      message.includes("socket") ||
      message.includes("timeout") ||
      message.includes("enotfound") ||
      message.includes("eagain")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === cfg.maxAttempts;
      const shouldRetry = isRetryableError(error) && !isLastAttempt;

      if (!shouldRetry) {
        throw error;
      }

      const delay = calculateDelay(attempt, cfg);
      console.warn(
        `[Retry] Attempt ${attempt}/${cfg.maxAttempts} failed. ` +
          `Retrying in ${delay}ms. Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

// ── User-Friendly Error Mapping ───────────────────────────────────────────────

export function getUserErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "Network connection failed. Please check your internet and try again.";
      case "PAYMENT_DECLINED":
        return "Payment was declined. Please check your card details or try a different payment method.";
      case "PAYMENT_EXPIRED":
        return "Payment session expired. Please try again.";
      case "PAYMENT_ALREADY_PROCESSED":
        return "This payment has already been processed.";
      case "VALIDATION_ERROR":
        return error.message;
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("stripe")) {
      if (msg.includes("card") || msg.includes("declined")) {
        return "Payment declined. Please check your card details.";
      }
      if (msg.includes("expired")) {
        return "Your card has expired. Please use a different card.";
      }
    }

    if (msg.includes("network") || msg.includes("timeout") || msg.includes("connreset")) {
      return "Network error. Please try again.";
    }

    if (msg.includes("rate limit") || msg.includes("429")) {
      return "Too many requests. Please wait a moment and try again.";
    }
  }

  return "An unexpected error occurred. Please try again.";
}

// ── API Response Helper ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function fail<T>(
  code: string,
  message: string,
): ApiResponse<T> {
  return { success: false, error: { code, message } };
}

export function fromError(error: unknown): ApiResponse<never> {
  if (error instanceof AppError) {
    return fail(error.code, getUserErrorMessage(error));
  }
  if (error instanceof Error) {
    return fail("INTERNAL_ERROR", getUserErrorMessage(error));
  }
  return fail("UNKNOWN_ERROR", "An unknown error occurred.");
}

// ── Circuit Breaker ──────────────────────────────────────────────────────────

type State = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

const DEFAULT_CB_OPTIONS = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
};

export class CircuitBreaker {
  private state: State = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold =
      options.failureThreshold ?? DEFAULT_CB_OPTIONS.failureThreshold;
    this.resetTimeout =
      options.resetTimeoutMs ?? DEFAULT_CB_OPTIONS.resetTimeoutMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "half-open") {
      this.state = "closed";
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }

  getState(): State {
    return this.state;
  }
}
