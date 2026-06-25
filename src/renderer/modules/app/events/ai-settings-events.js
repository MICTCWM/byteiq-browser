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
  ensureAiProfiles,
  getAiProfiles,
  addAiProfile,
  deleteAiProfile,
  upsertAiProfile,
  applyAiProfile,
  setModelContextSize,
  setModelThinkingConfig,
  DEFAULT_CONTEXT_SIZE
} = require('../../ai/context/ai-model-context-config');

function bindAiSettingsEvents(deps) {
  const {
    aiProfileSelect,
    aiProfileAddBtn,
    aiProfileDeleteBtn,
    aiProfileApplyBtn,
    aiProfileNameInput,
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

  let lastProfileId = '';
  let isDirty = false;

  function markDirty() {
    isDirty = true;
  }

  function resetDirty(nextProfileId) {
    isDirty = false;
    if (nextProfileId) {
      lastProfileId = nextProfileId;
    }
  }

  function getActiveProfileId() {
    return store ? store.get('settings.activeAiProfileId', '') : '';
  }

  function saveCurrentProfileIfNeeded(profileId) {
    if (!store || !profileId) return;
    if (!isDirty) return;

    let confirmed;
    try {
      confirmed = window.confirm('当前配置未保存，是否保存到当前配置？');
    } catch {
      confirmed = true;
    }

    if (!confirmed) {
      throw new Error('CANCEL_SWITCH');
    }

    const uiProfile = readProfileFromUi(profileId);
    const profiles = getAiProfiles(store);
    const currentName = profiles.find(p => p.id === profileId)?.name;
    if (!uiProfile.name) {
      uiProfile.name = currentName || '配置';
    }
    upsertAiProfile(store, uiProfile);
    resetDirty(profileId);
  }

  function readProfileFromUi(profileId) {
    const defaultCtx = store.get('settings.aiContextSize', DEFAULT_CONTEXT_SIZE);
    const candidates = getCandidateModels();

    const profileName = aiProfileNameInput ? aiProfileNameInput.value.trim() : '';

    return {
      id: profileId,
      name: profileName || '配置',
      endpoint: aiEndpointInput ? aiEndpointInput.value.trim() : '',
      apiKey: aiApiKeyInput ? aiApiKeyInput.value.trim() : '',
      requestType: aiRequestTypeSelect ? aiRequestTypeSelect.value : 'openai-chat',
      modelId: aiModelIdInput ? aiModelIdInput.value.trim() : 'gpt-3.5-turbo',
      modelCandidates: (Array.isArray(candidates) ? candidates : [])
        .map(item => {
          if (!item) return null;
          const id = typeof item.id === 'string' ? item.id.trim() : '';
          if (!id) return null;
          const contextSize =
            typeof item.contextSize === 'number' && item.contextSize >= 1024
              ? item.contextSize
              : defaultCtx;
          const thinkingEnabled =
            typeof item.thinkingEnabled === 'boolean' ? item.thinkingEnabled : false;
          const thinkingBudget =
            typeof item.thinkingBudget === 'string' ? item.thinkingBudget : 'medium';
          return { id, contextSize, thinkingEnabled, thinkingBudget };
        })
        .filter(Boolean)
    };
  }

  function fillUiFromProfile(profile) {
    if (!profile) return;
    if (aiProfileNameInput) aiProfileNameInput.value = profile.name || '';
    if (aiEndpointInput) aiEndpointInput.value = profile.endpoint || '';
    if (aiApiKeyInput) aiApiKeyInput.value = profile.apiKey || '';
    if (aiRequestTypeSelect) aiRequestTypeSelect.value = profile.requestType || 'openai-chat';
    if (aiModelIdInput) aiModelIdInput.value = profile.modelId || 'gpt-3.5-turbo';

    if (store) {
      store.set(
        'settings.aiModelCandidates',
        Array.isArray(profile.modelCandidates) ? profile.modelCandidates : []
      );
    }
    renderCandidateModels();

    if (aiModelListSelect) {
      syncAiModelSelection();
      if (aiModelListSelect.options.length <= 1) {
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    }

    resetDirty(profile.id);
  }

  function renderProfilesSelect(profiles, activeId) {
    if (!aiProfileSelect) return;
    aiProfileSelect.innerHTML = '';

    (Array.isArray(profiles) ? profiles : []).forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name || '配置';
      aiProfileSelect.appendChild(option);
    });

    if (activeId) {
      aiProfileSelect.value = activeId;
    }
  }

  function initAiProfilesUi() {
    if (!store || !aiProfileSelect) return;

    const profiles = ensureAiProfiles(store);
    const activeId = getActiveProfileId() || profiles[0]?.id;
    renderProfilesSelect(profiles, activeId);

    const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
    if (activeProfile) {
      fillUiFromProfile(activeProfile);
    }

    try {
      if (activeId) {
        window.dispatchEvent(
          new CustomEvent('ai-profile-applied', { detail: { profileId: activeId } })
        );
      }
    } catch {
      // ignore
    }
  }

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
    markDirty();
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
          markDirty();
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

      // 思考模式选项行
      const thinkingRow = document.createElement('div');
      thinkingRow.className = 'model-card-thinking-row';

      const thinkingLabel = document.createElement('label');
      thinkingLabel.className = 'model-card-thinking-label';

      const thinkingToggle = document.createElement('input');
      thinkingToggle.type = 'checkbox';
      thinkingToggle.className = 'model-card-thinking-toggle';
      thinkingToggle.checked = model.thinkingEnabled || false;
      thinkingToggle.title = t('panels.settings.ai.thinkingMode') || '思考模式';
      thinkingLabel.appendChild(thinkingToggle);

      const thinkingLabelText = document.createElement('span');
      thinkingLabelText.className = 'model-card-thinking-label-text';
      thinkingLabelText.textContent = t('panels.settings.ai.thinkingMode') || '思考模式';
      thinkingLabel.appendChild(thinkingLabelText);

      thinkingRow.appendChild(thinkingLabel);

      const thinkingBudgetSelect = document.createElement('select');
      thinkingBudgetSelect.className = 'model-card-thinking-budget';
      thinkingBudgetSelect.style.display = model.thinkingEnabled ? 'inline-block' : 'none';
      thinkingBudgetSelect.title = t('panels.settings.ai.thinkingBudget') || '思考预算';

      const budgetOptions = [
        { value: 'low', label: t('panels.settings.ai.thinkingBudget.low') || 'Low (1K)' },
        { value: 'medium', label: t('panels.settings.ai.thinkingBudget.medium') || 'Medium (4K)' },
        { value: 'high', label: t('panels.settings.ai.thinkingBudget.high') || 'High (8K)' },
        {
          value: 'extraHigh',
          label: t('panels.settings.ai.thinkingBudget.extraHigh') || 'XHigh (16K)'
        }
      ];

      budgetOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === (model.thinkingBudget || 'medium')) {
          option.selected = true;
        }
        thinkingBudgetSelect.appendChild(option);
      });

      thinkingRow.appendChild(thinkingBudgetSelect);

      // 思考模式切换事件
      thinkingToggle.addEventListener('change', () => {
        markDirty();
        setModelThinkingConfig(store, model.id, { enabled: thinkingToggle.checked });
        thinkingBudgetSelect.style.display = thinkingToggle.checked ? 'inline-block' : 'none';
      });

      // 思考预算变更事件
      thinkingBudgetSelect.addEventListener('change', () => {
        markDirty();
        setModelThinkingConfig(store, model.id, { budget: thinkingBudgetSelect.value });
      });

      tag.appendChild(thinkingRow);

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
    if (
      !aiModelRefreshBtn ||
      !aiModelListSelect ||
      !aiEndpointInput ||
      !aiApiKeyInput ||
      !aiRequestTypeSelect
    )
      return;

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
      markDirty();
      store.set('settings.aiEndpoint', aiEndpointInput.value);
      if (aiModelListSelect) {
        updateAiModelOptions([]);
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    });
  }

  if (aiApiKeyInput) {
    aiApiKeyInput.addEventListener('change', () => {
      markDirty();
      store.set('settings.aiApiKey', aiApiKeyInput.value);
      if (aiModelListSelect) {
        updateAiModelOptions([]);
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    });
  }

  if (aiRequestTypeSelect) {
    aiRequestTypeSelect.addEventListener('change', () => {
      markDirty();
      store.set('settings.aiRequestType', aiRequestTypeSelect.value);
      if (aiModelListSelect) {
        updateAiModelOptions([]);
        setAiModelStatus(t('panels.settings.ai.waitingFetch'), '');
      }
    });
  }

  if (aiModelIdInput) {
    aiModelIdInput.addEventListener('change', () => {
      markDirty();
      store.set('settings.aiModelId', aiModelIdInput.value);
      syncAiModelSelection();
    });
  }

  if (aiProfileNameInput) {
    aiProfileNameInput.addEventListener('change', () => {
      markDirty();
    });
  }

  if (aiProfileSelect) {
    aiProfileSelect.addEventListener('change', () => {
      if (!store) return;

      const fromId = lastProfileId || getActiveProfileId();
      try {
        saveCurrentProfileIfNeeded(fromId);
      } catch (err) {
        if (err && err.message === 'CANCEL_SWITCH') {
          if (fromId) {
            aiProfileSelect.value = fromId;
          }
          return;
        }
        throw err;
      }

      const profiles = getAiProfiles(store);
      const id = aiProfileSelect.value;
      const profile = profiles.find(p => p.id === id);
      if (!profile) return;
      store.set('settings.activeAiProfileId', id);
      fillUiFromProfile(profile);
    });
  }

  if (aiProfileAddBtn) {
    aiProfileAddBtn.addEventListener('click', () => {
      if (!store) return;

      const fromId = lastProfileId || getActiveProfileId();
      try {
        saveCurrentProfileIfNeeded(fromId);
      } catch (err) {
        if (err && err.message === 'CANCEL_SWITCH') {
          return;
        }
        throw err;
      }

      const profile = addAiProfile(store);
      const profiles = getAiProfiles(store);
      renderProfilesSelect(profiles, profile?.id);
      if (profile) {
        fillUiFromProfile(profile);
      }
    });
  }

  if (aiProfileDeleteBtn) {
    aiProfileDeleteBtn.addEventListener('click', () => {
      if (!store) return;

      // 删除前检查是否有未保存修改
      const fromId = lastProfileId || getActiveProfileId();
      if (isDirty && fromId) {
        let confirmed;
        try {
          confirmed = window.confirm('当前配置有未保存的修改，是否保存后再删除？');
        } catch {
          confirmed = true;
        }
        if (confirmed) {
          const uiProfile = readProfileFromUi(fromId);
          const profiles = getAiProfiles(store);
          const currentName = profiles.find(p => p.id === fromId)?.name;
          if (!uiProfile.name) {
            uiProfile.name = currentName || '配置';
          }
          upsertAiProfile(store, uiProfile);
          resetDirty(fromId);
        } else {
          // 用户选择不保存，继续删除
        }
      }

      const profiles = getAiProfiles(store);
      if (profiles.length <= 1) {
        try {
          window.alert('至少需要保留一个配置');
        } catch {
          // ignore
        }
        return;
      }

      const currentId = aiProfileSelect ? aiProfileSelect.value : getActiveProfileId();
      if (!currentId) return;

      const currentProfile = profiles.find(p => p.id === currentId);
      const profileName = currentProfile?.name || '配置';

      let confirmed;
      try {
        confirmed = window.confirm(`确定要删除配置「${profileName}」吗？`);
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;

      const removed = deleteAiProfile(store, currentId);
      if (!removed) return;

      // 删除后重新加载
      const nextProfiles = getAiProfiles(store);
      const newActiveId = store.get('settings.activeAiProfileId', nextProfiles[0]?.id);
      renderProfilesSelect(nextProfiles, newActiveId);

      const newActive = nextProfiles.find(p => p.id === newActiveId) || nextProfiles[0];
      if (newActive) {
        fillUiFromProfile(newActive);
      }

      try {
        window.dispatchEvent(
          new CustomEvent('ai-profile-applied', { detail: { profileId: newActiveId } })
        );
      } catch {
        // ignore
      }

      resetDirty(newActiveId);
    });
  }

  if (aiProfileApplyBtn) {
    aiProfileApplyBtn.addEventListener('click', () => {
      if (!store) return;
      const activeId = aiProfileSelect ? aiProfileSelect.value : getActiveProfileId();
      if (!activeId) return;

      const uiProfile = readProfileFromUi(activeId);
      const profiles = getAiProfiles(store);
      const currentName = profiles.find(p => p.id === activeId)?.name;
      if (!uiProfile.name) {
        uiProfile.name = currentName || '配置';
      }
      upsertAiProfile(store, uiProfile);
      const applied = applyAiProfile(store, activeId);
      if (!applied) return;

      if (aiProfileSelect) {
        const nextProfiles = getAiProfiles(store);
        renderProfilesSelect(nextProfiles, activeId);
      }

      if (aiModelIdInput) {
        aiModelIdInput.value = store.get('settings.aiModelId', 'gpt-3.5-turbo');
      }
      if (aiEndpointInput) {
        aiEndpointInput.value = store.get('settings.aiEndpoint', '');
      }
      if (aiApiKeyInput) {
        aiApiKeyInput.value = store.get('settings.aiApiKey', '');
      }
      if (aiRequestTypeSelect) {
        aiRequestTypeSelect.value = store.get('settings.aiRequestType', 'openai-chat');
      }

      renderCandidateModels();

      try {
        window.dispatchEvent(
          new CustomEvent('ai-profile-applied', { detail: { profileId: activeId } })
        );
      } catch {
        // ignore
      }

      resetDirty(activeId);
    });
  }

  if (aiModelListSelect) {
    aiModelListSelect.addEventListener('change', () => {
      const value = aiModelListSelect.value;
      if (!value) return;
      if (aiModelIdInput) {
        aiModelIdInput.value = value;
      }
      markDirty();
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
      markDirty();
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
      markDirty();
      setCandidateModels(models);
    });
  }

  if (aiModelCandidateClearBtn) {
    aiModelCandidateClearBtn.addEventListener('click', () => {
      markDirty();
      setCandidateModels([]);
    });
  }

  // 上下文大小：input 实时保存，change 校验修正
  if (aiContextSizeInput) {
    aiContextSizeInput.addEventListener('input', () => {
      const val = parseInt(aiContextSizeInput.value);
      if (val && val >= 1024) {
        markDirty();
        store.set('settings.aiContextSize', val);
      }
    });
    aiContextSizeInput.addEventListener('change', () => {
      const val = parseInt(aiContextSizeInput.value);
      if (val && val >= 1024) {
        aiContextSizeInput.value = val;
        markDirty();
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
    renderCandidateModels,
    initAiProfilesUi
  };
}

module.exports = { bindAiSettingsEvents };
