/**
 * AI工具栏管理 - 处理模式选择、模型选择、文件上传等功能
 */

function createAiToolbar(options) {
  const { documentRef, getCurrentMode, setCurrentMode, showToast, store, onFilesSelected } =
    options;

  // 获取UI元素
  const modeBtn = documentRef.getElementById('ai-mode-btn');
  const modeLabel = documentRef.getElementById('ai-mode-label');
  const modeMenu = documentRef.getElementById('ai-mode-menu');

  const modelBtn = documentRef.getElementById('ai-model-btn');
  const modelLabel = documentRef.getElementById('ai-model-label');
  const modelMenu = documentRef.getElementById('ai-model-menu');
  const modelList = documentRef.getElementById('ai-model-list');

  const uploadBtn = documentRef.getElementById('ai-upload-btn');
  const fileInput = documentRef.getElementById('ai-file-input');

  const {
    getCandidateModelList,
    getModelThinkingConfig,
    setModelThinkingConfig,
    THINKING_BUDGETS
  } = require('../context/ai-model-context-config');

  function getStoredCandidateModels() {
    return getCandidateModelList(store);
  }

  function getStoredCurrentModel() {
    return store ? store.get('settings.aiModelId', '') : '';
  }

  /**
   * 初始化模式选择
   */
  function initModeSelector() {
    if (!modeBtn || !modeMenu) return;

    // 模式按钮点击
    modeBtn.addEventListener('click', e => {
      e.stopPropagation();
      // 关闭其他菜单
      closeAllMenus();
      toggleMenu(modeMenu);
    });

    // 模式菜单项点击
    const modeItems = modeMenu.querySelectorAll('.ai-menu-item');
    modeItems.forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const mode = item.dataset.mode;
        switchMode(mode);
        closeAllMenus();
      });
    });

    updateModeButton();
  }

  /**
   * 初始化模型选择
   */
  function initModelSelector() {
    if (!modelBtn || !modelMenu) return;

    // 模型按钮点击
    modelBtn.addEventListener('click', e => {
      e.stopPropagation();
      // 关闭其他菜单
      closeAllMenus();
      loadModelList();
      toggleMenu(modelMenu);
    });

    // 设置按钮
    const settingsBtn = modelMenu.querySelector('.ai-menu-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', e => {
        e.stopPropagation();
        openModelSettings();
      });
    }

    updateModelButton();
  }

  /**
   * 初始化文件上传
   */
  function initFileUpload() {
    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      if (typeof onFilesSelected === 'function') {
        onFilesSelected(files);
      }
      if (showToast) {
        showToast(`已选择 ${files.length} 个文件`, 'info');
      }

      // 清空输入
      fileInput.value = '';
    });
  }

  /**
   * 切换菜单显示
   */
  function toggleMenu(menu) {
    if (!menu) return;
    const isVisible = menu.style.display !== 'none';
    menu.style.display = isVisible ? 'none' : 'block';
  }

  /**
   * 关闭所有菜单
   */
  function closeAllMenus() {
    if (modeMenu) modeMenu.style.display = 'none';
    if (modelMenu) modelMenu.style.display = 'none';
  }

  /**
   * 切换模式
   */
  function switchMode(mode) {
    if (!['ask', 'agent'].includes(mode)) return;

    if (typeof setCurrentMode === 'function') {
      setCurrentMode(mode);
    }

    updateModeButton();
  }

  /**
   * 更新模式按钮显示
   */
  function updateModeButton() {
    if (!modeLabel) return;
    const mode = typeof getCurrentMode === 'function' ? getCurrentMode() : 'ask';
    modeLabel.textContent = mode === 'ask' ? 'Ask' : 'Agent';

    // 更新菜单项的 active 状态
    if (modeMenu) {
      const items = modeMenu.querySelectorAll('.ai-menu-item');
      items.forEach(item => {
        if (item.dataset.mode === mode) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    // 更新图标：ask=聊天气泡，agent=机器人
    if (modeBtn) {
      const svgEl = modeBtn.querySelector('svg');
      if (svgEl) {
        if (mode === 'ask') {
          svgEl.innerHTML =
            '<path fill="currentColor" d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H5.17L4,17.17V4H20V16Z"/>';
        } else {
          svgEl.innerHTML =
            '<path fill="currentColor" d="M12,2A2,2 0 0,1 14,4C14,4.74 13.6,5.39 13,5.73V7H14A7,7 0 0,1 21,14H22A1,1 0 0,1 23,15V18A1,1 0 0,1 22,19H21V20A2,2 0 0,1 19,22H5A2,2 0 0,1 3,20V19H2A1,1 0 0,1 1,18V15A1,1 0 0,1 2,14H3A7,7 0 0,1 10,7H11V5.73C10.4,5.39 10,4.74 10,4A2,2 0 0,1 12,2M7.5,13A1.5,1.5 0 0,0 6,14.5A1.5,1.5 0 0,0 7.5,16A1.5,1.5 0 0,0 9,14.5A1.5,1.5 0 0,0 7.5,13M16.5,13A1.5,1.5 0 0,0 15,14.5A1.5,1.5 0 0,0 16.5,16A1.5,1.5 0 0,0 18,14.5A1.5,1.5 0 0,0 16.5,13Z"/>';
        }
      }
    }
  }

  function updateModelButton() {
    if (!modelLabel) return;
    const model = getStoredCurrentModel();
    modelLabel.textContent = model || 'Model';
  }

  /**
   * 加载模型列表
   */
  function loadModelList() {
    if (!modelList || !store) return;

    modelList.innerHTML = '';

    const models = getStoredCandidateModels();
    const currentModel = getStoredCurrentModel();

    models.forEach(model => {
      const itemWrapper = documentRef.createElement('div');
      itemWrapper.className = 'ai-model-item-wrapper';

      const btn = documentRef.createElement('button');
      btn.className = 'ai-model-item';
      btn.textContent = model.id;

      if (model.id === currentModel) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', e => {
        e.stopPropagation();
        selectModel(model.id);
        closeAllMenus();
      });

      itemWrapper.appendChild(btn);

      // 添加思考等级展开按钮
      const expandBtn = documentRef.createElement('button');
      expandBtn.className = 'ai-model-thinking-expand';
      expandBtn.innerHTML = '›';
      expandBtn.title = '思考等级设置';
      expandBtn.addEventListener('click', e => {
        e.stopPropagation();
        showThinkingSubmenu(model.id, itemWrapper);
      });

      itemWrapper.appendChild(expandBtn);

      modelList.appendChild(itemWrapper);
    });
  }

  /**
   * 显示思考等级子菜单
   */
  function showThinkingSubmenu(modelId, parentElement) {
    // 移除已有的子菜单
    const existingSubmenu = documentRef.querySelector('.ai-thinking-submenu');
    if (existingSubmenu) {
      existingSubmenu.remove();
    }

    const thinkingConfig = getModelThinkingConfig(store, modelId);

    const submenu = documentRef.createElement('div');
    submenu.className = 'ai-thinking-submenu';

    const budgetOptions = [
      { value: 'disabled', label: 'Disabled', tokens: 0 },
      { value: 'low', label: 'Low (1K)', tokens: THINKING_BUDGETS.low },
      { value: 'medium', label: 'Medium (4K)', tokens: THINKING_BUDGETS.medium },
      { value: 'high', label: 'High (8K)', tokens: THINKING_BUDGETS.high },
      { value: 'extraHigh', label: 'XHigh (16K)', tokens: THINKING_BUDGETS.extraHigh }
    ];

    budgetOptions.forEach(opt => {
      const optBtn = documentRef.createElement('button');
      optBtn.className = 'ai-thinking-option';
      optBtn.textContent = opt.label;

      // 当前选中的等级
      if (opt.value === 'disabled' && !thinkingConfig.enabled) {
        optBtn.classList.add('active');
      } else if (thinkingConfig.enabled && opt.value === thinkingConfig.budget) {
        optBtn.classList.add('active');
      }

      optBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (opt.value === 'disabled') {
          setModelThinkingConfig(store, modelId, { enabled: false });
        } else {
          setModelThinkingConfig(store, modelId, { enabled: true, budget: opt.value });
        }
        submenu.remove();
        // 刷新模型列表显示
        loadModelList();
        if (showToast) {
          const budgetLabel = opt.value === 'disabled' ? '已禁用' : opt.label;
          showToast(`${modelId} 思考等级: ${budgetLabel}`, 'info');
        }
      });

      submenu.appendChild(optBtn);
    });

    parentElement.appendChild(submenu);

    // 点击其他区域关闭子菜单
    setTimeout(() => {
      const closeHandler = e => {
        if (!submenu.contains(e.target)) {
          submenu.remove();
          documentRef.removeEventListener('click', closeHandler);
        }
      };
      documentRef.addEventListener('click', closeHandler);
    }, 0);
  }

  /**
   * 选择模型
   */
  function selectModel(modelId) {
    if (store) {
      store.set('settings.aiModelId', modelId);
    }

    loadModelList();
    updateModelButton();
  }

  /**
   * 打开模型设置
   */
  function openModelSettings() {
    const settingsBtn = documentRef.getElementById('settings-btn');
    if (settingsBtn && typeof settingsBtn.click === 'function') {
      settingsBtn.click();
      return;
    }
    if (showToast) {
      showToast('请在设置中配置模型候选列表', 'info');
    }
  }

  /**
   * 绑定全局点击事件来关闭菜单
   */
  function bindGlobalEvents() {
    documentRef.addEventListener('click', e => {
      // 检查点击是否在菜单或按钮内
      const isClickInMenu = modeMenu && modeMenu.contains(e.target);
      const isClickInBtn = modeBtn && modeBtn.contains(e.target);
      const isClickInModelMenu = modelMenu && modelMenu.contains(e.target);
      const isClickInModelBtn = modelBtn && modelBtn.contains(e.target);

      if (!isClickInMenu && !isClickInBtn && !isClickInModelMenu && !isClickInModelBtn) {
        closeAllMenus();
      }
    });

    window.addEventListener('ai-profile-applied', () => {
      updateModelButton();
      if (modelMenu && modelMenu.style.display !== 'none') {
        loadModelList();
      }
    });
  }

  /**
   * 初始化所有功能
   */
  function init() {
    initModeSelector();
    initModelSelector();
    initFileUpload();
    bindGlobalEvents();
    updateModeButton();
    updateModelButton();
  }

  return {
    init,
    switchMode,
    selectModel,
    closeAllMenus
  };
}

module.exports = {
  createAiToolbar
};
