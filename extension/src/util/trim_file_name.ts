export function trimFileName(filePath: string) {
    return filePath.split(/[\\/]/).pop() ?? filePath;
}