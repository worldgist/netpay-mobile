type AnyObject = Record<string, unknown>;

type EducationMetadataCandidates = {
  pin?: string;
  serial?: string;
  instructions?: string;
};

const PIN_KEYS = [
  'pin',
  'pin_number',
  'pinNumber',
  'pin_code',
  'pinCode',
  'epin',
  'e_pin',
  'voucher_pin',
  'voucherPin',
];

const SERIAL_KEYS = [
  'serial',
  'serial_number',
  'serialNumber',
  'serial_no',
  'serialNo',
  'voucher_serial',
  'voucherSerial',
];

const INSTRUCTION_KEYS = [
  'instruction',
  'instructions',
  'message',
  'description',
  'note',
  'details',
  'info',
];

const NORMALIZED_PIN_KEYS = new Set(PIN_KEYS.map((key) => key.toLowerCase()));
const NORMALIZED_SERIAL_KEYS = new Set(SERIAL_KEYS.map((key) => key.toLowerCase()));
const NORMALIZED_INSTRUCTION_KEYS = new Set(INSTRUCTION_KEYS.map((key) => key.toLowerCase()));

const sanitizeDisplayText = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.toString().trim();
  if (!trimmed) return undefined;
  if (/^success(?:ful)?$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const toPrimitiveString = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') return sanitizeDisplayText(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return sanitizeDisplayText(String(value));
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = toPrimitiveString(item);
      if (result) return result;
    }
  }
  if (typeof value === 'object') {
    const obj = value as AnyObject;
    for (const key of ['value', 'code', 'pin', 'pinNumber', 'serial', 'serialNumber', 'text']) {
      if (key in obj) {
        const result = toPrimitiveString(obj[key]);
        if (result) return result;
      }
    }
    for (const nested of Object.values(obj)) {
      const result = toPrimitiveString(nested);
      if (result) return result;
    }
  }
  return undefined;
};

const findValueByKeys = (
  source: unknown,
  keySet: Set<string>,
  visited: Set<AnyObject> = new Set()
): string | undefined => {
  if (source == null) return undefined;

  if (Array.isArray(source)) {
    for (const item of source) {
      const result = findValueByKeys(item, keySet, visited);
      if (result) return result;
    }
    return undefined;
  }

  if (typeof source === 'object') {
    const obj = source as AnyObject;
    if (visited.has(obj)) return undefined;
    visited.add(obj);

    for (const [key, value] of Object.entries(obj)) {
      if (keySet.has(key.toLowerCase())) {
        const result = toPrimitiveString(value);
        if (result) return result;
      }
    }

    for (const value of Object.values(obj)) {
      const result = findValueByKeys(value, keySet, visited);
      if (result) return result;
    }
  }

  return undefined;
};

const parseJsonSafely = (payload: unknown): unknown => {
  if (typeof payload !== 'string') {
    return payload;
  }
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
};

const normalizePayload = (payload: unknown): unknown => {
  const parsed = parseJsonSafely(payload);
  if (!parsed || typeof parsed !== 'object') return parsed;

  if (Array.isArray(parsed)) {
    if (parsed.length === 1) {
      return normalizePayload(parsed[0]);
    }
    return parsed.map(normalizePayload);
  }

  const obj = parsed as AnyObject;
  if ('data' in obj && obj.data) {
    return normalizePayload(obj.data);
  }
  if ('details' in obj && obj.details) {
    return normalizePayload(obj.details);
  }

  return parsed;
};

const enhanceFromInstructions = (
  metadata: EducationMetadataCandidates
): EducationMetadataCandidates => {
  const instructions = metadata.instructions;
  if (!instructions) return metadata;

  const pinPattern = /pin(?:\s*(?:code|number|no\.?|#))?\s*[:\-]\s*([A-Za-z0-9]+)/i;
  const serialPattern = /serial(?:\s*(?:number|no\.?|#))?\s*[:\-]\s*([A-Za-z0-9]+)/i;

  if (!metadata.pin) {
    const match = instructions.match(pinPattern);
    if (match?.[1]) {
      metadata.pin = match[1];
    }
  }

  if (!metadata.serial) {
    const match = instructions.match(serialPattern);
    if (match?.[1]) {
      metadata.serial = match[1];
    }
  }

  return metadata;
};

export type EducationPurchaseMetadata = {
  pin?: string;
  serial?: string;
  instructions?: string;
};

export const parseEducationPurchaseMetadata = (
  payload: unknown
): EducationPurchaseMetadata => {
  const normalizedPayload = normalizePayload(payload);

  const metadata: EducationMetadataCandidates = {};

  metadata.pin = sanitizeDisplayText(
    findValueByKeys(normalizedPayload, NORMALIZED_PIN_KEYS)
  );

  metadata.serial = sanitizeDisplayText(
    findValueByKeys(normalizedPayload, NORMALIZED_SERIAL_KEYS)
  );

  metadata.instructions = sanitizeDisplayText(
    findValueByKeys(normalizedPayload, NORMALIZED_INSTRUCTION_KEYS)
  );

  const enhanced = enhanceFromInstructions(metadata);

  return {
    pin: sanitizeDisplayText(enhanced.pin),
    serial: sanitizeDisplayText(enhanced.serial),
    instructions: sanitizeDisplayText(enhanced.instructions),
  };
};


