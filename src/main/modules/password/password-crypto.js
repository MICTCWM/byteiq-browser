'use strict';

const { safeStorage } = require('electron');

const PASSWORDS_STORE_KEY = 'passwords';
const PASSWORDS_VERSION = 1;

let _available = null;

function isAvailable() {
  if (_available !== null) return _available;
  try {
    _available = safeStorage.isAvailable();
  } catch (error) {
    console.error('[password-crypto] safeStorage.isAvailable() failed:', error.message);
    _available = false;
  }
  return _available;
}

function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  if (!isAvailable()) {
    console.warn('[password-crypto] safeStorage not available, cannot encrypt');
    return '';
  }
  try {
    const buffer = safeStorage.encryptString(plaintext);
    return buffer.toString('base64');
  } catch (error) {
    console.error('[password-crypto] encrypt failed:', error.message);
    return '';
  }
}

function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return '';
  if (!isAvailable()) {
    console.warn('[password-crypto] safeStorage not available, cannot decrypt');
    return '';
  }
  try {
    const buffer = Buffer.from(ciphertext, 'base64');
    const plaintext = safeStorage.decryptString(buffer);
    buffer.fill(0);
    return plaintext;
  } catch (error) {
    console.error('[password-crypto] decrypt failed:', error.message);
    return '';
  }
}

function getStoredPasswords(store) {
  const data = store.get(PASSWORDS_STORE_KEY);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.entries)) return data.entries;
  return [];
}

function saveStoredPasswords(store, entries) {
  store.set(PASSWORDS_STORE_KEY, {
    version: PASSWORDS_VERSION,
    entries: entries
  });
}

function findPasswordIndex(entries, hostname, username) {
  return entries.findIndex(item => {
    return item && item.hostname === hostname && item.username === username;
  });
}

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function extractHostname(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname || '';
  } catch {
    return '';
  }
}

function isValidHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  if (hostname.length > 253) return false;
  if (hostname.startsWith('javascript:') || hostname.startsWith('data:')) return false;
  if (hostname.startsWith('file:')) return false;
  // 支持 IPv4、IPv6（含方括号）和常规域名
  if (/^\[.*\]$/.test(hostname)) return true; // IPv6 如 [::1]
  // IPv4：每段 0-255
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').every(seg => {
      const n = parseInt(seg, 10);
      return n >= 0 && n <= 255 && String(n) === seg;
    });
  }
  // 常规域名：不允许以点开头或结尾，不允许连续点
  if (hostname.startsWith('.') || hostname.endsWith('..')) return false;
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(hostname);
}

function isValidCredential(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.length < 1 || value.length > 256) return false;
  return true;
}

module.exports = {
  isAvailable,
  encrypt,
  decrypt,
  getStoredPasswords,
  saveStoredPasswords,
  findPasswordIndex,
  generateId,
  extractHostname,
  isValidHostname,
  isValidCredential,
  PASSWORDS_STORE_KEY,
  PASSWORDS_VERSION
};
