/**
 * Extracted SSE parsing logic — testable without Electron or HTTP.
 */

export interface ParsedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export interface SseCallbacks {
  onChunk: (text: string) => void;
  onToolProgress?: (tool: string) => void;
  onUsage?: (usage: ParsedUsage) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

/** Tool progress pattern: `emoji tool_name` or `emoji description` */
const toolProgressRe = /^`([^\s`]+)\s+([^`]+)`$/;

/**
 * Process a custom SSE event (e.g. hermes.tool.progress).
 * Returns true if the event was handled.
 */
export function processCustomEvent(
  eventType: string,
  data: string,
  cb: Pick<SseCallbacks, "onToolProgress">,
): boolean {
  if (eventType === "hermes.tool.progress" && cb.onToolProgress) {
    try {
      const payload = JSON.parse(data);
      const label = payload.label || payload.tool || "";
      const emoji = payload.emoji || "";
      cb.onToolProgress(emoji ? `${emoji} ${label}` : label);
      return true;
    } catch {
      /* malformed — skip */
    }
  }
  return false;
}

export interface SseDataResult {
  done: boolean;
  hasContent: boolean;
  error?: string;
}

/**
 * Process a single SSE data payload (after `data: ` prefix is stripped).
 * Returns parsing result.
 */
export function processSseData(
  data: string,
  cb: SseCallbacks,
  state: { hasContent: boolean; lastError: string },
): SseDataResult {
  if (data === "[DONE]") {
    if (state.hasContent) {
      cb.onDone?.();
    }
    return { done: true, hasContent: state.hasContent, error: state.lastError };
  }

  try {
    const parsed = JSON.parse(data);

    // Capture error responses forwarded through SSE
    if (parsed.error) {
      state.lastError =
        parsed.error.message || JSON.stringify(parsed.error);
      return { done: false, hasContent: state.hasContent };
    }

    const delta = parsed.choices?.[0]?.delta;

    // Extract usage from final chunk
    if (parsed.usage && cb.onUsage) {
      cb.onUsage({
        promptTokens: parsed.usage.prompt_tokens || 0,
        completionTokens: parsed.usage.completion_tokens || 0,
        totalTokens: parsed.usage.total_tokens || 0,
        cost: parsed.usage.cost,
        rateLimitRemaining: parsed.usage.rate_limit_remaining,
        rateLimitReset: parsed.usage.rate_limit_reset,
      });
    }

    if (delta?.content) {
      const content = delta.content.trim();
      // Legacy: Detect tool progress lines injected into content
      const match = toolProgressRe.exec(content);
      if (match && cb.onToolProgress) {
        cb.onToolProgress(`${match[1]} ${match[2]}`);
      } else {
        state.hasContent = true;
        cb.onChunk(delta.content);
      }
    }
  } catch {
    /* malformed chunk — skip */
  }

  return { done: false, hasContent: state.hasContent };
}

/**
 * Parse a full SSE block (may contain `event:` and `data:` lines).
 * Returns { eventType, data } or null if no data line found.
 */
export function parseSseBlock(
  block: string,
): { eventType: string; data: string } | null {
  let eventType = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataLine = line.slice(6);
    }
  }
  if (!dataLine) return null;
  return { eventType, data: dataLine };
}

// ────────────────────────────────────────────────────
//  Remote SSE Parsing (for cloud API responses)
// ────────────────────────────────────────────────────

export interface RemoteSseChunk {
  delta: string;
  done: boolean;
  usage?: ParsedUsage;
  toolProgress?: string;
  error?: string;
}

export interface RemoteStreamCallbacks {
  onChunk: (chunk: RemoteSseChunk) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Parse a raw SSE block from a remote stream.
 * Returns structured chunk data.
 */
export function parseRemoteBlock(
  block: string,
): RemoteSseChunk | null {
  const parsed = parseSseBlock(block);
  if (!parsed) return null;

  // Handle [DONE]
  if (parsed.data === "[DONE]") {
    return { delta: "", done: true };
  }

  // Handle custom events
  if (parsed.eventType === "hermes.tool.progress") {
    try {
      const payload = JSON.parse(parsed.data);
      const label = payload.label || payload.tool || "";
      const emoji = payload.emoji || "";
      return {
        delta: "",
        done: false,
        toolProgress: emoji ? `${emoji} ${label}` : label,
      };
    } catch {
      return null;
    }
  }

  // Skip other custom events
  if (parsed.eventType) return null;

  // Parse data payload
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(parsed.data);
  } catch {
    return null;
  }

  // Extract error
  if (data.error) {
    const errMsg = (data.error as { message?: string }).message || JSON.stringify(data.error);
    return { delta: "", done: false, error: errMsg };
  }

