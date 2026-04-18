/**
 * DJI Motor Task
 * 处理 DJI 电机的配置、验证和模板生成
 */

import { TaskBase, FieldDefinition, ValidationError } from './TaskBase';

export class Task05_DJIMotor extends TaskBase {
  constructor() {
    const config = {
      id: 5,
      name: 'DJI Motor',
      has_read: true,
      has_write: true,
      fields: Task05_DJIMotor.buildFields(),
    };
    super(config);
  }

  /**
   * 构建字段定义
   */
  private static buildFields(): FieldDefinition[] {
    const fields: FieldDefinition[] = [
      // 基础配置
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
        label: 'Motor Control Packet ID',
        type: 'radio',
        data_type: 'uint32_t',
        default: 0x200,
        help: 'Determines which motor IDs this packet controls',
        options: [
          {
            value: 0x200,
            label: '0x200',
            description: 'Controls motors with feedback IDs 0x201-0x204 (3508/2006 ID1-4)',
          },
          {
            value: 0x1ff,
            label: '0x1ff',
            description: 'Controls motors with feedback IDs 0x201-0x208 (3508/2006 ID5-8)',
          },
          {
            value: 0x2ff,
            label: '0x2ff',
            description: 'Controls motors with feedback IDs 0x205-0x207 (6020 VOLT ID5-7)',
          },
          {
            value: 0x1fe,
            label: '0x1fe',
            description: 'Controls motors with feedback IDs 0x205-0x208 (6020 CURR ID1-4)',
          },
          {
            value: 0x2fe,
            label: '0x2fe',
            description: 'Controls motors with feedback IDs 0x205-0x207 (6020 CURR ID5-7)',
          },
        ],
      },
    ];

    // 为 4 个电机生成字段
    const defaultCanIds = [0x201, 0x202, 0x203, 0x204];
    const defaultControlTypes = [1, 1, 1, 1];

    for (let n = 1; n <= 4; n++) {
      fields.push(...Task05_DJIMotor.buildMotorFields(n, defaultCanIds[n - 1], defaultControlTypes[n - 1]));
    }

