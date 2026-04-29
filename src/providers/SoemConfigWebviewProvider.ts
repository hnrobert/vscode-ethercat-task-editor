import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from '../utils/yamlParser';
import { getBoardTypes } from '../utils/constantsParser';
import { TaskRegistry } from '../tasks';
import { TaskTypeMemory } from '../utils/taskTypeMemory';
import {
  applyAndSaveYaml,
  parseTopicSegment,
  toSnakeCase,
  nextTopicIndex,
} from '../utils/yamlUtils';
import { validateTopics } from '../utils/topicValidator';
import { validateTags } from '../utils/tagValidator';

function ensureBlockStyle(node: unknown) {
  if (yaml.isMap(node) || yaml.isSeq(node)) {
    node.flow = false;
    for (const item of node.items as any[]) {
      const child = yaml.isMap(node) ? item.value : item;
      ensureBlockStyle(child);
    }
  }
}

export class SoemConfigWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ethercatTaskEditor.sidebar';
  private _view?: vscode.WebviewView;
  private lastParsedDoc?: { doc: yaml.Document; data: any; isValid: boolean };
  private readonly taskTypeMemory = new TaskTypeMemory();
  private diagnosticCollection: vscode.DiagnosticCollection;

  public show() {
    if (this._view) {
      this._view.show();
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      'ethercat-task-editor',
    );

    context.subscriptions.push(this.diagnosticCollection);
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateWebview()),
    );
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.updateWebview()),
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          this.updateWebview();
        }
      }),
    );
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(() => this.updateWebview()),
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'refresh':
          this.updateWebview();
          break;
        case 'updateValue':
          await this.updateYamlValue(data.path, data.value);
          break;
        case 'addSlave':
          await this.addSlave();
          break;
        case 'addSlaveAt':
          await this.addSlaveAt(data.sIndex);
          break;
        case 'removeSlave':
          await this.removeSlave(data.sIndex);
          break;
        case 'renameSlave':
          await this.renameSlave(data.sIndex, data.newName);
          break;
          break;
        case 'addTask':
          await this.addTask(data.sIndex);
          break;
        case 'addTaskAt':
          await this.addTaskAt(data.sIndex, data.tIndex);
          break;
        case 'confirmTaskType':
          await this.createTaskWithType(
            data.sIndex,
            data.tIndex,
            data.taskType,
          );
          break;
        case 'removeTask':
          await this.removeTask(data.sIndex, data.tIndex);
          break;
        case 'renameTask':
          await this.renameTask(data.sIndex, data.tIndex, data.newSegment);
          break;
        case 'moveTask':
          await this.moveTask(
            data.fromSIndex,
            data.fromTIndex,
            data.toSIndex,
            data.toTIndex,
          );
          break;
        case 'moveSlave':
          await this.moveSlave(data.fromIndex, data.toIndex);
          break;
        case 'getTaskFields':
          this.handleGetTaskFields(data.taskType);
          break;
        case 'isFieldVisible':
          this.handleIsFieldVisible(
            data.taskType,
            data.fieldKey,
            data.taskData,
          );
          break;
        case 'getValidOptions':
          this.handleGetValidOptions(
            data.taskType,
            data.fieldKey,
            data.taskData,
          );
          break;
        case 'validateTask':
          this.handleValidateTask(data.taskType, data.taskData);
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateWebview();
      }
    });

    this.updateWebview();
  }

  public async refresh() {
    const editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      (!editor.document.fileName.endsWith('.yaml') &&
        !editor.document.fileName.endsWith('.yml'))
    ) {
      this.updateWebview();
      vscode.window.showWarningMessage(
        'No active YAML document to recalculate.',
      );
      return;
    }
    try {
      const doc = parseYamlDocumentWithTags(editor.document.getText());
      this.lastParsedDoc = { doc, data: doc.toJSON(), isValid: true };
      await this.saveDoc(editor, doc);
      vscode.window.showInformationMessage(
        'Offsets and lengths recalculated successfully.',
      );
    } catch (e) {
      this.updateWebview();
      vscode.window.showErrorMessage(`Recalculation failed: ${e}`);
    }
  }

  public collapseAll() {
    this._view?.webview.postMessage({ type: 'collapseAll' });
  }

  public expandAll() {
    this._view?.webview.postMessage({ type: 'expandAll' });
  }

  private updateWebview() {
    if (!this._view || !this._view.visible) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      (!editor.document.fileName.endsWith('.yaml') &&
        !editor.document.fileName.endsWith('.yml'))
    ) {
      this._view.webview.postMessage({
        type: 'setError',
        message: 'No active YAML document.',
      });
      this.diagnosticCollection.clear();
      return;
    }

    try {
      const text = editor.document.getText();
      const doc = parseYamlDocumentWithTags(text);
      const data = doc.toJSON();
      this.lastParsedDoc = { doc, data, isValid: true };

      // Validate topics and tags, set diagnostics
      const topicDiagnostics = validateTopics(editor.document, doc, data);
      const tagDiagnostics = validateTags(editor.document, doc);
      const allDiagnostics = [...topicDiagnostics, ...tagDiagnostics];
      this.diagnosticCollection.set(editor.document.uri, allDiagnostics);

      // Compute field visibility and option validity for all tasks
      const enrichedData = this.enrichDataWithVisibility(data);

      this._view.webview.postMessage({
        type: 'updateData',
        data: enrichedData,
        taskTypes: TaskRegistry.getTaskTypeList(),
        boardTypes: getBoardTypes(this.context.extensionPath),
      });
    } catch (e) {
      this._view.webview.postMessage({
        type: 'setError',
        message: 'Invalid YAML format: ' + e,
      });
      this.diagnosticCollection.clear();
    }
  }

  /**
   * 为数据添加字段可见性和选项有效性信息
   */
  private enrichDataWithVisibility(data: any): any {
    if (!data?.slaves) return data;

    const enriched = JSON.parse(JSON.stringify(data)); // Deep clone

    for (let sIndex = 0; sIndex < enriched.slaves.length; sIndex++) {
      const slave = enriched.slaves[sIndex];
      if (!slave) continue;

      for (const sKey of Object.keys(slave)) {
        const slaveData = slave[sKey];
        if (!slaveData?.tasks) continue;

        for (let tIndex = 0; tIndex < slaveData.tasks.length; tIndex++) {
          const taskList = slaveData.tasks[tIndex];
          if (!taskList) continue;

          for (const tKey of Object.keys(taskList)) {
            const taskData = taskList[tKey];
            if (!taskData?.sdowrite_task_type) continue;

            const taskType = Number(taskData.sdowrite_task_type);
            const task = TaskRegistry.getTask(taskType);
            if (!task) continue;

            // 标准化 taskData 中的十六进制值为数字
            const normalizedTaskData = this.normalizeTaskData(taskData);

            // 为每个字段添加可见性信息
            const fields = task.getFields();
            const fieldVisibility: Record<string, boolean> = {};
            const fieldDisabled: Record<string, boolean> = {};
            const fieldValidOptions: Record<string, any[]> = {};

            for (const field of fields) {
              // 计算字段可见性
              fieldVisibility[field.key] = task.isFieldVisible(field.key, normalizedTaskData);

              // 计算字段禁用状态
              fieldDisabled[field.key] = task.isFieldDisabled(field.key, normalizedTaskData);

              // 应用 from_yaml 转换：YAML 值 → UI 显示值
              if (field.from_yaml && taskData[field.key] !== undefined) {
                taskData[field.key] = field.from_yaml(taskData[field.key]);
              }

              // 计算选项有效性
              if (field.options) {
                const validOpts = task.getValidOptions(field.key, normalizedTaskData);
                fieldValidOptions[field.key] = validOpts;

                // 调试日志
                if (field.key.includes('motor') && field.key.includes('_can_id')) {
                  // console.log(`[enrichData] ${field.key}:`, {
                  //   packetId: normalizedTaskData.sdowrite_can_packet_id,
                  //   totalOptions: field.options.length,
                  //   validOptions: validOpts.length,
                  //   validOptionValues: validOpts.map(o => o.value),
                  // });
                }
              }
            }

            // 添加到 task 数据中
            taskData._fieldVisibility = fieldVisibility;
            taskData._fieldDisabled = fieldDisabled;
            taskData._fieldValidOptions = fieldValidOptions;
          }
        }
      }
    }

    return enriched;
  }

  /**
   * 标准化 task 数据，将十六进制字符串转换为数字
   */
  private normalizeTaskData(taskData: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(taskData)) {
      if (typeof value === 'string' && value.startsWith('0x')) {
        normalized[key] = parseInt(value, 16);
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  private async updateYamlValue(propertyPath: (string | number)[], value: any) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const doc = this.lastParsedDoc.doc;

    let finalValue = value;
    let isHex = false;

    if (typeof value === 'string' && value.toLowerCase().startsWith('0x')) {
      const parsedHex = parseInt(value, 16);
      if (!isNaN(parsedHex)) {
        finalValue = parsedHex;
        isHex = true;
      }
    }

    // 检查字段定义，判断是否应该使用十六进制
    const fieldKey = propertyPath[propertyPath.length - 1] as string;

    // 某些字段始终使用十六进制格式
    const alwaysHexKeys = new Set([
      'conf_connection_lost_read_action',
      'sdowrite_connection_lost_write_action',
      'board_type',
    ]);
    if (alwaysHexKeys.has(fieldKey)) {
      isHex = true;
    }

    if (fieldKey && propertyPath.length >= 6) {
      // 获取 task type
      const taskPath = propertyPath.slice(0, propertyPath.length - 1);
      const taskNode = doc.getIn(taskPath, true);
      if (yaml.isMap(taskNode)) {
        const taskTypeNode = taskNode.get('sdowrite_task_type', true);
        if (yaml.isScalar(taskTypeNode)) {
          const taskType = Number(taskTypeNode.value);
          const task = TaskRegistry.getTask(taskType);
          if (task) {
            const field = task.getField(fieldKey);
            if (field) {
              if (field.is_hex || field.yaml_hex) {
                isHex = true;
              } else if (typeof field.default === 'number' && field.default >= 0x100) {
                isHex = true;
              }
              // 应用 to_yaml 转换：UI 显示值 → YAML 存储值
              if (field.to_yaml) {
                finalValue = field.to_yaml(finalValue);
              }
            }
          }
        }
      }
    }

    const isTaskTypeChange =
      propertyPath.length > 0 &&
      propertyPath[propertyPath.length - 1] === 'sdowrite_task_type';

    const isBoardTypeChange =
      propertyPath.length > 0 &&
      propertyPath[propertyPath.length - 1] === 'board_type';

    const isControlTypeChange =
      propertyPath.length > 0 &&
      typeof propertyPath[propertyPath.length - 1] === 'string' &&
      (propertyPath[propertyPath.length - 1] as string).endsWith(
        '_control_type',
      );

    const isCanIdChange =
      propertyPath.length > 0 &&
      typeof propertyPath[propertyPath.length - 1] === 'string' &&
      (propertyPath[propertyPath.length - 1] as string).endsWith('_can_id');

    let savedTaskTypeValues: Record<string, any> | null = null;
    let oldFieldValue: any | undefined;

    // Save old field value before updating (for control_type or can_id)
    if (isControlTypeChange || isCanIdChange) {
      const taskPath = propertyPath.slice(0, propertyPath.length - 1);
      const taskNode = doc.getIn(taskPath, true);
      if (yaml.isMap(taskNode)) {
        const fieldKey = propertyPath[propertyPath.length - 1] as string;
        const oldNode = taskNode.get(fieldKey, true);
        if (yaml.isScalar(oldNode)) {
          oldFieldValue = oldNode.value;
        }
      }
    }

    if (isTaskTypeChange) {
      const sKey = propertyPath[2] as string;
      const tKey = propertyPath[5] as string;
      const sIndex = propertyPath[1] as number;
      const tIndex = propertyPath[4] as number;

      // 从 YAML 文档节点读取当前值（比 lastParsedDoc.data 更可靠）
      const taskNode = doc.getIn(
        ['slaves', sIndex, sKey, 'tasks', tIndex, tKey],
        true,
      );
      if (yaml.isMap(taskNode)) {
        const taskTypeNode = taskNode.get('sdowrite_task_type', true);
        const oldType = yaml.isScalar(taskTypeNode)
          ? Number(taskTypeNode.value)
          : Number(finalValue) === Number(taskTypeNode)
            ? Number(taskTypeNode)
            : 0;

        // 从 YAML 节点收集所有字段值
        const valuesToSave: Record<string, any> = {};
        for (const item of taskNode.items) {
          if (!yaml.isScalar(item.key)) continue;
          const key = String(item.key.value);
          if (key === 'pdoread_offset' || key === 'pdowrite_offset' || key.startsWith('_')) continue;
          let val: any;
          if (yaml.isScalar(item.value)) {
            val = item.value.value;
            // 十六进制字符串 → 数字
            if (typeof val === 'string' && val.startsWith('0x')) {
              const parsed = parseInt(val, 16);
              if (!isNaN(parsed)) val = parsed;
            }
          } else {
            val = item.value;
          }
          valuesToSave[key] = val;
        }
        this.taskTypeMemory.save(sKey, tKey, oldType, valuesToSave);

        savedTaskTypeValues = this.taskTypeMemory.get(
          sKey,
          tKey,
          Number(finalValue),
        );
      }
    }

    // Handle board_type insertion at correct position
    if (isBoardTypeChange) {
      const slavePath = propertyPath.slice(0, -1);
      const slaveNode = doc.getIn(slavePath, true);

      if (yaml.isMap(slaveNode)) {
        // Check if board_type already exists
        const existingBoardType = slaveNode.get('board_type', true);

        if (!existingBoardType) {
          // Create new board_type node with hex format
          const valueScalar = new yaml.Scalar(finalValue);
          valueScalar.tag = '!uint8_t';
          valueScalar.format = 'HEX';
          (valueScalar as any)._originalSource =
            '0x' + finalValue.toString(16).padStart(2, '0');
          valueScalar.toJSON = function () {
            return '0x' + (this as any).value.toString(16).padStart(2, '0');
          };

          const newPair = new yaml.Pair(
            new yaml.Scalar('board_type'),
            valueScalar,
          );

          // Insert at position 0 (right after the slave key, which is the map itself)
          slaveNode.items.splice(0, 0, newPair);

          await this.saveDoc(editor, doc);
          return;
        } else {
          // Update existing board_type with hex format
          doc.setIn(propertyPath, finalValue);
          const targetNode = doc.getIn(propertyPath, true);
          if (yaml.isScalar(targetNode)) {
            targetNode.format = 'HEX';
            (targetNode as any)._originalSource =
              '0x' + finalValue.toString(16).padStart(2, '0');
            targetNode.toJSON = function () {
              return '0x' + (this as any).value.toString(16).padStart(2, '0');
            };
          }
          await this.saveDoc(editor, doc);
          return;
        }
      }
    }

    doc.setIn(propertyPath, finalValue);

    const targetNode = doc.getIn(propertyPath, true);
    if (yaml.isScalar(targetNode)) {
      // 获取字段定义来确定数据类型
      const fieldKey = propertyPath[propertyPath.length - 1] as string;
      let dataType: string | undefined;

      // 已知的特殊字段数据类型
      const knownFieldTypes: Record<string, string> = {
        conf_connection_lost_read_action: 'uint8_t',
        sdowrite_connection_lost_write_action: 'uint8_t',
      };
      if (fieldKey in knownFieldTypes) {
        dataType = knownFieldTypes[fieldKey];
      }

      if (!dataType && fieldKey && propertyPath.length >= 6) {
        const taskPath = propertyPath.slice(0, propertyPath.length - 1);
        const taskNode = doc.getIn(taskPath, true);
        if (yaml.isMap(taskNode)) {
          const taskTypeNode = taskNode.get('sdowrite_task_type', true);
          if (yaml.isScalar(taskTypeNode)) {
            const taskType = Number(taskTypeNode.value);
            const task = TaskRegistry.getTask(taskType);
            if (task) {
              const field = task.getField(fieldKey);
              if (field) {
                dataType = field.data_type;
              }
            }
          }
        }
      }

      // 设置 YAML 标签
      if (dataType && !targetNode.tag) {
        targetNode.tag = `!${dataType}`;
      }

      if (isHex) {
        // 设置为十六进制格式
        targetNode.format = 'HEX';
        const hexStr = finalValue.toString(16).toUpperCase().padStart(2, '0');
        (targetNode as any)._originalSource = `0x${hexStr}`;
        targetNode.toJSON = function () {
          return '0x' + (this as any).value.toString(16).toUpperCase().padStart(2, '0');
        };
      } else if (typeof finalValue === 'number') {
        targetNode.format = 'PLAIN';
        (targetNode as any).toJSON = undefined;
        (targetNode as any)._originalSource = undefined;
      }
    }

    if (isTaskTypeChange) {
      const taskPath = propertyPath.slice(0, propertyPath.length - 1);
      const targetTaskNode = doc.getIn(taskPath, true);
      if (yaml.isMap(targetTaskNode)) {
        // 使用 TaskRegistry 获取 task 定义
        const task = TaskRegistry.getTask(Number(finalValue));
        if (!task) {
          // console.error(`Unknown task type: ${finalValue}`);
          return;
        }

        // 删除旧的 task 特定字段
        const keysToRemove: any[] = [];
        for (let i = 0; i < targetTaskNode.items.length; i++) {
          const item = targetTaskNode.items[i];
          if (!yaml.isScalar(item.key)) continue;
          const keyStr = String(item.key.value);

          if (
            (keyStr.startsWith('sdowrite_') || keyStr.startsWith('conf_')) &&
            keyStr !== 'sdowrite_task_type' &&
            keyStr !== 'conf_connection_lost_read_action' &&
            keyStr !== 'sdowrite_connection_lost_write_action' &&
            !keyStr.includes('_topic') &&
            !keyStr.includes('offset')
          ) {
            keysToRemove.push(item.key);
          }
        }

        keysToRemove.forEach((k) => targetTaskNode.delete(k));

        // 构建默认 taskData 用于 isFieldVisible 判断
        const fields = task.getFields();
        const defaultData: Record<string, any> = {};
        for (const f of fields) {
          if (f.default !== undefined) defaultData[f.key] = f.default;
        }
        // 如果有保存的值，覆盖默认值
        if (savedTaskTypeValues) {
          for (const [k, v] of Object.entries(savedTaskTypeValues)) {
            if (typeof v === 'string' && v.startsWith('0x')) {
              const parsed = parseInt(v, 16);
              if (!isNaN(parsed)) { defaultData[k] = parsed; continue; }
            }
            defaultData[k] = v;
          }
        }

        // 添加新 task 的默认字段（使用 yaml.Scalar 确保正确的 YAML 节点类型）
        for (const field of fields) {
          if (field.default === undefined) continue;
          // 跳过不可见的字段（如 control_type=1 时隐藏的 PID 字段）
          if (!task.isFieldVisible(field.key, defaultData)) continue;

          let finalFieldValue: any = defaultData[field.key] ?? field.default;

          // 十六进制字符串 "0x200" → 数字 512
          if (typeof finalFieldValue === 'string' && finalFieldValue.startsWith('0x')) {
            const parsed = parseInt(finalFieldValue, 16);
            if (!isNaN(parsed)) finalFieldValue = parsed;
          }

          // 创建 yaml.Scalar 节点
          const valueScalar = new yaml.Scalar(finalFieldValue);
          valueScalar.tag = `!${field.data_type}`;
          if ((field.is_hex || field.yaml_hex) && typeof finalFieldValue === 'number') {
            valueScalar.format = 'HEX';
            const hexStr = finalFieldValue.toString(16).toUpperCase().padStart(2, '0');
            (valueScalar as any)._originalSource = `0x${hexStr}`;
            valueScalar.toJSON = function () {
              return '0x' + (this as any).value.toString(16).toUpperCase().padStart(2, '0');
            };
          }

          targetTaskNode.add(new yaml.Pair(new yaml.Scalar(field.key), valueScalar));
        }
      }
    }

    // Handle field changes via task-specific hooks
    if ((isControlTypeChange || isCanIdChange) && oldFieldValue !== undefined) {
      const fieldKey = propertyPath[propertyPath.length - 1] as string;
      const taskPath = propertyPath.slice(0, propertyPath.length - 1);
      const taskNode = doc.getIn(taskPath, true);

      if (yaml.isMap(taskNode)) {
        // Get task type to retrieve task instance
        const taskTypeNode = taskNode.get('sdowrite_task_type', true);
        if (yaml.isScalar(taskTypeNode)) {
          const taskType = Number(taskTypeNode.value);
          const task = TaskRegistry.getTask(taskType);

          if (task) {
            // Get current task data
            const sIndex = propertyPath[1] as number;
            const sKey = propertyPath[2] as string;
            const tIndex = propertyPath[4] as number;
            const tKey = propertyPath[5] as string;

            const taskData =
              this.lastParsedDoc.data?.slaves?.[sIndex]?.[sKey]?.tasks?.[
                tIndex
              ]?.[tKey] || {};

            // Call task's onFieldChange hook
            const handled = task.onFieldChange({
              fieldKey,
              oldValue: oldFieldValue,
              newValue: finalValue,
              taskNode,
              taskData,
            });

            if (handled) {
              // console.log(
              //   `[Provider] Field change handled by task: ${fieldKey}`,
              // );

              // 重新排序字段
              task.reorderFields(taskNode);
            }
          }
        }
      }
    }

    await this.saveDoc(editor, doc);
  }

  private async addSlave() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const snName = await vscode.window.showInputBox({
      prompt: 'Enter new slave name (e.g., sn1234567)',
      value: 'sn0000000',
    });
    if (!snName) return;

    const doc = this.lastParsedDoc.doc;

    let slavesList = doc.getIn(['slaves']);
    if (!yaml.isSeq(slavesList)) {
      const seq = new yaml.YAMLSeq();
      seq.flow = false;
      doc.setIn(['slaves'], seq);
      slavesList = seq;
    }

    if (yaml.isSeq(slavesList)) {
      slavesList.flow = false;
      const newSlaveStr = `${snName}:
  board_type: !uint8_t 0x03
  sdo_len: !uint16_t 0
  task_count: !uint8_t 0
  latency_pub_topic: !std::string '/ecat/${snName.replace('+', '')}/latency'
  tasks:
`;
      const newSlaveNode = parseYamlDocumentWithTags(newSlaveStr).contents;
      if (newSlaveNode) {
        ensureBlockStyle(newSlaveNode);
        slavesList.items.push(newSlaveNode as any);
      }
      await this.saveDoc(editor, doc);
    }
  }

  private async addSlaveAt(sIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const snName = await vscode.window.showInputBox({
      prompt: 'Enter new slave name (e.g., sn1234567)',
      value: 'sn0000000',
    });
    if (!snName) return;

    const doc = this.lastParsedDoc.doc;

    let slavesList = doc.getIn(['slaves']);
    if (!yaml.isSeq(slavesList)) {
      const seq = new yaml.YAMLSeq();
      seq.flow = false;
      doc.setIn(['slaves'], seq);
      slavesList = seq;
    }

    if (yaml.isSeq(slavesList)) {
      slavesList.flow = false;
      const newSlaveStr = `${snName}:
  board_type: !uint8_t 0x03
  sdo_len: !uint16_t 0
  task_count: !uint8_t 0
  latency_pub_topic: !std::string '/ecat/${snName.replace('+', '')}/latency'
  tasks:
`;
      const newSlaveNode = parseYamlDocumentWithTags(newSlaveStr).contents;
      if (newSlaveNode) {
        ensureBlockStyle(newSlaveNode);
        slavesList.items.splice(sIndex, 0, newSlaveNode as any);
        await this.saveDoc(editor, doc);
      }
    }
  }

  private async removeSlave(sIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const result = await vscode.window.showWarningMessage(
      'Remove this entire slave?',
      { modal: true },
      'Remove',
    );
    if (result !== 'Remove') return;

    const doc = this.lastParsedDoc.doc;
    const slavesList = doc.getIn(['slaves']);
    if (yaml.isSeq(slavesList)) {
      slavesList.items.splice(sIndex, 1);
      await this.saveDoc(editor, doc);
    }
  }

  private async renameSlave(sIndex: number, newName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const keyNode = slaveItem.items[0].key;
    if (!yaml.isScalar(keyNode)) return;
    const currentName = String(keyNode.value);
    if (newName === currentName) return;

    this.taskTypeMemory.migrateSlave(currentName, newName);
    keyNode.value = newName;

    // Update latency_pub_topic to use new slave name
    const latencyTopic = doc.getIn([
      'slaves', sIndex, newName, 'latency_pub_topic',
    ]);
    if (typeof latencyTopic === 'string' && latencyTopic.includes(currentName)) {
      doc.setIn(
        ['slaves', sIndex, newName, 'latency_pub_topic'],
        latencyTopic.replace(currentName, newName),
      );
    }

    await this.saveDoc(editor, doc);
  }

  private async addTask(sIndex: number) {
    if (!this._view) return;

    // Request task type selection from webview
    this._view.webview.postMessage({
      type: 'requestTaskType',
      sIndex,
      tIndex: -1, // -1 means append
    });
  }

  private async addTaskAt(sIndex: number, tIndex: number) {
    if (!this._view) return;

    // Request task type selection from webview
    this._view.webview.postMessage({
      type: 'requestTaskType',
      sIndex,
      tIndex,
    });
  }

  private async createTaskWithType(
    sIndex: number,
    tIndex: number,
    taskType: number,
  ) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    let tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    if (!yaml.isSeq(tasksList)) {
      const seq = new yaml.YAMLSeq();
      seq.flow = false;
      doc.setIn(['slaves', sIndex, snKey, 'tasks'], seq);
      tasksList = seq;
    }

    if (yaml.isSeq(tasksList)) {
      tasksList.flow = false;
      const task = TaskRegistry.getTask(taskType);
      if (!task) return;
      const snakeName = toSnakeCase(task.getName());
      const index = nextTopicIndex(doc.toJSON(), snakeName);
      const segment = `${snakeName}_${index}`;

      if (tIndex === -1) {
        // Append to end
        const appIdx = tasksList.items.length + 1;
        const taskKey = `app_${appIdx}`;
        const newTaskStr = TaskRegistry.generateTemplate(
          taskType,
          taskKey,
          segment,
        );
        const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
        if (newTaskNode) {
          ensureBlockStyle(newTaskNode);
          tasksList.items.push(newTaskNode as any);
          doc.setIn(
            ['slaves', sIndex, snKey, 'task_count'],
            tasksList.items.length,
          );
          await this.saveDoc(editor, doc);
        }
      } else {
        // Insert at position
        const taskKey = `app_${tIndex + 1}`;
        const newTaskStr = TaskRegistry.generateTemplate(
          taskType,
          taskKey,
          segment,
        );
        const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
        if (newTaskNode) {
          ensureBlockStyle(newTaskNode);
          tasksList.items.splice(tIndex, 0, newTaskNode as any);
          doc.setIn(
            ['slaves', sIndex, snKey, 'task_count'],
            tasksList.items.length,
          );
          await this.saveDoc(editor, doc);
        }
      }
    }
  }


  private async removeTask(sIndex: number, tIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const result = await vscode.window.showWarningMessage(
      'Remove this task?',
      { modal: true },
      'Remove',
    );
    if (result !== 'Remove') return;

    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );
    const tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);

    if (yaml.isSeq(tasksList)) {
      tasksList.items.splice(tIndex, 1);
      doc.setIn(
        ['slaves', sIndex, snKey, 'task_count'],
        tasksList.items.length,
      );
      await this.saveDoc(editor, doc);
    }
  }

  private async renameTask(sIndex: number, tIndex: number, newSegment: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    const taskItem = doc.getIn(['slaves', sIndex, snKey, 'tasks', tIndex]);
    if (!yaml.isMap(taskItem) || taskItem.items.length === 0) return;
    const taskKeyNode = taskItem.items[0].key;
    if (!yaml.isScalar(taskKeyNode)) return;
    const currentKey = String(taskKeyNode.value);

    const pubTopic = doc.getIn([
      'slaves',
      sIndex,
      snKey,
      'tasks',
      tIndex,
      currentKey,
      'pub_topic',
    ]);
    const subTopic = doc.getIn([
      'slaves',
      sIndex,
      snKey,
      'tasks',
      tIndex,
      currentKey,
      'sub_topic',
    ]);

    if (typeof pubTopic === 'string') {
      const oldSeg = parseTopicSegment(pubTopic);
      if (oldSeg && oldSeg !== newSegment) {
        doc.setIn(
          ['slaves', sIndex, snKey, 'tasks', tIndex, currentKey, 'pub_topic'],
          pubTopic.replace(`/${oldSeg}/`, `/${newSegment}/`),
        );
      }
    }
    if (typeof subTopic === 'string') {
      const oldSeg = parseTopicSegment(subTopic);
      if (oldSeg && oldSeg !== newSegment) {
        doc.setIn(
          ['slaves', sIndex, snKey, 'tasks', tIndex, currentKey, 'sub_topic'],
          subTopic.replace(`/${oldSeg}/`, `/${newSegment}/`),
        );
      }
    }

    await this.saveDoc(editor, doc);
  }

  private async moveTask(
    fromSIndex: number,
    fromTIndex: number,
    toSIndex: number,
    toTIndex: number,
  ) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;

    // Get source
    const fromSlaveItem = doc.getIn(['slaves', fromSIndex]);
    if (!yaml.isMap(fromSlaveItem) || fromSlaveItem.items.length === 0) return;
    const fromSnKey = String(
      yaml.isScalar(fromSlaveItem.items[0].key)
        ? fromSlaveItem.items[0].key.value
        : '',
    );
    const fromTasksList = doc.getIn(['slaves', fromSIndex, fromSnKey, 'tasks']);
    if (!yaml.isSeq(fromTasksList) || fromTIndex >= fromTasksList.items.length)
      return;

    // Remove from source
    const taskNode = fromTasksList.items.splice(fromTIndex, 1)[0];
    doc.setIn(
      ['slaves', fromSIndex, fromSnKey, 'task_count'],
      fromTasksList.items.length,
    );

    // Adjust destination index if same slave
    let adjustedTIndex = toTIndex;
    if (fromSIndex === toSIndex && fromTIndex < toTIndex) {
      adjustedTIndex = toTIndex - 1;
    }

    // Get destination
    const toSlaveItem = doc.getIn(['slaves', toSIndex]);
    if (!yaml.isMap(toSlaveItem) || toSlaveItem.items.length === 0) return;
    const toSnKey = String(
      yaml.isScalar(toSlaveItem.items[0].key)
        ? toSlaveItem.items[0].key.value
        : '',
    );

    let toTasksList = doc.getIn(['slaves', toSIndex, toSnKey, 'tasks']);
    if (!yaml.isSeq(toTasksList)) {
      const seq = new yaml.YAMLSeq();
      seq.flow = false;
      doc.setIn(['slaves', toSIndex, toSnKey, 'tasks'], seq);
      toTasksList = seq;
    }

    if (yaml.isSeq(toTasksList)) {
      toTasksList.flow = false;
      toTasksList.items.splice(adjustedTIndex, 0, taskNode);
      doc.setIn(
        ['slaves', toSIndex, toSnKey, 'task_count'],
        toTasksList.items.length,
      );
      await this.saveDoc(editor, doc);
    }
  }

  private async moveSlave(fromIndex: number, toIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;

    const slavesList = doc.getIn(['slaves']);
    if (!yaml.isSeq(slavesList)) return;

    const slaveNode = slavesList.items.splice(fromIndex, 1)[0];

    let adjustedIndex = toIndex;
    if (fromIndex < toIndex) {
      adjustedIndex = toIndex - 1;
    }

    slavesList.items.splice(adjustedIndex, 0, slaveNode);
    await this.saveDoc(editor, doc);
  }

  private async saveDoc(editor: vscode.TextEditor, doc: yaml.Document) {
    await applyAndSaveYaml(
      editor,
      doc,
      () => this.updateWebview(),
    );
  }

  private getHtmlForWebview() {
    const webview = this._view!.webview;
    const extensionUri = this.context.extensionUri;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'assets', 'index.css'),
    );
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'assets', 'images', 'icon-stroke.svg'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>EtherCAT Task Editor</title>
</head>
<body>
  <div id="app" data-icon-uri="${iconUri}"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * 处理获取 task 字段定义
   */
  private handleGetTaskFields(taskType: number) {
    const task = TaskRegistry.getTask(taskType);
    if (!task) {
      this._view?.webview.postMessage({
        type: 'taskFieldsResponse',
        taskType,
        fields: [],
      });
      return;
    }

    this._view?.webview.postMessage({
      type: 'taskFieldsResponse',
      taskType,
      fields: task.getFields(),
    });
  }

  /**
   * 处理检查字段可见性
   */
  private handleIsFieldVisible(
    taskType: number,
    fieldKey: string,
    taskData: Record<string, any>,
  ) {
    const isVisible = TaskRegistry.isFieldVisible(taskType, fieldKey, taskData);
    this._view?.webview.postMessage({
      type: 'fieldVisibilityResponse',
      taskType,
      fieldKey,
      isVisible,
    });
  }

  /**
   * 处理获取有效选项
   */
  private handleGetValidOptions(
    taskType: number,
    fieldKey: string,
    taskData: Record<string, any>,
  ) {
    const task = TaskRegistry.getTask(taskType);
    if (!task) {
      this._view?.webview.postMessage({
        type: 'validOptionsResponse',
        taskType,
        fieldKey,
        options: [],
      });
      return;
    }

    const options = task.getValidOptions(fieldKey, taskData);

    // 只发送选项的值和标签，不发送函数
    const serializedOptions = options.map((opt) => ({
      value: opt.value,
      label: opt.label,
      description: opt.description,
    }));

    this._view?.webview.postMessage({
      type: 'validOptionsResponse',
      taskType,
      fieldKey,
      options: serializedOptions,
    });
  }

  /**
   * 处理验证 task
   */
  private handleValidateTask(taskType: number, taskData: Record<string, any>) {
    const errors = TaskRegistry.validateTask(taskType, taskData);
    this._view?.webview.postMessage({
      type: 'validateTaskResponse',
      taskType,
      errors,
    });
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
