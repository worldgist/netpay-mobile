export type PurchaseOutcomeKind = 'success' | 'pending' | 'failed' | 'connection_uncertain';

export type ParsedPurchaseOutcome = {
  kind: PurchaseOutcomeKind;
  message: string;
  reference?: string;
  status?: string;
};

const PENDING_STATUSES = new Set(['pending', 'processing', 'queued', 'submitted', 'in_progress']);

export function isTransientPurchaseNetworkError(error: unknown): boolean {
  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '');
  const errorName =
    error instanceof Error ? error.name : (error as { name?: string } | null)?.name ?? '';
  const code = (error as { code?: string } | null)?.code;

  return (
    errorMessage.includes('Network request failed') ||
    errorMessage.includes('Failed to send a request to the Edge Function') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
    errorMessage.includes('ERR_NETWORK_CHANGED') ||
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('AbortError') ||
    errorMessage.includes('TypeError') ||
    errorName === 'FunctionsFetchError' ||
    errorName === 'TypeError' ||
    code === 'NETWORK_ERROR'
  );
}

function unwrapPurchasePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const nested = root.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...root, ...(nested as Record<string, unknown>) };
  }
  return root;
}

function statusLooksPending(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  const normalized = status.trim().toLowerCase();
  return PENDING_STATUSES.has(normalized) || normalized.includes('process');
}

export function parsePurchaseResponse(
  payload: unknown,
  httpOk: boolean,
): ParsedPurchaseOutcome {
  const data = unwrapPurchasePayload(payload);
  const reference =
    (typeof data.reference === 'string' && data.reference) ||
    (typeof (data.data as Record<string, unknown> | undefined)?.reference === 'string'
      ? ((data.data as Record<string, unknown>).reference as string)
      : undefined);

  const status =
    (typeof data.status === 'string' && data.status) ||
    (typeof (data.data as Record<string, unknown> | undefined)?.status === 'string'
      ? ((data.data as Record<string, unknown>).status as string)
      : undefined);

  const message =
    (typeof data.message === 'string' && data.message) ||
    (typeof data.error === 'string' && data.error) ||
    '';

  const pendingFlag = data.pending === true;
  const successFlag = data.success;

  if (pendingFlag || statusLooksPending(status)) {
    return {
      kind: 'pending',
      message:
        message ||
        'Your payment was submitted. We are verifying it with the provider and will update you shortly.',
      reference,
      status,
    };
  }

  if (successFlag === true) {
    return {
      kind: 'success',
      message: message || 'Payment completed successfully.',
      reference,
      status: status || 'success',
    };
  }

  if (successFlag === false) {
    return {
      kind: 'failed',
      message: message || 'Unable to complete this payment.',
      reference,
      status,
    };
  }

  if (!httpOk) {
    if ([502, 503, 504, 408].includes((payload as { httpStatus?: number })?.httpStatus ?? 0)) {
      return {
        kind: 'connection_uncertain',
        message:
          'We could not confirm the payment result. If your wallet was debited, check Transactions for Pending or Processing.',
        reference,
        status,
      };
    }
    return {
      kind: 'failed',
      message: message || 'Unable to complete this payment.',
      reference,
      status,
    };
  }

  return {
    kind: 'success',
    message: message || 'Payment completed successfully.',
    reference,
    status: status || 'success',
  };
}

export function normalizeTransactionStatusLabel(status: string | null | undefined): string {
  const raw = (status || '').trim();
  if (!raw) return 'Pending';
  const lower = raw.toLowerCase();
  if (lower.includes('success') || lower.includes('complete') || lower.includes('delivered')) {
    return 'Successful';
  }
  if (lower.includes('fail') || lower.includes('cancel') || lower.includes('reject')) {
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (statusLooksPending(lower)) return 'Processing';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isTransactionStatusFailed(status: string | null | undefined): boolean {
  const lower = (status || '').toLowerCase();
  return lower.includes('fail') || lower.includes('cancel') || lower.includes('reject');
}

export function isTransactionStatusPending(status: string | null | undefined): boolean {
  const lower = (status || '').toLowerCase();
  if (!lower) return true;
  if (isTransactionStatusFailed(lower)) return false;
  if (lower.includes('success') || lower.includes('complete') || lower.includes('delivered')) {
    return false;
  }
  return statusLooksPending(lower) || lower === 'unknown';
}
