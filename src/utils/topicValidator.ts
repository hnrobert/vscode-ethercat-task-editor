import * as vscode from 'vscode';
import * as yaml from 'yaml';

export interface TopicDiagnostic {
  range: vscode.Range;
  message: string;
  severity: vscode.DiagnosticSeverity;
}

interface TaskTopicInfo {
  sIndex: number;
  tIndex: number;
  slaveKey: string;
  taskKey: string;
  pubTopic?: string;
  subTopic?: string;
  pubTopicRange?: vscode.Range;
  subTopicRange?: vscode.Range;
}

export function validateTopics(
  document: vscode.TextDocument,
  doc: yaml.Document,
  data: any,
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  if (!data?.slaves || !Array.isArray(data.slaves)) {
    return diagnostics;
  }

  const taskInfos: TaskTopicInfo[] = [];

  // Collect all task topic information
  data.slaves.forEach((slave: any, sIndex: number) => {
    if (!slave || typeof slave !== 'object') return;
    const slaveKey = Object.keys(slave)[0];
    const slaveData = slave[slaveKey];
    if (!slaveData || typeof slaveData !== 'object') return;

    const tasks = slaveData.tasks || [];

    tasks.forEach((task: any, tIndex: number) => {
      if (!task || typeof task !== 'object') return;
      const taskKey = Object.keys(task)[0];
      const taskData = task[taskKey];
      if (!taskData || typeof taskData !== 'object') return;

      const info: TaskTopicInfo = {
        sIndex,
        tIndex,
        slaveKey,
        taskKey,
        pubTopic: taskData.pub_topic,
        subTopic: taskData.sub_topic,
      };

      // Get ranges for topics
      if (taskData.pub_topic) {
        const range = getFieldRange(document, doc, [
          'slaves',
          sIndex,
          slaveKey,
          'tasks',
          tIndex,
          taskKey,
          'pub_topic',
        ]);
        if (range) info.pubTopicRange = range;
      }
      if (taskData.sub_topic) {
        const range = getFieldRange(document, doc, [
          'slaves',
          sIndex,
          slaveKey,
          'tasks',
          tIndex,
          taskKey,
          'sub_topic',
        ]);
        if (range) info.subTopicRange = range;
      }

      taskInfos.push(info);
    });
  });

  // Check for conflicts (same topic used multiple times globally)
  const topicMap = new Map<string, TaskTopicInfo[]>();

  taskInfos.forEach((info) => {
    if (info.pubTopic) {
      const key = `pub:${info.pubTopic}`;
      if (!topicMap.has(key)) topicMap.set(key, []);
      topicMap.get(key)!.push(info);
    }
    if (info.subTopic) {
      const key = `sub:${info.subTopic}`;
      if (!topicMap.has(key)) topicMap.set(key, []);
      topicMap.get(key)!.push(info);
    }
  });

  // Report conflicts
  topicMap.forEach((infos, key) => {
    if (infos.length > 1) {
      const [, topic] = key.split(':');
      infos.forEach((info) => {
        const type = key.startsWith('pub:') ? 'pub' : 'sub';
        const range = type === 'pub' ? info.pubTopicRange : info.subTopicRange;
        if (range) {
          diagnostics.push({
            range,
            message: `Topic conflict: "${topic}" is used by multiple tasks`,
            severity: vscode.DiagnosticSeverity.Error,
            source: 'ethercat-task-editor',
          });
        }
      });
    }
  });

  // Check for inconsistent segments within same task
  taskInfos.forEach((info) => {
    const segments = new Set<string>();

    if (info.pubTopic) {
      const segment = extractSegment(info.pubTopic);
      if (segment) segments.add(segment);
    }
    if (info.subTopic) {
      const segment = extractSegment(info.subTopic);
      if (segment) segments.add(segment);
    }

    if (segments.size > 1) {
      const segList = Array.from(segments);
      for (const range of [info.pubTopicRange, info.subTopicRange]) {
        if (range) {
          diagnostics.push({
            range,
            message: `Inconsistent segment in task ${info.taskKey}: found "${segList.join('", "')}"`,
            severity: vscode.DiagnosticSeverity.Warning,
            source: 'ethercat-task-editor',
          });
        }
      }
    }
  });

  return diagnostics;
}

function extractSegment(topic: string): string | null {
  // Expected format: /ecat/{segment}/read or /ecat/{segment}/write
  const match = topic.match(/^\/ecat\/([^/]+)\/(read|write)$/);
  return match ? match[1] : null;
}

function getFieldRange(
  document: vscode.TextDocument,
  doc: yaml.Document,
  path: (string | number)[],
): vscode.Range | null {
  try {
    const node = doc.getIn(path, true);
    if (!node || !yaml.isScalar(node)) return null;

    const range = node.range;
    if (!range) return null;

    const startPos = document.positionAt(range[0]);
    const endPos = document.positionAt(range[1]);

    return new vscode.Range(startPos, endPos);
  } catch {
    return null;
  }
}
