'use strict';

(function passwordInject() {
  if (window.__byteiqPasswordInjected) return;
  window.__byteiqPasswordInjected = true;

  const DETECTION_DELAY = 500;

  function getHostname() {
    try {
      return window.location.hostname || '';
    } catch {
      return '';
    }
  }

  function isSecurePage() {
    try {
      const protocol = window.location.protocol;
      return (
        protocol === 'https:' || (protocol === 'http:' && window.location.hostname === 'localhost')
      );
    } catch {
      return false;
    }
  }

  function detectLoginForm() {
    const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(
      el => el.offsetParent !== null
    );

    if (passwordInputs.length === 0) return null;

    const passwordInput = passwordInputs[0];
    const form = passwordInput.closest('form');

    let usernameInput = null;

    if (form) {
      usernameInput =
        form.querySelector('input[type="email"]') ||
        form.querySelector('input[name*="user"]') ||
        form.querySelector('input[name*="email"]') ||
        form.querySelector('input[name*="login"]') ||
        form.querySelector('input[type="text"]:not([name*="search"]):not([name*="query"])');
    }

    if (!usernameInput) {
      usernameInput =
        document.querySelector('input[type="email"]') ||
        document.querySelector('input[name*="user"]') ||
        document.querySelector('input[name*="email"]') ||
        document.querySelector('input[name*="login"]');
    }

    if (!usernameInput && form) {
      const textInputs = form.querySelectorAll('input[type="text"]');
      if (textInputs.length > 0) {
        usernameInput = textInputs[0];
      }
    }

    return {
      form,
      usernameInput,
      passwordInput
    };
  }

  function fillField(element, value) {
    if (!element || !value) return;
    element.focus();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function tryAutofill() {
    const hostname = getHostname();
    if (!hostname) return;

    if (!window.byteiqPassword) {
      return;
    }

    try {
      const result = await window.byteiqPassword.requestPasswordFill(hostname);

      if (!result.success || !result.entries || result.entries.length === 0) {
        return;
      }

      const loginForm = detectLoginForm();
      if (!loginForm || !loginForm.passwordInput) return;

      const entry = result.entries[0];

      showFillBar(entry, loginForm);
    } catch (error) {
      console.error('[password-inject] autofill error:', error.message);
    }
  }

  function createShadowContainer(id, positionStyle) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = id;
    host.style.cssText = positionStyle;
    const shadow = host.attachShadow({ mode: 'closed' });
    document.body.appendChild(host);
    return { host, shadow };
  }

  const BAR_STYLE = [
    'background: #1a73e8',
    'color: white',
    'padding: 8px 16px',
    'font-size: 14px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'display: flex',
    'align-items: center',
    'justify-content: space-between'
  ].join(';');

  const FILL_BTN_STYLE = [
    'background: white',
    'color: #1a73e8',
    'border: none',
    'padding: 4px 12px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 13px',
    'font-weight: 600'
  ].join(';');

  const DISMISS_BTN_STYLE = [
    'background: transparent',
    'color: white',
    'border: none',
    'padding: 4px 8px',
    'cursor: pointer',
    'font-size: 16px'
  ].join(';');

  function showFillBar(entry, loginForm) {
    const { host, shadow } = createShadowContainer(
      'byteiq-fill-bar',
      'position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;'
    );

    const bar = document.createElement('div');
    bar.style.cssText = BAR_STYLE + ';box-shadow: 0 2px 8px rgba(0,0,0,0.3);';

    const text = document.createElement('span');
    text.textContent = `Byteiq: ${entry.username}`;

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';

    const fillBtn = document.createElement('button');
    fillBtn.textContent = 'Fill';
    fillBtn.style.cssText = FILL_BTN_STYLE;
    fillBtn.addEventListener('click', () => {
      if (loginForm.usernameInput) {
        fillField(loginForm.usernameInput, entry.username);
      }
      fillField(loginForm.passwordInput, entry.password);
      host.remove();
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '\u2715';
    dismissBtn.style.cssText = DISMISS_BTN_STYLE;
    dismissBtn.addEventListener('click', () => {
      host.remove();
    });

    btnGroup.appendChild(fillBtn);
    btnGroup.appendChild(dismissBtn);
    bar.appendChild(text);
    bar.appendChild(btnGroup);
    shadow.appendChild(bar);

    setTimeout(() => {
      if (host.parentNode) host.remove();
    }, 10000);
  }

  function watchForFormSubmission() {
    if (!isSecurePage()) return;

    document.addEventListener(
      'submit',
      () => {
        const loginForm = detectLoginForm();
        if (!loginForm || !loginForm.passwordInput) return;

        const hostname = getHostname();
        const username = loginForm.usernameInput ? loginForm.usernameInput.value : '';
        const password = loginForm.passwordInput.value;

        if (!username || !password) return;

        if (window.byteiqPassword) {
          showSaveBar(hostname, username);
        }
      },
      true
    );
  }

  function showSaveBar(hostname, _username) {
    const { host, shadow } = createShadowContainer(
      'byteiq-save-bar',
      'position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483647;'
    );

    const bar = document.createElement('div');
    bar.style.cssText = BAR_STYLE + ';box-shadow: 0 -2px 8px rgba(0,0,0,0.3);';

    const text = document.createElement('span');
    text.textContent = `Save password for ${hostname}?`;

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = FILL_BTN_STYLE;
    saveBtn.addEventListener('click', async () => {
      const loginForm = detectLoginForm();
      if (!loginForm) {
        host.remove();
        return;
      }

      const pw = loginForm.passwordInput ? loginForm.passwordInput.value : '';
      const un = loginForm.usernameInput ? loginForm.usernameInput.value : '';

      if (window.byteiqPassword && un && pw) {
        try {
          await window.byteiqPassword.requestPasswordSave(hostname, un, pw);
        } catch (error) {
          console.error('[password-inject] save error:', error.message);
        }
      }
      host.remove();
    });

    const neverBtn = document.createElement('button');
    neverBtn.textContent = 'Never';
    neverBtn.style.cssText = [
      'background: rgba(255,255,255,0.2)',
      'color: white',
      'border: none',
      'padding: 4px 12px',
      'border-radius: 4px',
      'cursor: pointer',
      'font-size: 13px'
    ].join(';');
    neverBtn.addEventListener('click', () => {
      host.remove();
    });

    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(neverBtn);
    bar.appendChild(text);
    bar.appendChild(btnGroup);
    shadow.appendChild(bar);

    setTimeout(() => {
      if (host.parentNode) host.remove();
    }, 30000);
  }

  function init() {
    setTimeout(() => {
      tryAutofill();
      watchForFormSubmission();
    }, DETECTION_DELAY);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
