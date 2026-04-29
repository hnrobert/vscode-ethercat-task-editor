/**
 * LkTech Motor Task (Task Type 2)
 * 处理 LkTech 电机的配置、验证和模板生成
 */

import { TaskBase, FieldDefinition, FieldChangeContext } from '../TaskBase';
import * as yaml from 'yaml';

export class Task02_LkTechMotor extends TaskBase {
  constructor() {
    const config = {
      id: 2,
      name: 'LkTech Motor',
      has_read: true,
      has_write: true,
      fields: Task02_LkTechMotor.buildFields(),
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
        key: 'sdowrite_can_packet_id',
        label: 'Motor Driver ID',
        type: 'number',
        data_type: 'uint32_t',
        default: 1,
        min: 1,
        max: 32,
        yaml_hex: true,
        from_yaml: (value) => value - 0x140,
        to_yaml: (value) => value + 0x140,
        help: 'Motor driver ID (1-32). CAN packet ID = 0x140 + this ID. Not needed in broadcast mode.',
        visible_when: (data) => data.sdowrite_control_type !== 8,
      },
      {
        key: 'sdowrite_control_type',
        label: 'Control Type',
        type: 'radio',
        data_type: 'uint8_t',
        default: 1,
        help: 'More info: http://www.lkmotor.cn/Download.aspx?ClassID=47',
        options: [
          { value: 8, label: 'Current (Broadcast)', group: 'Broadcast mode' },
          { value: 1, label: 'Openloop Current', group: 'Single motor mode' },
          { value: 2, label: 'Torque', group: 'Single motor mode' },
          {
            value: 3,
            label: 'Speed with Torque Limit',
            group: 'Single motor mode',
          },
          {
            value: 4,
            label: 'Multi-Round Position',
            group: 'Single motor mode',
          },
          {
            value: 5,
            label: 'Multi-Round Position with Speed Limit',
            group: 'Single motor mode',
          },
          {
            value: 6,
            label: 'Single-Round Position',
            group: 'Single motor mode',
          },
          {
            value: 7,
            label: 'Single-Round Position with Speed Limit',
            group: 'Single motor mode',
          },
        ],
      },
    ];
  }

  override generateTemplate(taskKey: string, segment: string): string {
    let template = `${taskKey}:\n`;
    template += `  sdowrite_task_type: !uint8_t ${this.config.id}\n`;
    template += `  conf_connection_lost_read_action: !uint8_t 0x02\n`;
    template += `  sdowrite_connection_lost_write_action: !uint8_t 0x02\n`;
    template += `  pub_topic: !std::string '/ecat/${segment}/read'\n`;
    template += `  pdoread_offset: !uint16_t 0\n`;
    template += `  sub_topic: !std::string '/ecat/${segment}/write'\n`;
    template += `  pdowrite_offset: !uint16_t 0\n`;

    const controlTypeField = this.getField('sdowrite_control_type');
    const controlType = controlTypeField?.default ?? 1;

    // Base fields
    for (const fieldKey of [
      'sdowrite_control_period',
      'sdowrite_can_inst',
    ]) {
      const field = this.getField(fieldKey);
      if (field && field.default !== undefined) {
        template += `  ${field.key}: ${this.formatValue(field.default, field.data_type, !!field.is_hex)}\n`;
      }
    }

    // Skip can_packet_id when control_type is Broadcast Current (0x08)
    if (controlType !== 8) {
      const field = this.getField('sdowrite_can_packet_id');
      if (field && field.default !== undefined) {
        const yamlValue = field.to_yaml ? field.to_yaml(field.default) : field.default;
        template += `  ${field.key}: ${this.formatValue(yamlValue, field.data_type, !!(field.is_hex || field.yaml_hex))}\n`;
      }
    }

    template += `  sdowrite_control_type: ${this.formatValue(controlType, 'uint8_t')}\n`;

    return template;
  }

  override calculateTxPdoSize(taskData: Record<string, any>): number {
    const cType = Number(taskData.sdowrite_control_type) || 0;
    return cType !== 8 ? 8 : 32;
  }

  override onFieldChange(context: FieldChangeContext): boolean {
    const { fieldKey, newValue, taskNode } = context;

    if (fieldKey === 'sdowrite_control_type') {
      const newType = Number(newValue);

      if (newType === 8) {
        // Broadcast mode: remove can_packet_id
        taskNode.delete('sdowrite_can_packet_id');
      } else {
        // Single motor mode: add can_packet_id if missing
        if (!taskNode.has('sdowrite_can_packet_id')) {
          const field = this.getField('sdowrite_can_packet_id');
          if (field) {
            // default is UI value (1), YAML value via to_yaml (0x141)
            const yamlValue = field.to_yaml ? field.to_yaml(field.default) : field.default;
            const valueScalar = new yaml.Scalar(yamlValue);
            valueScalar.tag = `!${field.data_type}`;
            valueScalar.format = 'HEX';
            (valueScalar as any)._originalSource =
              '0x' + yamlValue.toString(16).toUpperCase();
            valueScalar.toJSON = function () {
              return '0x' + (this as any).value.toString(16).toUpperCase();
            };

            // Insert after can_inst field
            let insertIndex = -1;
            for (let i = 0; i < taskNode.items.length; i++) {
              const item = taskNode.items[i];
              if (
                yaml.isScalar(item.key) &&
                String(item.key.value) === 'sdowrite_can_inst'
              ) {
                insertIndex = i + 1;
                break;
              }
            }

            const newPair = new yaml.Pair(
              new yaml.Scalar('sdowrite_can_packet_id'),
              valueScalar,
            );

            if (insertIndex >= 0) {
              taskNode.items.splice(insertIndex, 0, newPair);
            } else {
              taskNode.items.push(newPair);
            }
          }
        }
      }
      return true;
    }

    return false;
  }

  override calculateRxPdoSize(taskData: Record<string, any>): number {
    const cType = Number(taskData.sdowrite_control_type) || 0;
    switch (cType) {
      case 1:
      case 2:
        return 3;
      case 3:
        return 7;
      case 4:
        return 5;
      case 5:
        return 7;
      case 6:
        return 6;
      case 7:
      case 8:
        return 8;
      default:
        return 0;
    }
  }
}
