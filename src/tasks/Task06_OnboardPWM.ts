/**
 * Onboard PWM Task (Task Type 6)
 * 处理板载 PWM 的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task06_OnboardPWM extends TaskBase {
  constructor() {
    const config = {
      id: 6,
      name: 'Onboard PWM',
      has_read: false,
      has_write: true,
      fields: Task06_OnboardPWM.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_port_id',
        label: 'Port ID',
        type: 'select',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'Port 1' },
          { value: 2, label: 'Port 2' },
          { value: 3, label: 'Port 3' },
          { value: 4, label: 'Port 4' },
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

  override calculateRxPdoSize(): number {
    return 8;
  }
}
