export type FetchWithRetryOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** HTTP status codes that should be retried (default: 408, 429, 502, 503, 504). */
  retryStatusCodes?: number[];
  /** Retry on network errors and timeouts (default: true). */
  retryOnNetworkError?: boolean;
};

const DEFAULT_RETRY_STATUS = new Set([408, 429, 502, 503, 504]);

export class HttpTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "HttpTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 25_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const parentSignal = init.signal;
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpTimeoutError(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number, retryStatusCodes: Set<number>): boolean {
  return retryStatusCodes.has(status);
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const retryOnNetworkError = options.retryOnNetworkError !== false;
  const retryStatusCodes = new Set(options.retryStatusCodes ?? [...DEFAULT_RETRY_STATUS]);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);
      if (response.ok || !isRetryableStatus(response.status, retryStatusCodes) || attempt === maxAttempts) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      const isTimeout = error instanceof HttpTimeoutError;
      if (!retryOnNetworkError && !isTimeout) {
        throw error;
      }
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * 200);
    await sleep(delay + jitter);
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}
