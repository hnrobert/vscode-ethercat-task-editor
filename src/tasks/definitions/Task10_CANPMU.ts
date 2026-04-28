/**
 * CAN PMU Task (Task Type 10)
 * 处理 CAN PMU 的配置
 */

import { TaskBase, FieldDefinition } from '../TaskBase';

export class Task10_CANPMU extends TaskBase {
  constructor() {
    const config = {
      id: 10,
      name: 'CAN PMU',
      has_read: true,
      has_write: false,
      fields: Task10_CANPMU.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_can_inst',
        label: 'CAN Instance',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'CAN1' },
          { value: 2, label: 'CAN2' },
        ],
      },
      {
        key: 'sdowrite_can_id',
        label: 'CAN ID',
        type: 'number',
        data_type: 'uint32_t',
        default: 0x211,
        is_hex: true,
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 7;
  }
}
