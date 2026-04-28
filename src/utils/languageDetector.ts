import * as vscode from 'vscode';
import * as yaml from 'yaml';

/**
 * 检测文档是否是 EtherCAT 配置文件
 */
export function isEthercatYaml(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'yaml' && document.languageId !== 'ethercat-yaml') {
    return false;
  }

  try {
    const text = document.getText();
    if (!text.trim()) return false;
    const parsed = yaml.parse(text);
    return parsed && 'slaves' in parsed;
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
