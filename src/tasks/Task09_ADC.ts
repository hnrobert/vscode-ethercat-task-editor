/**
 * ADC Task (Task Type 9)
 * 处理 ADC 的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task09_ADC extends TaskBase {
  constructor() {
    const config = {
      id: 9,
      name: 'ADC',
      has_read: true,
      has_write: false,
      fields: Task09_ADC.buildFields(),
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
        default: 'adc',
      },
    ];
  }
}
