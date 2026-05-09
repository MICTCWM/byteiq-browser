'use strict';

function createPasswordUiManager(options) {
  const {
    ipcRenderer,
    store,
    t,
    showToast,
    modalManager,
    passwordEnabledToggle,
    passwordAutofillToggle,
    passwordAvailabilityStatus,
    passwordList,
    passwordListEmpty
  } = options;

  let isAvailable = false;
  const revealTimers = new Map();

  async function checkAvailability() {
    try {
      const result = await ipcRenderer.invoke('password-manager:check-availability');
      isAvailable = result.available;

      if (!isAvailable && passwordAvailabilityStatus) {
        passwordAvailabilityStatus.textContent =
          result.reason || t('panels.settings.passwordUnavailable') || '密码管理不可用';
        passwordAvailabilityStatus.style.display = 'block';
        passwordAvailabilityStatus.classList.add('unavailable');
      } else if (passwordAvailabilityStatus) {
        passwordAvailabilityStatus.style.display = 'none';
      }

      if (passwordEnabledToggle) {
        passwordEnabledToggle.disabled = !isAvailable;
      }
      if (passwordAutofillToggle) {
        passwordAutofillToggle.disabled = !isAvailable;
      }

      return isAvailable;
    } catch (error) {
      console.error('[password-ui] checkAvailability error:', error.message);
      isAvailable = false;
      return false;
    }
  }

  async function loadPasswordList() {
    if (!isAvailable) return;

    try {
      const result = await ipcRenderer.invoke('password-manager:list-all');

      if (!result.success) {
        if (passwordListEmpty) {
          passwordListEmpty.textContent =
            result.reason || t('panels.settings.passwordLoadFailed') || '加载密码列表失败';
          passwordListEmpty.style.display = 'block';
        }
        return;
      }

      const entries = result.entries || [];

      if (entries.length === 0) {
        if (passwordListEmpty) {
          passwordListEmpty.textContent =
            t('panels.settings.noSavedPasswords') || '暂无已保存的密码';
          passwordListEmpty.style.display = 'block';
        }
        if (passwordList) passwordList.innerHTML = '';
        return;
      }

      if (passwordListEmpty) passwordListEmpty.style.display = 'none';

      if (passwordList) {
        passwordList.innerHTML = '';
        entries.forEach(entry => {
          const item = createPasswordItem(entry);
          if (item) passwordList.appendChild(item);
        });
      }
    } catch (error) {
      console.error('[password-ui] loadPasswordList error:', error.message);
    }
  }

  function createPasswordItem(entry) {
    const item = document.createElement('div');
    item.className = 'password-item';
    item.setAttribute('role', 'listitem');
    item.dataset.id = entry.id;

    const info = document.createElement('div');
    info.className = 'password-item-info';

    const hostname = document.createElement('div');
    hostname.className = 'password-item-hostname';
    hostname.textContent = entry.hostname;

    const username = document.createElement('div');
    username.className = 'password-item-username';
    username.textContent = entry.username;

    info.appendChild(hostname);
    info.appendChild(username);

    const actions = document.createElement('div');
    actions.className = 'password-item-actions';

    const revealBtn = document.createElement('button');
    revealBtn.className = 'password-item-btn reveal-btn';
    revealBtn.textContent = t('panels.settings.passwordShow') || '显示';
    revealBtn.title = t('panels.settings.passwordShowTitle') || '显示密码';
    revealBtn.addEventListener('click', () => handleReveal(entry.id, revealBtn));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'password-item-btn delete-btn';
    deleteBtn.textContent = t('panels.settings.passwordDelete') || '删除';
    deleteBtn.title = t('panels.settings.passwordDeleteTitle') || '删除密码';
    deleteBtn.addEventListener('click', () =>
      handleDelete(entry.id, entry.hostname, entry.username)
    );

    actions.appendChild(revealBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);

    return item;
  }

  async function handleReveal(id, btn) {
    try {
      const result = await ipcRenderer.invoke('password-manager:reveal', { id });

      if (!result.success) {
        showToast(
          result.reason || t('panels.settings.passwordRevealFailed') || '显示密码失败',
          'error'
        );
        return;
      }

      const originalText = btn.textContent;
      btn.textContent = result.password;
      btn.classList.add('revealed');

      if (revealTimers.has(id)) {
        clearTimeout(revealTimers.get(id));
      }

      const timer = setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('revealed');
        revealTimers.delete(id);
      }, 5000);

      revealTimers.set(id, timer);
    } catch (error) {
      console.error('[password-ui] handleReveal error:', error.message);
      showToast(t('panels.settings.passwordRevealFailed') || '显示密码失败', 'error');
    }
  }

  async function handleDelete(id, hostname, _username) {
    const message =
      t('panels.settings.passwordDeleteConfirm') || `确定要删除 ${hostname} 的密码吗？`;
    const confirmed = await modalManager.confirmDelete(message);

    if (!confirmed) return;

    try {
      const result = await ipcRenderer.invoke('password-manager:delete', { id });

      if (result.success) {
        showToast(t('panels.settings.passwordDeleted') || '密码已删除', 'success');
        loadPasswordList();
      } else {
        showToast(
          result.reason || t('panels.settings.passwordDeleteFailed') || '删除密码失败',
          'error'
        );
      }
    } catch (error) {
      console.error('[password-ui] handleDelete error:', error.message);
      showToast(t('panels.settings.passwordDeleteFailed') || '删除密码失败', 'error');
    }
  }

  function bindEvents() {
    if (passwordEnabledToggle) {
      const enabled = store.get('settings.passwordEnabled', false);
      passwordEnabledToggle.checked = enabled && isAvailable;

      passwordEnabledToggle.addEventListener('change', () => {
        store.set('settings.passwordEnabled', passwordEnabledToggle.checked);
        if (passwordAutofillToggle && !passwordEnabledToggle.checked) {
          passwordAutofillToggle.checked = false;
          store.set('settings.passwordAutofill', false);
        }
      });
    }

    if (passwordAutofillToggle) {
      const autofill = store.get('settings.passwordAutofill', false);
      passwordAutofillToggle.checked = autofill && isAvailable;

      passwordAutofillToggle.addEventListener('change', () => {
        store.set('settings.passwordAutofill', passwordAutofillToggle.checked);
      });
    }
  }

  async function init() {
    await checkAvailability();
    bindEvents();
    if (isAvailable) {
      await loadPasswordList();
    }
  }

  function destroy() {
    revealTimers.forEach(timer => clearTimeout(timer));
    revealTimers.clear();
  }

  return {
    init,
    destroy,
    loadPasswordList,
    checkAvailability,
    isPasswordEnabled: () => store.get('settings.passwordEnabled', false),
    isAutofillEnabled: () => store.get('settings.passwordAutofill', false),
    isAvailable: () => isAvailable
  };
}

module.exports = { createPasswordUiManager };
