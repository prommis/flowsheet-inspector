import * as fs from 'fs';

/**
 * Returns true if the file at filePath is a wrapped flowsheet
 * (i.e. contains the @FS.step("build") decorator required by flowsheet-inspector-lib).
 */
export function isWrappedFlowsheet(filePath: string): boolean {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.includes('@FS.step("build")');
    } catch {
        return false;
    }
}
