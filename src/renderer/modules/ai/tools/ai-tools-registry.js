/**
 * AI 工具注册表
 * 统一工具定义（schema + 执行）以减少重复与漂移
 * 工具定义拆分至：ai-tools-defs-web / ai-tools-defs-todo
 */

const { webToolDefs } = require('./ai-tools-defs-web');
const { todoAndSessionDefs } = require('./ai-tools-defs-todo');

function getAiToolDefinitions(_store) {
  return [...webToolDefs, ...todoAndSessionDefs];
}

// OpenAI Tool API 支持的标准 JSON Schema 属性
const ALLOWED_SCHEMA_PROPS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'description',
  'anyOf',
  'oneOf',
  'allOf',
  'const'
]);

/**
 * 递归清理参数 schema，移除非 OpenAI 标准属性（如 maxLength）
 * 部分模型服务端（如 vLLM）的 Jinja2 模板引擎无法处理这些属性，导致 500 错误
 *
 * 关键：properties 对象的子键是属性名（如 tab_id、selector），必须全部保留；
 * 只有属性值（子 schema）才需要递归清理非标准字段。
 */
function sanitizeParameters(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema;

  const cleaned = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      // properties 的子键是属性名（如 tab_id、selector），必须全部保留
      // 只递归清理每个属性的值（子 schema）
      const sanitizedProps = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        sanitizedProps[propName] = sanitizeParameters(propSchema);
      }
      cleaned[key] = sanitizedProps;
    } else if (ALLOWED_SCHEMA_PROPS.has(key)) {
      cleaned[key] = sanitizeParameters(value);
    }
    // else: 非标准 key（如 maxLength），跳过
  }
  return cleaned;
}

function buildToolSchema(def) {
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: sanitizeParameters(def.parameters)
    }
  };
}

function getAiToolsSchema(store) {
  return getAiToolDefinitions(store).map(buildToolSchema);
}

function getAiToolByName(name, store) {
  return getAiToolDefinitions(store).find(def => def.name === name) || null;
}

function buildToolsSystemPrompt(store) {
  const defs = getAiToolDefinitions(store);
  if (defs.length === 0) return '';

  const lines = [
    '你可以使用以下工具来完成任务。',
    '当需要调用工具时：只输出 <invoke>...</invoke> 块，不要输出任何额外的外层标签（例如 <minimax:tool_call> 或 </minimax:tool_call>）。',
    '工具调用 XML 格式如下：',
    '<invoke name="工具名">',
    '<parameter name="参数名">参数值</parameter>',
    '</invoke>',
    '',
    '可用工具列表：',
    ''
  ];

  defs.forEach(def => {
    lines.push(`### ${def.name}`);
    lines.push(`${def.description}`);
    if (def.parameters && def.parameters.properties) {
      const props = def.parameters.properties;
      const required = def.parameters.required || [];
      lines.push('参数：');
      for (const [key, schema] of Object.entries(props)) {
        const req = required.includes(key) ? '（必填）' : '（可选）';
        lines.push(
          `- ${key}${req}: ${schema.description || schema.type}${schema.enum ? '，可选值: ' + schema.enum.join('/') : ''}`
        );
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = {
  getAiToolsSchema,
  getAiToolDefinitions,
  getAiToolByName,
  buildToolsSystemPrompt
};
