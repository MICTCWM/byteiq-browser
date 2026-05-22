/**
 * AI Agent 工具调用循环处理
 * 封装 tool_calls 结果的渲染、执行、历史记录等逻辑
 * 支持后台任务工具并行执行（最多 3 个），其他工具顺序执行
 */

const { renderMarkdownToElement } = require('../chat/ai-markdown-renderer');
const { truncateToolResult } = require('./ai-agent-utils');

// 后台任务工具标识列表
const BACKGROUND_TASK_TOOLS = ['dispatch_background_task'];

// 最大并行后台任务数
const MAX_PARALLEL_BG_TASKS = 3;

/**
 * 创建工具循环处理器
 * @param {Object} deps - 依赖注入
 * @returns {{ handleToolCalls: Function }}
 */
function createToolLoopHandler(deps) {
  const {
    toolCardUI,
    toolsExecutor,
    addChatMessage,
    updateStreamingMessage,
    finishStreamingMessage,
    autoCollapseThinkingDropdown,
    historyStorage,
    contextIsolation,
    updateTaskState,
    getTaskState,
    getCurrentPageInfo,
    bindTabToSession,
    documentRef,
    _handleBgTaskResult,
    handleWaitSeconds,
    getBgTaskRunner
  } = deps;

  /**
   * 判断是否为后台任务工具
   */
  function isBackgroundTaskTool(toolName) {
    return BACKGROUND_TASK_TOOLS.includes(toolName);
  }

  /**
   * 处理 tool_calls 类型的响应
   */
  async function handleToolCalls({ result, aiMsgElement, session, agentMessageHistory }) {
    const hasStreamedContent =
      aiMsgElement.querySelector('.message-content') ||
      aiMsgElement.querySelector('.think-dropdown');
    if (hasStreamedContent) {
      finishStreamingMessage(aiMsgElement);
    } else if (result.content || result.reasoningContent) {
      const fullText = result.reasoningContent
        ? `<!--think-->${result.reasoningContent}<!--endthink-->${result.content || ''}`
        : result.content || '';
      updateStreamingMessage(aiMsgElement, fullText);
      finishStreamingMessage(aiMsgElement);
    } else {
      if (aiMsgElement.parentNode) {
        aiMsgElement.parentNode.removeChild(aiMsgElement);
      }
    }

    if (typeof autoCollapseThinkingDropdown === 'function' && hasStreamedContent) {
      autoCollapseThinkingDropdown(aiMsgElement);
    }

    const toolMessages = new Map();
    result.toolCalls.forEach(toolCall => {
      if (toolCall.name === 'end_session') {
        toolMessages.set(toolCall.id, null);
        return;
      }
      const target = addChatMessage('', 'ai');
      toolMessages.set(toolCall.id, target);
      toolCardUI.renderToolCard(target, {
        title: toolCardUI.getToolTitle(toolCall.name),
        description: toolCardUI.buildToolCallDescription(toolCall),
        status: 'pending',
        toolName: toolCall.name,
        args: toolCall.arguments
      });
    });

    const openAiToolCalls = result.toolCalls.map(call => ({
      id: call.id,
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.arguments || {})
      }
    }));

    agentMessageHistory.push({
      role: 'assistant',
      content: null,
      tool_calls: openAiToolCalls
    });

    const assistantSavedContent = result.reasoningContent
      ? `<!--think-->${result.reasoningContent}<!--endthink-->${result.content || ''}`
      : result.content || '';
    if (contextIsolation?.isSessionActive?.(session.id)) {
      await historyStorage.addMessage(session.id, {
        role: 'assistant',
        content: assistantSavedContent,
        metadata: {
          thinkingContent: result.reasoningContent || '',
          actionContent: result.content || '',
          toolCalls: result.toolCalls.map(call => ({
            id: call.id,
            name: call.name,
            arguments: call.arguments
          }))
        }
      });
    }

    let shouldBreak = false;

    // 并发调度状态
    const bgTaskPromises = [];
    const bgTaskResults = [];
    const bgTaskRunner = getBgTaskRunner?.();

    for (let ti = 0; ti < result.toolCalls.length; ti++) {
      const toolCall = result.toolCalls[ti];

      // 后台任务工具：并发控制
      if (isBackgroundTaskTool(toolCall.name)) {
        // 如果已达到最大并行数，等待任意一个完成
        if (bgTaskPromises.length >= MAX_PARALLEL_BG_TASKS) {
          const completedTask = await Promise.race(bgTaskPromises);
          const completedIndex = bgTaskPromises.findIndex(
            p => p === completedTask || (p.taskId && p.taskId === completedTask?.id)
          );
          if (completedIndex !== -1) {
            bgTaskPromises.splice(completedIndex, 1);
          }
          if (completedTask) {
            bgTaskResults.push(completedTask);
          }
        }

        // 执行前更新卡片状态为 running
        const runningTarget = toolMessages.get(toolCall.id);
        if (runningTarget) {
          toolCardUI.renderToolCard(runningTarget, {
            title: toolCardUI.getToolTitle(toolCall.name),
            description: toolCardUI.buildToolCallDescription(toolCall),
            status: 'running',
            toolName: toolCall.name,
            args: toolCall.arguments
          });
        }

        // 执行后台任务工具
        const toolResult = await toolsExecutor.execute(toolCall);

        // 如果成功派发，创建等待 Promise
        if (toolResult?.success && toolResult?.taskId && bgTaskRunner?.waitForTask) {
          const waitPromise = bgTaskRunner.waitForTask(toolResult.taskId);
          waitPromise.taskId = toolResult.taskId;
          bgTaskPromises.push(waitPromise);
        }

        // 更新卡片状态
        const target = toolMessages.get(toolCall.id);
        if (target) {
          const summary = toolCardUI.buildToolResultSummary(toolCall, toolResult);
          toolCardUI.renderToolCard(target, {
            title: toolCardUI.getToolTitle(toolCall.name),
            description: summary.text || `后台任务 #${toolResult?.taskId || ''} 已派发`,
            status: summary.status,
            toolName: toolCall.name,
            args: toolCall.arguments,
            toolResult
          });
        }

        // 添加工具结果到历史
        const bgTruncated = truncateToolResult(toolCall.name, toolResult);
        agentMessageHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: bgTruncated.content
        });

        if (contextIsolation?.isSessionActive?.(session.id)) {
          await historyStorage.addMessage(session.id, {
            role: 'tool',
            content: truncated.summary,
            metadata: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              status: toolResult?.success ? 'success' : 'error',
              description: toolResult?.message || '后台任务已派发'
            }
          });
        }

        continue;
      }

      // 其他工具：等待所有后台任务完成后再执行
      if (bgTaskPromises.length > 0) {
        const completedTasks = await Promise.all(bgTaskPromises);
        bgTaskResults.push(...completedTasks.filter(t => t));
        bgTaskPromises.length = 0;
        injectBgTaskResultsToHistory(bgTaskResults, agentMessageHistory);
        bgTaskResults.length = 0;
      }

      // 工具间间隔 3 秒
      if (ti > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // 执行前更新卡片状态
      const runningTarget = toolMessages.get(toolCall.id);
      if (runningTarget && toolCall.name !== 'end_session') {
        toolCardUI.renderToolCard(runningTarget, {
          title: toolCardUI.getToolTitle(toolCall.name),
          description: toolCardUI.buildToolCallDescription(toolCall),
          status: 'running',
          toolName: toolCall.name,
          args: toolCall.arguments
        });
      }

      const toolResult = await toolsExecutor.execute(toolCall);

      // 特殊处理: 等待秒数
      if (toolCall.name === 'wait_seconds' && toolResult?.success && toolResult?.waitMode) {
        const seconds = toolResult.waitSeconds;
        if (typeof handleWaitSeconds === 'function') {
          await handleWaitSeconds(seconds);
        }
      }

      // search_page 工具绑定会话
      if (
        toolCall.name === 'search_page' &&
        toolResult?.success &&
        toolResult?.tabId &&
        session?.id &&
        typeof bindTabToSession === 'function'
      ) {
        try {
          bindTabToSession(toolResult.tabId, session.id);
        } catch (error) {
          console.warn('[ai-agent-runner] Failed to bind tab to session:', error);
        }
      }

      const target = toolMessages.get(toolCall.id) || addChatMessage('', 'ai');

      if (toolCall.name === 'end_session') {
        const summaryText = toolCall.arguments?.summary || toolResult?.summary || '';
        if (summaryText) {
          const summaryMsg = addChatMessage('', 'ai');
          const contentDiv = documentRef.createElement('div');
          contentDiv.className = 'message-content';
          renderMarkdownToElement(contentDiv, summaryText, documentRef);
          summaryMsg.appendChild(contentDiv);
        }
        if (contextIsolation?.isSessionActive?.(session.id)) {
          const endTruncated = truncateToolResult(toolCall.name, toolResult);
          await historyStorage.addMessage(session.id, {
            role: 'tool',
            content: endTruncated.summary,
            metadata: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              status: 'success',
              description: summaryText || '会话已结束'
            }
          });
        }
        shouldBreak = true;
        break;
      }

      const truncated = truncateToolResult(toolCall.name, toolResult);

      // 如果有页面快照，追加到工具消息内容末尾
      if (toolResult._pageSnapshot) {
        const snap = toolResult._pageSnapshot;
        const snapLines = ['\n\n[操作后页面状态]', 'URL: ' + snap.url, '标题: ' + snap.title];
        if (snap.contentFilePath) {
          snapLines.push('完整内容文件: ' + snap.contentFilePath);
        }
        snapLines.push(
          '内容预览: ' + snap.contentPreview,
          '可交互元素: ' +
            snap.controlsCount.buttons +
            '个按钮 | ' +
            snap.controlsCount.inputs +
            '个输入框 | ' +
            snap.controlsCount.links +
            '个链接'
        );
        const snapText = snapLines.join('\n');
        truncated.content = (truncated.content || '') + snapText;
        if (truncated.summary && typeof truncated.summary === 'string') {
          truncated.summary = truncated.summary + snapText;
        }
      }

      const toolMsgIndex = agentMessageHistory.findIndex(
        msg => msg.role === 'tool' && msg.tool_call_id === toolCall.id
      );
      if (toolMsgIndex !== -1) {
        agentMessageHistory[toolMsgIndex].content = truncated.content;
      } else {
        agentMessageHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: truncated.content
        });
      }

      const summary = toolCardUI.buildToolResultSummary(toolCall, toolResult);
      toolCardUI.renderToolCard(target, {
        title: toolCardUI.getToolTitle(toolCall.name),
        description: summary.text,
        status: summary.status,
        toolName: toolCall.name,
        args: toolCall.arguments,
        toolResult
      });

      if (typeof updateTaskState === 'function') {
        const steps =
          typeof getTaskState === 'function' && getTaskState()
            ? getTaskState().completedSteps || []
            : [];
        steps.push(`${toolCardUI.getToolTitle(toolCall.name)}: ${summary.text}`);
        const currentPageInfo =
          typeof getCurrentPageInfo === 'function' ? getCurrentPageInfo() : null;
        updateTaskState({
          completedSteps: steps,
          currentPage: currentPageInfo
            ? `${currentPageInfo.title || currentPageInfo.url}`
            : getTaskState()?.currentPage || '未知',
          lastAction: summary.text
        });
      }

      if (contextIsolation?.isSessionActive?.(session.id)) {
        await historyStorage.addMessage(session.id, {
          role: 'tool',
          content: truncated.summary,
          metadata: {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: summary.status,
            description: summary.text
          }
        });
      }
    }

    // 循环结束后等待剩余后台任务完成
    if (bgTaskPromises.length > 0) {
      const completedTasks = await Promise.all(bgTaskPromises);
      bgTaskResults.push(...completedTasks.filter(t => t));
      bgTaskPromises.length = 0;
      injectBgTaskResultsToHistory(bgTaskResults, agentMessageHistory);
      bgTaskResults.length = 0;
    }

    return { shouldBreak };
  }

  /**
   * 将后台任务结果统一注入到消息历史
   */
  function injectBgTaskResultsToHistory(bgTaskResults, agentMessageHistory) {
    if (!bgTaskResults || bgTaskResults.length === 0) return;

    const resultSummaries = bgTaskResults
      .map(task => {
        const toolSummary =
          task?.resumeMetadata?.toolCallHistory
            ?.map(tc => tc.title || tc.toolName)
            ?.filter(name => name)
            ?.join(' → ') || '';
        return `任务 #${task?.id}: ${task?.name}\n结果: ${task?.result || '无结果'}${toolSummary ? `\n执行步骤: ${toolSummary}` : ''}`;
      })
      .join('\n\n');

    // 使用 user 角色而非 system，避免 API 报错
    const resultMessage = {
      role: 'user',
      content: `[后台任务结果汇总] ${bgTaskResults.length} 个后台任务已完成。\n\n${resultSummaries}\n\n请根据任务结果继续处理。`
    };

    agentMessageHistory.push(resultMessage);
  }

  return { handleToolCalls };
}

module.exports = {
  createToolLoopHandler
};
