/**
 * 后台任务模块统一导出
 */

const { createBgTaskManager } = require('./bg-task-manager');
const { createBgTaskRunner } = require('./bg-task-runner');
const { createBgTaskPanelUI } = require('./bg-task-panel-ui');
const { createBgTaskNotification } = require('./bg-task-notification');
const { createBgTaskResumeHandler } = require('./bg-task-resume-handler');

module.exports = {
  createBgTaskManager,
  createBgTaskRunner,
  createBgTaskPanelUI,
  createBgTaskNotification,
  createBgTaskResumeHandler
};
