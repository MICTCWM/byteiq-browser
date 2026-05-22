/**
 * AI 控制台日志收集模块
 * 被动收集 webview 的控制台输出，供 AI 上下文使用
 */

function createConsoleCollector() {
  const buffers = new Map();

  function startCollecting(webview, webviewId, maxEntries = 100) {
    if (!webview || !webviewId) return;
    if (buffers.has(webviewId)) return;

    const logs = [];
    buffers.set(webviewId, logs);

    const handler = event => {
      const level = event.level;
      const entry = {
        level,
        levelName:
          level === -1
            ? 'verbose'
            : level === 0
              ? 'info'
              : level === 1
                ? 'warn'
                : level === 2
                  ? 'error'
                  : 'unknown',
        message: event.message || '',
        line: event.line || 0,
        sourceId: event.sourceId || '',
        timestamp: Date.now()
      };
      logs.push(entry);
      if (logs.length > maxEntries) {
        logs.shift();
      }
    };

    webview.addEventListener('console-message', handler);
    buffers.set(webviewId + ':handler', handler);
  }

  function stopCollecting(webview, webviewId) {
    if (!webviewId) return;
    const handler = buffers.get(webviewId + ':handler');
    if (handler && webview) {
      webview.removeEventListener('console-message', handler);
    }
    buffers.delete(webviewId);
    buffers.delete(webviewId + ':handler');
  }

  function getLogs(webviewId) {
    if (!webviewId) return [];
    return buffers.get(webviewId) || [];
  }

  function getFormattedLogs(webviewId) {
    const logs = getLogs(webviewId);
    if (logs.length === 0) return '';
    return logs
      .map(entry => {
        const levelTag = entry.levelName.toUpperCase();
        return `[${levelTag}] ${entry.message}${entry.line ? ` (line:${entry.line})` : ''}`;
      })
      .join('\n');
  }

  function getErrorsAndWarnings(webviewId) {
    const logs = getLogs(webviewId);
    return logs.filter(entry => entry.level >= 1);
  }

  function getFormattedErrorsAndWarnings(webviewId) {
    const filtered = getErrorsAndWarnings(webviewId);
    if (filtered.length === 0) return '';
    return filtered
      .map(entry => {
        const levelTag = entry.levelName.toUpperCase();
        return `[${levelTag}] ${entry.message}${entry.line ? ` (line:${entry.line})` : ''}`;
      })
      .join('\n');
  }

  function clearOnNavigation(webviewId) {
    if (!webviewId) return;
    const logs = buffers.get(webviewId);
    if (logs) {
      logs.length = 0;
    }
  }

  function getLogsCount(webviewId) {
    const logs = getLogs(webviewId);
    return {
      total: logs.length,
      errors: logs.filter(e => e.level === 2).length,
      warnings: logs.filter(e => e.level === 1).length
    };
  }

  function destroy() {
    buffers.clear();
  }

  return {
    startCollecting,
    stopCollecting,
    getLogs,
    getFormattedLogs,
    getErrorsAndWarnings,
    getFormattedErrorsAndWarnings,
    clearOnNavigation,
    getLogsCount,
    destroy
  };
}

module.exports = { createConsoleCollector };
