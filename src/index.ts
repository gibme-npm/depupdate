// Copyright (c) 2021-2025, Brandon Lehmann <brandonlehmann@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { existsSync } from 'fs';
import { resolve } from 'path';
import { exec } from 'child_process';
import Logger from '@gibme/logger';

const cwd = process.cwd() ?? './';
const swd = resolve(__dirname);

const run = async (cmd: string): Promise<[string, string, Error | null]> => {
    return new Promise(resolve => {
        exec(cmd, (error, stdout, stderr) => {
            stdout.split('\n')
                .map(line => Logger.debug(line));

            return resolve([stdout, stderr, error]);
        });
    });
};

const runPrintErrors = async (cmd: string): Promise<[string, string, Error | null]> => {
    const [stdout, stderr, error] = await run(cmd);

    if (error || stderr.length !== 0) {
        stderr.split('\n')
            .filter(line => line.trim().length !== 0)
            .map(line => Logger.error(line.trim()));
    }

    return [stdout, stderr, error];
};

const check_for_vulnerabilities = (stdout: string): boolean => {
    const matcher = stdout.match(/([0-9]*)/gm);

    if (!matcher) {
        return false;
    }

    return parseInt(matcher[0] || '0') !== 0;
};

const standardDevDependencies = [
    '@types/mocha',
    '@types/node',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'eslint',
    'eslint-config-standard',
    'eslint-plugin-import',
    'eslint-plugin-n',
    'eslint-plugin-node',
    'eslint-plugin-promise',
    'mocha',
    'ts-node',
    'typedoc',
    'typescript'
];

const format_dep = (dependencies: string[], latest = false): string =>
    (latest ? dependencies.map(dep => `${dep}@latest`) : dependencies)
        .join(' ');

(async () => {
    const is_yarn = existsSync(resolve(cwd, './yarn.lock'));
    const is_npm = existsSync(resolve(cwd, './package-lock.json'));
    const latest = process.argv.map(e => e.toLowerCase().trim())
        .includes('latest');
    const setup = process.argv.map(e => e.toLowerCase().trim())
        .includes('setup');

    const config: any = require(resolve(cwd, './package.json'));

    const dependencies: {name: string, items: string[], flags?: Partial<{yarn: string, npm: string}>}[] = [
        {
            name: 'dependencies',
            items: Object.keys(config.dependencies ?? []),
            flags: {
                npm: '--save'
            }
        },
        {
            name: 'development dependencies',
            items: Object.keys(config.devDependencies ?? []),
            flags: {
                yarn: '--dev',
                npm: '--save-dev'
            }
        },
        {
            name: 'peer dependencies',
            items: Object.keys(config.peerDependencies ?? []),
            flags: { yarn: '--peer' }
        },
        {
            name: 'optional dependencies',
            items: Object.keys(config.optionalDependencies ?? []),
            flags: {
                yarn: '--optional',
                npm: '--save-optional'
            }
        }
    ];

    let cmd = 'yarn';

    if (is_npm && is_yarn) {
        Logger.error('Cannot run while both yarn.lock and package-lock.json both exist...');

        return process.exit(1);
    } else if (is_npm) {
        Logger.warn('NPM detected...');

        cmd = 'npm install';
    } else if (is_yarn) {
        Logger.warn('Yarn detected...');

        if (!latest) {
            cmd = 'yarn upgrade';
        } else {
            cmd = 'yarn add';
        }
    } else if (!setup) {
        Logger.error('Cannot detect package management system');

        return process.exit(1);
    }

    for (const category of dependencies) {
        if (category.items.length !== 0) {
            Logger.info('Found %s', category.name);

            for (const dependency of category.items) {
                Logger.info('\t\t%s', dependency);
            }
        }
    }

    if (setup) {
        Logger.info('Setting up standard development dependencies...');

        if (is_npm) {
            await run(
                `npm install --save --dev ${format_dep(standardDevDependencies, latest)}`);
        } else {
            await run(
                `yarn add --dev ${format_dep(standardDevDependencies, latest)}`);
        }
    } else {
        if (latest) {
            Logger.warn('Set to update all dependencies to the latest version...');
        } else {
            Logger.warn('Set to update all dependencies to latest version within the rules in package.json...');
        }

        for (const category of dependencies) {
            if (category.items.length === 0) {
                continue;
            }

            const deps = format_dep(category.items, latest);

            const command_line =
                `${cmd} ${is_yarn ? category.flags?.yarn || '' : category.flags?.npm || ''} ${deps}`;

            Logger.warn(command_line);

            await run(command_line);
        }

        /**
         * We have to run at least twice as sometimes the linking that changes requires additional
         * linking changes
         */
        for (let i = 0; i < 2; ++i) {
            Logger.warn('Running audit checks... attempt #%s', i + 1);

            let run_fix = false;

            if (is_npm) {
                const [out] = await runPrintErrors('npm audit');

                run_fix = check_for_vulnerabilities(out);
            } else {
                const [out] = await runPrintErrors('yarn audit');

                run_fix = check_for_vulnerabilities(out);
            }

            if (run_fix) {
                Logger.warn('Attempting audit fixes...');

                if (is_npm) {
                    await runPrintErrors('npm audit fix');
                } else {
                    const cmd = resolve(`${swd}/../node_modules/.bin/yarn-audit-fix`);
                    await runPrintErrors(cmd);
                }
            } else {
                break;
            }
        }
    }
})();
