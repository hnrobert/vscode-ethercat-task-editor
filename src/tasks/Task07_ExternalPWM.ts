/**
 * External PWM Task (Task Type 7)
 * 处理外部 PWM 的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task07_ExternalPWM extends TaskBase {
  constructor() {
    const config = {
      id: 7,
      name: 'External PWM',
      has_read: false,
      has_write: true,
      fields: Task07_ExternalPWM.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_uart_id',
        label: 'UART ID',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'UART 1' },
          { value: 2, label: 'UART 2' },
          { value: 3, label: 'UART 3' },
          { value: 4, label: 'UART 4' },
          { value: 5, label: 'UART 5' },
          { value: 6, label: 'UART 6' },
          { value: 7, label: 'UART 7' },
          { value: 8, label: 'UART 8' },
        ],
      },
      {
        key: 'sdowrite_pwm_period',
        label: 'PWM Period (μs)',
        type: 'number',
        data_type: 'uint16_t',
        default: 20000,
        min: 0,
        max: 65535,
      },
      {
        key: 'sdowrite_channel_num',
        label: 'Channel Count',
        type: 'number',
        data_type: 'uint8_t',
        default: 1,
        min: 1,
        max: 8,
      },
      {
        key: 'sdowrite_init_value',
        label: 'Initial Value (μs)',
        type: 'number',
        data_type: 'uint16_t',
        default: 1500,
        min: 0,
        max: 65535,
      },
    ];
  }

  override calculateRxPdoSize(taskData: Record<string, any>): number {
    const channelNum = Number(taskData.sdowrite_channel_num) || 0;
    return channelNum * 2;
  }
}
