import * as vscode from 'vscode';
import * as yaml from 'yaml';

/**
 * 检测文档是否是 EtherCAT 配置文件
 */
export function isEthercatYaml(document: vscode.TextDocument): boolean {
  // 必须是 YAML 文件
  if (document.languageId !== 'yaml' && document.languageId !== 'ethercat-yaml') {
    return false;
  }

  try {
    const text = document.getText();
    const parsed = yaml.parse(text);

    // 检查是否有 slaves 数组
    if (!parsed?.slaves || !Array.isArray(parsed.slaves)) {
      return false;
    }

    // 检查是否有 tasks 结构
    for (const slave of parsed.slaves) {
      if (!slave || typeof slave !== 'object') continue;
      const slaveKey = Object.keys(slave)[0];
      const slaveData = slave[slaveKey];
      if (slaveData?.tasks && Array.isArray(slaveData.tasks)) {
        // 检查是否有 sdowrite_task_type
        for (const task of slaveData.tasks) {
          if (!task || typeof task !== 'object') continue;
          const taskKey = Object.keys(task)[0];
          const taskData = task[taskKey];
          if (taskData?.sdowrite_task_type !== undefined) {
            return true;
          }
        }
      }
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 设置文档语言为 ethercat-yaml
 */
export async function setEthercatYamlLanguage(document: vscode.TextDocument): Promise<void> {
  if (document.languageId === 'yaml' && isEthercatYaml(document)) {
    await vscode.languages.setTextDocumentLanguage(document, 'ethercat-yaml');
  }
}
