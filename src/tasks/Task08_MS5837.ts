/**
 * MS5837 Pressure Sensor Task (Task Type 8)
 * 处理 MS5837 压力传感器的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task08_MS5837 extends TaskBase {
  constructor() {
    const config = {
      id: 8,
      name: 'MS5837-30BA',
      has_read: true,
      has_write: false,
      fields: Task08_MS5837.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_i2c_id',
        label: 'I2C ID',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'I2C 1' },
          { value: 2, label: 'I2C 2' },
          { value: 3, label: 'I2C 3' },
          { value: 4, label: 'I2C 4' },
        ],
      },
      {
        key: 'sdowrite_osr_id',
        label: 'OSR ID',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 0, label: '256' },
          { value: 1, label: '512' },
          { value: 2, label: '1024' },
          { value: 3, label: '2048' },
          { value: 4, label: '4096' },
          { value: 5, label: '8192' },
        ],
      },
      {
        key: 'conf_frame_name',
        label: 'Frame Name',
        type: 'text',
        data_type: 'std::string',
        default: 'pressure_sensor',
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 9;
  }
}
