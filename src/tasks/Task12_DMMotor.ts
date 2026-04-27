/**
 * DM Motor Task (Task Type 12)
 * 处理 DM 电机的配置
 */

import { TaskBase, FieldDefinition } from './TaskBase';

export class Task12_DMMotor extends TaskBase {
  constructor() {
    const config = {
      id: 12,
      name: 'DM Motor',
      has_read: true,
      has_write: true,
      fields: Task12_DMMotor.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    return [
      {
        key: 'sdowrite_control_period',
        label: 'Control Period (ms)',
        type: 'number',
        data_type: 'uint16_t',
        default: 1,
        min: 1,
        max: 1000,
      },
      {
        key: 'sdowrite_can_id',
        label: 'Motor CAN ID',
        type: 'hex',
        data_type: 'uint16_t',
        default: 0x01,
      },
      {
        key: 'sdowrite_master_id',
        label: 'Master ID',
        type: 'hex',
        data_type: 'uint16_t',
        default: 0x00,
      },
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
        key: 'sdowrite_control_type',
        label: 'Control Type',
        type: 'radio',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'MIT Control' },
          { value: 2, label: 'Position Control with Speed Limit' },
          { value: 3, label: 'Speed Control' },
        ],
      },
      {
        key: 'conf_pmax',
        label: 'P Max',
        type: 'number',
        data_type: 'float',
        default: 10.0,
      },
      {
        key: 'conf_vmax',
        label: 'V Max',
        type: 'number',
        data_type: 'float',
        default: 10.0,
      },
      {
        key: 'conf_tmax',
        label: 'T Max',
        type: 'number',
        data_type: 'float',
        default: 10.0,
      },
    ];
  }

  override calculateTxPdoSize(): number {
    return 9;
  }

  override calculateRxPdoSize(taskData: Record<string, any>): number {
    const dmCtrlType = Number(taskData.sdowrite_control_type) || 0;
    if (dmCtrlType === 1 || dmCtrlType === 2) return 9;
    if (dmCtrlType === 3) return 5;
    return 0;
  }
}
