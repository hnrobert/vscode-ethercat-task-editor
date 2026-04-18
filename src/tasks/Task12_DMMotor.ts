/**
 * DM Motor Task (Task Type 12)
 * 处理 DM 电机的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task12_DMMotor extends TaskBase {
  constructor() {
    const config = {
      id: 12,
      name: 'DM Motor',
      has_read: true,
      has_write: true,
      fields: Task12_DMMotor.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_control_period',
        label: 'Control Period (ms)',
        type: 'number',
        data_type: 'uint16_t',
        default: 1,
        min: 1,
        max: 1000,
      },
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
        key: 'sdowrite_motor_id',
        label: 'Motor ID',
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
        key: 'sdowrite_control_type',
        label: 'Control Type',
        type: 'radio',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'MIT Control' },
          { value: 2, label: 'Position Control with Speed Limit' },
          { value: 3, label: 'Speed Control' },
        ],
      },
    ];
  }
}
