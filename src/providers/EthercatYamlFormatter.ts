import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from '../utils/yamlParser';
import { TaskRegistry } from '../tasks';

/**
 * EtherCAT YAML 格式化提供者
 * 负责：
 * 1. 重新排序字段
 * 2. 规范化空行
 * 3. 设置 2 空格缩进
 */
export class EthercatYamlFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    try {
      const text = document.getText();
      const doc = parseYamlDocumentWithTags(text);
      const data = doc.toJSON();

      if (!data?.slaves || !Array.isArray(data.slaves)) {
        return [];
      }

      // 重新排序所有 task 的字段
      this.reorderAllTaskFields(doc, data);

      // 生成格式化后的文本
      const formattedText = this.stringifyWithProperSpacing(doc);

      // 创建编辑操作：替换整个文档
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length),
      );

      return [vscode.TextEdit.replace(fullRange, formattedText)];
    } catch (e) {
      // console.error('Failed to format EtherCAT YAML:', e);
      return [];
    }
  }

  /**
   * 重新排序所有 task 的字段
   */
  private reorderAllTaskFields(doc: yaml.Document, data: any): void {
    for (let sIndex = 0; sIndex < data.slaves.length; sIndex++) {
      const slave = data.slaves[sIndex];
      if (!slave || typeof slave !== 'object') continue;

      const slaveKey = Object.keys(slave)[0];
      const tasks = slave[slaveKey]?.tasks;
      if (!Array.isArray(tasks)) continue;

      for (let tIndex = 0; tIndex < tasks.length; tIndex++) {
        const task = tasks[tIndex];
        if (!task || typeof task !== 'object') continue;

        const taskKey = Object.keys(task)[0];
        const taskData = task[taskKey];
        if (!taskData?.sdowrite_task_type) continue;

        const taskType = Number(taskData.sdowrite_task_type);
        const taskDef = TaskRegistry.getTask(taskType);
        if (!taskDef) continue;

        const taskNode = doc.getIn(
          ['slaves', sIndex, slaveKey, 'tasks', tIndex, taskKey],
          true,
        );

        if (yaml.isMap(taskNode)) {
          taskDef.reorderFields(taskNode);
        }
      }
    }
  }

  /**
   * 生成带有适当空行的 YAML 字符串
   */
  private stringifyWithProperSpacing(doc: yaml.Document): string {
    // 使用 yaml 库的 stringify 方法
    let text = doc.toString({
      indent: 2,
      lineWidth: 0, // 不限制行宽
    });

    // 规范化空行：
    // 1. 在 slaves 之间添加空行
    // 2. 在 tasks 之间添加空行
    // 3. 移除多余的空行

    // 在每个 slave 之间添加一个空行
    text = text.replace(/(\n  - [a-zA-Z0-9_]+:)/g, '\n$1');

    // 在每个 task 之间添加一个空行
    text = text.replace(/(\n        [a-zA-Z0-9_]+:)/g, '\n$1');

    // 移除连续的多个空行（保留最多一个空行）
    text = text.replace(/\n\n\n+/g, '\n\n');

    // 确保文件末尾只有一个换行符
    text = text.replace(/\n*$/, '\n');

    return text;
  }
}
