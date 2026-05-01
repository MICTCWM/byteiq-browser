/**
 * Tests for AI Tools Executor - Argument Type Validation
 */

const { createAiToolsExecutor } = require('../src/renderer/modules/ai/tools/ai-tools-executor');

class MockStore {
  constructor() {
    this.store = {
      'settings.experimentalBatchTodo': true
    };
  }

  get(key, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(this.store, key)) return this.store[key];
    return defaultValue;
  }

  set(key, value) {
    this.store[key] = value;
  }
}

describe('AI Tools Executor - validateToolArgs', () => {
  function createExecutor() {
    const doc = {
      getElementById: () => null
    };

    return createAiToolsExecutor({
      documentRef: doc,
      getActiveTabId: () => null,
      extractPageContent: async () => ({ success: true, content: '' }),
      openTab: null,
      formatUrl: u => u,
      switchTab: null,
      bindTabToSession: async () => ({ success: true }),
      getTodoManager: () => ({
        addTodos: items => ({ success: true, added: items, allTodos: [] })
      }),
      store: new MockStore()
    });
  }

  test('add_todos should accept items as array (schema type=array)', async () => {
    const executor = createExecutor();

    const res = await executor.execute({
      name: 'add_todos',
      arguments: {
        items: [{ title: 'Todo 1', priority: 'medium' }]
      }
    });

    expect(res.success).toBe(true);
  });

  test('add_todos should reject items as string when schema expects array', async () => {
    const executor = createExecutor();

    const res = await executor.execute({
      name: 'add_todos',
      arguments: {
        items: 'Todo 1, Todo 2'
      }
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/items should be array/);
  });
});
