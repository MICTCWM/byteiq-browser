/**
 * 后台任务通知弹窗
 * 任务完成时在右下角显示可点击的通知
 */

/**
 * 创建后台任务通知组件
 * @param {Object} options - 依赖注入
 * @returns {Object} 通知组件实例
 */
function createBgTaskNotification(options = {}) {
  const { documentRef, onNotificationClick, t } = options;

  let notificationContainer = null;

  /**
   * 初始化通知容器
   */
  function init() {
    notificationContainer = documentRef.getElementById('bg-notification-container');
    if (!notificationContainer) {
      // 如果容器不存在，创建它
      notificationContainer = documentRef.createElement('div');
      notificationContainer.id = 'bg-notification-container';
      notificationContainer.className = 'bg-notification-container';
      documentRef.body.appendChild(notificationContainer);
    }
  }

  /**
   * 显示任务完成通知
   * @param {Object} task - 任务对象
   */
  function showTaskCompleteNotification(task) {
    if (!notificationContainer) init();
    if (!notificationContainer) return;

    const notification = documentRef.createElement('div');
    notification.className = 'bg-notification bg-notification-success';

    // 图标
    const icon = documentRef.createElement('span');
    icon.className = 'bg-notification-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18">' +
      '<path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>' +
      '</svg>';

    // 内容
    const content = documentRef.createElement('div');
    content.className = 'bg-notification-content';

    const title = documentRef.createElement('div');
    title.className = 'bg-notification-title';
    title.textContent = t('ai.bgTaskCompleted') || '后台任务已完成';

    const preview = documentRef.createElement('div');
    preview.className = 'bg-notification-preview';
    const previewText = task.result
      ? task.result
          .replace(/<[^>]*>/g, '')
          .replace(/\n/g, ' ')
          .trim()
          .slice(0, 60)
      : '';
    preview.textContent = previewText
      ? `${task.name}: ${previewText}${task.result.length > 60 ? '...' : ''}`
      : task.name;

    content.appendChild(title);
    content.appendChild(preview);

    // 关闭按钮
    const closeBtn = documentRef.createElement('button');
    closeBtn.className = 'bg-notification-close';
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14">' +
      '<path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>' +
      '</svg>';
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      dismissNotification(notification);
    });

    notification.appendChild(icon);
    notification.appendChild(content);
    notification.appendChild(closeBtn);

    // 点击通知跳转到任务面板
    notification.addEventListener('click', () => {
      dismissNotification(notification);
      if (typeof onNotificationClick === 'function') {
        onNotificationClick(task);
      }
    });

    notificationContainer.appendChild(notification);

    // 入场动画
    requestAnimationFrame(() => {
      notification.classList.add('bg-notification-enter');
    });

    // 自动消失（8秒）
    setTimeout(() => {
      dismissNotification(notification);
    }, 8000);
  }

  /**
   * 显示任务失败通知
   * @param {Object} task - 任务对象
   * @param {string} error - 错误信息
   */
  function showTaskErrorNotification(task, error) {
    if (!notificationContainer) init();
    if (!notificationContainer) return;

    const notification = documentRef.createElement('div');
    notification.className = 'bg-notification bg-notification-error';

    const icon = documentRef.createElement('span');
    icon.className = 'bg-notification-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18">' +
      '<path fill="currentColor" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12' +
      'A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>' +
      '</svg>';

    const content = documentRef.createElement('div');
    content.className = 'bg-notification-content';

    const title = documentRef.createElement('div');
    title.className = 'bg-notification-title';
    title.textContent = t('ai.bgTaskFailed') || '后台任务执行失败';

    const preview = documentRef.createElement('div');
    preview.className = 'bg-notification-preview';
    preview.textContent = `${task.name}: ${error || '未知错误'}`;

    content.appendChild(title);
    content.appendChild(preview);

    const closeBtn = documentRef.createElement('button');
    closeBtn.className = 'bg-notification-close';
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14">' +
      '<path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>' +
      '</svg>';
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      dismissNotification(notification);
    });

    notification.appendChild(icon);
    notification.appendChild(content);
    notification.appendChild(closeBtn);

    notification.addEventListener('click', () => {
      dismissNotification(notification);
      if (typeof onNotificationClick === 'function') {
        onNotificationClick(task);
      }
    });

    notificationContainer.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add('bg-notification-enter');
    });

    setTimeout(() => {
      dismissNotification(notification);
    }, 8000);
  }

  /**
   * 关闭通知
   */
  function dismissNotification(notification) {
    if (!notification || !notification.parentNode) return;
    notification.classList.add('bg-notification-exit');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }

  return {
    init,
    showTaskCompleteNotification,
    showTaskErrorNotification
  };
}

module.exports = {
  createBgTaskNotification
};
