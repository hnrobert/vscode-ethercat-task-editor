export function getTaskTemplateYaml(type: number): string {
    let res = ``;
    switch (type) {
        // dji rc
        case 1: {
            break;
        }
        // lk motor
        case 2: {
            res += `sdowrite_control_period: !uint16_t 1\n`;
            res += `sdowrite_can_packet_id: !uint32_t 0x141\n`;
            res += `sdowrite_can_inst: !uint8_t 1\n`;
            res += `sdowrite_control_type: !uint8_t 8\n`;
            break;
        }
        // hipnuc imu can
        case 3: {
            res += `sdowrite_can_inst: !uint8_t 1\n`;
            res += `sdowrite_packet1_id: !uint32_t 0x01\n`;
            res += `sdowrite_packet2_id: !uint32_t 0x02\n`;
            res += `sdowrite_packet3_id: !uint32_t 0x03\n`;
            res += `conf_frame_name: !std::string 'imu_link'\n`;
            break;
        }
        // dshot600
        case 4: {
            res += `sdowrite_dshot_id: !uint8_t 1\n`;
            res += `sdowrite_init_value: !uint16_t 0\n`;
            break;
        }
        // dji motor
        case 5: {
            res += `sdowrite_control_period: !uint16_t 1\n`;
            res += `sdowrite_can_packet_id: !uint32_t 0x200\n`;
            res += `sdowrite_motor1_can_id: !uint32_t 0x201\n`;
            res += `sdowrite_motor2_can_id: !uint32_t 0x202\n`;
            res += `sdowrite_motor3_can_id: !uint32_t 0x203\n`;
            res += `sdowrite_motor4_can_id: !uint32_t 0\n`;
            res += `sdowrite_can_inst: !uint8_t 1\n`;
            res += `sdowrite_motor1_control_type: !uint8_t 2\n`;
            res += `sdowrite_motor1_speed_pid_kp: !float 13.5\n`;
            res += `sdowrite_motor1_speed_pid_ki: !float 1\n`;
            res += `sdowrite_motor1_speed_pid_kd: !float 0\n`;
            res += `sdowrite_motor1_speed_pid_max_out: !float 16384\n`;
            res += `sdowrite_motor1_speed_pid_max_iout: !float 2000\n`;
            res += `sdowrite_motor2_control_type: !uint8_t 2\n`;
            res += `sdowrite_motor2_speed_pid_kp: !float 13.5\n`;
            res += `sdowrite_motor2_speed_pid_ki: !float 1\n`;
            res += `sdowrite_motor2_speed_pid_kd: !float 0\n`;
            res += `sdowrite_motor2_speed_pid_max_out: !float 16384\n`;
            res += `sdowrite_motor2_speed_pid_max_iout: !float 2000\n`;
            res += `sdowrite_motor3_control_type: !uint8_t 1\n`;
            break;
        }
        // onboard pwm
        case 6: {
            break;
        }
        // external pwm
        case 7: {
            res += `sdowrite_uart_id: !uint8_t 1\n`;
            res += `sdowrite_pwm_period: !uint16_t 20000\n`;
            res += `sdowrite_channel_num: !uint8_t 1\n`;
            res += `sdowrite_init_value: !uint16_t 1000\n`;
            break;
        }
        // ms5876 30ba
        case 8: {
            res += `sdowrite_i2c_id: !uint8_t 1\n`;
            res += `sdowrite_osr_id: !uint8_t 5\n`;
            break;
        }
        // can pmu
        case 10: {
            break;
        }
        // sbus
        case 11: {
            break;
        }
        // dm motor
        case 12: {
            res += `sdowrite_control_period: !uint16_t 1\n`;
            res += `sdowrite_can_id: !uint16_t 0x01\n`;
            res += `sdowrite_master_id: !uint16_t 0x00\n`;
            res += `sdowrite_can_inst: !uint8_t 1\n`;
            res += `sdowrite_control_type: !uint8_t 1\n`;
            res += `conf_pmax: !float 12.5\n`;
            res += `conf_vmax: !float 30.0\n`;
            res += `conf_tmax: !float 10.0\n`;
            break;
        }
        // super cap
        case 13: {
            res += `sdowrite_can_inst: !uint8_t 1\n`;
            res += `sdowrite_chassis_to_cap_id: !uint32_t 0x210\n`;
            res += `sdowrite_cap_to_chassis_id: !uint32_t 0x211\n`;
            break;
        }
        // vt13
        case 14: {
            break;
        }
        // dd motor
        case 15: {
            res += `sdowrite_control_period: !uint16_t 1\n`;
            res += `sdowrite_can_baudrate: !uint8_t 1\n`;
            res += `sdowrite_can_packet_id: !uint32_t 0x1\n`;
            res += `sdowrite_motor1_can_id: !uint32_t 0\n`;
            res += `sdowrite_motor2_can_id: !uint32_t 0\n`;
            res += `sdowrite_motor3_can_id: !uint32_t 0\n`;
            res += `sdowrite_motor4_can_id: !uint32_t 0\n`;
            res += `sdowrite_can_inst: !uint8_t 1\n`;
            res += `sdowrite_motor1_control_type: !uint8_t 1\n`;
            break;
        }
    }
    return res;
}

export function generateTaskTemplate(
    taskKey: string,
    snKey: string,
    segment: string,
    taskType: number
): string {
    const hasRead = [1, 2, 3, 5, 8, 10, 11, 12, 13, 14, 15].includes(taskType);
    const hasWrite = [1, 2, 4, 5, 6, 7, 12, 13, 15].includes(taskType);

    let template = `${taskKey}:\n`;
    template += `  sdowrite_task_type: !uint8_t ${taskType}\n`;
    template += `  conf_connection_lost_read_action: !uint8_t 1\n`;

    if (hasWrite) {
        template += `  sdowrite_connection_lost_write_action: !uint8_t 2\n`;
    }

    if (hasRead) {
        template += `  pub_topic: !std::string '/ecat/${snKey}/${segment}/read'\n`;
        template += `  pdoread_offset: !uint16_t 0\n`;
    }

    if (hasWrite) {
        template += `  sub_topic: !std::string '/ecat/${snKey}/${segment}/write'\n`;
        template += `  pdowrite_offset: !uint16_t 0\n`;
    }

    const typeSpecific = getTaskTemplateYaml(taskType);
    if (typeSpecific) {
        template += typeSpecific.split('\n').map(line => line ? `  ${line}` : '').join('\n');
    }

    return template;
}
