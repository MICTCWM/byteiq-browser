/**
 * AI Agent 工具卡片 UI 渲染器
 * 负责工具卡片渲染、工具描述/摘要构建
 */

/**
 * 创建工具卡片 UI 工厂
 * @param {Object} options
 * @param {Document} options.documentRef - 文档引用
 * @param {Function} options.getPageList - 获取页面列表函数
 */
const TOOL_ICONS = {
  search_page:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  get_page_info:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  click_element:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1"/><path d="m5.1 8-2.9-.8"/><path d="m14 4.1.8 2.9"/><path d="m4.1 14 2.9.8"/></svg>',
  input_text:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><path d="M6 10h.01"/><path d="M10 10h.01"/><path d="M14 10h.01"/></svg>',
  add_todo:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
  add_todos:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="10"/></svg>',
  list_todos:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  complete_todo:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  complete_todos:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/><path d="M3 12h.01"/></svg>',
  remove_todo:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  end_session:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>'
};

const TOOL_COLORS = {
  search_page: '#4285f4',
  get_page_info: '#a855f7',
  click_element: '#a855f7',
  input_text: '#a855f7',
  add_todo: '#22c55e',
  add_todos: '#22c55e',
  list_todos: '#22c55e',
  complete_todo: '#22c55e',
  complete_todos: '#22c55e',
  remove_todo: '#ef4444',
  end_session: '#64748b'
};

const STATUS_ICONS = {
  success:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  pending:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>'
};

function getToolIcon(toolName) {
  return TOOL_ICONS[toolName] || '';
}

function getToolColor(toolName) {
  return TOOL_COLORS[toolName] || '#64748b';
}

function getStatusIcon(status) {
  return STATUS_ICONS[status] || '';
}

