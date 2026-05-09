/**
 * AI 设置事件绑定模块
 * 负责AI模型列表刷新、AI配置、翻译设置的事件绑定
 */

/**
 * 绑定AI设置相关事件
 * @param {object} deps - 依赖
 * @returns {object} AI设置辅助方法
 */
const {
  getCandidateModelList,
  setModelContextSize,
  DEFAULT_CONTEXT_SIZE
} = require('../../ai/context/ai-model-context-config');

function bindAiSettingsEvents(deps) {
  const {
    aiApiKeyInput,
    aiEndpointInput,
    aiModelIdInput,
    aiModelListSelect,
    aiModelListStatus,
    aiModelRefreshBtn,
    aiModelCandidateInput,
    aiModelCandidateAddBtn,
    aiModelCandidateAddFromListBtn,
    aiModelCandidateClearBtn,
    aiModelCandidatesContainer,
    aiRequestTypeSelect,
    aiContextSizeInput,
    aiTimeoutInput,
    ipcRenderer,
    store,
    translationApiEnabledToggle,
    translationApiKeyInput,
    translationConcurrencyCountInput,
    translationConcurrencyToggle,
    translationDynamicEnabledToggle,
    translationEndpointInput,
    translationMaxCharsInput,
    translationMaxTextsInput,
    translationModelIdInput,
    translationRequestTypeSelect,
    translationStreamingToggle,
    translationTargetLanguageSelect,
    translationTimeoutInput,
    t
  } = deps;

  const document = deps.documentRef;

  function getCandidateModels() {
    return getCandidateModelList(store);
  }

  function setCandidateModels(list) {
    // 去重（按 id）
    const seen = new Set();
    const next = (Array.isArray(list) ? list : []).filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    store.set('settings.aiModelCandidates', next);
    renderCandidateModels();
  }

  function formatContextSize(size) {
    if (!size || size < 1024) return `${DEFAULT_CONTEXT_SIZE / 1024}K`;
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size % 1024 === 0) return `${size / 1024}K`;
    return `${(size / 1024).toFixed(1)}K`;
  }

  function renderCandidateModels() {
    if (!aiModelCandidatesContainer) return;
    const models = getCandidateModels();
    aiModelCandidatesContainer.innerHTML = '';

    if (models.length === 0) {
      aiModelCandidatesContainer.textContent = '（未添加）';
      return;
    }

    models.forEach((model, index) => {
      const tag = document.createElement('div');
      tag.className = 'model-candidate-card';
      tag.dataset.modelId = model.id;

      const nameRow = document.createElement('div');
      nameRow.className = 'model-card-name-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'model-card-name';
      nameSpan.textContent = model.id;
      nameSpan.title = model.id;
      nameRow.appendChild(nameSpan);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'model-card-delete';
      deleteBtn.innerHTML = '\u00d7';
      deleteBtn.title = t('panels.settings.ai.deleteModel') || '删除';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        const currentModels = getCandidateModels();
        currentModels.splice(index, 1);
        setCandidateModels(currentModels);
      });
      nameRow.appendChild(deleteBtn);

      tag.appendChild(nameRow);

      const ctxRow = document.createElement('div');
      ctxRow.className = 'model-card-ctx-row';

      const ctxLabel = document.createElement('span');
      ctxLabel.className = 'model-card-ctx-label';
      ctxLabel.textContent = t('panels.settings.ai.contextSize') || '上下文大小';
      ctxRow.appendChild(ctxLabel);

      const ctxInput = document.createElement('input');
      ctxInput.type = 'number';
      ctxInput.className = 'model-card-ctx-input';
      ctxInput.value = model.contextSize || DEFAULT_CONTEXT_SIZE;
      ctxInput.min = 1024;
      ctxInput.max = 1000000;
      ctxInput.step = 1024;
      ctxInput.title = `${model.id} - ${t('panels.settings.ai.contextSize') || '上下文大小'}`;
      ctxInput.addEventListener('change', () => {
        const val = parseInt(ctxInput.value);
        if (val && val >= 1024) {
          ctxInput.value = val;
          setModelContextSize(store, model.id, val);
          // 更新显示
          ctxDisplay.textContent = formatContextSize(val);
          // 同步全局 contextSize（如果编辑的是当前模型）
          const currentModelId = store.get('settings.aiModelId', '');
          if (currentModelId === model.id) {
            store.set('settings.aiContextSize', val);
            if (aiContextSizeInput) aiContextSizeInput.value = val;
          }
        } else {
          ctxInput.value = model.contextSize || DEFAULT_CONTEXT_SIZE;
        }
      });
      ctxRow.appendChild(ctxInput);

      const ctxDisplay = document.createElement('span');
      ctxDisplay.className = 'model-card-ctx-display';
      ctxDisplay.textContent = formatContextSize(model.contextSize);
      ctxRow.appendChild(ctxDisplay);

      tag.appendChild(ctxRow);

      aiModelCandidatesContainer.appendChild(tag);
    });
  }

  function setAiModelStatus(text, state) {
    if (!aiModelListStatus) return;
    aiModelListStatus.textContent = text || '';
    aiModelListStatus.classList.remove('loading', 'success', 'error');
    if (state) {
      aiModelListStatus.classList.add(state);
    }
  }

  function updateAiModelOptions(models) {
    if (!aiModelListSelect) return;
    aiModelListSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent =
      models.length > 0 ? t('panels.settings.ai.selectModel') : t('panels.settings.ai.noModels');
    aiModelListSelect.appendChild(placeholder);

    models.forEach(modelId => {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = modelId;
      aiModelListSelect.appendChild(option);
    });
  }

  function syncAiModelSelection() {
    if (!aiModelListSelect || !aiModelIdInput) return;
    const value = aiModelIdInput.value.trim();
    if (!value) return;
    const hasOption = Array.from(aiModelListSelect.options).some(option => {
      return option.value === value;
    });
    if (hasOption) {
      aiModelListSelect.value = value;
    }
  }

  async function refreshAiModelList() {
    if (!aiModelRefreshBtn || !aiModelListSelect || !aiEndpointInput || !aiApiKeyInput || !aiRequestTypeSelect) return;

    const endpoint = aiEndpointInput.value.trim();
    const apiKey = aiApiKeyInput.value.trim();
    const requestType = aiRequestTypeSelect.value;

    if (!endpoint || !apiKey) {
      setAiModelStatus(t('panels.settings.ai.configureEndpointKey'), 'error');
      return;
    }

    aiModelRefreshBtn.disabled = true;
    setAiModelStatus(t('panels.settings.ai.fetchingModels'), 'loading');

    try {
      const result = await ipcRenderer.invoke('ai-list-models', {
        endpoint,
        apiKey,
        requestType
      });

      if (!result?.success) {
        setAiModelStatus(result?.error || t('panels.settings.ai.fetchFailed'), 'error');
        updateAiModelOptions([]);
        return;
      }

      const models = Array.isArray(result.models) ? result.models : [];
      updateAiModelOptions(models);
      syncAiModelSelection();

      if (models.length > 0) {
        setAiModelStatus(
          t('panels.settings.ai.fetchedModels', { count: models.length }),
          'success'
        );
      } else {
        setAiModelStatus(t('panels.settings.ai.noModels'), 'error');
      }
    } catch (error) {
      setAiModelStatus(error.message || t('panels.settings.ai.fetchFailed'), 'error');
    } finally {
      aiModelRefreshBtn.disabled = false;
    }
  }

  // AI端点配置事件
  if (aiEndpointInput) {
    aiEndpointInput.addEventListener('change', () => {
      store.set('settings.aiEndpoint', aiEndpointInput.value);
      if (aiModelListSelect) {
        updateAiModelOptions([]);
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    });
  }

  if (aiApiKeyInput) {
    aiApiKeyInput.addEventListener('change', () => {
      store.set('settings.aiApiKey', aiApiKeyInput.value);
      if (aiModelListSelect) {
        updateAiModelOptions([]);
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    });
  }

  if (aiRequestTypeSelect) {
    aiRequestTypeSelect.addEventListener('change', () => {
      store.set('settings.aiRequestType', aiRequestTypeSelect.value);
      if (aiModelListSelect) {
        updateAiModelOptions([]);
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    });
  }

  if (aiModelIdInput) {
    aiModelIdInput.addEventListener('change', () => {
      store.set('settings.aiModelId', aiModelIdInput.value);
      syncAiModelSelection();
    });
  }

  if (aiModelListSelect) {
    aiModelListSelect.addEventListener('change', () => {
      const value = aiModelListSelect.value;
      if (!value) return;
      if (aiModelIdInput) {
        aiModelIdInput.value = value;
      }
      store.set('settings.aiModelId', value);
    });
  }

  if (aiModelRefreshBtn) {
    aiModelRefreshBtn.addEventListener('click', () => {
      refreshAiModelList();
    });
  }

  if (aiModelCandidateAddBtn && aiModelCandidateInput) {
    aiModelCandidateAddBtn.addEventListener('click', () => {
      const value = aiModelCandidateInput.value.trim();
      if (!value) return;
      const models = getCandidateModels();
      const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
      models.push({ id: value, contextSize: defaultCtx });
      setCandidateModels(models);
      aiModelCandidateInput.value = '';
    });
  }

  if (aiModelCandidateAddFromListBtn && aiModelListSelect) {
    aiModelCandidateAddFromListBtn.addEventListener('click', () => {
      const value = aiModelListSelect.value;
      if (!value) return;
      const models = getCandidateModels();
      const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
      models.push({ id: value, contextSize: defaultCtx });
      setCandidateModels(models);
    });
  }

  if (aiModelCandidateClearBtn) {
    aiModelCandidateClearBtn.addEventListener('click', () => {
      setCandidateModels([]);
    });
  }

  // 上下文大小：input 实时保存，change 校验修正
  if (aiContextSizeInput) {
    aiContextSizeInput.addEventListener('input', () => {
      const val = parseInt(aiContextSizeInput.value);
      if (val && val >= 1024) {
        store.set('settings.aiContextSize', val);
      }
    });
    aiContextSizeInput.addEventListener('change', () => {
      const val = parseInt(aiContextSizeInput.value);
      if (val && val >= 1024) {
        aiContextSizeInput.value = val;
        store.set('settings.aiContextSize', val);
      } else {
        // 输入无效时恢复存储值
        const saved = store.get('settings.aiContextSize', 8192);
        aiContextSizeInput.value = saved;
      }
    });
  }

  // 超时时间：input 实时保存，change 校验修正
  if (aiTimeoutInput) {
    aiTimeoutInput.addEventListener('input', () => {
      const value = parseInt(aiTimeoutInput.value);
      if (value && value >= 30 && value <= 300) {
        store.set('settings.aiTimeout', value);
      }
    });
    aiTimeoutInput.addEventListener('change', () => {
      const value = Math.max(30, Math.min(300, parseInt(aiTimeoutInput.value) || 120));
      aiTimeoutInput.value = value;
      store.set('settings.aiTimeout', value);
    });
  }

  // 翻译设置事件绑定
  if (translationTargetLanguageSelect) {
    translationTargetLanguageSelect.addEventListener('change', () => {
      store.set('settings.translationTargetLanguage', translationTargetLanguageSelect.value);
    });
  }

  if (translationDynamicEnabledToggle) {
    translationDynamicEnabledToggle.addEventListener('change', () => {
      store.set('settings.translationDynamicEnabled', translationDynamicEnabledToggle.checked);
    });
  }

  if (translationApiEnabledToggle) {
    translationApiEnabledToggle.addEventListener('change', () => {
      store.set('settings.translationApiEnabled', translationApiEnabledToggle.checked);
    });
  }

  if (translationEndpointInput) {
    translationEndpointInput.addEventListener('change', () => {
      store.set('settings.translationEndpoint', translationEndpointInput.value);
    });
  }

  if (translationApiKeyInput) {
    translationApiKeyInput.addEventListener('change', () => {
      store.set('settings.translationApiKey', translationApiKeyInput.value);
    });
  }

  if (translationRequestTypeSelect) {
    translationRequestTypeSelect.addEventListener('change', () => {
      store.set('settings.translationRequestType', translationRequestTypeSelect.value);
    });
  }

  if (translationModelIdInput) {
    translationModelIdInput.addEventListener('change', () => {
      store.set('settings.translationModelId', translationModelIdInput.value);
    });
  }

  // 翻译高级选项事件绑定
  if (translationStreamingToggle) {
    translationStreamingToggle.addEventListener('change', () => {
      store.set('settings.translationStreaming', translationStreamingToggle.checked);
    });
  }

  if (translationConcurrencyToggle) {
    translationConcurrencyToggle.addEventListener('change', () => {
      store.set('settings.translationConcurrencyEnabled', translationConcurrencyToggle.checked);
    });
  }

  if (translationConcurrencyCountInput) {
    translationConcurrencyCountInput.addEventListener('change', () => {
      const value = Math.max(
        1,
        Math.min(10, parseInt(translationConcurrencyCountInput.value) || 2)
      );
      translationConcurrencyCountInput.value = value;
      store.set('settings.translationConcurrency', value);
    });
  }

  if (translationMaxTextsInput) {
    translationMaxTextsInput.addEventListener('change', () => {
      const value = Math.max(10, Math.min(1000, parseInt(translationMaxTextsInput.value) || 500));
      translationMaxTextsInput.value = value;
      store.set('settings.translationMaxTexts', value);
    });
  }

  if (translationMaxCharsInput) {
    translationMaxCharsInput.addEventListener('change', () => {
      const value = Math.max(
        1000,
        Math.min(100000, parseInt(translationMaxCharsInput.value) || 50000)
      );
      translationMaxCharsInput.value = value;
      store.set('settings.translationMaxChars', value);
    });
  }

  if (translationTimeoutInput) {
    translationTimeoutInput.addEventListener('change', () => {
      const value = Math.max(30, Math.min(300, parseInt(translationTimeoutInput.value) || 120));
      translationTimeoutInput.value = value;
      store.set('settings.translationTimeout', value);
    });
  }

  return {
    setAiModelStatus,
    updateAiModelOptions,
    syncAiModelSelection,
    refreshAiModelList,
    renderCandidateModels
  };
}

module.exports = { bindAiSettingsEvents };
