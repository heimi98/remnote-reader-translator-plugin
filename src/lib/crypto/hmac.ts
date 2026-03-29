const encoder = new TextEncoder();

function normalizeKey(key: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof key === 'string') {
    return encoder.encode(key);
  }

  if (key instanceof Uint8Array) {
    return key;
  }

  return new Uint8Array(key);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Bytes(
  key: string | Uint8Array | ArrayBuffer,
  payload: string
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    normalizeKey(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload));
  return new Uint8Array(signature);
}

