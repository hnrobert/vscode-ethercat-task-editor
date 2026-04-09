import { MsgField } from './msgParser';

export function getTypeSize(type: string): number {
    if (type === 'uint8' || type === 'int8') return 1;
    if (type === 'uint16' || type === 'int16') return 2;
    if (type === 'uint32' || type === 'int32' || type === 'float32') return 4;
    if (type === 'uint64' || type === 'int64' || type === 'float64') return 8;
    return 0; // unknown
}

export function getMsgTotalSize(fields: MsgField[]): number {
    return fields.reduce((total, field) => total + getTypeSize(field.type), 0);
}
