/**
 * Hipnuc IMU CAN Task (Task Type 3)
 * 处理 Hipnuc IMU CAN 的配置
 */

import { TaskBase, FieldDefinition } from '../TaskBase';

export class Task03_HipnucIMUCAN extends TaskBase {
  constructor() {
    const config = {
      id: 3,
      name: 'Hipnuc IMU CAN',
      has_read: true,
      has_write: false,
      fields: Task03_HipnucIMUCAN.buildFields(),
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
        key: 'sdowrite_packet1_id',
        label: 'Packet 1 ID',
        type: 'hex',
        data_type: 'uint32_t',
        default: 0x90,
      },
      {
        key: 'sdowrite_packet2_id',
        label: 'Packet 2 ID',
        type: 'hex',
        data_type: 'uint32_t',
        default: 0x91,
      },
      {
        key: 'sdowrite_packet3_id',
        label: 'Packet 3 ID',
        type: 'hex',
        data_type: 'uint32_t',
        default: 0x92,
      },
      {
        key: 'conf_frame_name',
        label: 'Frame Name',
        type: 'text',
        data_type: 'std::string',
        default: 'imu_link',
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 21;
  }
}
