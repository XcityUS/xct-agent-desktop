/**
 * Local cost estimator (display-only).
 *
 * Replaces the previous HMAC-signed token meter. Authoritative metering now
 * happens at the LiteLLM gateway → xct-wallet, so this module is purely for
 * informational UI: "this prompt will cost ~5 credits before you send it."
 *
 * No HMAC, no signing, no aggregation, no buffering. Anything that needs to
 * be ground truth goes to the wallet service.
 */

export interface MessageLike {
  role: string;
  content: string;
}

export interface TokenEstimate {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  credits: number;
}

/** Cents per 1k tokens — kept loose; authoritative numbers live in xct-wallet's rate card. */
const RATE_CARD: Record<string, { input_per_1k: number; output_per_1k: number }> = {
  'gpt-4o': { input_per_1k: 5, output_per_1k: 15 },
  'gpt-4-turbo': { input_per_1k: 10, output_per_1k: 30 },
  'gpt-4': { input_per_1k: 30, output_per_1k: 60 },
  'gpt-3.5-turbo': { input_per_1k: 0.5, output_per_1k: 1.5 },
  'claude-opus': { input_per_1k: 15, output_per_1k: 75 },
  'claude-sonnet': { input_per_1k: 3, output_per_1k: 15 },
  'claude-haiku': { input_per_1k: 0.8, output_per_1k: 4 },
  'gemini-pro': { input_per_1k: 1.25, output_per_1k: 5 },
  'gemini-ultra': { input_per_1k: 7, output_per_1k: 21 },
  llama: { input_per_1k: 0.1, output_per_1k: 0.1 },
  mistral: { input_per_1k: 0.2, output_per_1k: 0.6 },
  default: { input_per_1k: 5, output_per_1k: 15 },
};

const TOKEN_CHARS_PER_TOKEN: Record<string, number> = {
  'gpt-4': 4.0,
  'gpt-4o': 4.2,
  'gpt-3.5': 4.0,
  claude: 3.5,
  gemini: 4.0,
  llama: 3.5,
  mistral: 3.5,
  default: 4.0,
};

function pickRate(model: string): { input_per_1k: number; output_per_1k: number } {
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(RATE_CARD)) {
    if (key !== 'default' && lower.includes(key)) return value;
  }
  return RATE_CARD.default;
}

function pickCharsPerToken(model: string): number {
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(TOKEN_CHARS_PER_TOKEN)) {
    if (key !== 'default' && lower.includes(key)) return value;
  }
  return TOKEN_CHARS_PER_TOKEN.default;
}

function countTokens(text: string, model: string): number {
  if (!text) return 0;
  const chars = text.length;
  const ratio = pickCharsPerToken(model);
  return Math.max(1, Math.round(chars / ratio));
}

/**
 * Estimate prompt + completion tokens and credit cost for a given model.
 *
 * Credits use the same conversion as the wallet service: 1 USD = 1000 credits,
 * with a 10% markup baked in. These numbers are *rough* — they're for the
 * "this will cost ~X credits" hint shown in the composer.
 */
export function measure(
  prompt: string | MessageLike[],
  completion: string,
  model: string,
): TokenEstimate {
  const promptText = Array.isArray(prompt)
    ? prompt.map((m) => `${m.role}: ${m.content}`).join('\n')
    : prompt;

  const promptTokens = countTokens(promptText, model);
  const completionTokens = countTokens(completion, model);
  const totalTokens = promptTokens + completionTokens;

  const rate = pickRate(model);
  const usdRaw =
    (promptTokens / 1000) * (rate.input_per_1k / 100) +
    (completionTokens / 1000) * (rate.output_per_1k / 100);
  const usdMarked = usdRaw * 1.1; // 10% markup, matching wallet service
  const credits = Math.max(0, Math.round(usdMarked * 1000));

  return { promptTokens, completionTokens, totalTokens, model, credits };
}

/**
 * Estimate credit cost from already-known token counts (e.g. server-reported
 * input/output tokens). Used post-call to display "you spent N credits."
 */
export function estimateCredits(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = pickRate(model);
  const usdRaw =
    (inputTokens / 1000) * (rate.input_per_1k / 100) +
    (outputTokens / 1000) * (rate.output_per_1k / 100);
  return Math.max(0, Math.round(usdRaw * 1.1 * 1000));
}
