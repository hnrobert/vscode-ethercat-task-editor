/**
 * CAN PMU Task (Task Type 10)
 * 处理 CAN PMU 的配置
 */

import { TaskBase } from '../TaskBase';

export class Task10_CANPMU extends TaskBase {
  constructor() {
    const config = {
      id: 10,
      name: 'CAN PMU',
      has_read: true,
      has_write: false,
      fields: [],
    };
    super(config);
  }

  override calculateTxPdoSize(): number {
    return 7;
  }
}
