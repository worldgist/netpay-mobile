function cleanAddress(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return null;
  }
  return text;
}

export function readElectricityCustomerAddress(source: {
  customer_address?: unknown;
  metadata?: { customer_address?: unknown } | null;
  api_response?: unknown;
}): string | null {
  const api = source.api_response as Record<string, any> | null | undefined;
  const data = api?.data;
  const candidates = [
    source.customer_address,
    source.metadata?.customer_address,
    data?.customer_address,
    data?.customerAddress,
    data?.address,
    data?.details?.customer_address,
    data?.details?.customerAddress,
    data?.details?.address,
    data?.data?.customer_address,
    api?.customer_address,
    api?.customerAddress,
    api?.address,
    api?.details?.customer_address,
    api?.details?.customerAddress,
    api?.details?.address,
  ];

  for (const candidate of candidates) {
    const address = cleanAddress(candidate);
    if (address) return address;
  }

  return null;
}