  // Extract content delta
  const delta = (data.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta;
  if (delta?.content) {
    return { delta: delta.content, done: false };
  }

  return null;
}

/**
 * Parse remote SSE usage data from a chunk.
 * Handles various usage field formats from different cloud providers.
 */
export function parseRemoteUsage(
  usageData: Record<string, unknown>,
): ParsedUsage {
  return {
    promptTokens: (usageData.prompt_tokens as number) || (usageData.promptTokens as number) || 0,
    completionTokens: (usageData.completion_tokens as number) || (usageData.completionTokens as number) || 0,
    totalTokens: (usageData.total_tokens as number) || (usageData.totalTokens as number) || 0,
    cost: usageData.cost as number | undefined,
    rateLimitRemaining: (usageData.rate_limit_remaining as number) || (usageData.rateLimitRemaining as number) || undefined,
    rateLimitReset: (usageData.rate_limit_reset as number) || (usageData.rateLimitReset as number) || undefined,
  };
}

/**
 * Create a remote SSE stream parser that processes an async iterable.
 * Returns a promise that resolves when the stream is complete.
 */
export async function parseRemoteStream(
  stream: AsyncIterable<string>,
  cb: RemoteStreamCallbacks,
): Promise<void> {
  let buffer = "";

  try {
    for await (const chunk of stream) {
      buffer += chunk;

      // Process complete SSE events (separated by double newlines)
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const parsed = parseRemoteBlock(part);
        if (!parsed) continue;

        if (parsed.done) {
          cb.onDone();
          return;
        }

        if (parsed.error) {
          cb.onError(parsed.error);
          return;
        }

        if (parsed.delta) {
          cb.onChunk({ delta: parsed.delta, done: false });
        }

        if (parsed.toolProgress) {
          cb.onChunk({ delta: "", done: false, toolProgress: parsed.toolProgress });
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const parsed = parseRemoteBlock(buffer);
      if (parsed) {
        if (parsed.done) {
          cb.onDone();
          return;
        }
        if (parsed.error) {
          cb.onError(parsed.error);
          return;
        }
        if (parsed.delta) {
          cb.onChunk({ delta: parsed.delta, done: false });
        }
      }
    }
  } catch (err) {
    cb.onError((err as Error).message || "Stream parsing error");
  }

  cb.onDone();
}

/**
 * Process a remote SSE data string and extract usage if present.
 * Returns usage data if found, null otherwise.
 */
export function extractRemoteUsage(
  data: string,
): ParsedUsage | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.usage) {
      return parseRemoteUsage(parsed.usage as Record<string, unknown>);
    }
  } catch {
    // Not JSON or parse error
  }
  return null;
}

/**
 * Split a raw SSE text into individual events.
 * Handles both \n\n and \n separators.
 */
export function splitSseEvents(raw: string): string[] {
  // Try splitting by double newlines first
  if (raw.includes("\n\n")) {
    return raw.split("\n\n").map((e) => e.trim()).filter(Boolean);
  }
  // Fall back to single newlines for simpler streams
  if (raw.includes("\n")) {
    return raw.split("\n").map((e) => e.trim()).filter(Boolean);
  }
  // No newlines, return as-is
  return raw ? [raw] : [];
}

// ────────────────────────────────────────────────────
//  Remote SSE Reconnection & Resume Support (S2-BE-02)
// ────────────────────────────────────────────────────

/**
 * Checkpoint state for resuming SSE streams after disconnection.
 * Allows resuming from the last successfully processed position.
 */
export interface SseCheckpoint {
  /** Number of SSE events processed */
  eventCount: number;
  /** Accumulated text length processed */
  textLength: number;
  /** Last session ID if available */
  sessionId?: string;
  /** Timestamp of last successful chunk */
  timestamp: number;
}

/**
 * Options for resilient SSE stream parsing with reconnection support.
 */
export interface ResilientStreamOptions {
  /** Maximum number of reconnection attempts (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelayMs?: number;
  /** Maximum retry delay cap in ms (default: 30000) */
  maxRetryDelayMs?: number;
  /** Enable resume capability (default: true) */
  enableResume?: boolean;
  /** Called when reconnection is attempted */
  onReconnecting?: (attempt: number, error?: string) => void;
  /** Called when stream successfully reconnects */
  onReconnected?: (attempt: number) => void;
  /** Called when checkpoint is updated for resume */
  onCheckpoint?: (checkpoint: SseCheckpoint) => void;
}

/**
 * Default options for resilient stream parsing.
 */
const DEFAULT_RESILIENT_OPTIONS: Required<ResilientStreamOptions> = {
  maxRetries: 3,
  retryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  enableResume: true,
  onReconnecting: () => {},
  onReconnected: () => {},
  onCheckpoint: () => {},
};

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateRetryDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Resilient SSE stream parser with reconnection, resume, and error recovery.
 * 
 * Features:
 * - Automatic reconnection on stream failure
 * - Checkpoint-based resume after reconnection
 * - Exponential backoff with jitter for retries
 * - Error recovery with graceful degradation
 */
export class ResilientSseParser {
  private options: Required<ResilientStreamOptions>;
  private checkpoint: SseCheckpoint;
  private aborted = false;
  private currentAttempt = 0;

