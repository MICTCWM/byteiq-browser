/**
 * AI Agent 工具卡片 UI 渲染器
 * 负责工具卡片渲染编排
 * 常量/纯函数拆分至：ai-tool-card-constants
 * 待办渲染拆分至：ai-tool-card-todo
 * 描述/摘要构建拆分至：ai-tool-card-desc
 * 样式渲染器拆分至：ai-tool-style-inline / text / badge
 */

const {
  getToolIcon,
  getToolColor,
  getStatusIcon,
  truncateText,
  buildToolParamRows,
  isTodoTool,
  getToolStatusLabel,
  getToolTitle,
  TRUNCATE_DESC_TOOLS,
  DESC_TRUNCATE_LEN
} = require('./ai-tool-card-constants');
const { createInlineStyleRenderer } = require('./ai-tool-style-inline');
const { createTextStyleRenderer } = require('./ai-tool-style-text');
const { createBadgeStyleRenderer } = require('./ai-tool-style-badge');
const { createTodoRenderer } = require('./ai-tool-card-todo');
const { createDescBuilder } = require('./ai-tool-card-desc');

/**
 * 创建工具卡片 UI 工厂
 * @param {Object} options
 * @param {Document} options.documentRef - 文档引用
 * @param {Function} options.getPageList - 获取页面列表函数
 */
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

    const { title, description, status, toolName = '', args } = cardOptions;
    target.classList.remove('streaming', 'ai');
    target.textContent = '';

    const style = getCardStyle();
    const color = getToolColor(toolName);
    const displayTitle = title || getToolTitle(toolName);
    const paramRows = buildToolParamRows(toolName, args);

    // 待办系列工具使用向下展开的垂直布局
    if (isTodoTool(toolName)) {
      todoRenderer.renderTodoStyle(target, displayTitle, description, status, toolName, color);
    } else if (style === 'text') {
      renderTextStyle(target, displayTitle, description, status, toolName, color, paramRows);
    } else if (style === 'badge') {
      renderBadgeStyle(target, displayTitle, description, status, toolName, color, paramRows);
    } else {
      renderInlineStyle(target, displayTitle, description, status, toolName, color, paramRows);
    }
  }

  // 创建带截断+tooltip的描述元素
  function createDescElement(text, toolName) {
    const el = documentRef.createElement('span');
    if (TRUNCATE_DESC_TOOLS.has(toolName) && text && text.length > DESC_TRUNCATE_LEN) {
      el.textContent = truncateText(text, DESC_TRUNCATE_LEN);
      el.title = text;
    } else {
      el.textContent = text;
    }
    return el;
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

  // 创建子渲染器实例
  const todoRenderer = createTodoRenderer({ documentRef });

  const styleDeps = {
    documentRef,
    getStatusIcon,
    getToolIcon,
    createDescElement,
    buildParamSummary
  };
  const { renderInlineStyle } = createInlineStyleRenderer(styleDeps);
  const { renderTextStyle } = createTextStyleRenderer(styleDeps);
  const { renderBadgeStyle } = createBadgeStyleRenderer({ ...styleDeps, hexToRgba });

  // 创建描述构建器实例
  const descBuilder = createDescBuilder({ getPageList });

  return {
    renderToolCard,
    getToolStatusLabel,
    getToolTitle,
    getToolIcon,
    getToolColor,
    getStatusIcon,
    truncateText,
    resolvePageLabel: descBuilder.resolvePageLabel,
    buildPageHintFromArgs: descBuilder.buildPageHintFromArgs,
    buildPageHintFromResult: descBuilder.buildPageHintFromResult,
    buildToolCallDescription: descBuilder.buildToolCallDescription,
    buildToolResultSummary: descBuilder.buildToolResultSummary,
    buildToolParamRows
  };
}

module.exports = {
  createToolCardUI
};
