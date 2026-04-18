import * as fs from 'fs';
import * as path from 'path';
import { parseYamlWithTags } from './yamlParser';

export interface BoardTypeDef {
  id: number;
  name: string;
  max_tx_pdo: number;
  max_rx_pdo: number;
}

interface BoardConfig {
  board_types: BoardTypeDef[];
}

let cachedBoardTypes: BoardTypeDef[] | null = null;

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
