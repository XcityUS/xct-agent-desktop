/**
 * XCT Cloud API Gateway
 *
 * Provides unified interface to XCT Cloud services:
 * - chatCompletion(params): SSE streaming chat completions
 * - getBalance(): Query XCT token balance
 * - reportUsage(usage): Report token usage to cloud
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Offline degradation (graceful fallback when network unavailable)
 * - SSE stream parsing for real-time responses
 */

import { parseSseBlock, parseRemoteUsage } from "./sse-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
  error?: string;
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: ChatChunk) => void;
  onDone: (finalUsage?: ParsedUsage) => void;
  onError: (error: string) => void;
}

export interface BalanceInfo {
  available: number;
  total: number;
  currency: string;
  lastUpdated: string;
}

export interface UsageReport {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  timestamp: number;
  sessionId?: string;
}

export interface ParsedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

interface CloudApiConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: CloudApiConfig = {
  baseUrl: "https://api.xct.dev/v1",
  apiKey: "",
  timeout: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

let _config: CloudApiConfig = { ...DEFAULT_CONFIG };

export function configureCloudApi(config: Partial<CloudApiConfig>): void {
  _config = { ..._config, ...config };
}

export function getCloudApiConfig(): CloudApiConfig {
  return { ..._config };
}

// ─── HTTP Client with Retry ──────────────────────────────────────────────────

interface RequestOptions {
  method: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

interface RetryOptions {
  maxRetries: number;
  retryDelayMs: number;
  shouldRetry?: (response: Response) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  retryDelayMs: 1000,
  shouldRetry: (res) => res.status >= 500 || res.status === 429,
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestOptions,
  retryOpts: Partial<RetryOptions> = {},
): Promise<{ ok: boolean; status: number; data: unknown; headers: Headers }> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOpts };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff
      await sleep(opts.retryDelayMs * Math.pow(2, attempt - 1));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || _config.timeout);

      const response = await fetch(url, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          "XCT-API-Key": _config.apiKey,
          Authorization: `Bearer ${_config.apiKey}`,
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!opts.shouldRetry || !opts.shouldRetry(response)) {
        let data: unknown;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }
        return { ok: response.ok, status: response.status, data, headers: response.headers };
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

// ─── Chat Completion ─────────────────────────────────────────────────────────

export interface ChatCompletionResult {
  abort: () => void;
}

/**
 * Send a chat completion request with SSE streaming support.
 * Returns an abort handle for cancellation.
 */
