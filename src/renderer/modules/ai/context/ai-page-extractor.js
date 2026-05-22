/**
 * AI 页面内容提取模块
 * 负责从 webview 中提取页面内容（标题、正文、控件等）
 * 支持 Markdown 结构化输出、iframe 内容提取、超大内容落盘
 */

const { ipcRenderer } = require('electron');

const CONTENT_TRUNCATE_THRESHOLD = 10000;

const EXTRACT_PAGE_CONTENT_SCRIPT = `
(function() {
  const MAX_IFRAME_DEPTH = 3;
  const MAX_CONTENT_LENGTH = 50000;

  const IFRAME_PREFIX_DEPTH = {};
  for (let d = 0; d <= MAX_IFRAME_DEPTH; d++) {
    IFRAME_PREFIX_DEPTH[d] = '';
  }

  const title = document.title || '';
  let fullContent = '';
  let didTruncate = false;
  let fullContentLength = 0;

  const mainSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.content',
    '#content',
    '.post',
    '.article',
    '.entry-content'
  ];

  let mainElement = null;
  for (const selector of mainSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      mainElement = el;
      break;
    }
  }

  if (!mainElement) {
    mainElement = document.body;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\\\]/g, '\\\\$&');
  }

  function safeText(value, limit) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!limit || text.length <= limit) return text;
    return text.substring(0, limit) + '...';
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return false;
    return true;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0 &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
      rect.right > 0
    );
  }

  function isValidLink(href) {
    if (!href) return false;
    href = href.trim().toLowerCase();
    if (href.startsWith('javascript:')) return false;
    if (href === '#') return false;
    return true;
  }

  function detectCodeLanguage(codeEl) {
    if (!codeEl) return '';
    const cls = codeEl.className || '';
    const match = cls.match(/language-(\\w+)/);
    return match ? match[1] : '';
  }

  function walkElement(element, depth) {
    if (depth > MAX_IFRAME_DEPTH) return '';
    if (!element) return '';

    let result = '';

    function processNode(node) {
      if (fullContentLength > MAX_CONTENT_LENGTH) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent) return;
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'svg', 'link', 'meta'].includes(tagName)) return;
        if (!isVisible(parent)) return;
        const text = node.textContent.replace(/\\s+/g, ' ').trim();
        if (!text) return;
        result += text;
        fullContentLength += text.length;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'link', 'meta', 'head'].includes(tag)) return;
      if (!isVisible(node)) return;

      switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
          const level = parseInt(tag.charAt(1), 10);
          const prefix = '#'.repeat(level);
          const text = node.textContent.replace(/\\s+/g, ' ').trim();
          if (text) {
            result += '\\n\\n' + prefix + ' ' + text + '\\n';
            fullContentLength += text.length + level + 4;
          }
          return;
        }
        case 'p': {
          const text = node.textContent.replace(/\\s+/g, ' ').trim();
          if (text) {
            result += '\\n\\n' + text + '\\n';
            fullContentLength += text.length + 4;
          }
          return;
        }
        case 'a': {
          const href = node.getAttribute('href') || '';
          if (!isValidLink(href)) {
            const text = node.textContent.replace(/\\s+/g, ' ').trim();
            if (text) {
              result += text;
              fullContentLength += text.length;
            }
            return;
          }
          const aText = node.textContent.replace(/\\s+/g, ' ').trim();
          if (aText) {
            result += '[' + aText + '](' + href + ')';
            fullContentLength += aText.length + href.length + 4;
          }
          return;
        }
        case 'img': {
          const alt = node.getAttribute('alt') || '';
          const src = node.getAttribute('src') || '';
          if (alt || src) {
            result += '![' + alt + '](' + src + ')';
            fullContentLength += alt.length + src.length + 5;
          }
          return;
        }
        case 'strong': case 'b': {
          const text = node.textContent.replace(/\\s+/g, ' ').trim();
          if (text) {
            result += '**' + text + '**';
            fullContentLength += text.length + 4;
          }
          return;
        }
        case 'em': case 'i': {
          const text = node.textContent.replace(/\\s+/g, ' ').trim();
          if (text) {
            result += '*' + text + '*';
            fullContentLength += text.length + 2;
          }
          return;
        }
        case 'code': {
          const text = node.textContent.replace(/\\s+/g, ' ').trim();
          if (text) {
            result += '\`' + text + '\`';
            fullContentLength += text.length + 2;
          }
          return;
        }
        case 'pre': {
          const codeEl = node.querySelector('code');
          const lang = codeEl ? detectCodeLanguage(codeEl) : '';
          const text = (codeEl || node).textContent.replace(/[\\t]+/g, '  ').trim();
          if (text) {
            result += '\\n\\n\`\`\`' + lang + '\\n' + text + '\\n\`\`\`\\n';
            fullContentLength += text.length + lang.length + 12;
          }
          return;
        }
        case 'ul': case 'ol': {
          const isOrdered = tag === 'ol';
          let idx = 1;
          for (const li of node.children) {
            if (li.tagName === 'LI') {
              const text = li.textContent.replace(/\\s+/g, ' ').trim();
              if (text) {
                const bullet = isOrdered ? idx + '. ' : '- ';
                result += '\\n' + bullet + text;
                fullContentLength += text.length + 4;
                idx++;
              }
            }
          }
          result += '\\n';
          fullContentLength += 1;
          return;
        }
        case 'blockquote': {
          const lines = node.textContent.replace(/\\s+/g, ' ').trim().split('\\n');
          for (const line of lines) {
            if (line.trim()) {
              result += '\\n> ' + line.trim();
              fullContentLength += line.length + 3;
            }
          }
          result += '\\n';
          fullContentLength += 1;
          return;
        }
        case 'hr': {
          result += '\\n\\n---\\n';
          fullContentLength += 5;
          return;
        }
        case 'br': {
          result += '\\n';
          fullContentLength += 1;
          return;
        }
        case 'table': {
          result += '\\n\\n';
          fullContentLength += 2;
          const rows = node.querySelectorAll('tr');
          let rowCount = 0;
          let headerDone = false;
          for (const row of rows) {
            if (rowCount >= 20) break;
            const cells = row.querySelectorAll('td, th');
            const cellTexts = [];
            for (const cell of cells) {
              cellTexts.push(cell.textContent.replace(/\\s+/g, ' ').trim());
            }
            if (cellTexts.length === 0) continue;
            const rowStr = '| ' + cellTexts.join(' | ') + ' |';
            result += rowStr + '\\n';
            fullContentLength += rowStr.length + 1;
            if (!headerDone && row.querySelector('th')) {
              const sep = '| ' + cellTexts.map(() => '---').join(' | ') + ' |';
              result += sep + '\\n';
              fullContentLength += sep.length + 1;
              headerDone = true;
            }
            rowCount++;
          }
          result += '\\n';
          fullContentLength += 1;
          return;
        }
        case 'iframe': {
          try {
            const childDoc = node.contentDocument;
            if (childDoc && childDoc.body) {
              // Add iframe prefix
              const iframeTitle = node.getAttribute('title') || '';
              const iframeSrc = node.getAttribute('src') || '';
              let prefix = '';
              if (iframeTitle) {
                prefix = '\\n\\n[嵌入内容: ' + iframeTitle + ']\\n';
              } else if (iframeSrc) {
                prefix = '\\n\\n[嵌入内容: ' + iframeSrc + ']\\n';
              } else {
                prefix = '\\n\\n[嵌入内容]\\n';
              }
              result += prefix;
              fullContentLength += prefix.length;
              result += walkElement(childDoc.body, depth + 1);
            }
          } catch(e) {
            // cross-origin iframe, silently skip
          }
          return;
        }
        default: {
          // Recurse into children
          for (const child of node.childNodes) {
            if (fullContentLength > MAX_CONTENT_LENGTH) return;
            processNode(child);
          }
          return;
        }
      }
    }

    // Process children of the element
    for (const child of element.childNodes) {
      if (fullContentLength > MAX_CONTENT_LENGTH) return result;
      processNode(child);
    }

    // Also handle iframes at the element level that might not have been in the child loop
    if (element.querySelectorAll) {
      const iframes = element.querySelectorAll('iframe');
      for (const iframe of iframes) {
        if (fullContentLength > MAX_CONTENT_LENGTH) return result;
        try {
          const childDoc = iframe.contentDocument;
          if (childDoc && childDoc.body) {
            const iframeTitle = iframe.getAttribute('title') || '';
            const iframeSrc = iframe.getAttribute('src') || '';
            let prefix = '';
            if (iframeTitle) {
              prefix = '\\n\\n[嵌入内容: ' + iframeTitle + ']\\n';
            } else if (iframeSrc) {
              prefix = '\\n\\n[嵌入内容: ' + iframeSrc + ']\\n';
            } else {
              prefix = '\\n\\n[嵌入内容]\\n';
            }
            result += prefix;
            fullContentLength += prefix.length;
            result += walkElement(childDoc.body, depth + 1);
          }
        } catch(e) {
          // cross-origin iframe, silently skip
        }
      }
    }

    return result;
  }

  fullContent = walkElement(mainElement, 0);

  let truncatedContent = fullContent;
  if (fullContent.length > ${CONTENT_TRUNCATE_THRESHOLD}) {
    didTruncate = true;
    const truncationNote = '\\n\\n[内容已截断，完整内容共 ' + fullContent.length + ' 字符]';
    truncatedContent = fullContent.substring(0, ${CONTENT_TRUNCATE_THRESHOLD}) + truncationNote;
  }

  const meta = {
    description: document.querySelector('meta[name="description"]')?.content || '',
    keywords: document.querySelector('meta[name="keywords"]')?.content || '',
    author: document.querySelector('meta[name="author"]')?.content || ''
  };

  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();

    if (el.id) {
      const idSel = '#' + cssEscape(el.id);
      if (document.querySelectorAll(idSel).length === 1) return idSel;
    }

    const dataTestId = el.getAttribute('data-testid');
    if (dataTestId) {
      return tag + '[data-testid="' + cssEscape(dataTestId) + '"]';
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      return tag + '[aria-label="' + cssEscape(ariaLabel) + '"]';
    }

    const name = el.getAttribute('name');
    if (name) {
      return tag + '[name="' + cssEscape(name) + '"]';
    }

    const placeholder = el.getAttribute('placeholder');
    if (placeholder && (tag === 'input' || tag === 'textarea')) {
      return tag + '[placeholder="' + cssEscape(placeholder) + '"]';
    }

    const role = el.getAttribute('role');
    if (role) {
      return tag + '[role="' + cssEscape(role) + '"]';
    }

    const type = el.getAttribute('type');
    if (type && tag === 'input') {
      return tag + '[type="' + cssEscape(type) + '"]';
    }

    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      path.unshift(selector);
      const fullPath = path.join(' > ');
      if (document.querySelectorAll(fullPath).length === 1) {
        return fullPath;
      }
      current = current.parentElement;
    }

    return tag;
  }

  function findLabelText(el) {
    if (el.id) {
      const label = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (label) return safeText(label.innerText, 80);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const labelText = parentLabel.cloneNode(true);
      labelText.querySelectorAll('input, textarea, select, button').forEach(
        function(child) { child.remove(); }
      );
      return safeText(labelText.innerText, 80);
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\\s+/);
      const texts = parts.map(function(id) {
        const ref = document.getElementById(id);
        return ref ? ref.textContent.trim() : '';
      }).filter(Boolean);
      if (texts.length) return safeText(texts.join(' '), 80);
    }
    return '';
  }

  function collectElements(selector, maxCount) {
    const result = [];
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (!isVisible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const text = safeText(
        el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title'),
        80
      ) || findLabelText(el);
      result.push({
        tag,
        type: el.getAttribute('type') || '',
        text,
        id: el.id || '',
        name: el.getAttribute('name') || '',
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || '',
        placeholder: el.getAttribute('placeholder') || '',
        selector: buildSelector(el),
        disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        inViewport: isInViewport(el)
      });
      if (result.length >= maxCount) break;
    }
    return result;
  }

  const controls = {
    buttons: collectElements(
      'button, [role="button"], input[type="button"], input[type="submit"], summary, [role="link"]',
      30
    ),
    inputs: collectElements(
      'input:not([type="button"]):not([type="submit"]), textarea, select, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      30
    ),
    links: collectElements('a[href]', 30)
  };

  return {
    url: window.location.href,
    title: title,
    content: truncatedContent,
    fullContent: (fullContent.length > ${CONTENT_TRUNCATE_THRESHOLD}) ? fullContent : null,
    contentTruncated: didTruncate,
    contentLength: fullContent.length,
    meta: meta,
    controls: controls
  };
})();
`;

