/**
 * VT13 RC Task (Task Type 14)
 * 处理 VT13 遥控器的配置
 */

import { TaskBase, FieldDefinition } from '../TaskBase';

export class Task14_VT13RC extends TaskBase {
  constructor() {
    const config = {
      id: 14,
      name: 'VT13 RC',
      has_read: true,
      has_write: false,
      fields: Task14_VT13RC.buildFields(),
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
        default: 'vt13_rc',
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 18;
  }
}
