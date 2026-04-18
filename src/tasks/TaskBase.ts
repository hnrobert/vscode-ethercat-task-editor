/**
 * Base Task Class
 * 所有 task type 的基类，定义通用接口和默认行为
 */

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'number' | 'select' | 'radio' | 'hex' | 'text';
  data_type: string;
  default?: any;
  min?: number;
  max?: number;
  group?: string;
  help?: string;
  visible_when?: (data: Record<string, any>) => boolean;
  options?: FieldOption[];
}

export interface FieldOption {
  value: any;
  label: string;
  description?: string;
  valid_when?: (data: Record<string, any>) => boolean;
}

export interface TaskConfig {
  id: number;
  name: string;
  has_read: boolean;
  has_write: boolean;
  fields: FieldDefinition[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export abstract class TaskBase {
  protected config: TaskConfig;

  constructor(config: TaskConfig) {
    this.config = config;
  }

  /**
   * 获取 task 配置
   */
  getConfig(): TaskConfig {
    return this.config;
  }

  /**
   * 获取 task ID
   */
  getId(): number {
    return this.config.id;
  }

  /**
   * 获取 task 名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取所有字段定义
   */
  getFields(): FieldDefinition[] {
    return this.config.fields;
  }

  /**
   * 根据 key 获取字段定义
   */
  getField(key: string): FieldDefinition | undefined {
    return this.config.fields.find(f => f.key === key);
  }

  /**
   * 生成 task 的 YAML 模板
   * @param taskKey - task 的 key (e.g., "app_1")
   * @param snKey - slave 的 key (e.g., "sn1")
   * @param segment - segment 名称 (e.g., "app1")
   */
  generateTemplate(taskKey: string, snKey: string, segment: string): string {
    let template = `${taskKey}:\n`;
    template += `  sdowrite_task_type: !uint8_t ${this.config.id}\n`;
    template += `  conf_connection_lost_read_action: !uint8_t 1\n`;

    if (this.config.has_write) {
      template += `  sdowrite_connection_lost_write_action: !uint8_t 2\n`;
    }

    if (this.config.has_read) {
      template += `  pub_topic: !std::string '/ecat/${snKey}/${segment}/read'\n`;
      template += `  pdoread_offset: !uint16_t 0\n`;
    }

    if (this.config.has_write) {
      template += `  sub_topic: !std::string '/ecat/${snKey}/${segment}/write'\n`;
      template += `  pdowrite_offset: !uint16_t 0\n`;
    }

    // 添加所有字段的默认值
    for (const field of this.config.fields) {
      if (field.default !== undefined) {
        const value = this.formatValue(field.default, field.data_type);
        template += `  ${field.key}: ${value}\n`;
      }
    }

    return template;
  }

  /**
   * 格式化值为 YAML 格式
   */
  protected formatValue(value: any, dataType: string): string {
    if (dataType === 'std::string') {
      return `!std::string '${value}'`;
    }
    if (typeof value === 'number') {
      // 检查是否是十六进制
      const hexStr = '0x' + value.toString(16).toUpperCase();
      if (value > 255 || hexStr.length <= 6) {
        return `!${dataType} ${hexStr}`;
      }
    }
    return `!${dataType} ${value}`;
  }

  /**
   * 检查字段是否可见
   * @param fieldKey - 字段 key
   * @param taskData - 当前 task 的所有数据
   */
  isFieldVisible(fieldKey: string, taskData: Record<string, any>): boolean {
    const field = this.getField(fieldKey);
    if (!field || !field.visible_when) {
      return true;
    }

    try {
      return field.visible_when(taskData);
    } catch (e) {
      console.error(`Error evaluating visible_when for ${fieldKey}:`, e);
      return true;
    }
  }

  /**
   * 检查字段选项是否有效
   * @param fieldKey - 字段 key
   * @param optionValue - 选项值
   * @param taskData - 当前 task 的所有数据
   */
  isOptionValid(
    fieldKey: string,
    optionValue: any,
    taskData: Record<string, any>
  ): boolean {
    const field = this.getField(fieldKey);
    if (!field || !field.options) {
      return true;
    }

    const option = field.options.find(opt => opt.value === optionValue);
    if (!option || !option.valid_when) {
      return true;
    }

    try {
      return option.valid_when(taskData);
    } catch (e) {
      console.error(`Error evaluating valid_when for ${fieldKey} option ${optionValue}:`, e);
      return true;
    }
  }

  /**
   * 获取字段的有效选项列表
   * @param fieldKey - 字段 key
   * @param taskData - 当前 task 的所有数据
   */
  getValidOptions(fieldKey: string, taskData: Record<string, any>): FieldOption[] {
    const field = this.getField(fieldKey);
    if (!field || !field.options) {
      return [];
    }

    return field.options.filter(opt => {
      if (!opt.valid_when) {
        return true;
      }
      try {
        return opt.valid_when(taskData);
      } catch (e) {
        console.error(`Error evaluating valid_when for ${fieldKey} option ${opt.value}:`, e);
        return true;
      }
    });
  }

  /**
   * 验证 task 配置
   * @param taskData - task 的所有数据
   * @returns 验证错误列表
   */
  validate(taskData: Record<string, any>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const field of this.config.fields) {
      const value = taskData[field.key];

      // 检查必填字段
      if (value === undefined || value === null) {
        if (field.default === undefined) {
          errors.push({
            field: field.key,
            message: `Field '${field.label}' is required`,
            severity: 'error',
          });
        }
        continue;
      }

      // 检查数值范围
      if (field.type === 'number' && typeof value === 'number') {
        if (field.min !== undefined && value < field.min) {
          errors.push({
            field: field.key,
            message: `Value ${value} is less than minimum ${field.min}`,
            severity: 'error',
          });
        }
        if (field.max !== undefined && value > field.max) {
          errors.push({
            field: field.key,
            message: `Value ${value} is greater than maximum ${field.max}`,
            severity: 'error',
          });
        }
      }

      // 检查选项有效性
      if (field.options && field.options.length > 0) {
        const option = field.options.find(opt => opt.value === value);
        if (!option) {
          errors.push({
            field: field.key,
            message: `Invalid value '${value}' for field '${field.label}'`,
            severity: 'error',
          });
        } else if (option.valid_when) {
          try {
            if (!option.valid_when(taskData)) {
              errors.push({
                field: field.key,
                message: `Value '${option.label}' is not valid in current configuration`,
                severity: 'error',
              });
            }
          } catch (e) {
            console.error(`Error validating ${field.key}:`, e);
          }
        }
      }
    }

    return errors;
  }
}
