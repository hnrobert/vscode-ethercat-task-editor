/**
 * DSHOT Task (Task Type 4)
 * 处理 DSHOT 电调的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task04_DSHOT extends TaskBase {
  constructor() {
    const config = {
      id: 4,
      name: 'DSHOT',
      has_read: false,
      has_write: true,
      fields: Task04_DSHOT.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_dshot_id',
        label: 'DSHOT ID',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: '1' },
          { value: 2, label: '2' },
          { value: 3, label: '3' },
          { value: 4, label: '4' },
          { value: 5, label: '5' },
          { value: 6, label: '6' },
          { value: 7, label: '7' },
          { value: 8, label: '8' },
        ],
      },
      {
        key: 'sdowrite_init_value',
        label: 'Initial Value',
        type: 'number',
        data_type: 'uint16_t',
        default: 0,
        min: 0,
        max: 2047,
      },
    ];
  }
}
