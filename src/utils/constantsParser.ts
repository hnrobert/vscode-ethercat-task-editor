import * as fs from 'fs';
import * as path from 'path';
import { parseYamlWithTags } from './yamlParser';

export interface TaskTypeDef {
  id: number;
  description: string;
  has_read: boolean;
  has_write: boolean;
  template?: string;
}

export interface BoardTypeDef {
  id: number;
  name: string;
  max_tx_pdo: number;
  max_rx_pdo: number;
}

interface TaskConfig {
  task_types: TaskTypeDef[];
}

interface BoardConfig {
  board_types: BoardTypeDef[];
}

let cachedTaskTypes: TaskTypeDef[] | null = null;
let cachedBoardTypes: BoardTypeDef[] | null = null;

function loadTaskConfig(extensionPath: string): TaskConfig {
  const yamlPath = path.join(
    extensionPath,
    'assets',
    'constants',
    'task_templates.yaml',
  );
  const text = fs.readFileSync(yamlPath, 'utf-8');
  return parseYamlWithTags(text) as TaskConfig;
}

function loadBoardConfig(extensionPath: string): BoardConfig {
  const yamlPath = path.join(
    extensionPath,
    'assets',
    'constants',
    'board_types.yaml',
  );
  const text = fs.readFileSync(yamlPath, 'utf-8');
  return parseYamlWithTags(text) as BoardConfig;
}

export function getTaskTypes(extensionPath: string): TaskTypeDef[] {
  if (!cachedTaskTypes) {
    cachedTaskTypes = loadTaskConfig(extensionPath).task_types;
  }
  return cachedTaskTypes;
}

export function getBoardTypes(extensionPath: string): BoardTypeDef[] {
  if (!cachedBoardTypes) {
    const raw = loadBoardConfig(extensionPath).board_types;
    cachedBoardTypes = raw.map(bt => ({
      ...bt,
      id: typeof bt.id === 'number' ? bt.id : parseInt(String(bt.id), 16),
    }));
  }
  return cachedBoardTypes;
}

export function getTaskTypeDef(
  extensionPath: string,
  typeId: number,
): TaskTypeDef | undefined {
  return getTaskTypes(extensionPath).find((t) => t.id === typeId);
}

export function getTaskTemplateYaml(
  extensionPath: string,
  typeId: number,
): string {
  const def = getTaskTypeDef(extensionPath, typeId);
  return def?.template ?? '';
}

export function generateTaskTemplate(
  extensionPath: string,
  taskKey: string,
  snKey: string,
  segment: string,
  taskType: number,
): string {
  const def = getTaskTypeDef(extensionPath, taskType);

  let template = `${taskKey}:\n`;
  template += `  sdowrite_task_type: !uint8_t ${taskType}\n`;
  template += `  conf_connection_lost_read_action: !uint8_t 1\n`;

  if (def?.has_write) {
    template += `  sdowrite_connection_lost_write_action: !uint8_t 2\n`;
  }

  if (def?.has_read) {
    template += `  pub_topic: !std::string '/ecat/${snKey}/${segment}/read'\n`;
    template += `  pdoread_offset: !uint16_t 0\n`;
  }

  if (def?.has_write) {
    template += `  sub_topic: !std::string '/ecat/${snKey}/${segment}/write'\n`;
    template += `  pdowrite_offset: !uint16_t 0\n`;
  }

  const typeSpecific = def?.template ?? '';
  if (typeSpecific) {
    template += typeSpecific
      .split('\n')
      .map((line: string) => (line ? `  ${line}` : ''))
      .join('\n');
  }

  return template;
}

