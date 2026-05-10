/**
 * 后台任务管理器
 * 负责任务的创建、状态追踪、生命周期管理和资源清理
 */

/**
 * 创建后台任务管理器
 * @param {Object} options - 依赖注入
 * @returns {Object} 任务管理器实例
 */
function createBgTaskManager(options = {}) {
  const { onTaskStatusChange, onToolCallUpdate, store } = options;

  // 任务列表
  const tasks = new Map();

  // 任务 ID 计数器
  let taskCounter = 0;

  // 持久化存储键名
  const STORE_KEY = 'bgTasks';

  // 最大保存任务数
  const MAX_PERSIST_TASKS = 50;

  /**
   * 生成唯一任务 ID
   */
  function nextTaskId() {
    taskCounter++;
    return `bg-task-${Date.now()}-${taskCounter}`;
  }

  /**
   * 创建新任务
   * @param {string} name - 任务名称（用户输入的文本摘要）
   * @returns {Object} 任务对象
   */
  function createTask(name) {
    const id = nextTaskId();
    const task = {
      id,
      name: name.length > 50 ? name.slice(0, 50) + '...' : name,
      fullText: name,
      status: 'running',
      result: null,
      createdAt: Date.now(),
      completedAt: null,
      hiddenWebviewIds: [],
      abortController: null,
      latestToolCall: null
    };
    tasks.set(id, task);
    if (typeof onTaskStatusChange === 'function') {
      onTaskStatusChange(task);
    }
    saveTasks();
    return task;
  }

  /**
   * 标记任务完成
   * @param {string} taskId - 任务 ID
   * @param {string} result - end_session 返回的 summary
   */
  function completeTask(taskId, result) {
    const task = tasks.get(taskId);
    if (!task) return;
    task.status = 'completed';
    task.result = result || '';
    task.completedAt = Date.now();
    if (typeof onTaskStatusChange === 'function') {
      onTaskStatusChange(task);
    }
    saveTasks();
  }

  /**
   * 标记任务失败
   * @param {string} taskId - 任务 ID
   * @param {string} error - 错误信息
   */
  function failTask(taskId, error) {
    const task = tasks.get(taskId);
    if (!task) return;
    task.status = 'error';
    task.result = error || '未知错误';
    task.completedAt = Date.now();
    if (typeof onTaskStatusChange === 'function') {
      onTaskStatusChange(task);
    }
    saveTasks();
  }

  /**
   * 取消任务
   * @param {string} taskId - 任务 ID
   */
  function cancelTask(taskId) {
    const task = tasks.get(taskId);
    if (!task) return;
    // 触发 abort
    if (task.abortController && typeof task.abortController.abort === 'function') {
      task.abortController.abort();
    }
    task.status = 'error';
    task.result = '已取消';
    task.latestToolCall = null;
    task.completedAt = Date.now();
    if (typeof onTaskStatusChange === 'function') {
      onTaskStatusChange(task);
    }
    saveTasks();
  }

  /**
   * 注册隐藏 webview ID 到任务
   * @param {string} taskId - 任务 ID
   * @param {string} webviewId - 隐藏 webview 的 ID
   */
  function registerHiddenWebview(taskId, webviewId) {
    const task = tasks.get(taskId);
    if (!task) return;
    if (!task.hiddenWebviewIds.includes(webviewId)) {
      task.hiddenWebviewIds.push(webviewId);
    }
  }

  /**
   * 获取任务关联的隐藏 webview ID 列表
   * @param {string} taskId - 任务 ID
   * @returns {Array<string>}
   */
  function getHiddenWebviewIds(taskId) {
    const task = tasks.get(taskId);
    if (!task) return [];
    return [...task.hiddenWebviewIds];
  }

  /**
   * 清理任务资源（销毁隐藏 webview）
   * @param {string} taskId - 任务 ID
   * @param {Object} documentRef - document 引用
   */
  function cleanupTask(taskId, documentRef) {
    const task = tasks.get(taskId);
    if (!task) return;

    // 销毁隐藏 webview
    if (documentRef && task.hiddenWebviewIds.length > 0) {
      const container = documentRef.getElementById('bg-webviews-container');
      if (container) {
        task.hiddenWebviewIds.forEach(wvId => {
          const wv = documentRef.getElementById(wvId);
          if (wv && wv.parentNode) {
            // 尝试关闭 webview 的 session
            try {
              if (typeof wv.close === 'function') {
                wv.close();
              }
            } catch {
              // 忽略关闭错误
            }
            wv.parentNode.removeChild(wv);
          }
        });
      }
    }
    task.hiddenWebviewIds = [];
  }

  /**
   * 更新任务最新工具调用信息
   * @param {string} taskId - 任务 ID
   * @param {Object|null} toolCallInfo - 工具调用信息
   */
  function updateLatestToolCall(taskId, toolCallInfo) {
    const task = tasks.get(taskId);
    if (!task) return;
    task.latestToolCall = toolCallInfo;
    if (typeof onToolCallUpdate === 'function') {
      onToolCallUpdate(taskId, toolCallInfo);
    }
  }

  /**
   * 获取所有任务列表（按时间倒序）
   * @returns {Array<Object>}
   */
  function getTasks() {
    return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取指定任务
   * @param {string} taskId - 任务 ID
   * @returns {Object|null}
   */
  function getTaskById(taskId) {
    return tasks.get(taskId) || null;
  }

  /**
   * 获取正在运行的任务数量
   * @returns {number}
   */
  function getRunningCount() {
    let count = 0;
    tasks.forEach(task => {
      if (task.status === 'running') count++;
    });
    return count;
  }

  /**
   * 删除已完成的任务记录
   * @param {string} taskId - 任务 ID
   */
  function removeTask(taskId) {
    tasks.delete(taskId);
    saveTasks();
  }

  /**
   * 序列化可持久化的任务数据（排除运行时字段）
   * @param {Object} task - 任务对象
   * @returns {Object} 可序列化的任务数据
   */
  function serializeTask(task) {
    return {
      id: task.id,
      name: task.name,
      fullText: task.fullText,
      status: task.status,
      result: task.result,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      latestToolCall: task.latestToolCall
    };
  }

  /**
   * 将已结束的任务保存到 store
   */
  function saveTasks() {
    if (!store) return;
    const persistable = [];
    tasks.forEach(task => {
      if (task.status !== 'running') {
        persistable.push(serializeTask(task));
      }
    });
    // 按 completedAt 倒序，保留最新 MAX_PERSIST_TASKS 条
    persistable.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    store.set(STORE_KEY, persistable.slice(0, MAX_PERSIST_TASKS));
  }

  /**
   * 从 store 加载已保存的任务
   */
  function loadTasks() {
    if (!store) return;
    const saved = store.get(STORE_KEY);
    if (!Array.isArray(saved)) return;
    saved.forEach(data => {
      // running 任务在重启后标记为中断
      if (data.status === 'running') {
        data.status = 'error';
        data.result = '应用重启，任务中断';
        data.completedAt = data.completedAt || Date.now();
      }
      // 重建运行时字段
      const task = {
        ...data,
        hiddenWebviewIds: [],
        abortController: null
      };
      tasks.set(task.id, task);
      // 恢复计数器，避免 ID 冲突
      const counterMatch = task.id.match(/bg-task-\d+-(\d+)/);
      if (counterMatch) {
        const c = parseInt(counterMatch[1], 10);
        if (c > taskCounter) taskCounter = c;
      }
    });
  }

  // 初始化时加载持久化数据
  loadTasks();

  return {
    createTask,
    completeTask,
    failTask,
    cancelTask,
    updateLatestToolCall,
    registerHiddenWebview,
    getHiddenWebviewIds,
    cleanupTask,
    getTasks,
    getTaskById,
    getRunningCount,
    removeTask
  };
}

module.exports = {
  createBgTaskManager
};
