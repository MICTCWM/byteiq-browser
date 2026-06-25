'use strict';

/**
 * 模型上下文大小配置工具
 * 提供模型独立上下文大小的统一查询和管理接口
 */

const DEFAULT_CONTEXT_SIZE = 8192;

const AI_PROFILES_SCHEMA_VERSION = 1;

/**
 * 思考等级配置
 * budget_tokens 必须大于等于1024，且小于 max_tokens
 */
const THINKING_BUDGETS = {
  disabled: 0,
  low: 1024,
  medium: 4096,
  high: 8192,
  extraHigh: 16384
};

const DEFAULT_THINKING_BUDGET = 'medium';

function normalizeCandidateModels(list, fallbackContextSize) {
  const defaultCtx =
    typeof fallbackContextSize === 'number' && fallbackContextSize >= 1024
      ? fallbackContextSize
      : DEFAULT_CONTEXT_SIZE;

  const seen = new Set();
  const normalized = (Array.isArray(list) ? list : [])
    .map(item => {
      if (!item) return null;
      if (typeof item === 'string') {
        const id = item.trim();
        if (!id) return null;
        return {
          id,
          contextSize: defaultCtx,
          thinkingEnabled: false,
          thinkingBudget: DEFAULT_THINKING_BUDGET
        };
      }
      if (typeof item === 'object') {
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (!id) return null;
        const contextSize =
          typeof item.contextSize === 'number' && item.contextSize >= 1024
            ? item.contextSize
            : defaultCtx;

        // thinking 配置，向后兼容
        const thinkingEnabled =
          typeof item.thinkingEnabled === 'boolean' ? item.thinkingEnabled : false;
        const thinkingBudget =
          THINKING_BUDGETS[item.thinkingBudget] !== undefined
            ? item.thinkingBudget
            : DEFAULT_THINKING_BUDGET;

        return {
          id,
          contextSize,
          thinkingEnabled,
          thinkingBudget
        };
      }
      return null;
    })
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  return normalized;
}

