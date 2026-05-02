/**
 * DD Motor Task (Task Type 15)
 *
 * CAN Packet ID: 0x32 (ID 1-4) / 0x33 (ID 5-8)
 * Motor CAN ID = 0x96 + Motor ID
 *   Motor ID 1 → 0x97, Motor ID 2 → 0x98, ...
 */

import { TaskBase, FieldDefinition, FieldChangeContext } from '../TaskBase';
import * as yaml from 'yaml';

export class Task15_DDMotor extends TaskBase {
  constructor() {
    const config = {
      id: 15,
      name: 'DD Motor',
      has_read: true,
      has_write: true,
      fields: Task15_DDMotor.buildFields(),
    };
    super(config);
  }

  private static buildFields(): FieldDefinition[] {
    const fields: FieldDefinition[] = [
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
        label: 'CAN Port',
        type: 'radio',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: 'CAN1' },
          { value: 2, label: 'CAN2' },
        ],
      },
      {
        key: 'sdowrite_can_baudrate',
        label: 'CAN Baudrate',
        type: 'radio',
        data_type: 'uint8_t',
        default: 1,
        options: [
          { value: 1, label: '1M' },
          { value: 2, label: '500K' },
        ],
      },
      {
        key: 'sdowrite_can_packet_id',
        label: 'Motor Control Packet ID',
        type: 'radio',
        data_type: 'uint32_t',
        default: 0x32,
        is_hex: true,
        help: 'Determines which motor IDs this packet controls',
        options: [
          {
            value: 0x32,
            label: '0x32',
            description: 'Controls motors with ID 1-4',
          },
          {
            value: 0x33,
            label: '0x33',
            description: 'Controls motors with ID 5-8',
          },
        ],
      },
    ];

    // Default motors: ID 1-4, all enabled
    const defaultMotorIds = [1, 2, 3, 4];
    const defaultControlTypes = [1, 1, 1, 1];

    for (let n = 1; n <= 4; n++) {
      fields.push(
        ...Task15_DDMotor.buildMotorFields(
          n,
          defaultMotorIds[n - 1],
          defaultControlTypes[n - 1],
        ),
      );
    }

    return fields;
  }

  private static buildMotorFields(
    motorIndex: number,
    defaultMotorId: number,
    defaultControlType: number,
  ): FieldDefinition[] {
    return [
      // Motor CAN ID (0x96 + motor_id, or 0 for disabled)
      {
        key: `sdowrite_motor${motorIndex}_can_id`,
        label: `Motor ${motorIndex} CAN ID`,
        type: 'select',
        data_type: 'uint32_t',
        default: 0x96 + defaultMotorId,
        is_hex: true,
        help: 'Set to 0 to disable this motor. CAN ID = 0x96 + Motor ID.',
        options: [
          { value: 0, label: 'Disabled' },
          {
            value: 0x97,
            label: 'ID 1 (0x97)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x32,
          },
          {
            value: 0x98,
            label: 'ID 2 (0x98)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x32,
          },
          {
            value: 0x99,
            label: 'ID 3 (0x99)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x32,
          },
          {
            value: 0x9a,
            label: 'ID 4 (0x9a)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x32,
          },
          {
            value: 0x9b,
            label: 'ID 5 (0x9b)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x33,
          },
          {
            value: 0x9c,
            label: 'ID 6 (0x9c)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x33,
          },
          {
            value: 0x9d,
            label: 'ID 7 (0x9d)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x33,
          },
          {
            value: 0x9e,
            label: 'ID 8 (0x9e)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x33,
          },
        ],
      },
      // Motor Control Type
      {
        key: `sdowrite_motor${motorIndex}_control_type`,
        label: `Motor ${motorIndex} Control Type`,
        type: 'radio',
        data_type: 'uint8_t',
        default: defaultControlType,
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0,
        options: [
          {
            value: 1,
            label: 'Openloop Voltage',
          },
          {
            value: 2,
            label: 'Closedloop Current',
          },
          {
            value: 3,
            label: 'Speed',
          },
          {
            value: 4,
            label: 'Single-Round Position',
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
    template += `  sub_topic: !std::string '/ecat/${segment}/write'\n`;
    template += `  pdowrite_offset: !uint16_t 0\n`;

    // Base fields
    for (const fieldKey of [
      'sdowrite_control_period',
      'sdowrite_can_inst',
      'sdowrite_can_baudrate',
      'sdowrite_can_packet_id',
    ]) {
      const field = this.getField(fieldKey);
      if (field && field.default !== undefined) {
        const yamlValue = field.to_yaml ? field.to_yaml(field.default) : field.default;
        template += `  ${field.key}: ${this.formatValue(yamlValue, field.data_type, !!(field.is_hex || field.yaml_hex))}\n`;
      }
    }

    // Motor fields
    for (let n = 1; n <= 4; n++) {
      const canIdField = this.getField(`sdowrite_motor${n}_can_id`);
      if (canIdField && canIdField.default !== undefined) {
        template += `  sdowrite_motor${n}_can_id: ${this.formatValue(canIdField.default, canIdField.data_type, !!canIdField.is_hex)}\n`;

        // Only add control_type if motor is enabled (can_id != 0)
        if (canIdField.default !== 0) {
          const controlTypeField = this.getField(`sdowrite_motor${n}_control_type`);
          if (controlTypeField && controlTypeField.default !== undefined) {
            template += `  sdowrite_motor${n}_control_type: ${this.formatValue(controlTypeField.default, controlTypeField.data_type)}\n`;
          }
        }
      }
    }

    template += `  pub_topic: !std::string '/ecat/${segment}/read'\n`;
    template += `  pdoread_offset: !uint16_t 0\n`;

    return template;
  }

  override onFieldChange(context: FieldChangeContext): boolean {
    const { fieldKey, newValue, taskNode } = context;

    const canIdMatch = fieldKey.match(/motor(\d+)_can_id/);
    if (canIdMatch) {
      return this.handleCanIdChange(
        canIdMatch[1],
        newValue,
        taskNode,
      );
    }

    // Handle can_packet_id change: remove invalid motor IDs
    if (fieldKey === 'sdowrite_can_packet_id') {
      const newPacketId = Number(newValue);
      // Remove control_type for motors that are now disabled
      for (let n = 1; n <= 4; n++) {
        const motorCanId = taskNode.get(`sdowrite_motor${n}_can_id`, true);
        let canId: any;
        if (yaml.isScalar(motorCanId)) {
          canId = motorCanId.value;
          if (typeof canId === 'string' && canId.startsWith('0x')) {
            canId = parseInt(canId, 16);
          }
        }
        if (Number(canId) !== 0) {
          // Check if the current motor ID is valid for the new packet ID
          const motorId = Number(canId) - 0x96;
          const isValid =
            (newPacketId === 0x32 && motorId >= 1 && motorId <= 4) ||
            (newPacketId === 0x33 && motorId >= 5 && motorId <= 8);
          if (!isValid) {
            // Reset to 0 (disabled)
            const valueScalar = new yaml.Scalar(0);
            valueScalar.tag = '!uint32_t';
            const keyScalar = new yaml.Scalar(`sdowrite_motor${n}_can_id`);
            taskNode.set(keyScalar, valueScalar);
            // Also remove control_type
            taskNode.delete(`sdowrite_motor${n}_control_type`);
          }
        }
      }
      return true;
    }

    return false;
  }

  private handleCanIdChange(
    motorIndex: string,
    newValue: any,
    taskNode: any,
  ): boolean {
    const newCanId = Number(newValue);

    // From enabled to disabled: remove control_type
    if (newCanId === 0) {
      taskNode.delete(`sdowrite_motor${motorIndex}_control_type`);
      return true;
    }

    // From disabled to enabled: add control_type with default 1
    const controlTypeKey = `sdowrite_motor${motorIndex}_control_type`;
    if (!taskNode.has(controlTypeKey)) {
      const valueScalar = new yaml.Scalar(1);
      valueScalar.tag = '!uint8_t';

      // Find insert position (after can_id)
      let insertIndex = -1;
      for (let i = 0; i < taskNode.items.length; i++) {
        const item = taskNode.items[i];
        if (
          yaml.isScalar(item.key) &&
          String(item.key.value) === `sdowrite_motor${motorIndex}_can_id`
        ) {
          insertIndex = i + 1;
          break;
        }
      }

      const newPair = new yaml.Pair(
        new yaml.Scalar(controlTypeKey),
        valueScalar,
      );
      if (insertIndex >= 0) {
        taskNode.items.splice(insertIndex, 0, newPair);
      } else {
        taskNode.add(newPair);
      }
    }

    return true;
  }

  override getExpectedFields(taskData: Record<string, any>): string[] {
    const fields: string[] = [
      'sdowrite_control_period',
      'sdowrite_can_inst',
      'sdowrite_can_baudrate',
      'sdowrite_can_packet_id',
    ];
    for (let i = 1; i <= 4; i++) {
      fields.push(`sdowrite_motor${i}_can_id`);
      const canId = taskData[`sdowrite_motor${i}_can_id`];
      if (canId !== undefined && Number(canId) !== 0) {
        fields.push(`sdowrite_motor${i}_control_type`);
      }
    }
    return fields;
  }

  override calculateTxPdoSize(taskData: Record<string, any>): number {
    let size = 0;
    for (let i = 1; i <= 4; i++) {
      const motorCanId = taskData[`sdowrite_motor${i}_can_id`];
      if (motorCanId !== undefined && Number(motorCanId) !== 0) {
        size += 9;
      }
    }
    return size;
  }

  override calculateRxPdoSize(taskData: Record<string, any>): number {
    let size = 0;
    for (let i = 1; i <= 4; i++) {
      const motorCanId = taskData[`sdowrite_motor${i}_can_id`];
      if (motorCanId !== undefined && Number(motorCanId) !== 0) {
        size += 3;
      }
    }
    return size;
  }
}
