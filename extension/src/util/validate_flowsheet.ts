import * as fs from 'fs';

/**
 * Returns an array of FlowsheetRunner instance names found in the file at filePath.
 * If no FlowsheetRunner instances are found, returns an empty array.
 */
export function getFlowsheetRunners(filePath: string): string[] {
    const runners: string[] = [];
    console.debug(`Looking for FlowsheetRunner instances in ${filePath}...`);
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Look for FlowsheetRunner instance creation at global scope
        const regexp = /^\s*(\w+)\s*=\s*FlowsheetRunner\s*\(/gm;
        const matches = content.matchAll(regexp);
        for (const match of matches) {
            if (match[1]) {
                runners.push(match[1]);
            }
        }
    } catch {
        console.warn(`While looking for FlowsheetRunner objects: failed to read file at ${filePath}`);
    }
    return runners;
}