function isWebviewNotReadyError(error) {
  const msg = error && error.message ? String(error.message) : '';
  return (
    msg.includes('WebView must be attached to the DOM') ||
    msg.includes('dom-ready event emitted before this method can be called') ||
    msg.includes('dom-ready')
  );
}

async function writeTempFile(content, prefix = 'byteiq-page') {
  try {
    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      const result = await ipcRenderer.invoke('ai-write-temp-file', { content, prefix });
      return result && result.filepath ? result.filepath : null;
    }
  } catch (error) {
    console.error('[ai-page-extractor] Failed to write temp file:', error);
  }
  return null;
}

async function extractPageContent(webview) {
  if (!webview || webview.tagName !== 'WEBVIEW') {
    return null;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
      )
    ]);
  }

  try {
    if (!webview.isConnected) {
      const start = Date.now();
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (webview.isConnected) {
            clearInterval(timer);
            resolve();
            return;
          }
          if (Date.now() - start > 5000) {
            clearInterval(timer);
            reject(new Error('Webview attach timeout'));
          }
        }, 50);
      });
    }

    const maxAttempts = 3;
    const delays = [300, 800, 1500];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const content = await withTimeout(
          webview.executeJavaScript(EXTRACT_PAGE_CONTENT_SCRIPT),
          8000
        );
        if (webview.dataset) {
          webview.dataset.domReady = 'true';
        }

        // If content was truncated, write full content to temp file
        if (content && content.contentTruncated && content.fullContent) {
          const tempRoot = content.url ? new URL(content.url).hostname : 'byteiq-page';
          const safePrefix = tempRoot
            .replace(/[^a-zA-Z0-9\\u4e00-\\u9fff\\-]/g, '_')
            .substring(0, 30);
          const filepath = await writeTempFile(content.fullContent, safePrefix);
          if (filepath) {
            content.contentFilePath = filepath;
          }
          // Don't include fullContent in the returned object to avoid IPC bloat
          delete content.fullContent;
          delete content.contentTruncated;
        } else if (content) {
          delete content.fullContent;
          delete content.contentTruncated;
        }

        return content;
      } catch (error) {
        const msg = error && error.message ? String(error.message) : '';
        if (
          (isWebviewNotReadyError(error) || msg.includes('timed out')) &&
          attempt < maxAttempts - 1
        ) {
          console.warn(
            `[ai-page-extractor] extractPageContent attempt ${attempt + 1} failed, ` +
              `retrying in ${delays[attempt]}ms...`
          );
          await new Promise(r => setTimeout(r, delays[attempt]));
          continue;
        }
        throw error;
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to extract page content:', error);
    return null;
  }
}

module.exports = {
  EXTRACT_PAGE_CONTENT_SCRIPT,
  extractPageContent,
  isWebviewNotReadyError
};