function generateProfileId(existingIds) {
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  for (let i = 0; i < 5; i++) {
    const id = `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!existing.has(id)) return id;
  }
  return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function buildProfileFromFlatSettings(store, name, id) {
  const endpoint = store.get('settings.aiEndpoint', '');
  const apiKey = store.get('settings.aiApiKey', '');
  const requestType = store.get('settings.aiRequestType', 'openai-chat');
  const modelId = store.get('settings.aiModelId', 'gpt-3.5-turbo');
  const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
  const candidates = normalizeCandidateModels(
    store.get('settings.aiModelCandidates', []),
    defaultCtx
  );

  return {
    id,
    name: name || '默认配置',
    endpoint,
    apiKey,
    requestType,
    modelId,
    modelCandidates: candidates
  };
}

function ensureAiProfiles(store) {
  if (!store) return [];

  const schemaVersion = store.get('settings.aiProfilesSchemaVersion', 0);
  let profiles = store.get('settings.aiProfiles', []);

  if (!Array.isArray(profiles) || profiles.length === 0) {
    const id = generateProfileId();
    profiles = [buildProfileFromFlatSettings(store, '默认配置', id)];
    store.set('settings.aiProfiles', profiles);
    store.set('settings.aiProfilesSchemaVersion', AI_PROFILES_SCHEMA_VERSION);
    store.set('settings.activeAiProfileId', id);
    return profiles;
  }

  const normalized = profiles
    .filter(p => p && typeof p.id === 'string' && p.id.trim())
    .map(p => {
      const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
      return {
        id: p.id,
        name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '配置',
        endpoint: typeof p.endpoint === 'string' ? p.endpoint : '',
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        requestType: typeof p.requestType === 'string' ? p.requestType : 'openai-chat',
        modelId: typeof p.modelId === 'string' ? p.modelId : 'gpt-3.5-turbo',
        modelCandidates: normalizeCandidateModels(p.modelCandidates || [], defaultCtx)
      };
    });

  if (normalized.length === 0) {
    const id = generateProfileId();
    const fallback = [buildProfileFromFlatSettings(store, '默认配置', id)];
    store.set('settings.aiProfiles', fallback);
    store.set('settings.aiProfilesSchemaVersion', AI_PROFILES_SCHEMA_VERSION);
    store.set('settings.activeAiProfileId', id);
    return fallback;
  }

  store.set('settings.aiProfiles', normalized);
  if (schemaVersion !== AI_PROFILES_SCHEMA_VERSION) {
    store.set('settings.aiProfilesSchemaVersion', AI_PROFILES_SCHEMA_VERSION);
  }
  const activeId = store.get('settings.activeAiProfileId', '');
  if (!activeId || !normalized.some(p => p.id === activeId)) {
    store.set('settings.activeAiProfileId', normalized[0].id);
  }
  return normalized;
}

function getAiProfiles(store) {
  return ensureAiProfiles(store);
}

function upsertAiProfile(store, profile) {
  if (!store || !profile || typeof profile !== 'object') return null;
  const profiles = ensureAiProfiles(store);
  const next = profiles.slice();
  const idx = next.findIndex(p => p.id === profile.id);
  const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
  const merged = {
    id: profile.id,
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : '配置',
    endpoint: typeof profile.endpoint === 'string' ? profile.endpoint : '',
    apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : '',
    requestType: typeof profile.requestType === 'string' ? profile.requestType : 'openai-chat',
    modelId: typeof profile.modelId === 'string' ? profile.modelId : 'gpt-3.5-turbo',
    modelCandidates: normalizeCandidateModels(profile.modelCandidates || [], defaultCtx)
  };

  if (idx >= 0) {
    next[idx] = merged;
  } else {
    next.push(merged);
  }
  store.set('settings.aiProfiles', next);
  return merged;
}

function addAiProfile(store, partialProfile) {
  if (!store) return null;
  const profiles = ensureAiProfiles(store);
  const existingIds = new Set(profiles.map(p => p.id));
  const id = generateProfileId(existingIds);
  const defaultProfile = buildProfileFromFlatSettings(
    store,
    partialProfile?.name || `配置 ${profiles.length + 1}`,
    id
  );

  const next = profiles.concat([defaultProfile]);
  store.set('settings.aiProfiles', next);
  store.set('settings.activeAiProfileId', id);
  return defaultProfile;
}

function deleteAiProfile(store, profileId) {
  if (!store || !profileId) return null;
  const profiles = ensureAiProfiles(store);
  if (profiles.length <= 1) return null; // 至少保留一个配置

  const idx = profiles.findIndex(p => p.id === profileId);
  if (idx < 0) return null;

  const removed = profiles[idx];
  const next = profiles.filter(p => p.id !== profileId);
  store.set('settings.aiProfiles', next);

  // 如果删除的是当前激活的配置，自动切换到第一个并应用
  const activeId = store.get('settings.activeAiProfileId', '');
  if (activeId === profileId) {
    const fallback = next[0];
    store.set('settings.activeAiProfileId', fallback.id);
    applyAiProfile(store, fallback.id);
  }

  return removed;
}

function applyAiProfile(store, profileId) {
  if (!store || !profileId) return null;
  const profiles = ensureAiProfiles(store);
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return null;

  store.set('settings.activeAiProfileId', profile.id);
  store.set('settings.aiEndpoint', profile.endpoint || '');
  store.set('settings.aiApiKey', profile.apiKey || '');
  store.set('settings.aiRequestType', profile.requestType || 'openai-chat');
  store.set('settings.aiModelId', profile.modelId || 'gpt-3.5-turbo');
  store.set('settings.aiModelCandidates', profile.modelCandidates || []);

  // 同步 aiContextSize：优先使用当前模型的独立配置，否则回退到全局默认
  const candidates = Array.isArray(profile.modelCandidates) ? profile.modelCandidates : [];
  const match = candidates.find(c => c.id === profile.modelId);
  const globalSize = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
  const ctxSize =
    match && typeof match.contextSize === 'number' && match.contextSize >= 1024
      ? match.contextSize
      : typeof globalSize === 'number' && globalSize >= 1024
        ? globalSize
        : DEFAULT_CONTEXT_SIZE;
  store.set('settings.aiContextSize', ctxSize);

  return profile;
}

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

/**
 * 获取模型的思考配置
 * @param {object} store - electron-store 实例
 * @param {string} modelId - 模型ID
 * @returns {{ enabled: boolean, budget: string, budgetTokens: number }}
 */
function getModelThinkingConfig(store, modelId) {
  if (!store || !modelId) {
    return {
      enabled: false,
      budget: DEFAULT_THINKING_BUDGET,
      budgetTokens: THINKING_BUDGETS[DEFAULT_THINKING_BUDGET]
    };
  }

  const candidates = getCandidateModelList(store);
  const model = candidates.find(c => c.id === modelId);

  if (!model) {
    return {
      enabled: false,
      budget: DEFAULT_THINKING_BUDGET,
      budgetTokens: THINKING_BUDGETS[DEFAULT_THINKING_BUDGET]
    };
  }

  const budget = model.thinkingBudget || DEFAULT_THINKING_BUDGET;
  return {
    enabled: model.thinkingEnabled || false,
    budget,
    budgetTokens: THINKING_BUDGETS[budget] || THINKING_BUDGETS[DEFAULT_THINKING_BUDGET]
  };
}

/**
 * 设置模型的思考配置
 * @param {object} store - electron-store 实例
 * @param {string} modelId - 模型ID
 * @param {{ enabled?: boolean, budget?: string }} config - 思考配置
 */
function setModelThinkingConfig(store, modelId, config) {
  if (!store || !modelId || !config) return;

  const list = getCandidateModelList(store);
  const item = list.find(c => c.id === modelId);
  if (item) {
    if (typeof config.enabled === 'boolean') {
      item.thinkingEnabled = config.enabled;
    }
    if (typeof config.budget === 'string' && THINKING_BUDGETS[config.budget] !== undefined) {
      item.thinkingBudget = config.budget;
    }
    store.set('settings.aiModelCandidates', list);
  }
}

/**
 * 构建Anthropic API的thinking参数
 * @param {object} store - electron-store 实例
 * @param {string} modelId - 模型ID
 * @param {number} maxTokens - max_tokens参数值
 * @returns {object|null} thinking参数对象，如果不启用则返回null
 */
function buildThinkingParam(store, modelId, maxTokens = 4096) {
  const config = getModelThinkingConfig(store, modelId);

  if (!config.enabled) {
    return null;
  }

  // budget_tokens 必须小于 max_tokens
  let budgetTokens = config.budgetTokens;
  if (budgetTokens >= maxTokens) {
    budgetTokens = Math.max(1024, Math.floor(maxTokens * 0.5));
  }

  return {
    type: 'enabled',
    budget_tokens: budgetTokens
  };
}

module.exports = {
  DEFAULT_CONTEXT_SIZE,
  AI_PROFILES_SCHEMA_VERSION,
  THINKING_BUDGETS,
  DEFAULT_THINKING_BUDGET,
  normalizeCandidateModels,
  ensureAiProfiles,
  getAiProfiles,
  upsertAiProfile,
  addAiProfile,
  deleteAiProfile,
  applyAiProfile,
  migrateCandidateModels,
  getCandidateModelList,
  getModelContextSize,
  setModelContextSize,
  getModelThinkingConfig,
  setModelThinkingConfig,
  buildThinkingParam
};
