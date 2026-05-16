/**
 * 后台任务恢复到前台处理器
 * 将后台任务恢复到前台对话，渲染工具卡片、思考内容，并允许继续追问
 */

const { renderMarkdownToElement } = require('../chat/ai-markdown-renderer');
const { createToolCardUI } = require('../tools/ai-tool-card-ui');

/**
 * 创建后台任务恢复处理器
 * @param {Object} options - 依赖注入
 * @returns {Object} 恢复处理器实例
 */
function createBgTaskResumeHandler(options) {
  const {
    documentRef,
    aiChatArea,
    historyStorage,
    getCurrentSession,
    updateSession,
    renderSessionsList,
    agentRunner,
    setInputEnabled,
    store
  } = options;

  // 工具卡片 UI 实例（复用前台渲染器）
  const toolCardUI = createToolCardUI({ documentRef, getPageList: () => [], store });

  /**
   * 恢复后台任务到前台对话
   * @param {Object} task - 后台任务对象
   */
  async function resumeTaskToFrontend(task) {
    if (!task || task.status !== 'completed') {
      console.warn('[bg-task-resume] Task is not completed, cannot resume');
      return;
    }

    const metadata = task.resumeMetadata;
    if (!metadata) {
      console.warn('[bg-task-resume] No resume metadata found');
      return;
    }

    // 清空当前聊天区域
    aiChatArea.innerHTML = '';

    // 渲染用户原始消息
    const userMsg = documentRef.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.textContent = task.fullText;
    aiChatArea.appendChild(userMsg);

    // 渲染 AI 回复消息（包含思考内容和工具调用）
    const aiMsg = documentRef.createElement('div');
    aiMsg.className = 'chat-message ai bg-task-resumed';
    aiMsg.dataset.bgTaskId = task.id;

    // 渲染思考内容（如果有）
    if (metadata.thinkingContent && metadata.thinkingContent.trim()) {
      const thinkDropdown = createThinkDropdown({
        isThinking: false,
        content: metadata.thinkingContent
      });
      aiMsg.appendChild(thinkDropdown);
    }

    // 渲染工具调用历史（如果有）- 复用前台渲染器
    if (metadata.toolCallHistory && metadata.toolCallHistory.length > 0) {
      for (const toolCall of metadata.toolCallHistory) {
        // 为每个工具调用创建独立的 chat-message 容器（与前台一致）
        const toolMsg = documentRef.createElement('div');
        toolMsg.className = 'chat-message ai bg-tool-card-resumed';

        // 使用前台渲染器渲染工具卡片
        const displayTitle = toolCall.title || toolCardUI.getToolTitle(toolCall.toolName);
        const description = buildToolDescriptionFromHistory(toolCall);

        toolCardUI.renderToolCard(toolMsg, {
          title: displayTitle,
          description: description,
          status: toolCall.status,
          toolName: toolCall.toolName,
          args: toolCall.arguments || {},
          toolResult: toolCall.result
        });

        aiChatArea.appendChild(toolMsg);
      }
    }

    // 渲染最终总结
    if (metadata.finalSummary) {
      const summaryDiv = documentRef.createElement('div');
      summaryDiv.className = 'message-content bg-task-summary';
      renderMarkdownToElement(summaryDiv, metadata.finalSummary, documentRef);
      aiMsg.appendChild(summaryDiv);
    }

    aiChatArea.appendChild(aiMsg);

    // 滚动到底部
    aiChatArea.scrollTop = aiChatArea.scrollHeight;

    // 创建或切换到新会话
    const session = await getCurrentSession();
    if (session) {
      // 保存恢复的消息到历史
      await saveResumedMessagesToHistory(session.id, task, metadata);

      // 更新会话标题
      const resumedTitle = `[恢复] ${task.name}`;
      await updateSession(session.id, { title: resumedTitle, mode: 'agent' });
      renderSessionsList();

      // 设置 agentRunner 的消息历史，以便继续追问时继承后台记忆
      setupAgentHistoryForResume(session.id, task, metadata);
    }

    // 启用输入框，允许继续追问
    setInputEnabled(true);
  }

  /**
   * 创建思考下拉框（用于恢复显示）
   * @param {Object} options - 配置
   * @returns {HTMLElement}
   */
  function createThinkDropdown({ isThinking, content }) {
    const container = documentRef.createElement('div');
    container.className = 'think-dropdown thought';

    const header = documentRef.createElement('div');
    header.className = 'think-dropdown-header';
    header.innerHTML = `
      <span class="think-label">${isThinking ? 'Thinking' : 'Thought'}</span>
      <span class="think-toggle">▼</span>
    `;

    const contentEl = documentRef.createElement('div');
    contentEl.className = 'think-dropdown-content';
    contentEl.textContent = content;

    header.addEventListener('click', () => {
      const isExpanded = container.classList.toggle('expanded');
      const toggle = header.querySelector('.think-toggle');
      if (toggle) {
        toggle.textContent = isExpanded ? '▲' : '▼';
      }
      if (isExpanded) {
        contentEl.style.maxHeight = `${contentEl.scrollHeight}px`;
        contentEl.style.padding = '6px 0 10px 16px';
        contentEl.classList.add('show');
      } else {
        contentEl.style.maxHeight = '0px';
        contentEl.style.padding = '0';
        contentEl.classList.remove('show');
      }
    });

    container.appendChild(header);
    container.appendChild(contentEl);
    return container;
  }

  /**
   * 从历史记录构建工具描述
   * @param {Object} toolCall - 工具调用记录
   * @returns {string}
   */
  function buildToolDescriptionFromHistory(toolCall) {
    if (!toolCall) return '';

    const result = toolCall.result;
    if (result && result.message) {
      return result.message.substring(0, 150);
    }

    // 根据工具类型构建默认描述
    const toolName = toolCall.toolName;
    const args = toolCall.arguments || {};

    switch (toolName) {
      case 'search_page':
        return args.query ? `搜索: ${args.query.substring(0, 50)}` : '搜索页面';
      case 'get_page_info':
        return '获取页面信息';
      case 'click_element':
        return args.selector ? `点击: ${args.selector.substring(0, 50)}` : '点击元素';
      case 'input_text':
        return args.text ? `输入: ${args.text.substring(0, 30)}` : '输入文本';
      case 'close_tab':
        return '关闭标签页';
      case 'end_session':
        return '结束会话';
      default:
        return toolCall.title || toolName;
    }
  }

  /**
   * 保存恢复的消息到历史
   * @param {string} sessionId - 会话 ID
   * @param {Object} task - 任务对象
   * @param {Object} metadata - 恢复元数据
   */
  async function saveResumedMessagesToHistory(sessionId, task, metadata) {
    if (!sessionId || !historyStorage) return;

    // 保存用户消息
    await historyStorage.addMessage(sessionId, {
      role: 'user',
      content: task.fullText,
      metadata: { resumedFromBgTask: task.id }
    });

    // 保存 AI 消息（包含思考内容）
    const aiContent = metadata.thinkingContent
      ? `<!--think-->${metadata.thinkingContent}<!--endthink-->${metadata.finalSummary || ''}`
      : metadata.finalSummary || '';

    await historyStorage.addMessage(sessionId, {
      role: 'assistant',
      content: aiContent,
      metadata: {
        resumedFromBgTask: task.id,
        toolCallHistory: metadata.toolCallHistory,
        model: metadata.model,
        contextSize: metadata.contextSize
      }
    });
  }

  /**
   * 设置 AgentRunner 的消息历史，以便继续追问时继承后台记忆
   * @param {string} sessionId - 会话 ID
   * @param {Object} task - 任务对象
   * @param {Object} metadata - 恢复元数据
   */
  function setupAgentHistoryForResume(sessionId, task, metadata) {
    if (!agentRunner || !metadata.messageHistory) return;

    // 构建继承后台记忆的消息历史
    // 只保留最后的总结作为上下文
    const summaryContext = metadata.finalSummary
      ? `[后台任务完成总结]\n${metadata.finalSummary}\n\n用户可以基于此继续追问。`
      : '';

    // 设置 agentRunner 的消息历史
    // 包含：系统提示 + 用户原始问题 + AI 总结（作为上下文）
    const resumedHistory = [
      { role: 'system', content: buildResumeSystemPrompt(task, metadata) },
      { role: 'user', content: task.fullText },
      { role: 'assistant', content: summaryContext }
    ];

    agentRunner.setMessageHistory(resumedHistory);
  }

  /**
   * 构建恢复时的系统提示词
   * @param {Object} task - 任务对象
   * @param {Object} metadata - 恢复元数据
   * @returns {string}
   */
  function buildResumeSystemPrompt(task, metadata) {
    const basePrompt = `你是一个从后台任务恢复的 AI 助手。
之前的后台任务已完成，以下是任务摘要：

任务名称：${task.name}
任务结果：${metadata.finalSummary || '无'}

用户现在可以基于之前的任务结果继续追问。请根据上下文回答用户的问题。
如果用户的问题与之前的任务相关，请引用之前的总结内容。
如果用户提出新的任务，请重新开始执行。`;

    return basePrompt;
  }

  return {
    resumeTaskToFrontend
  };
}

module.exports = {
  createBgTaskResumeHandler
};
