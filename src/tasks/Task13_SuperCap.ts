/**
 * Super Capacitor Task (Task Type 13)
 * 处理超级电容的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task13_SuperCap extends TaskBase {
  constructor() {
    const config = {
      id: 13,
      name: 'Super Capacitor',
      has_read: true,
      has_write: true,
      fields: Task13_SuperCap.buildFields(),
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
        key: 'sdowrite_chassis_to_cap_id',
        label: 'Chassis → Cap ID',
        type: 'hex',
        data_type: 'uint32_t',
        default: 0x211,
      },
      {
        key: 'sdowrite_cap_to_chassis_id',
        label: 'Cap → Chassis ID',
        type: 'hex',
        data_type: 'uint32_t',
        default: 0x211,
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 7;
  }

  override calculateRxPdoSize(): number {
    return 4;
  }
}