    return fields;
  }

  /**
   * 为单个电机构建字段
   */
  private static buildMotorFields(
    motorIndex: number,
    defaultCanId: number,
    defaultControlType: number
  ): FieldDefinition[] {

    return [
      // CAN ID
      {
        key: `sdowrite_motor${motorIndex}_can_id`,
        label: `Motor ${motorIndex} CAN ID`,
        type: 'select',
        data_type: 'uint32_t',
        default: defaultCanId,
        help: 'Set to 0 to disable this motor. Valid IDs depend on can_packet_id.',
        options: [
          { value: 0, label: 'Disabled' },
          {
            value: 0x201,
            label: '0x201 (ID 1)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x200
          },
          {
            value: 0x202,
            label: '0x202 (ID 2)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x200
          },
          {
            value: 0x203,
            label: '0x203 (ID 3)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x200
          },
          {
            value: 0x204,
            label: '0x204 (ID 4)',
            valid_when: (data) => data.sdowrite_can_packet_id === 0x200
          },
          {
            value: 0x205,
            label: '0x205 (ID 5)',
            valid_when: (data) => [0x1ff, 0x2ff, 0x1fe, 0x2fe].includes(data.sdowrite_can_packet_id)
          },
          {
            value: 0x206,
            label: '0x206 (ID 6)',
            valid_when: (data) => [0x1ff, 0x2ff, 0x1fe, 0x2fe].includes(data.sdowrite_can_packet_id)
          },
          {
            value: 0x207,
            label: '0x207 (ID 7)',
            valid_when: (data) => [0x1ff, 0x2ff, 0x1fe, 0x2fe].includes(data.sdowrite_can_packet_id)
          },
          {
            value: 0x208,
            label: '0x208 (ID 8)',
            valid_when: (data) => [0x1ff, 0x1fe].includes(data.sdowrite_can_packet_id)
          },
        ],
      },
      // Control Type
      {
        key: `sdowrite_motor${motorIndex}_control_type`,
        label: 'Control Type',
        type: 'radio',
        data_type: 'uint8_t',
        default: defaultControlType,
        visible_when: (data) => data[`sdowrite_motor${motorIndex}_can_id`] !== 0,
        options: [
          { value: 1, label: 'Openloop Current (0x01)', description: 'Direct current control, no PID' },
          { value: 2, label: 'Speed (0x02)', description: 'Speed control with PID' },
          { value: 3, label: 'Single-Round Position (0x03)', description: 'Position control with cascaded PID' },
        ],
      },
      // Speed PID
      {
        key: `sdowrite_motor${motorIndex}_speed_pid_kp`,
        label: 'Kp',
        type: 'number',
        data_type: 'float',
        default: 13.5,
        group: 'Speed PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 2,
      },
      {
        key: `sdowrite_motor${motorIndex}_speed_pid_ki`,
        label: 'Ki',
        type: 'number',
        data_type: 'float',
        default: 1.0,
        group: 'Speed PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 2,
      },
      {
        key: `sdowrite_motor${motorIndex}_speed_pid_kd`,
        label: 'Kd',
        type: 'number',
        data_type: 'float',
        default: 0.0,
        group: 'Speed PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 2,
      },
      {
        key: `sdowrite_motor${motorIndex}_speed_pid_max_out`,
        label: 'Max Out',
        type: 'number',
        data_type: 'float',
        default: 16384.0,
        group: 'Speed PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 2,
      },
      {
        key: `sdowrite_motor${motorIndex}_speed_pid_max_iout`,
        label: 'Max IOut',
        type: 'number',
        data_type: 'float',
        default: 2000.0,
        group: 'Speed PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 2,
      },
      // Angle PID
      {
        key: `sdowrite_motor${motorIndex}_angle_pid_kp`,
        label: 'Kp',
        type: 'number',
        data_type: 'float',
        default: 1.0,
        group: 'Angle PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 3,
      },
      {
        key: `sdowrite_motor${motorIndex}_angle_pid_ki`,
        label: 'Ki',
        type: 'number',
        data_type: 'float',
        default: 0.0,
        group: 'Angle PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 3,
      },
      {
        key: `sdowrite_motor${motorIndex}_angle_pid_kd`,
        label: 'Kd',
        type: 'number',
        data_type: 'float',
        default: 0.0,
        group: 'Angle PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 3,
      },
      {
        key: `sdowrite_motor${motorIndex}_angle_pid_max_out`,
        label: 'Max Out',
        type: 'number',
        data_type: 'float',
        default: 10000.0,
        group: 'Angle PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 3,
      },
      {
        key: `sdowrite_motor${motorIndex}_angle_pid_max_iout`,
        label: 'Max IOut',
        type: 'number',
        data_type: 'float',
        default: 1000.0,
        group: 'Angle PID',
        visible_when: (data) =>
          data[`sdowrite_motor${motorIndex}_can_id`] !== 0 &&
          data[`sdowrite_motor${motorIndex}_control_type`] >= 3,
      },
    ];
  }

  /**
   * 输出启用的电机字段 only
   */
  override generateTemplate(taskKey: string, snKey: string, segment: string): string {
    let template = `${taskKey}:\n`;
    template += `  sdowrite_task_type: !uint8_t ${this.config.id}\n`;
    template += `  conf_connection_lost_read_action: !uint8_t 1\n`;
    template += `  sdowrite_connection_lost_write_action: !uint8_t 2\n`;
    template += `  pub_topic: !std::string '/ecat/${snKey}/${segment}/read'\n`;
    template += `  pdoread_offset: !uint16_t 0\n`;
    template += `  sub_topic: !std::string '/ecat/${snKey}/${segment}/write'\n`;
    template += `  pdowrite_offset: !uint16_t 0\n`;

    // 添加基础字段
    const baseFields = ['sdowrite_control_period', 'sdowrite_can_inst', 'sdowrite_can_packet_id'];
    for (const fieldKey of baseFields) {
      const field = this.getField(fieldKey);
      if (field && field.default !== undefined) {
        template += `  ${field.key}: ${this.formatValue(field.default, field.data_type)}\n`;
      }
    }

    // 为每个电机添加字段
    for (let n = 1; n <= 4; n++) {
      const canIdField = this.getField(`sdowrite_motor${n}_can_id`);
      if (canIdField && canIdField.default !== undefined) {
        template += `  sdowrite_motor${n}_can_id: ${this.formatValue(canIdField.default, canIdField.data_type)}\n`;

        // 只有当 can_id != 0 时才添加其他字段
        if (canIdField.default !== 0) {
          const controlTypeField = this.getField(`sdowrite_motor${n}_control_type`);
          if (controlTypeField && controlTypeField.default !== undefined) {
            template += `  sdowrite_motor${n}_control_type: ${this.formatValue(controlTypeField.default, controlTypeField.data_type)}\n`;

            const controlType = controlTypeField.default;

            // control_type >= 2: 添加 speed PID
            if (controlType >= 2) {
              const speedPidFields = [
                `sdowrite_motor${n}_speed_pid_kp`,
                `sdowrite_motor${n}_speed_pid_ki`,
                `sdowrite_motor${n}_speed_pid_kd`,
                `sdowrite_motor${n}_speed_pid_max_out`,
                `sdowrite_motor${n}_speed_pid_max_iout`,
              ];
              for (const fieldKey of speedPidFields) {
                const field = this.getField(fieldKey);
                if (field && field.default !== undefined) {
                  template += `  ${field.key}: ${this.formatValue(field.default, field.data_type)}\n`;
                }
              }
            }

            // control_type >= 3: 添加 angle PID
            if (controlType >= 3) {
              const anglePidFields = [
                `sdowrite_motor${n}_angle_pid_kp`,
                `sdowrite_motor${n}_angle_pid_ki`,
                `sdowrite_motor${n}_angle_pid_kd`,
                `sdowrite_motor${n}_angle_pid_max_out`,
                `sdowrite_motor${n}_angle_pid_max_iout`,
              ];
              for (const fieldKey of anglePidFields) {
                const field = this.getField(fieldKey);
                if (field && field.default !== undefined) {
                  template += `  ${field.key}: ${this.formatValue(field.default, field.data_type)}\n`;
                }
              }
            }
          }
        }
      }
    }

    return template;
  }
}
