/**
 * LkTech Motor Task (Task Type 2)
 * 处理 LkTech 电机的配置、验证和模板生成
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task02_LkTechMotor extends TaskBase {
  constructor() {
    const config = {
      id: 2,
      name: 'LkTech Motor',
      has_read: true,
      has_write: true,
      fields: Task02_LkTechMotor.buildFields(),
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
        key: 'sdowrite_can_packet_id',
        label: 'CAN Packet ID',
        type: 'hex',
        data_type: 'uint32_t',
        default: 0x141,
      },
      {
        key: 'sdowrite_control_type',
        label: 'Control Type',
        type: 'radio',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'Openloop Current' },
          { value: 2, label: 'Torque' },
          { value: 3, label: 'Speed with Torque Limit' },
          { value: 4, label: 'Multi-Round Position' },
          { value: 5, label: 'Multi-Round Position with Speed Limit' },
          { value: 6, label: 'Single-Round Position' },
          { value: 7, label: 'Single-Round Position with Speed Limit' },
          { value: 8, label: 'Broadcast Current' },
        ],
      },
    ];
  }
}
