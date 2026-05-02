import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from '../utils/yamlParser';

export class EthercatCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);
    const root = doc.contents;
    if (!yaml.isMap(root)) return [];

    const slavesNode = root.get('slaves', true);
    if (!yaml.isSeq(slavesNode)) return [];

    const lenses: vscode.CodeLens[] = [];

    for (let sIndex = 0; sIndex < slavesNode.items.length; sIndex++) {
      const slaveItem = slavesNode.items[sIndex];
      if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) continue;

      const keyNode = slaveItem.items[0].key;
      if (!yaml.isScalar(keyNode) || !keyNode.range) continue;

      const pos = document.positionAt(keyNode.range[0]);
      const line = pos.line;

      // Slave CodeLens
      const slaveName = String(keyNode.value);
      lenses.push(
        new vscode.CodeLens(
          new vscode.Range(line, 0, line, 0),
          {
            title: `Open "${slaveName}" in Editor`,
            command: 'ethercatTaskEditor.focusInWebview',
            arguments: [{ sIndex }],
          },
        ),
      );

      // Task CodeLenses
      const slaveData = slaveItem.items[0].value;
      if (!yaml.isMap(slaveData)) continue;

      const tasksNode = slaveData.get('tasks', true);
      if (!yaml.isSeq(tasksNode)) continue;

      for (let tIndex = 0; tIndex < tasksNode.items.length; tIndex++) {
        const taskItem = tasksNode.items[tIndex];
        if (!yaml.isMap(taskItem) || taskItem.items.length === 0) continue;

        const taskKeyNode = taskItem.items[0].key;
        if (!yaml.isScalar(taskKeyNode) || !taskKeyNode.range) continue;

        const taskPos = document.positionAt(taskKeyNode.range[0]);
        const taskLine = taskPos.line;
        const taskKey = String(taskKeyNode.value);

        lenses.push(
          new vscode.CodeLens(
            new vscode.Range(taskLine, 0, taskLine, 0),
            {
              title: `Open "${taskKey}" in Editor`,
              command: 'ethercatTaskEditor.focusInWebview',
              arguments: [{ sIndex, tIndex }],
            },
          ),
        );
      }
    }

    return lenses;
  }
}
