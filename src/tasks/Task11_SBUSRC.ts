/**
 * SBUS RC Task (Task Type 11)
 * 处理 SBUS 遥控器的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task11_SBUSRC extends TaskBase {
  constructor() {
    const config = {
      id: 11,
      name: 'SBUS RC',
      has_read: true,
      has_write: false,
      fields: Task11_SBUSRC.buildFields(),
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
        default: 'sbus_rc',
      },
    ];
  }
}