function truncateText(text, maxLength) {
  const value = String(text || '');
  if (!maxLength || value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '...';
}

/**
 * 根据工具名和参数构建结构化参数列表
 */
function buildToolParamRows(toolName, args, toolResult) {
  const rows = [];
  const a = args || {};

  switch (toolName) {
    case 'search_page': {
      if (a.query) rows.push({ label: '搜索词', value: a.query, icon: 'text' });
      break;
    }
    case 'get_page_info': {
      if (a.tab_id) rows.push({ label: '目标页面', value: a.tab_id, icon: 'page' });
      else rows.push({ label: '目标页面', value: '当前页面', icon: 'page' });
      break;
    }
    case 'click_element': {
      if (a.selector) rows.push({ label: '目标选择器', value: a.selector, icon: 'selector' });
      if (a.tab_id) rows.push({ label: '目标页面', value: a.tab_id, icon: 'page' });
      else rows.push({ label: '目标页面', value: '当前页面', icon: 'page' });
      break;
    }
    case 'input_text': {
      if (a.selector) rows.push({ label: '目标选择器', value: a.selector, icon: 'selector' });
      if (a.text) rows.push({ label: '输入内容', value: a.text, icon: 'text' });
      if (a.tab_id) rows.push({ label: '目标页面', value: a.tab_id, icon: 'page' });
      else rows.push({ label: '目标页面', value: '当前页面', icon: 'page' });
      break;
    }
    case 'add_todo': {
      if (a.title) rows.push({ label: '待办标题', value: a.title, icon: 'text' });
      if (a.priority) rows.push({ label: '优先级', value: a.priority, icon: 'tag' });
      break;
    }
    case 'add_todos': {
      if (Array.isArray(a.items)) {
        rows.push({ label: '待办数量', value: `${a.items.length} 项`, icon: 'count' });
      }
      break;
    }
    case 'list_todos': {
      if (a.filter) rows.push({ label: '筛选', value: a.filter, icon: 'filter' });
      else rows.push({ label: '筛选', value: 'pending', icon: 'filter' });
      break;
    }
    case 'complete_todo': {
      if (a.todo_id) rows.push({ label: '待办 ID', value: a.todo_id, icon: 'id' });
      break;
    }
    case 'complete_todos': {
      if (Array.isArray(a.todo_ids)) {
        rows.push({ label: '待办 ID', value: a.todo_ids.join(', '), icon: 'id' });
      }
      break;
    }
    case 'remove_todo': {
      if (a.todo_id) rows.push({ label: '待办 ID', value: a.todo_id, icon: 'id' });
      break;
    }
    case 'end_session': {
      if (a.summary) rows.push({ label: '总结', value: truncateText(a.summary, 60), icon: 'text' });
      break;
    }
    default:
      break;
  }

  // 如果有结果信息，追加结果参数
  if (toolResult) {
    if (toolResult.title && toolName === 'get_page_info') {
      rows.push({ label: '页面标题', value: toolResult.title, icon: 'page' });
    }
    if (toolResult.url && (toolName === 'search_page' || toolName === 'get_page_info')) {
      rows.push({ label: '页面 URL', value: truncateText(toolResult.url, 50), icon: 'link' });
    }
    if (toolResult.tabId) {
      rows.push({ label: '标签页 ID', value: toolResult.tabId, icon: 'page' });
    }
    if (toolResult.tagName && toolName === 'click_element') {
      rows.push({ label: '元素标签', value: toolResult.tagName.toLowerCase(), icon: 'tag' });
    }
  }

  return rows;
}

function createToolCardUI(options) {
  const { documentRef, getPageList, store } = options;

  function getCardStyle() {
    return (store && store.get('settings.toolCardStyle')) || 'inline';
  }

  function renderToolCard(target, cardOptions) {
    if (!target) return;
    if (!documentRef) {
      target.classList.remove('streaming');
      target.innerText = cardOptions.description || '';
      return;
    }

    const { title, description, status, toolName = '', args, toolResult } = cardOptions;
    target.classList.remove('streaming', 'ai');
    target.textContent = '';

    const style = getCardStyle();
    const color = getToolColor(toolName);
    const displayTitle = title || getToolTitle(toolName);
    const paramRows = buildToolParamRows(toolName, args, toolResult);

    if (style === 'text') {
      renderTextStyle(target, displayTitle, description, status, toolName, color, paramRows);
    } else if (style === 'badge') {
      renderBadgeStyle(target, displayTitle, description, status, toolName, color, paramRows);
    } else {
      renderInlineStyle(target, displayTitle, description, status, toolName, color, paramRows);
    }
  }

  // V2 极简行内：图标 + 标题 + 分隔符 + 描述 + 状态
  function renderInlineStyle(target, title, description, status, toolName, color, paramRows) {
    target.classList.add('tool-card', 'tool-card-style-inline');

    const main = documentRef.createElement('div');
    main.className = 'tc-inline-main';

    if (status) {
      const statusEl = documentRef.createElement('span');
      statusEl.className = `tc-inline-status-icon ${status}`;
      statusEl.innerHTML = getStatusIcon(status);
      main.appendChild(statusEl);
    }

    const icon = documentRef.createElement('div');
    icon.className = 'tc-inline-icon';
    icon.style.color = color;
    icon.innerHTML = getToolIcon(toolName) || '';
    main.appendChild(icon);

    const titleEl = documentRef.createElement('span');
    titleEl.className = 'tc-inline-title';
    titleEl.textContent = title;
    main.appendChild(titleEl);

    const sep = documentRef.createElement('span');
    sep.className = 'tc-inline-sep';
    sep.textContent = '·';
    main.appendChild(sep);

    const descEl = documentRef.createElement('span');
    descEl.className = 'tc-inline-desc';
    descEl.textContent = description || buildParamSummary(paramRows);
    main.appendChild(descEl);

    target.appendChild(main);
  }

  // V3 纯净文本：色点 + 一行文字 + 状态小标签
  function renderTextStyle(target, title, description, status, toolName, color, paramRows) {
    target.classList.add('tool-card', 'tool-card-style-text');

    const statusIcon = documentRef.createElement('span');
    statusIcon.className = `tc-text-status-icon ${status || 'success'}`;
    statusIcon.innerHTML = getStatusIcon(status || 'success');
    if ((status || 'success') !== 'pending') statusIcon.style.color = color;
    target.appendChild(statusIcon);

    const textWrap = documentRef.createElement('div');
    textWrap.className = 'tc-text-wrap';

    const titleEl = documentRef.createElement('strong');
    titleEl.textContent = title;
    textWrap.appendChild(titleEl);

    const detail = description || buildParamSummary(paramRows);
    if (detail) {
      textWrap.appendChild(documentRef.createTextNode(` — ${detail}`));
    }

    target.appendChild(textWrap);
  }

  // V4 徽章标签：工具名彩色徽章 + 描述文字跟随
  function renderBadgeStyle(target, title, description, status, toolName, color, paramRows) {
    target.classList.add('tool-card', 'tool-card-style-badge');

    if (status) {
      const statusEl = documentRef.createElement('span');
      statusEl.className = `tc-badge-status-icon ${status}`;
      statusEl.innerHTML = getStatusIcon(status);
      target.appendChild(statusEl);
    }

    const badge = documentRef.createElement('span');
    badge.className = `tc-badge ${status || 'success'}`;
    badge.style.color = color;
    badge.style.background = hexToRgba(color, 0.08);
    badge.style.borderColor = hexToRgba(color, 0.15);
    badge.innerHTML = `${getToolIcon(toolName) || ''} <span>${title}</span>`;
    target.appendChild(badge);

    const descEl = documentRef.createElement('span');
    descEl.className = 'tc-badge-desc';
    descEl.textContent = description || buildParamSummary(paramRows);
    target.appendChild(descEl);
  }

  function buildParamSummary(paramRows) {
    if (!paramRows || paramRows.length === 0) return '';
    return paramRows.map(r => `${r.label}: ${r.value}`).join(' · ');
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getToolStatusLabel(status) {
    switch (status) {
      case 'success':
        return '已完成';
      case 'error':
        return '失败';
      case 'pending':
        return '执行中';
      default:
        return '状态';
    }
  }

  function getToolTitle(toolName) {
    switch (toolName) {
      case 'get_page_info':
        return '获取页面信息';
      case 'click_element':
        return '点击元素';
      case 'input_text':
        return '输入文本';
      case 'search_page':
        return '搜索页面';
      case 'add_todo':
        return '添加待办项';
      case 'add_todos':
        return '批量添加待办项';
      case 'list_todos':
        return '显示待办列表';
      case 'complete_todo':
        return '完成待办项';
      case 'complete_todos':
        return '批量完成待办项';
      case 'remove_todo':
        return '删除待办项';
      case 'end_session':
        return '结束会话';
      default:
        return toolName || '工具';
    }
  }

  function resolvePageLabel(tabId) {
    if (!tabId || typeof getPageList !== 'function') return '';
    const pages = getPageList() || [];
    const match = pages.find(page => page.id === tabId);
    if (!match) return '';
    return match.title || match.url || '';
  }

  function buildPageHintFromArgs(args) {
    if (!args || !args.tab_id) return '当前页面';
    const label = resolvePageLabel(args.tab_id);
    if (label) {
      return `页面: ${label}`;
    }
    return `tab_id: ${args.tab_id}`;
  }

  function buildPageHintFromResult(toolResult, toolCall) {
    if (toolResult?.title) {
      return `页面: ${toolResult.title}`;
    }
    if (toolResult?.url) {
      return `页面: ${toolResult.url}`;
    }
    if (toolResult?.tabId) {
      const label = resolvePageLabel(toolResult.tabId);
      if (label) return `页面: ${label}`;
      return `tab_id: ${toolResult.tabId}`;
    }
    const callTabId = toolCall?.arguments?.tab_id;
    if (callTabId) {
      const label = resolvePageLabel(callTabId);
      if (label) return `页面: ${label}`;
      return `tab_id: ${callTabId}`;
    }
    return '';
  }

  function buildToolCallDescription(toolCall) {
    if (!toolCall) return '准备执行';
    const args = toolCall.arguments || {};
    switch (toolCall.name) {
      case 'search_page': {
        const query = args.query ? truncateText(args.query, 40) : '未提供搜索词';
        return query;
      }
      case 'get_page_info':
        return buildPageHintFromArgs(args);
      case 'click_element': {
        const selector = args.selector || '';
        const pageHint = buildPageHintFromArgs(args);
        const parts = [selector, pageHint].filter(Boolean);
        return parts.join('，') || '准备点击';
      }
      case 'input_text': {
        const selector = args.selector || '';
        const text = args.text ? truncateText(args.text, 32) : '';
        const pageHint = buildPageHintFromArgs(args);
        const parts = [selector, text, pageHint].filter(Boolean);
        return parts.join('，') || '准备输入';
      }
      case 'add_todo': {
        const title = args.title ? truncateText(args.title, 48) : '';
        const priority = args.priority || '';
        const parts = [title, priority].filter(Boolean);
        return parts.join(' · ') || '添加待办';
      }
      case 'add_todos': {
        const count = args.items ? args.items.length : 0;
        return `${count} 项`;
      }
      case 'list_todos': {
        const filter = args.filter || 'pending';
        return filter;
      }
      case 'complete_todo': {
        return args.todo_id || '';
      }
      case 'complete_todos': {
        return args.todo_ids ? args.todo_ids.join(', ') : '';
      }
      case 'remove_todo': {
        return args.todo_id || '';
      }
      case 'end_session':
        return '结束会话';
      default:
        return '准备执行';
    }
  }

  function buildToolResultSummary(toolCall, toolResult) {
    const toolName = toolCall ? toolCall.name : '';
    if (toolName === 'search_page') {
      const pageHint = buildPageHintFromResult(toolResult, toolCall);
      const failed = toolResult && toolResult.success === false;
      if (failed) {
        return { status: 'error', text: toolResult.error || '搜索页面打开失败' };
      }
      const title = toolResult?.title || '';
      const tabId = toolResult?.tabId || '';
      const hint = title || pageHint || (tabId ? `tab_id: ${tabId}` : '');
      return {
        status: 'success',
        text: hint || '已打开',
        tabId
      };
    }

    if (toolName === 'get_page_info') {
      const pageHint = buildPageHintFromResult(toolResult, toolCall);
      const failed = toolResult && toolResult.success === false;
      const errorText = toolResult && toolResult.error ? toolResult.error : '获取失败';
      return {
        status: failed ? 'error' : 'success',
        text: failed ? errorText : pageHint || '已获取'
      };
    }

    if (toolResult && toolResult.success === false) {
      return {
        status: 'error',
        text: toolResult.error || '执行失败'
      };
    }

    if (toolName === 'click_element') {
      const tagName =
        toolResult && toolResult.tagName ? `目标: ${toolResult.tagName.toLowerCase()}` : '';
      const role = toolResult && toolResult.role ? `role=${toolResult.role}` : '';
      const type = toolResult && toolResult.type ? `type=${toolResult.type}` : '';
      const pageHint = buildPageHintFromResult(toolResult, toolCall);
      const cancelled = toolResult && toolResult.cancelled ? '事件被取消' : '';
      const details = [tagName, role, type, cancelled, pageHint].filter(Boolean).join('，');
      return {
        status: 'success',
        text: details || '已完成'
      };
    }

    if (toolName === 'input_text') {
      const pageHint = buildPageHintFromResult(toolResult, toolCall);
      return {
        status: 'success',
        text: pageHint || '已完成'
      };
    }

    if (toolName === 'add_todo') {
      const listText = toolResult.currentList ? `\n${toolResult.currentList}` : '';
      return {
        status: 'success',
        text: `${toolResult.message || '已添加'}${listText}`
      };
    }

    if (toolName === 'add_todos') {
      const listText = toolResult.currentList ? `\n${toolResult.currentList}` : '';
      return {
        status: 'success',
        text: `${toolResult.message || '已添加'}${listText}`
      };
    }

    if (toolName === 'list_todos') {
      const display = toolResult.display || '暂无';
      return {
        status: 'success',
        text: display
      };
    }

    if (toolName === 'complete_todo') {
      const listText = toolResult.currentList ? `\n${toolResult.currentList}` : '';
      return {
        status: 'success',
        text: `${toolResult.message || '已完成'}${listText}`
      };
    }

    if (toolName === 'complete_todos') {
      const listText = toolResult.currentList ? `\n${toolResult.currentList}` : '';
      return {
        status: 'success',
        text: `${toolResult.message || '已完成'}${listText}`
      };
    }

    if (toolName === 'remove_todo') {
      const listText = toolResult.currentList ? `\n${toolResult.currentList}` : '';
      return {
        status: 'success',
        text: `${toolResult.message || '已删除'}${listText}`
      };
    }

    return {
      status: 'success',
      text: '已完成'
    };
  }

  return {
    renderToolCard,
    getToolStatusLabel,
    getToolTitle,
    getToolIcon,
    getToolColor,
    getStatusIcon,
    truncateText,
    resolvePageLabel,
    buildPageHintFromArgs,
    buildPageHintFromResult,
    buildToolCallDescription,
    buildToolResultSummary,
    buildToolParamRows
  };
}

module.exports = {
  createToolCardUI
};
