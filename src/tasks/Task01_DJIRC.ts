/**
 * DJI RC Task (Task Type 1)
 * 处理 DJI 遥控器的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task01_DJIRC extends TaskBase {
  constructor() {
    const config = {
      id: 1,
      name: 'DJI RC',
      has_read: true,
      has_write: false,
      fields: Task01_DJIRC.buildFields(),
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
        default: 'dji_rc',
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 19;
  }
}
