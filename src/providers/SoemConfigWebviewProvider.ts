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
        case 'renameSlaveAlias':
          await this.renameSlaveAlias(data.sIndex, data.newAlias);
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
            const fieldValidOptions: Record<string, any[]> = {};

            for (const field of fields) {
              // 计算字段可见性
              fieldVisibility[field.key] = task.isFieldVisible(field.key, normalizedTaskData);

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
            if (field && typeof field.default === 'number') {
              // 检查 default 值是否是十六进制表示（>= 0x100 或特定字段）
              const shouldBeHex =
                field.default >= 0x100 ||
                fieldKey.includes('can_id') ||
                fieldKey.includes('packet_id') ||
                fieldKey.includes('can_packet_id');

              if (shouldBeHex) {
                isHex = true;
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

      const taskData =
        this.lastParsedDoc.data?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[
          tKey
        ];
      if (taskData) {
        const oldType = Number(taskData.sdowrite_task_type);

        const valuesToSave: Record<string, any> = {};
        for (const [key, val] of Object.entries(taskData)) {
          if (key !== 'pdoread_offset' && key !== 'pdowrite_offset') {
            valuesToSave[key] = val;
          }
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

      if (fieldKey && propertyPath.length >= 6) {
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
        (targetNode as any)._originalSource =
          `0x${finalValue.toString(16).toUpperCase()}`;
        targetNode.toJSON = function () {
          return '0x' + (this as any).value.toString(16).toUpperCase();
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

        // 添加新 task 的默认字段
        const fields = task.getFields();
        for (const field of fields) {
          if (field.default !== undefined) {
            const value = field.default;
            const dataType = field.data_type;

            // 恢复保存的值（如果存在）
            const finalFieldValue =
              savedTaskTypeValues && field.key in savedTaskTypeValues
                ? savedTaskTypeValues[field.key]
                : value;

            targetTaskNode.set(field.key, finalFieldValue);

            // 设置 YAML 标签
            const node = targetTaskNode.get(field.key, true);
            if (yaml.isScalar(node)) {
              node.tag = `!${dataType}`;
            }
          }
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
    if (!slavesList) {
      doc.setIn(['slaves'], []);
      slavesList = doc.getIn(['slaves']);
    }

    if (yaml.isSeq(slavesList)) {
      const newSlaveStr = `${snName}:
  sdo_len: !uint16_t 0
  task_count: !uint8_t 0
  latency_pub_topic: !std::string '/ecat/${snName.replace('+', '')}/latency'
  tasks: []
`;
      const newSlaveNode = parseYamlDocumentWithTags(newSlaveStr).contents;
      if (newSlaveNode) slavesList.items.push(newSlaveNode as any);
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
    if (!slavesList) {
      doc.setIn(['slaves'], []);
      slavesList = doc.getIn(['slaves']);
    }

    if (yaml.isSeq(slavesList)) {
      const newSlaveStr = `${snName}:
  sdo_len: !uint16_t 0
  task_count: !uint8_t 0
  latency_pub_topic: !std::string '/ecat/${snName.replace('+', '')}/latency'
  tasks: []
`;
      const newSlaveNode = parseYamlDocumentWithTags(newSlaveStr).contents;
      if (newSlaveNode) {
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
    await this.saveDoc(editor, doc);
  }

  private async renameSlaveAlias(sIndex: number, newAlias: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    const latencyTopic = doc.getIn([
      'slaves',
      sIndex,
      snKey,
      'latency_pub_topic',
    ]);
    let currentAlias = snKey;
    if (typeof latencyTopic === 'string') {
      const m = latencyTopic.match(/^\/ecat\/([^/]+)\/latency/);
      if (m) currentAlias = m[1];
    }
    if (currentAlias === newAlias) return;

    if (typeof latencyTopic === 'string') {
      doc.setIn(
        ['slaves', sIndex, snKey, 'latency_pub_topic'],
        latencyTopic.replace(`/ecat/${currentAlias}/`, `/ecat/${newAlias}/`),
      );
    }

    const tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    if (yaml.isSeq(tasksList)) {
      tasksList.items.forEach((taskNode: any, tIndex: number) => {
        if (!yaml.isMap(taskNode) || taskNode.items.length === 0) return;
        const taskKey = String(
          yaml.isScalar(taskNode.items[0].key)
            ? taskNode.items[0].key.value
            : '',
        );
        const base = ['slaves', sIndex, snKey, 'tasks', tIndex, taskKey];
        for (const field of ['pub_topic', 'sub_topic'] as const) {
          const topic = doc.getIn([...base, field]);
          if (
            typeof topic === 'string' &&
            topic.includes(`/ecat/${currentAlias}/`)
          ) {
            doc.setIn(
              [...base, field],
              topic.replace(`/ecat/${currentAlias}/`, `/ecat/${newAlias}/`),
            );
          }
        }
      });
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
    if (!tasksList) {
      doc.setIn(['slaves', sIndex, snKey, 'tasks'], []);
      tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    }

    if (yaml.isSeq(tasksList)) {
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
          snKey,
          segment,
        );
        const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
        if (newTaskNode) {
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
          snKey,
          segment,
        );
        const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
        if (newTaskNode) {
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
    if (!toTasksList) {
      doc.setIn(['slaves', toSIndex, toSnKey, 'tasks'], []);
      toTasksList = doc.getIn(['slaves', toSIndex, toSnKey, 'tasks']);
    }

    if (yaml.isSeq(toTasksList)) {
      // Cross-slave: update topic namespace
      if (fromSIndex !== toSIndex) {
        this.remapTaskTopics(taskNode, fromSnKey, toSnKey);
      }

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

  /** Update /ecat/{oldSlave}/... → /ecat/{newSlave}/... in task topics */
  private remapTaskTopics(taskNode: any, oldSnKey: string, newSnKey: string) {
    if (!yaml.isMap(taskNode)) return;
    const innerMap = taskNode.items[0]?.value;
    if (!yaml.isMap(innerMap)) return;

    for (const item of innerMap.items) {
      if (!yaml.isScalar(item.key)) continue;
      const key = String(item.key.value);
      if (
        (key === 'pub_topic' || key === 'sub_topic') &&
        yaml.isScalar(item.value)
      ) {
        const topic = String(item.value.value);
        if (topic.includes(`/ecat/${oldSnKey}/`)) {
          item.value.value = topic.replace(
            `/ecat/${oldSnKey}/`,
            `/ecat/${newSnKey}/`,
          );
        }
      }
    }
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
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>EtherCAT Task Editor</title>
</head>
<body>
  <div id="app"></div>
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