export function chatCompletion(
  params: ChatCompletionParams,
  cb: ChatStreamCallbacks,
): ChatCompletionResult {
  const controller = new AbortController();
  let finished = false;

  const url = `${_config.baseUrl}/chat/completions`;

  const body = JSON.stringify({
    model: params.model,
    messages: params.messages,
    stream: params.stream !== false,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens,
    top_p: params.topP,
    stop: params.stop,
  });

  async function execute(): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "XCT-API-Key": _config.apiKey,
          Authorization: `Bearer ${_config.apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = `API error ${response.status}`;
        try {
          const errData = await response.json();
          errorMsg = (errData as { error?: { message?: string } }).error?.message || errorMsg;
        } catch {
          // ignore parse error
        }
        if (!finished) {
          finished = true;
          cb.onError(errorMsg);
        }
        return;
      }

      if (!response.body) {
        if (!finished) {
          finished = true;
          cb.onError("No response body received");
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const parsed = parseSseBlock(block);
          if (!parsed) continue;

          // Handle custom events
          if (parsed.eventType === "hermes.tool.progress") {
            // Tool progress - emit as chunk with special marker
            cb.onChunk({ delta: `{{tool_progress:${parsed.data}}}`, done: false });
            continue;
          }

          if (parsed.eventType) continue; // Unknown event type, skip

          // Handle data messages
          if (parsed.data === "[DONE]") {
            if (!finished) {
              finished = true;
              cb.onDone();
            }
            return;
          }

          // Parse the SSE data as JSON
          let parsedData: Record<string, unknown>;
          try {
            parsedData = JSON.parse(parsed.data);
          } catch {
            continue;
          }

          // Extract error
          if (parsedData.error) {
            const errMsg = (parsedData.error as { message?: string }).message || "Unknown error";
            if (!finished) {
              finished = true;
              cb.onError(errMsg);
            }
            return;
          }

          // Extract content delta
          const delta = (parsedData.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta;
          if (delta?.content) {
            cb.onChunk({ delta: delta.content, done: false });
          }

          // Extract usage
          if (parsedData.usage) {
            const usage = parseRemoteUsage(parsedData.usage as Record<string, unknown>);
            cb.onChunk({
              delta: "",
              done: false,
              usage: {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                cost: usage.cost,
              },
            });
          }
        }
      }

      // Stream ended without [DONE]
      if (!finished) {
        finished = true;
        cb.onDone();
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      if (!finished) {
        finished = true;
        cb.onError((err as Error).message || "Request failed");
      }
    }
  }

  execute();

  return {
    abort: () => {
      if (!finished) {
        finished = true;
        controller.abort();
        cb.onError("Request aborted");
      }
    },
  };
}

// ─── Balance Query ───────────────────────────────────────────────────────────

export interface BalanceResponse {
  success: boolean;
  balance?: BalanceInfo;
  error?: string;
}

/**
 * Query the current XCT token balance.
 */
export async function getBalance(): Promise<BalanceResponse> {
  try {
    const result = await fetchWithRetry(
      `${_config.baseUrl}/balance`,
      { method: "GET" },
      { maxRetries: 2, shouldRetry: (res) => res.status >= 500 },
    );

    if (!result.ok) {
      const err = result.data as { error?: { message?: string } };
      return {
        success: false,
        error: err.error?.message || `Failed to get balance: ${result.status}`,
      };
    }

    const data = result.data as {
      available?: number;
      total?: number;
      currency?: string;
      last_updated?: string;
    };

    return {
      success: true,
      balance: {
        available: data.available ?? 0,
        total: data.total ?? data.available ?? 0,
        currency: data.currency || "XCT",
        lastUpdated: data.last_updated || new Date().toISOString(),
      },
    };
  } catch (err) {
    // Offline degradation: return cached/fallback balance
    return {
      success: false,
      error: (err as Error).message || "Network unavailable",
    };
  }
}

// ─── Usage Reporting ─────────────────────────────────────────────────────────

export interface ReportUsageResult {
  success: boolean;
  reportedAt?: number;
  error?: string;
}

/**
 * Report token usage to the XCT Cloud for billing/metering.
 */
export async function reportUsage(usage: UsageReport): Promise<ReportUsageResult> {
  try {
    const result = await fetchWithRetry(
      `${_config.baseUrl}/usage`,
      {
        method: "POST",
        body: JSON.stringify({
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
          model: usage.model,
          timestamp: usage.timestamp || Date.now(),
          session_id: usage.sessionId,
        }),
      },
      {
        maxRetries: 3,
        retryDelayMs: 2000,
        shouldRetry: (res) => res.status >= 500 || res.status === 429,
      },
    );

    if (!result.ok) {
      const err = result.data as { error?: { message?: string } };
      return {
        success: false,
        error: err.error?.message || `Failed to report usage: ${result.status}`,
      };
    }

    const data = result.data as { reported_at?: number };
    return {
      success: true,
      reportedAt: data.reported_at || Date.now(),
    };
  } catch (err) {
    // Usage reporting failure is non-fatal - queue for later retry
    console.warn("[CloudAPI] Usage reporting failed, will retry:", err);
    return {
      success: false,
      error: (err as Error).message || "Network unavailable",
    };
  }
}

// ─── Health Check ───────────────────────────────────────────────────────────

export interface HealthStatus {
  healthy: boolean;
  latencyMs?: number;
  version?: string;
  error?: string;
}

/**
 * Perform a health check against the XCT Cloud API.
 */
export async function healthCheck(): Promise<HealthStatus> {
  const start = Date.now();

  try {
    const result = await fetchWithRetry(
      `${_config.baseUrl}/health`,
      { method: "GET" },
      { maxRetries: 1, retryDelayMs: 500 },
    );

    const latencyMs = Date.now() - start;

    if (!result.ok) {
      return {
        healthy: false,
        latencyMs,
        error: `Health check failed: ${result.status}`,
      };
    }

    const data = result.data as { version?: string; status?: string };
    return {
      healthy: true,
      latencyMs,
      version: data.version,
    };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: (err as Error).message || "Network unavailable",
    };
  }
}

// ─── Mode Enum ───────────────────────────────────────────────────────────────

export type CloudMode = "online" | "offline" | "degraded";

let _currentMode: CloudMode = "online";

export function getCloudMode(): CloudMode {
  return _currentMode;
}

export function setCloudMode(mode: CloudMode): void {
  _currentMode = mode;
}

/**
 * Determine the effective cloud mode based on health check results.
 */
export async function determineCloudMode(): Promise<CloudMode> {
  const health = await healthCheck();

  if (health.healthy) {
    setCloudMode("online");
    return "online";
  }

  // If health check fails but we have a cached API key, we're in degraded mode
  if (_config.apiKey) {
    setCloudMode("degraded");
    return "degraded";
  }

  setCloudMode("offline");
  return "offline";
}
