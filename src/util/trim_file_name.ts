export function trimFileName(filePath: string) {
    const filePathArr = filePath.split('/');
    const fileName = filePathArr[filePathArr.length - 1];
    return fileName;
}