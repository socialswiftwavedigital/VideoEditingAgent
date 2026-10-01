/*
 * Vault — security code + encrypted storage.
 * Saara data browser ke localStorage me AES-GCM (256-bit) se encrypted rehta hai.
 * Key aap ke security code se PBKDF2 (SHA-256, 250k iterations) ke zariye banti hai,
 * is liye code ke baghair data parha nahi ja sakta.
 */
const Vault = (() => {
  const KEY = 'vea_vault_v1';
  const GUARD = 'vea_guard_v1';
  const ITER = 250000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let key = null;
  let salt = null;

  function toB64(bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deriveKey(code, saltBytes, iterations = ITER) {
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function exists() {
    return !!localStorage.getItem(KEY);
  }

  function isSupported() {
    return !!(window.crypto && crypto.subtle);
  }

  async function save(data) {
    if (!key) throw new Error('Vault locked');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
    localStorage.setItem(KEY, JSON.stringify({
      v: 1, iter: ITER, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct))
    }));
  }

  async function create(code, data) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(code, salt);
    await save(data);
  }

  // Galat code par decrypt fail hota hai aur error throw hota hai.
  async function unlock(code) {
    const box = JSON.parse(localStorage.getItem(KEY));
    const s = fromB64(box.salt);
    const k = await deriveKey(code, s, box.iter || ITER);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, k, fromB64(box.ct));
    key = k;
    salt = s;
    return JSON.parse(dec.decode(pt));
  }

  async function changeCode(newCode, data) {
    await create(newCode, data);
  }

  function lock() {
    key = null;
  }

  function isUnlocked() {
    return !!key;
  }

  function wipe() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(GUARD);
    key = null;
  }

  // Brute-force guard: 5 ghalat koshishon ke baad barhta hua wait.
  function guard() {
    try {
      return JSON.parse(localStorage.getItem(GUARD)) || { fails: 0, until: 0 };
    } catch {
      return { fails: 0, until: 0 };
    }
  }

  function lockedForMs() {
    return Math.max(0, guard().until - Date.now());
  }

  function recordFail() {
    const g = guard();
    g.fails += 1;
    if (g.fails >= 5) {
      const wait = Math.min(30000 * 2 ** (g.fails - 5), 15 * 60000);
      g.until = Date.now() + wait;
    }
    localStorage.setItem(GUARD, JSON.stringify(g));
    return g;
  }

  function recordSuccess() {
    localStorage.removeItem(GUARD);
  }

  return {
    exists, isSupported, create, unlock, save, changeCode, lock, isUnlocked, wipe,
    lockedForMs, recordFail, recordSuccess
  };
})();
