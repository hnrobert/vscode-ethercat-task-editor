/**
 * DD Motor Task (Task Type 15)
 * 处理 DD 电机的配置、验证和模板生成
 */

import { TaskBase, FieldDefinition } from '../TaskBase';

export class Task15_DDMotor extends TaskBase {
  constructor() {
    const config = {
      id: 15,
      name: 'DD Motor',
      has_read: true,
      has_write: true,
      fields: Task15_DDMotor.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    const fields: FieldDefinition[] = [
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
        key: 'sdowrite_can_baudrate',
        label: 'CAN Baudrate',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'Standard CAN' },
          { value: 2, label: 'CAN FD' },
        ],
      },
      {
        key: 'sdowrite_can_packet_id',
        label: 'Motor Control Packet ID',
        type: 'radio',
        data_type: 'uint32_t',
        default: 0x280,
        options: [
          { value: 0x280, label: '0x280 (ID 1-4)' },
          { value: 0x2c0, label: '0x2C0 (ID 5-8)' },
        ],
      },
    ];

    // 为 4 个电机生成字段
    const defaultCanIds = [0x281, 0x282, 0x283, 0];

    for (let n = 1; n <= 4; n++) {
      fields.push(...Task15_DDMotor.buildMotorFields(n, defaultCanIds[n - 1]));
    }

    return fields;
  }

  private static buildMotorFields(
    motorIndex: number,
    defaultCanId: number,
  ): FieldDefinition[] {
    return [
      {
        key: `sdowrite_motor${motorIndex}_can_id`,
        label: `Motor ${motorIndex} CAN ID`,
        type: 'select',
        data_type: 'uint32_t',
        default: defaultCanId,
        help: 'Set to 0 to disable this motor',
        options: [
          { value: 0, label: 'Disabled' },
          {
            value: 0x281,
            label: '0x281 (ID 1)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x280,
          },
          {
            value: 0x282,
            label: '0x282 (ID 2)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x280,
          },
          {
            value: 0x283,
            label: '0x283 (ID 3)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x280,
          },
          {
            value: 0x284,
            label: '0x284 (ID 4)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x280,
          },
          {
            value: 0x2c1,
            label: '0x2C1 (ID 5)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x2c0,
          },
          {
            value: 0x2c2,
            label: '0x2C2 (ID 6)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x2c0,
          },
          {
            value: 0x2c3,
            label: '0x2C3 (ID 7)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x2c0,
          },
          {
            value: 0x2c4,
            label: '0x2C4 (ID 8)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x2c0,
          },
        ],
      },
    ];
  }

  override calculateTxPdoSize(taskData: Record<string, any>): number {
    let size = 0;
    for (let i = 1; i <= 4; i++) {
      const motorCanId = taskData[`sdowrite_motor${i}_can_id`];
      if (motorCanId !== undefined && Number(motorCanId) !== 0) {
        size += 9;
      }
    }
    return size;
  }

  override calculateRxPdoSize(taskData: Record<string, any>): number {
    let size = 0;
    for (let i = 1; i <= 4; i++) {
      const motorCanId = taskData[`sdowrite_motor${i}_can_id`];
      if (motorCanId !== undefined && Number(motorCanId) !== 0) {
        size += 3;
      }
    }
    return size;
  }
}
