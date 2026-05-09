'use strict';

/**
 * 模型上下文大小配置工具
 * 提供模型独立上下文大小的统一查询和管理接口
 */

const DEFAULT_CONTEXT_SIZE = 8192;

/**
 * 迁移旧格式候选模型数据（字符串数组 → 对象数组）
 * @param {object} store - electron-store 实例
 * @returns {Array<{id: string, contextSize: number}>} 迁移后的候选模型列表
 */
function migrateCandidateModels(store) {
  if (!store) return [];
  const list = store.get('settings.aiModelCandidates', []);
  if (!Array.isArray(list) || list.length === 0) return list;

  // 已是新格式（对象数组）
  if (typeof list[0] === 'object' && list[0] !== null) return list;

  // 旧格式（字符串数组），自动迁移
  const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
  const migrated = list
    .filter(id => typeof id === 'string' && id.trim())
    .map(id => ({ id: id.trim(), contextSize: defaultCtx }));

  if (migrated.length > 0) {
    store.set('settings.aiModelCandidates', migrated);
  }
  return migrated;
}

/**
 * 获取候选模型列表（确保为新格式）
 * @param {object} store - electron-store 实例
 * @returns {Array<{id: string, contextSize: number}>}
 */
function getCandidateModelList(store) {
  if (!store) return [];
  const list = store.get('settings.aiModelCandidates', []);
  if (!Array.isArray(list) || list.length === 0) return [];

  // 检测旧格式并迁移
  if (typeof list[0] === 'string') {
    return migrateCandidateModels(store);
  }

  return list.filter(item => item && typeof item.id === 'string' && item.id.trim());
}

/**
 * 根据当前模型获取对应的上下文大小
 * 优先使用模型独立配置，未找到则回退到全局设置
 * @param {object} store - electron-store 实例
 * @returns {number} 上下文大小（token 数）
 */
function getModelContextSize(store) {
  if (!store) return DEFAULT_CONTEXT_SIZE;

  const currentModelId = store.get('settings.aiModelId', '');
  if (currentModelId) {
    const candidates = getCandidateModelList(store);
    const match = candidates.find(c => c.id === currentModelId);
    if (match && typeof match.contextSize === 'number' && match.contextSize >= 1024) {
      return match.contextSize;
    }
  }

  // 回退到全局设置
  const globalSize = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
  return typeof globalSize === 'number' && globalSize >= 1024 ? globalSize : DEFAULT_CONTEXT_SIZE;
}

/**
 * 设置指定模型的上下文大小
 * @param {object} store - electron-store 实例
 * @param {string} modelId - 模型ID
 * @param {number} contextSize - 上下文大小
 */
function setModelContextSize(store, modelId, contextSize) {
  if (!store || !modelId || typeof contextSize !== 'number' || contextSize < 1024) return;

  const list = getCandidateModelList(store);
  const item = list.find(c => c.id === modelId);
  if (item) {
    item.contextSize = contextSize;
    store.set('settings.aiModelCandidates', list);
  }
}

module.exports = {
  DEFAULT_CONTEXT_SIZE,
  migrateCandidateModels,
  getCandidateModelList,
  getModelContextSize,
  setModelContextSize
};
