import * as vscode from 'vscode';
import * as yaml from 'yaml';

/**
 * 验证 EtherCAT YAML 中的 tag
 * 确保每个值都有正确的 tag
 */
export function validateTags(
  document: vscode.TextDocument,
  doc: yaml.Document,
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  // 允许的 tag 列表
  const validTags = new Set([
    'std::string',
    'uint8_t',
    'uint16_t',
    'uint32_t',
    'int8_t',
    'int16_t',
    'int32_t',
    'float',
  ]);

  // 不需要检查 tag 的字段（结构性字段）
  const skipFields = new Set([
    'slaves',
    'tasks',
    'alias',
    'sn',
    'board_type',
    '_fieldVisibility',
    '_fieldValidOptions',
  ]);

  /**
   * 递归检查节点
   */
  function checkNode(node: any, path: (string | number)[]): void {
    if (yaml.isMap(node)) {
      for (const pair of node.items) {
        if (!yaml.isScalar(pair.key)) continue;
        const key = String(pair.key.value);

        // 跳过不需要检查的字段
        if (skipFields.has(key) || key.startsWith('_')) continue;

        const value = pair.value;

        // 检查值节点
        if (yaml.isScalar(value)) {
          const tag = value.tag;

          // 检查是否有 tag
          if (!tag || tag === '?') {
            // 没有 tag，添加警告
            const range = getNodeRange(document, value);
            if (range) {
              diagnostics.push({
                range,
                message: `Missing type tag for field '${key}'. Expected one of: !std::string, !uint8_t, !uint16_t, !uint32_t, !int8_t, !int16_t, !int32_t, !float`,
                severity: vscode.DiagnosticSeverity.Warning,
                source: 'ethercat-task-editor',
                code: 'missing-tag',
              });
            }
          } else {
            // 有 tag，检查是否是有效的 tag
            const tagName = tag.replace(/^!/, '');
            if (!validTags.has(tagName)) {
              // 尝试获取 tag 的精确位置
              const tagRange = getTagRange(document, value, tag);
              const range = tagRange || getNodeRange(document, value);
              if (range) {
                diagnostics.push({
                  range,
                  message: `Invalid type tag '!${tagName}'. Expected one of: !std::string, !uint8_t, !uint16_t, !uint32_t, !int8_t, !int16_t, !int32_t, !float`,
                  severity: vscode.DiagnosticSeverity.Error,
                  source: 'ethercat-task-editor',
                  code: 'invalid-tag',
                });
              }
            }
          }
        } else if (yaml.isMap(value) || yaml.isSeq(value)) {
          // 递归检查子节点
          checkNode(value, [...path, key]);
        }
      }
    } else if (yaml.isSeq(node)) {
      for (let i = 0; i < node.items.length; i++) {
        const item = node.items[i];
        checkNode(item, [...path, i]);
      }
    }
  }

  // 从根节点开始检查
  checkNode(doc.contents, []);

  return diagnostics;
}

/**
 * 获取节点在文档中的范围
 */
function getNodeRange(
  document: vscode.TextDocument,
  node: any,
): vscode.Range | null {
  try {
    if (!node || !node.range) return null;

    const range = node.range;
    const startPos = document.positionAt(range[0]);
    const endPos = document.positionAt(range[1]);

    return new vscode.Range(startPos, endPos);
  } catch {
    return null;
  }
}

/**
 * 获取 tag 在文档中的精确范围
 */
function getTagRange(
  document: vscode.TextDocument,
  node: any,
  tag: string,
): vscode.Range | null {
  try {
    if (!node || !node.range) return null;

    const range = node.range;
    const startOffset = range[0];
    const endOffset = range[1];

    // 获取节点的文本
    const text = document.getText(
      new vscode.Range(
        document.positionAt(startOffset),
        document.positionAt(endOffset),
      ),
    );

    // 查找 tag 的位置
    const tagIndex = text.indexOf(tag);
    if (tagIndex === -1) return null;

    // 计算 tag 的起始和结束位置
    const tagStart = startOffset + tagIndex;
    const tagEnd = tagStart + tag.length;

    return new vscode.Range(
      document.positionAt(tagStart),
      document.positionAt(tagEnd),
    );
  } catch {
    return null;
  }
}
