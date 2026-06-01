import * as path from 'path';

export function trimFileName(filePath: string) {
    return path.basename(filePath);
}