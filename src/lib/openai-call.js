import { getOpenAiClient } from "./openai-client.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function shouldRetry(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 408 || status === 409 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (error?.code === "ETIMEDOUT" || error?.code === "ECONNRESET") return true;
  if (error?.name === "AbortError") return true;
  return false;
}

function backoffDelay(attempt) {
  const base = 250 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(base + jitter, 4_000);
}

export async function callOpenAiResponses(payload, {
  stage,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
} = {}) {
  const client = getOpenAiClient();
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await client.responses.create(payload, { signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const elapsed = Date.now() - startedAt;
      console.warn(`[openai] stage=${stage} attempt=${attempt} elapsed=${elapsed}ms error=${error?.message ?? error}`);
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
    }
  }

  throw lastError ?? new Error("OpenAI call failed.");
}
