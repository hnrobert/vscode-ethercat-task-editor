# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm run build           # Full build (extension + webview)
pnpm run build:ext       # Extension only (tsup → dist/extension.js)
pnpm run build:webview   # Webview only (Vite → dist/assets/)
pnpm run watch           # Watch extension (tsup)
pnpm run watch:webview   # Watch webview (Vite)
```

To debug: press F5 in VS Code, which runs "Run Extension" launch config (builds both watch tasks first).

No test framework is configured.

## Architecture

VS Code extension for editing EtherCAT SOEM YAML configs via a webview sidebar panel.

### Extension side (`src/`)

- **extension.ts** — Entry point. Registers the webview provider and commands (`refresh`, `collapseAll`, `expandAll`, `showPanel`).
- **SoemConfigWebviewProvider.ts** — Main webview panel. Parses active YAML, sends data to webview, handles CRUD messages (add/remove/rename slaves and tasks), updates YAML values with offset recalculation.
- **constants.ts** — Loads task type definitions and board type definitions from YAML config files. Provides `getTaskTypes()`, `getBoardTypes()`, `getTaskTemplateYaml()`, `generateTaskTemplate()`.

### Configuration files (`assets/constants/`)

- **task_templates.yaml** — Task type definitions with labels, descriptions, has_read/has_write flags, and default parameter templates with typed tags.
- **board_types.yaml** — Board type definitions with names and max TX/RX PDO lengths.

### Shared utilities (`src/utils/`)

- **offsetCalculator.ts** — PDO read/write offset calculation based on task types. Shared by both webview and tree providers.
- **yamlUtils.ts** — `isSoemFormat()`, `normalizeTaskKeys()`, `parseTopicSegment()`, path get/set helpers, `writeDocument()`, `applyAndSaveYaml()`.
- **taskTypeMemory.ts** — Persists task parameter values across type switches so users don't lose settings.
- **topicValidator.ts** — Validates topic names for conflicts and inconsistent app segments, produces VS Code diagnostics.

### Parser layer

- **yamlParser.ts** — Custom YAML parser with typed tags (`!uint8_t`, `!uint16_t`, `!int32_t`, `!float`, `!std::string`). Preserves hex formatting and custom tag annotations on round-trip.
- **msgParser.ts** — Parses `.msg` files from `assets/msg/` for field definitions.
- **msgSizes.ts** — Size calculations for MSG field types.

### Webview side (`webview/`)

Vue 3 + Vite app. Communicates with extension via `postMessage`:

- Extension → Webview: `{type: 'updateData'|'setError'|'collapseAll'|'expandAll', data, taskTypes, boardTypes}`
- Webview → Extension: `{type: 'updateValue'|'addSlave'|'removeSlave'|'renameSlave'|'addTask'|'removeTask'|'renameTask', path, value}`

### YAML data structure

```yaml
slaves:
  - sn_name:
      sdo_len: !uint16_t 0
      task_count: !uint8_t 0
      latency_pub_topic: !std::string '/ecat/sn_name/latency'
      tasks:
        - app_1:
            sdowrite_task_type: !uint8_t 1
            pub_topic: !std::string '/ecat/sn_name/app1/read'
            pdoread_offset: !uint16_t 0
            ...
```

Task keys are normalized to `app_1…app_n` based on array position. Topics follow `/ecat/{slave}/{segment}/read|write`.
