# EtherCAT Task Editor

[![Visual Studio Marketplace](https://flat.badgen.net/vs-marketplace/i/HNRobert.vscode-ethercat-task-editor?icon=visualstudio)](https://marketplace.visualstudio.com/items?itemName=HNRobert.vscode-ethercat-task-editor)
[![GitHub](https://flat.badgen.net/github/release/hnrobert/vscode-ethercat-task-editor?icon=github)](https://github.com/hnrobert/vscode-ethercat-task-editor)
[![Apache License](https://flat.badgen.net/badge/license/Apache-2.0/blue)](LICENSE)
[![Open Issues](https://flat.badgen.net/github/open-issues/hnrobert/vscode-ethercat-task-editor?icon=github)](https://github.com/hnrobert/vscode-ethercat-task-editor/issues)
[![Closed Issues](https://flat.badgen.net/github/closed-issues/hnrobert/vscode-ethercat-task-editor?icon=github)](https://github.com/hnrobert/vscode-ethercat-task-editor/issues?q=is%3Aissue+is%3Aclosed)

A VSCode extension providing a visual sidebar editor for EtherCAT SOEM YAML configuration files.

## Features

- **Visual slave/task editor** — Add, remove, reorder, and configure EtherCAT slaves and their tasks through a sidebar panel
- **Automatic offset calculation** — PDO read/write offsets and `sdo_len` are recalculated on every change using per-task size methods
- **Board type awareness** — Set board type per slave to get real-time PDO overflow warnings
- **Topic name diagnostics** — Detects conflicting or inconsistent ROS2 topic names directly in the YAML editor
- **Drag and drop** — Reorder tasks and slaves by dragging their headers
- **Typed YAML round-trip** — Preserves `!uint8_t`, `!int8_t`, `!uint16_t`, `!int16_t`, `!uint32_t`, `!int32_t`, `!float`, `!std::string` tags and hex formatting on save

## Getting Started

1. Open a SOEM-format `.yaml` file in VS Code
2. The EtherCAT Config panel appears in the sidebar automatically
3. Edit task parameters in the panel — changes are written back to the YAML file immediately

## YAML Format

The extension expects YAML files with this structure:

```yaml
slaves:
  - sn_name:
      board_type: !uint8_t 0x03
      sdo_len: !uint16_t 0
      task_count: !uint8_t 0
      latency_pub_topic: !std::string "/ecat/sn_name/latency"
      tasks:
        - app_1:
            sdowrite_task_type: !uint8_t 1
            pub_topic: !std::string "/ecat/sn_name/app1/read"
            pdoread_offset: !uint16_t 0
            ...
```

## Build & Development

```bash
pnpm install
pnpm run build           # Full build (extension + webview)
pnpm run build:ext       # Extension only (tsup)
pnpm run build:webview   # Webview only (Vite)
pnpm run watch           # Watch extension
pnpm run watch:webview   # Watch webview
```

Press **F5** in VS Code to launch the Extension Development Host.

## Architecture you should know about

```bash
.
├── assets
│   └── constants
│       └── board_types.yaml
├── docs
│   └── ethercat-yaml-file-icon-setup
│       └── README.md
├── language-configuration.json
├── src
│   ├── extension.ts                      # Extension entry point
│   ├── providers
│   │   ├── EthercatYamlFormatter.ts
│   │   └── SoemConfigWebviewProvider.ts  # Webview panel, message handling, CRUD
│   ├── tasks
│   │   ├── TaskBase.ts
│   │   ├── TaskRegistry.ts
│   │   ├── definitions                   # All task type implementations
│   │   │   ├── index.ts                  # Exports all task definitions
│   │   │   ├── Task01_DJIRC.ts
│   │   │   ├── Task02_LkTechMotor.ts
│   │   │   └── ...
│   │   └── index.ts                      # Module exports
│   └── utils
│       ├── constantsParser.ts            # Board type definitions from YAML
│       ├── iconConfigurator.ts
│       ├── languageDetector.ts
│       ├── offsetCalculator.ts           # PDO offset calculation (uses TaskRegistry)
│       ├── tagValidator.ts
│       ├── taskTypeMemory.ts
│       ├── topicValidator.ts             # Topic name validation and diagnostics
│       ├── yamlParser.ts                 # Custom parser preserving typed tags
│       └── yamlUtils.ts                  # YAML parsing, normalization, save
├── syntaxes
│   └── ethercat-yaml.tmLanguage.json     # EtherCAT YAML syntax highlighting
├── themes
│   └── ethercat-yaml-theme.json          # EtherCAT YAML color theme
└── webview                               # Vue 3 + Vite sidebar app
    └── src
        ├── components                    # Vue components
        ├── composables
        │   ├── useTaskFields.ts
        │   └── useVscode.ts              # VS Code webview API bridge
        └── styles                        # Modular CSS files
```

### Data flow

1. Extension parses active YAML file and sends data to webview via `postMessage`
2. Webview renders slaves/tasks with property fields
3. User edits are sent back as `updateValue` messages
4. Extension applies changes, recalculates offsets via `TaskRegistry`, and saves

## Adding a New Task Type

See [`src/tasks/README.md`](src/tasks/README.md) for the full guide on creating and registering new task types.

## License

Apache 2.0 License. See [LICENSE](LICENSE) for details.
