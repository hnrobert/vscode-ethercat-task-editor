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
