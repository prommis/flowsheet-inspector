/**
 * Checks which packages from required_package.json are missing from the
 * currently selected Python interpreter, using importlib.metadata so we
 * never need to spawn pip.  Returns one warning entry per missing package —
 * callers broadcast these to the webview so the user knows exactly what to
 * install without having to decode a raw subprocess error.
 */
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { type IResolvedPythonEnv, activatedProcessEnv } from './python_env';

export interface IPackageWarning {
    name: string;
    install_command: string;
}

interface IRequiredPackage {
    name: string;
    install_command: string;
}

/**
 * Reads the list of required packages from required_package.json (lives in
 * src/ at the extension root, adjacent to the compiled out/ directory).
 */
function loadRequiredPackages(): IRequiredPackage[] {
    // __dirname at runtime = <ext-root>/out/util  →  ../../src = <ext-root>/src
    const jsonPath = path.join(__dirname, '../../src/required_package.json');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw) as IRequiredPackage[];
}

/**
 * Tests whether a pip package (by its distribution name, e.g. "idaes-pse")
 * is installed in the given Python environment.
 *
 * Uses `importlib.metadata.distribution(name)` rather than spawning pip, so
 * it is fast and has zero side-effects.  Returns true if installed, false if
 * the PackageNotFoundError is raised (or the process fails for any reason).
 *
 * @param env  The resolved Python environment to check against.
 * @param name pip distribution name exactly as it appears in PyPI / the JSON.
 */
function isPackageInstalled(env: IResolvedPythonEnv, name: string): Promise<boolean> {
    return new Promise((resolve) => {
        const code = `import importlib.metadata; importlib.metadata.distribution(${JSON.stringify(name)})`;
        cp.execFile(
            env.interpreterPath,
            ['-c', code],
            { windowsHide: true, env: activatedProcessEnv(env) },
            (error) => resolve(!error),
        );
    });
}

/**
 * Checks every package listed in required_package.json against the given
 * Python environment and returns one warning entry for each missing package.
 *
 * All checks run in parallel so the total wait time equals the slowest single
 * check, not the sum of all checks.  Missing package entries include the
 * install_command from the JSON so the caller can surface actionable guidance
 * to the user without hard-coding install instructions in extension code.
 *
 * @param env The Python environment resolved from the VS Code Python extension.
 * @returns Array of missing packages (empty when all packages are present).
 */
export async function checkRequiredPackages(env: IResolvedPythonEnv): Promise<IPackageWarning[]> {
    let packages: IRequiredPackage[];
    try {
        packages = loadRequiredPackages();
    } catch (e) {
        console.error(`[checkRequiredPackages] Could not read required_package.json: ${e}`);
        return [];
    }

    const results = await Promise.all(
        packages.map(async (pkg) => ({
            pkg,
            installed: await isPackageInstalled(env, pkg.name),
        })),
    );

    return results
        .filter((r) => !r.installed)
        .map((r) => ({ name: r.pkg.name, install_command: r.pkg.install_command }));
}
