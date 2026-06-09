// This is the config file for vscode test cli.
import { defineConfig } from '@vscode/test-cli';
import * as os from 'os';
import * as path from 'path';

/**
 * The test files are located in the `out/test` directory, which is the output of the TypeScript compilation.
 * The `launchArgs` option specifies additional arguments to pass when launching the VS Code instance for testing.
 * Here, we set a custom user data directory to avoid conflicts with the user's actual VS Code settings.
 * os.tmpdir() is used to get the system temp directory in a cross-platform way (/tmp on macOS/Linux, AppData\Local\Temp on Windows).
 * For more information on the available options, see the documentation for `@vscode/test-cli`.
 */
export default defineConfig({
  files: 'out/test/**/*.test.js',
  launchArgs: ['--user-data-dir', path.join(os.tmpdir(), 'vscode-test-data')],
});
