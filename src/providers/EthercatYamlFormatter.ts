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
    let text = doc.toString({
      indent: 2,
      lineWidth: 0,
    });

    // Step 1: Collapse ALL blank lines
    text = text.replace(/\n\n+/g, '\n');

    // Step 2: Add blank line before "tasks:"
    text = text.replace(/\n( {6}tasks:)/g, '\n\n$1');

    // Step 3: Add blank lines between tasks (skip first after "tasks:")
    text = text.replace(/\n( {8}- app_\d+:)/g, (match, p1, offset) => {
      const prevNewline = text.lastIndexOf('\n', offset - 1);
      const prevLine = text.substring(prevNewline + 1, offset).trimEnd();
      if (prevLine === '      tasks:') return match;
      return '\n\n' + p1;
    });

    // Step 4: Add blank lines between slaves (skip first after "slaves:")
    text = text.replace(/\n( {2}- [a-zA-Z0-9_]+:)/g, (match, p1, offset) => {
      const prevNewline = text.lastIndexOf('\n', offset - 1);
      const prevLine = text.substring(prevNewline + 1, offset).trimEnd();
      if (prevLine === 'slaves:') return match;
      return '\n\n' + p1;
    });

    // Ensure trailing newline
    text = text.replace(/\n*$/, '\n');

    return text;
  }
}
