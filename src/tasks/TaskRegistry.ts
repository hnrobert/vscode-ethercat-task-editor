/**
 * Task Registry
 * 管理所有 task types 的注册和访问
 */

import { TaskBase } from './TaskBase';
import { Task01_DJIRC } from './Task01_DJIRC';
import { Task02_LkTechMotor } from './Task02_LkTechMotor';
import { Task03_HipnucIMUCAN } from './Task03_HipnucIMUCAN';
import { Task04_DSHOT } from './Task04_DSHOT';
import { Task05_DJIMotor } from './Task05_DJIMotor';
import { Task06_OnboardPWM } from './Task06_OnboardPWM';
import { Task07_ExternalPWM } from './Task07_ExternalPWM';
import { Task08_MS5837 } from './Task08_MS5837';
import { Task09_ADC } from './Task09_ADC';
import { Task10_CANPMU } from './Task10_CANPMU';
import { Task11_SBUSRC } from './Task11_SBUSRC';
import { Task12_DMMotor } from './Task12_DMMotor';
import { Task13_SuperCap } from './Task13_SuperCap';
import { Task14_VT13RC } from './Task14_VT13RC';
import { Task15_DDMotor } from './Task15_DDMotor';

export class TaskRegistry {
  private static tasks: Map<number, TaskBase> = new Map();

  /**
   * 注册所有 task types
   */
  static initialize() {
    const taskClasses = [
      Task01_DJIRC,
      Task02_LkTechMotor,
      Task03_HipnucIMUCAN,
      Task04_DSHOT,
      Task05_DJIMotor,
      Task06_OnboardPWM,
      Task07_ExternalPWM,
      Task08_MS5837,
      Task09_ADC,
      Task10_CANPMU,
      Task11_SBUSRC,
      Task12_DMMotor,
      Task13_SuperCap,
      Task14_VT13RC,
      Task15_DDMotor,
    ];

    for (const TaskClass of taskClasses) {
      const task = new TaskClass();
      TaskRegistry.tasks.set(task.getId(), task);
    }
  }

  /**
   * 根据 ID 获取 task
   */
  static getTask(id: number): TaskBase | undefined {
    if (TaskRegistry.tasks.size === 0) {
      TaskRegistry.initialize();
    }
    return TaskRegistry.tasks.get(id);
  }

  /**
   * 获取所有 task types
   */
  static getAllTasks(): TaskBase[] {
    if (TaskRegistry.tasks.size === 0) {
      TaskRegistry.initialize();
    }
    return Array.from(TaskRegistry.tasks.values());
  }

  /**
   * 获取所有 task types 的简要信息（用于前端下拉列表）
   */
  static getTaskTypeList(): Array<{ id: number; name: string; has_read: boolean; has_write: boolean; fields?: any[] }> {
    return TaskRegistry.getAllTasks().map(task => ({
      id: task.getId(),
      name: task.getName(),
      has_read: task.getConfig().has_read,
      has_write: task.getConfig().has_write,
      fields: TaskRegistry.serializeFields(task.getFields()),
    }));
  }

  /**
   * 序列化字段定义，移除函数（函数将在后端评估）
   */
  private static serializeFields(fields: any[]): any[] {
    return fields.map(field => {
      const serialized: any = {
        key: field.key,
        label: field.label,
        type: field.type,
        data_type: field.data_type,
        default: field.default,
        min: field.min,
        max: field.max,
        group: field.group,
        help: field.help,
      };

      // 标记字段是否有 visible_when（但不发送函数本身）
      if (field.visible_when) {
        serialized.has_visible_when = true;
      }

      // 序列化选项，但移除 valid_when 函数
      if (field.options) {
        serialized.options = field.options.map((opt: any) => ({
          value: opt.value,
          label: opt.label,
          description: opt.description,
          has_valid_when: !!opt.valid_when,
        }));
      }

      return serialized;
    });
  }

  /**
   * 生成 task 模板
   */
  static generateTemplate(
    taskType: number,
    taskKey: string,
    snKey: string,
    segment: string
  ): string {
    const task = TaskRegistry.getTask(taskType);
    if (!task) {
      throw new Error(`Unknown task type: ${taskType}`);
    }
    return task.generateTemplate(taskKey, snKey, segment);
  }

  /**
   * 验证 task 配置
   */
  static validateTask(taskType: number, taskData: Record<string, any>) {
    const task = TaskRegistry.getTask(taskType);
    if (!task) {
      return [{ field: 'sdowrite_task_type', message: `Unknown task type: ${taskType}`, severity: 'error' as const }];
    }
    return task.validate(taskData);
  }

  /**
   * 检查字段是否可见
   */
  static isFieldVisible(taskType: number, fieldKey: string, taskData: Record<string, any>): boolean {
    const task = TaskRegistry.getTask(taskType);
    if (!task) {
      return true;
    }
    return task.isFieldVisible(fieldKey, taskData);
  }

  /**
   * 检查选项是否有效
   */
  static isOptionValid(
    taskType: number,
    fieldKey: string,
    optionValue: any,
    taskData: Record<string, any>
  ): boolean {
    const task = TaskRegistry.getTask(taskType);
    if (!task) {
      return true;
    }
    return task.isOptionValid(fieldKey, optionValue, taskData);
  }
}
