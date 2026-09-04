const TRANSFER_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function isTransferId(value) {
  return typeof value === 'string' && TRANSFER_ID_PATTERN.test(value);
}

export function createTransferId() {
  const result = [];
  const random = new Uint8Array(24);

  while (result.length < 12) {
    globalThis.crypto.getRandomValues(random);
    for (const value of random) {
      if (value < 248) result.push(ALPHABET[value % ALPHABET.length]);
      if (result.length === 12) break;
    }
  }

  return result.join('');
}
