/**
 * Base Task Class
 * 所有 task type 的基类，定义通用接口和默认行为
 */

import * as yaml from 'yaml';

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

/**
 * Field change context - 字段变化时的上下文信息
 */
export interface FieldChangeContext {
  fieldKey: string;
  oldValue: any;
  newValue: any;
  taskNode: any; // yaml.YAMLMap type
  taskData: Record<string, any>;
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
    return this.config.fields.find((f) => f.key === key);
  }

  /**
   * 生成 task 的 YAML 模板
   * @param taskKey - task 的 key (e.g., "app_1")
   * @param segment - topic segment (e.g., "dji_motor_1")
   */
  generateTemplate(taskKey: string, segment: string): string {
    let template = `${taskKey}:\n`;
    template += `  sdowrite_task_type: !uint8_t ${this.config.id}\n`;
    template += `  conf_connection_lost_read_action: !uint8_t 1\n`;

    if (this.config.has_write) {
      template += `  sdowrite_connection_lost_write_action: !uint8_t 2\n`;
    }

    if (this.config.has_read) {
      template += `  pub_topic: !std::string '/ecat/${segment}/read'\n`;
      template += `  pdoread_offset: !uint16_t 0\n`;
    }

    if (this.config.has_write) {
      template += `  sub_topic: !std::string '/ecat/${segment}/write'\n`;
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
      // console.error(`Error evaluating visible_when for ${fieldKey}:`, e);
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
    taskData: Record<string, any>,
  ): boolean {
    const field = this.getField(fieldKey);
    if (!field || !field.options) {
      return true;
    }

    const option = field.options.find((opt) => opt.value === optionValue);
    if (!option || !option.valid_when) {
      return true;
    }

    try {
      return option.valid_when(taskData);
    } catch (e) {
      // console.error(
      //   `Error evaluating valid_when for ${fieldKey} option ${optionValue}:`,
      //   e,
      // );
      return true;
    }
  }

  /**
   * 获取字段的有效选项列表
   * @param fieldKey - 字段 key
   * @param taskData - 当前 task 的所有数据
   */
  getValidOptions(
    fieldKey: string,
    taskData: Record<string, any>,
  ): FieldOption[] {
    const field = this.getField(fieldKey);
    if (!field || !field.options) {
      return [];
    }

    return field.options.filter((opt) => {
      if (!opt.valid_when) {
        return true;
      }
      try {
        return opt.valid_when(taskData);
      } catch (e) {
        // console.error(
        //   `Error evaluating valid_when for ${fieldKey} option ${opt.value}:`,
        //   e,
        // );
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
        const option = field.options.find((opt) => opt.value === value);
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
            // console.error(`Error validating ${field.key}:`, e);
          }
        }
      }
    }

    return errors;
  }

  /**
   * 计算该 task 的 TXPDO (pdoread) 大小（字节）
   * 子类根据自身逻辑重写
   */
  calculateTxPdoSize(_taskData: Record<string, any>): number {
    return 0;
  }

  /**
   * 计算该 task 的 RXPDO (pdowrite) 大小（字节）
   * 子类根据自身逻辑重写
   */
  calculateRxPdoSize(_taskData: Record<string, any>): number {
    return 0;
  }

  /**
   * Hook: 当字段值变化时调用
   * 子类可以重写此方法来实现自定义逻辑（如添加/删除相关字段）
   *
   * @param _context - 字段变化的上下文信息
   * @returns 是否已处理（如果返回 true，provider 将跳过默认处理）
   */
  onFieldChange(_context: FieldChangeContext): boolean {
    // 默认不做任何处理
    return false;
  }

  /**
   * 重新排序 task 节点的字段，使其符合字段定义的顺序
   * @param taskNode - YAML task 节点
   */
  reorderFields(taskNode: any): void {
    if (!yaml.isMap(taskNode)) {
      return;
    }

    // 获取字段定义的顺序
    const fieldOrder = [
      'sdowrite_task_type',
      'conf_connection_lost_read_action',
      'sdowrite_connection_lost_write_action',
      'pub_topic',
      'pdoread_offset',
      'sub_topic',
      'pdowrite_offset',
      ...this.config.fields.map((f) => f.key),
    ];

    // 创建一个新的 items 数组，按照正确的顺序
    const newItems: any[] = [];
    const existingItems = new Map<string, any>();

    // 先收集所有现有的字段
    for (const item of taskNode.items) {
      if (yaml.isScalar(item.key)) {
        existingItems.set(String(item.key.value), item);
      }
    }

    // 按照字段顺序添加
    for (const fieldKey of fieldOrder) {
      if (existingItems.has(fieldKey)) {
        newItems.push(existingItems.get(fieldKey));
        existingItems.delete(fieldKey);
      }
    }

    // 添加任何未在字段顺序中的字段
    for (const item of existingItems.values()) {
      newItems.push(item);
    }

    // 替换 items
    taskNode.items = newItems;
  }
}
