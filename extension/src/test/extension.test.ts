import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { trimFileName } from '../util/trim_file_name';
import { isWrappedFlowsheet } from '../util/validate_flowsheet';
import { getPlatform, isWindows } from '../util/platform_config';

suite('Extension', () => {
    test('activates successfully', async () => {
        const ext = vscode.extensions.getExtension('idaes-team.flowsheet-inspector');
        assert.ok(ext, 'Extension should be present');
        await ext!.activate();
        assert.strictEqual(ext!.isActive, true);
    });

    test('registers idaes commands', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.some(cmd => cmd.startsWith('idaes.')));
    });
});

suite('trimFileName', () => {
    test('returns filename from Unix path', () => {
        assert.strictEqual(trimFileName('/home/user/project/flowsheet.py'), 'flowsheet.py');
    });

    test('returns filename from Windows path', () => {
        assert.strictEqual(trimFileName('C:\\Users\\user\\project\\flowsheet.py'), 'flowsheet.py');
    });

    test('returns filename when given filename only', () => {
        assert.strictEqual(trimFileName('flowsheet.py'), 'flowsheet.py');
    });
});

suite('isWrappedFlowsheet', () => {
    let tmpFile: string;

    setup(() => {
        tmpFile = path.join(os.tmpdir(), `test_flowsheet_${Date.now()}.py`);
    });

    teardown(() => {
        if (fs.existsSync(tmpFile)) {
            fs.unlinkSync(tmpFile);
        }
    });

    test('returns true for a valid wrapped flowsheet', () => {
        fs.writeFileSync(tmpFile, '@FS.step("build")\ndef build():\n    pass\n');
        assert.strictEqual(isWrappedFlowsheet(tmpFile), true);
    });

    test('returns false for a plain Python file', () => {
        fs.writeFileSync(tmpFile, 'def build():\n    pass\n');
        assert.strictEqual(isWrappedFlowsheet(tmpFile), false);
    });

    test('returns false for a non-existent file', () => {
        assert.strictEqual(isWrappedFlowsheet('/non/existent/path.py'), false);
    });
});

suite('getPlatform', () => {
    test('returns a known platform string', () => {
        const platform = getPlatform();
        assert.ok(['win32', 'darwin', 'linux'].includes(platform));
    });

    test('isWindows matches current platform', () => {
        assert.strictEqual(isWindows(), os.platform() === 'win32');
    });
});
