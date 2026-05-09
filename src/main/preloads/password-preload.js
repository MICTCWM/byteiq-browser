'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function isValidHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  if (hostname.length > 253) return false;
  if (hostname.startsWith('javascript:') || hostname.startsWith('data:')) return false;
  if (hostname.startsWith('file:')) return false;
  // IPv6 带方括号
  if (/^\[.+\]$/.test(hostname)) return true;
  // IPv4：每段 0-255
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').every(seg => {
      const n = parseInt(seg, 10);
      return n >= 0 && n <= 255 && String(n) === seg;
    });
  }
  // 常规域名
  if (hostname.startsWith('.') || hostname.endsWith('..')) return false;
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(hostname);
}

contextBridge.exposeInMainWorld('byteiqPassword', {
  requestPasswordFill: hostname => {
    if (!isValidHostname(hostname))
      return Promise.resolve({ success: false, reason: 'Invalid hostname' });
    return ipcRenderer.invoke('password-manager:get', { hostname });
  },
  requestPasswordSave: (hostname, username, password) => {
    if (!isValidHostname(hostname))
      return Promise.resolve({ success: false, reason: 'Invalid hostname' });
    if (!username || typeof username !== 'string') {
      return Promise.resolve({ success: false, reason: 'Invalid username' });
    }
    if (!password || typeof password !== 'string') {
      return Promise.resolve({ success: false, reason: 'Invalid password' });
    }
    return ipcRenderer.invoke('password-manager:save', {
      hostname,
      username,
      password
    });
  }
});