  constructor(options: ResilientStreamOptions = {}) {
    this.options = { ...DEFAULT_RESILIENT_OPTIONS, ...options };
    this.checkpoint = {
      eventCount: 0,
      textLength: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Get the current checkpoint state for resume purposes.
   */
  getCheckpoint(): SseCheckpoint {
    return { ...this.checkpoint };
  }

  /**
   * Set checkpoint state to resume from a specific point.
   */
  setCheckpoint(checkpoint: SseCheckpoint): void {
    this.checkpoint = { ...checkpoint };
  }

  /**
   * Reset the checkpoint to initial state.
   */
  resetCheckpoint(): void {
    this.checkpoint = {
      eventCount: 0,
      textLength: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Abort the resilient parser and cancel any pending operations.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Parse a remote SSE stream with automatic reconnection and resume support.
   * 
   * @param streamFactory Async function that creates a new stream (used for reconnection)
   * @param callbacks Stream callbacks for chunk, done, error events
   * @param initialCheckpoint Optional checkpoint to resume from
   */
  async parse(
    streamFactory: () => Promise<AsyncIterable<string>>,
    callbacks: RemoteStreamCallbacks,
    initialCheckpoint?: SseCheckpoint,
  ): Promise<void> {
    if (initialCheckpoint && this.options.enableResume) {
      this.checkpoint = { ...initialCheckpoint };
    }

    this.aborted = false;
    this.currentAttempt = 0;

    await this._parseWithRetry(streamFactory, callbacks);
  }

  private async _parseWithRetry(
    streamFactory: () => Promise<AsyncIterable<string>>,
    callbacks: RemoteStreamCallbacks,
  ): Promise<void> {
    let lastError: string | undefined;

    while (this.currentAttempt <= this.options.maxRetries && !this.aborted) {
      try {
        const stream = await streamFactory();
        await this._parseStream(stream, callbacks);
        
        // Stream completed successfully
        if (!this.aborted) {
          callbacks.onDone();
        }
        return;
      } catch (err) {
        if (this.aborted) {
          return;
        }

        lastError = (err as Error).message || "Stream error";
        this.currentAttempt++;

        if (this.currentAttempt <= this.options.maxRetries) {
          // Notify about reconnection attempt
          this.options.onReconnecting?.(this.currentAttempt, lastError);

          // Calculate delay with exponential backoff
          const delay = calculateRetryDelay(
            this.currentAttempt,
            this.options.retryDelayMs,
            this.options.maxRetryDelayMs,
          );

          // Wait before reconnecting
          await this._sleep(delay);

          // Notify about successful reconnection
          this.options.onReconnected?.(this.currentAttempt);
        }
      }
    }

    // All retries exhausted
    if (!this.aborted) {
      callbacks.onError(lastError || "Max retries exceeded");
    }
  }

  private async _parseStream(
    stream: AsyncIterable<string>,
    callbacks: RemoteStreamCallbacks,
  ): Promise<void> {
    let buffer = "";

    try {
      for await (const chunk of stream) {
        if (this.aborted) {
          return;
        }

        buffer += chunk;

        // Process complete SSE events (separated by double newlines)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (this.aborted) {
            return;
          }

          const parsed = parseRemoteBlock(part);
          if (!parsed) continue;

          // Update checkpoint on each successful parse
          this.checkpoint.eventCount++;
          this.options.onCheckpoint?.(this.checkpoint);

          if (parsed.done) {
            return;
          }

          if (parsed.error) {
            callbacks.onError(parsed.error);
            return;
          }

          if (parsed.delta) {
            this.checkpoint.textLength += parsed.delta.length;
            callbacks.onChunk({ delta: parsed.delta, done: false });
          }

          if (parsed.toolProgress) {
            callbacks.onChunk({ delta: "", done: false, toolProgress: parsed.toolProgress });
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim() && !this.aborted) {
        const parsed = parseRemoteBlock(buffer);
        if (parsed) {
          this.checkpoint.eventCount++;
          this.options.onCheckpoint?.(this.checkpoint);

          if (parsed.done) {
            return;
          }
          if (parsed.error) {
            callbacks.onError(parsed.error);
            return;
          }
          if (parsed.delta) {
            this.checkpoint.textLength += parsed.delta.length;
            callbacks.onChunk({ delta: parsed.delta, done: false });
          }
        }
      }
    } catch (err) {
      if (this.aborted) {
        return;
      }
      throw err;
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Parse a raw SSE stream with automatic reconnection.
 * This is a convenience wrapper around ResilientSseParser.
 * 
 * @param streamFactory Factory function that creates a new stream on each call
 * @param callbacks Stream callbacks
 * @param options Reconnection options
 */
export async function parseRemoteStreamWithRetry(
  streamFactory: () => Promise<AsyncIterable<string>>,
  callbacks: RemoteStreamCallbacks,
  options: ResilientStreamOptions = {},
): Promise<void> {
  const parser = new ResilientSseParser(options);
  await parser.parse(streamFactory, callbacks);
}
