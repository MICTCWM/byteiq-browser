'use strict';

const {
  isAvailable,
  encrypt,
  decrypt,
  getStoredPasswords,
  saveStoredPasswords,
  findPasswordIndex,
  generateId,
  isValidHostname,
  isValidCredential
} = require('../password/password-crypto');

function extractSenderInfo(event) {
  try {
    const url = event.sender.getURL();
    if (!url) return { hostname: '', isInternal: false };
    const parsed = new URL(url);
    const isInternal = parsed.protocol === 'file:' || parsed.protocol === 'atom:';
    return { hostname: parsed.hostname || '', isInternal };
  } catch {
    return { hostname: '', isInternal: false };
  }
}

function verifySenderHostname(event, requestedHostname) {
  const { hostname, isInternal } = extractSenderInfo(event);
  // 主渲染进程(file://)是可信的内部调用方
  if (isInternal) return true;
  if (!hostname) {
    console.warn('[password-ipc] rejected: empty sender hostname');
    return false;
  }
  if (hostname !== requestedHostname) {
    console.warn('[password-ipc] rejected: sender hostname mismatch');
    return false;
  }
  return true;
}

function safeParseArgs(args) {
  if (!args || typeof args !== 'object') return {};
  return args;
}

function registerPasswordIpc(options) {
  const { ipcMain, store } = options;

  ipcMain.handle('password-manager:check-availability', () => {
    try {
      return {
        available: isAvailable(),
        reason: isAvailable() ? '' : 'safeStorage 不可用，请检查系统密钥链服务是否正常运行'
      };
    } catch (error) {
      console.error('[password-ipc] check-availability error:', error.message);
      return { available: false, reason: '检测失败: ' + error.message };
    }
  });

  ipcMain.handle('password-manager:save', (event, rawArgs) => {
    try {
      const { hostname, username, password } = safeParseArgs(rawArgs);

      if (!isAvailable()) {
        return { success: false, reason: 'safeStorage 不可用' };
      }
      if (!isValidHostname(hostname)) {
        return { success: false, reason: '无效的 hostname' };
      }
      if (!isValidCredential(username)) {
        return { success: false, reason: '无效的用户名' };
      }
      if (!isValidCredential(password)) {
        return { success: false, reason: '无效的密码' };
      }
      if (!verifySenderHostname(event, hostname)) {
        return { success: false, reason: 'hostname 不匹配请求来源' };
      }

      const encryptedPassword = encrypt(password);
      if (!encryptedPassword) {
        return { success: false, reason: '加密失败' };
      }

      const entries = getStoredPasswords(store);
      const existingIndex = findPasswordIndex(entries, hostname, username);

      const now = new Date().toISOString();

      if (existingIndex >= 0) {
        entries[existingIndex].encryptedPassword = encryptedPassword;
        entries[existingIndex].updatedAt = now;
      } else {
        entries.push({
          id: generateId(),
          hostname,
          username,
          encryptedPassword,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: ''
        });
      }

      saveStoredPasswords(store, entries);
      return { success: true };
    } catch (error) {
      console.error('[password-ipc] save error:', error.message);
      return { success: false, reason: '保存失败' };
    }
  });

  ipcMain.handle('password-manager:get', (event, rawArgs) => {
    try {
      const { hostname } = safeParseArgs(rawArgs);

      if (!isAvailable()) {
        return { success: false, reason: 'safeStorage 不可用', entries: [] };
      }
      if (!isValidHostname(hostname)) {
        return { success: false, reason: '无效的 hostname', entries: [] };
      }
      if (!verifySenderHostname(event, hostname)) {
        return { success: false, reason: 'hostname 不匹配请求来源', entries: [] };
      }

      const entries = getStoredPasswords(store);
      const matched = entries.filter(item => item && item.hostname === hostname);

      const result = matched.map(item => {
        const decrypted = decrypt(item.encryptedPassword);
        const entry = {
          id: item.id,
          username: item.username,
          password: decrypted
        };
        return entry;
      });

      return { success: true, entries: result };
    } catch (error) {
      console.error('[password-ipc] get error:', error.message);
      return { success: false, reason: '获取失败', entries: [] };
    }
  });

  ipcMain.handle('password-manager:list-for-hostname', (event, rawArgs) => {
    try {
      const { hostname } = safeParseArgs(rawArgs);

      if (!isAvailable()) {
        return { success: false, reason: 'safeStorage 不可用', entries: [] };
      }
      if (!isValidHostname(hostname)) {
        return { success: false, reason: '无效的 hostname', entries: [] };
      }
      if (!verifySenderHostname(event, hostname)) {
        return { success: false, reason: 'hostname 不匹配请求来源', entries: [] };
      }

      const entries = getStoredPasswords(store);
      const matched = entries.filter(item => item && item.hostname === hostname);

      const result = matched.map(item => ({
        id: item.id,
        username: item.username
      }));

      return { success: true, entries: result };
    } catch (error) {
      console.error('[password-ipc] list-for-hostname error:', error.message);
      return { success: false, reason: '获取失败', entries: [] };
    }
  });

  ipcMain.handle('password-manager:delete', (event, rawArgs) => {
    try {
      const { id } = safeParseArgs(rawArgs);

      if (!id || typeof id !== 'string') {
        return { success: false, reason: '无效的 ID' };
      }

      const entries = getStoredPasswords(store);
      const index = entries.findIndex(item => item && item.id === id);

      if (index < 0) {
        return { success: false, reason: '未找到该密码记录' };
      }

      entries.splice(index, 1);
      saveStoredPasswords(store, entries);
      return { success: true };
    } catch (error) {
      console.error('[password-ipc] delete error:', error.message);
      return { success: false, reason: '删除失败' };
    }
  });

  ipcMain.handle('password-manager:list-all', event => {
    try {
      if (!isAvailable()) {
        return { success: false, reason: 'safeStorage 不可用', entries: [] };
      }

      const { hostname: senderHostname, isInternal } = extractSenderInfo(event);
      if (!isInternal && !senderHostname) {
        console.warn('[password-ipc] list-all rejected: untrusted sender');
        return { success: false, reason: '无法验证请求来源', entries: [] };
      }

      const entries = getStoredPasswords(store);
      const result = entries.map(item => ({
        id: item.id,
        hostname: item.hostname,
        username: item.username,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        lastUsedAt: item.lastUsedAt
      }));

      return { success: true, entries: result };
    } catch (error) {
      console.error('[password-ipc] list-all error:', error.message);
      return { success: false, reason: '获取失败', entries: [] };
    }
  });

  ipcMain.handle('password-manager:reveal', (event, rawArgs) => {
    try {
      const { id } = safeParseArgs(rawArgs);

      if (!isAvailable()) {
        return { success: false, reason: 'safeStorage 不可用', password: '' };
      }
      if (!id || typeof id !== 'string') {
        return { success: false, reason: '无效的 ID', password: '' };
      }

      const { hostname: senderHostname, isInternal } = extractSenderInfo(event);
      if (!isInternal && !senderHostname) {
        console.warn('[password-ipc] reveal rejected: untrusted sender');
        return { success: false, reason: '无法验证请求来源', password: '' };
      }

      const entries = getStoredPasswords(store);
      const item = entries.find(e => e && e.id === id);

      if (!item) {
        return { success: false, reason: '未找到该密码记录', password: '' };
      }

      // 主渲染进程可查看任意密码；webview 仅可查看匹配 hostname 的密码
      if (!isInternal && item.hostname !== senderHostname) {
        console.warn('[password-ipc] reveal rejected: hostname mismatch');
        return { success: false, reason: 'hostname 不匹配请求来源', password: '' };
      }

      const decrypted = decrypt(item.encryptedPassword);

      // 更新最后使用时间
      item.lastUsedAt = new Date().toISOString();
      saveStoredPasswords(store, entries);

      return { success: true, password: decrypted };
    } catch (error) {
      console.error('[password-ipc] reveal error:', error.message);
      return { success: false, reason: '获取失败', password: '' };
    }
  });
}

module.exports = { registerPasswordIpc };
