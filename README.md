# EtherCAT Task Editor

A VS Code extension that provides a visual editor for SOEM-based EtherCAT YAML configuration files.

Instead of manually editing long YAML files with typed tags and calculating PDO offsets by hand, this extension gives you a structured sidebar panel where you can configure slaves, tasks, and parameters with immediate feedback on PDO usage.

## Features

- **Visual slave/task editor** — Add, remove, reorder, and configure EtherCAT slaves and their tasks through a sidebar panel
- **Automatic offset calculation** — PDO read/write offsets and `sdo_len` are recalculated on every change
- **Board type awareness** — Set board type per slave to get real-time PDO overflow warnings (H750 Universal / Large PDO)
- **Topic name diagnostics** — Detects conflicting or inconsistent ROS2 topic names directly in the YAML editor
- **Drag and drop** — Reorder tasks and slaves by dragging their headers
- **Typed YAML round-trip** — Preserves `!uint8_t`, `!uint16_t`, `!float`, `!std::string` tags and hex formatting on save
- **Task type templates** — Switching task types preserves compatible parameters and fills in defaults for new fields

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

## Configuration

Task types, board types, and default parameter templates are defined in YAML config files under `assets/constants/`:

- **`task_templates.yaml`** — Task type definitions (label, description, has_read/has_write flags, default parameter templates)
- **`board_types.yaml`** — Board type definitions (name, max TXPDO/RXPDO lengths)

To add a new task type or board type, edit the corresponding YAML file. No code changes required.

## Development

```bash
pnpm install
pnpm run build          # Build extension + webview
pnpm run watch          # Watch extension
pnpm run watch:webview  # Watch webview
```

Press F5 in VS Code to launch the Extension Development Host.

## License

Apache 2.0 License. See [LICENSE](LICENSE) for details.
