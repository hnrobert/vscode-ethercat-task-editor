# Adding a New Task Type

Task types are defined as TypeScript classes in `definitions/`. Each task extends `TaskBase` and declares its configuration, fields, and PDO size calculations.

## Step-by-step guide

### 1. Create the task class

Create `definitions/Task16_YourTask.ts`:

```typescript
import { TaskBase, FieldDefinition } from '../TaskBase';

export class Task16_YourTask extends TaskBase {
  constructor() {
    super({
      id: 16,
      name: 'Your Task',
      has_read: true,    // set false if write-only
      has_write: true,   // set false if read-only
      fields: Task16_YourTask.buildFields(),
    });
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_some_param',
        label: 'Some Parameter',
        type: 'number',         // 'number' | 'select' | 'radio' | 'hex' | 'text'
        data_type: 'uint16_t',  // YAML tag type
        default: 100,
        min: 0,
        max: 65535,
      },
      {
        key: 'sdowrite_some_option',
        label: 'Some Option',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'Option A' },
          { value: 2, label: 'Option B' },
        ],
      },
    ];
  }
}
```

### 2. Implement PDO size calculations

Override `calculateTxPdoSize` (TXPDO / pdoread) and `calculateRxPdoSize` (RXPDO / pdowrite). These receive the task's current field values and return byte sizes. Default is 0 if not overridden.

```typescript
// Fixed size — read-only task
override calculateTxPdoSize(): number {
  return 9;
}

// Dynamic size based on field values
override calculateRxPdoSize(taskData: Record<string, any>): number {
  const channelNum = Number(taskData.sdowrite_channel_num) || 0;
  return channelNum * 2;
}
```

### 3. Register in the barrel file

Add one line to `definitions/index.ts`:

```typescript
export * from './Task16_YourTask';
```

That's it — `TaskRegistry` auto-discovers all exports via `Object.values(Tasks)`. No other registration needed.

### 4. Verify

```bash
pnpm run build
```

The new task type will appear in the task type picker when adding tasks.

## Advanced features

### Conditional field visibility

Use `visible_when` to show/hide fields based on other values:

```typescript
{
  key: 'sdowrite_pid_kp',
  label: 'PID Kp',
  type: 'number',
  data_type: 'float',
  default: 1.0,
  visible_when: (data) => data.sdowrite_control_type >= 2,
},
```

### Conditional option validity

Use `valid_when` on options to restrict available choices:

```typescript
options: [
  { value: 0x201, label: 'ID 1', valid_when: (data) => data.sdowrite_can_packet_id === 0x200 },
  { value: 0x205, label: 'ID 5', valid_when: (data) => data.sdowrite_can_packet_id === 0x1ff },
],
```

### Dynamic field management on change

Override `onFieldChange` to add/remove YAML fields when a value changes (e.g., showing PID fields when control type changes). See `Task05_DJIMotor` for a full example.

### Custom template generation

Override `generateTemplate` if the default template doesn't fit your task's needs (e.g., only outputting enabled motors).

## Field types reference

| `type`   | UI component   | `data_type` examples                                                       |
|----------|----------------|----------------------------------------------------------------------------|
| `number` | Number input   | `uint8_t`, `int8_t`, `uint16_t`, `int16_t`, `uint32_t`, `int32_t`, `float` |
| `select` | Dropdown       | Any numeric type                                                           |
| `radio`  | Radio buttons  | Any numeric type                                                           |
| `hex`    | Hex input      | `uint32_t`, `uint16_t`                                                     |
| `text`   | Text input     | `std::string`                                                              |
