import * as fs from 'fs';
import * as path from 'path';

export interface MsgField {
  type: string;
  name: string;
}

export function parseMsgFolder(
  msgFolderPath: string,
): Record<string, MsgField[]> {
  const files = fs.readdirSync(msgFolderPath).filter((f) => f.endsWith('.msg'));
  const msgs: Record<string, MsgField[]> = {};
  for (const file of files) {
    const content = fs.readFileSync(path.join(msgFolderPath, file), 'utf8');
    const fields: MsgField[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        fields.push({ type: parts[0], name: parts[1] });
      }
    }
    msgs[file.replace('.msg', '')] = fields;
  }
  return msgs;
}
