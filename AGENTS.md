# Memory

## Project Overview
Byteiq Browser is a community-driven AI browser built on Electron 28 + Chromium. See @README.md for details and @package.json for commands.

## Tech Stack
- Electron 28 (main + renderer process)
- Vanilla JavaScript (no frontend framework)
- electron-store for persistent settings
- IndexedDB for AI chat history
- Jest for testing
- ESLint + Prettier for code quality

## Code Style Guidelines
- JavaScript, 2-space indent, single quotes, semicolons, max 100 columns (see `.prettierrc`)
- Use `const` by default; `let` only when reassignment is needed; never use `var`
- No `console.log` — use `console.warn` or `console.error` only
- No `eval`, `new Function`, or string-based code execution (security rule)
- Use descriptive variable names; extract complex conditions into named booleans
- Prefer factory functions (`createXxxManager()`) over classes
- Pass dependencies via parameter injection (see `createDownloadsManager({ ipcMain, shell, getMainWindow })`)

## Architecture Notes

### Process Model
- **Main process** (`src/main/`): system APIs, windows, persistence, AI network requests, IPC handlers
- **Renderer process** (`src/renderer/`): all UI, tabs, navigation, browser views
- Current main window has `nodeIntegration: true, contextIsolation: false` (legacy debt — new windows MUST use contextIsolation)

### Module Pattern
Both processes use factory functions that accept injected dependencies:
```js
// Renderer pattern
const manager = createXxxManager({ /* deps */ });
manager.init();

// Main pattern  
const manager = createXxxManager({ /* deps */ });
manager.registerIpc();
```

### IPC Architecture
- IPC handlers live in `src/main/modules/ipc/` as separate files per feature (ai-ipc.js, downloads-ipc.js, etc.)
- Register IPC in main.js by calling `registerXxxIpc()` or `createXxxManager().registerIpc()`
- All IPC parameters must be validated in the main process
- For streaming/cancellable operations, maintain task IDs and clean up listeners on cancel/destroy

### Directory Structure
```
src/main/
  main.js                  # Entry: window creation, IPC registration
  modules/
    ipc/                   # IPC handlers (ai, downloads, password, translation, dialog, version)
    chat/                  # AI chat backend
    password/              # Password management backend
    translation/           # AI translation backend
    ai-chat.js             # AI API calls (streaming + non-streaming)
    ai-models.js           # Model list fetching
    extensions-manager.js  # Chrome extension loading
  preloads/

src/renderer/
  renderer.js              # Entry: initializes all managers
  i18n.js                  # Internationalization
  modules/
    app/                   # DOM references, event binding
    tabs/                  # Tab management
    navigation/            # Browser view navigation
    ui/                    # Context menu, find, overlays, modals, settings panels
    ai/                    # AI chat UI
    downloads/             # Downloads UI
    extensions/            # Extensions UI
    password/              # Password UI
    translation/           # Translation UI
    storage/               # IndexedDB (ai-history with schema versioning)
  locales/                 # 6 languages: en-US, ja-JP, ko-KR, ru-RU, zh-CN, zh-TW
  fragments/               # HTML layout fragments
  styles/                  # Per-feature CSS files
  styles.css               # Style entry point
```

### Security Boundaries
- Never expose main process objects, credentials, or unnecessary IPC to web pages
- Untrusted content (web pages, extension pages) must be treated as hostile
- All user-visible strings go through i18n (`t()` function); never hardcode in UI code

## i18n Requirements
- Adding a new translation key requires updating ALL 6 locale files in `src/renderer/locales/`
- Keep interpolation parameter names consistent across languages
- Access translations via `t('key')` from `src/renderer/i18n.js`

## Data & Persistence
- Settings: `electron-store` (keys under `settings.*`)
- AI history: IndexedDB via `src/renderer/modules/storage/ai-history/schema.js` — bump DB version on schema changes
- When changing stored data format, search all readers and provide migration or backward compatibility

## Testing
- Tests in `tests/**/*.test.js` (Jest)
- Test behavior and edge cases, not implementation details
- New IPC handlers need tests covering normal + error paths

## Common Workflows

| Task | Command |
|------|---------|
| Start dev | `npm run dev` |
| Run tests | `npm test` |
| Lint check | `npm run lint` |
| Lint fix | `npm run lint:fix` |
| Format code | `npm run format` |
| Format check | `npm run format:check` |
| Build installer | `npm run build` |

### Pre-commit Checklist
1. `npm test` passes
2. `npm run lint` has no errors
3. `npm run format:check` passes
4. New UI strings added to all 6 locale files
5. IPC changes validated on both main + renderer sides

### Adding a New Feature
1. Determine which process it belongs to (main for system/network, renderer for UI)
2. Create module in the appropriate `modules/` subdirectory
3. Use factory function pattern with dependency injection
4. For IPC: create handler file in `src/main/modules/ipc/`, register in `main.js`
5. For UI: add module in `src/renderer/modules/`, wire in `renderer.js`
6. Add i18n keys to all locale files
7. Add tests if applicable

## Common Pitfalls
- Forgetting to update all locale files when adding a translation key
- Not cleaning up IPC listeners when windows are destroyed
- Using `console.log` instead of `console.warn`/`console.error`
- Placing business logic in `main.js` or `renderer.js` instead of dedicated modules
- Not validating IPC parameters in the main process
