// Copyright (c) 2021-2023, Brandon Lehmann <brandonlehmann@gmail.com>
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

const run = async (cmd: string): Promise<[string, string, Error | null]> => {
    return new Promise(resolve => {
        exec(cmd, (error, stdout, stderr) => {
            return resolve([stdout, stderr, error]);
        });
    });
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

    const config = require(resolve(cwd, './package.json'));

    const dependencies = Object.keys(config.dependencies ?? []);
    const devDependencies = Object.keys(config.devDependencies ?? []);
    const peerDependencies = Object.keys(config.peerDependencies ?? []);
    const optionalDependencies = Object.keys(config.optionalDependencies ?? []);

    let cmd = 'yarn';

    if (is_npm && is_yarn) {
        Logger.error('Cannot run while both yarn.lock and package-lock.json both exist...');

        return process.exit(1);
    } else if (is_npm) {
        Logger.warn('NPM detected...');

        if (latest) {
            cmd = 'npm install --save';
        } else {
            cmd = 'npm update --save';
        }
    } else if (is_yarn) {
        Logger.warn('Yarn detected...');
    } else if (!setup) {
        Logger.error('Cannot detect package management system');

        return process.exit(1);
    }

    if (setup) {
        Logger.info('Setting up standard development dependencies...');

        if (is_npm) {
            const [stdout] = await run(
                `npm install --save --dev ${format_dep(standardDevDependencies, latest)}`);

            stdout.split('\n')
                .map(line => Logger.debug(line));
        } else {
            const [stdout] = await run(
                `yarn add --dev ${format_dep(standardDevDependencies, latest)}`);

            stdout.split('\n')
                .map(line => Logger.debug(line));
        }
    } else {
        if (latest) {
            Logger.warn('Set to update all dependencies to the latest version...');
        } else {
            Logger.warn('Set to update all dependencies to latest version within the rules in package.json...');
        }

        if (!is_yarn) {
            if (dependencies.length !== 0) {
                Logger.info('Updating %s dependencies...', dependencies.length);

                const [stdout] = await run(`${cmd} ${format_dep(dependencies, latest)}`);

                stdout.split('\n')
                    .map(line => Logger.debug(line));
            }

            if (devDependencies.length !== 0) {
                Logger.info('Updating %s development dependencies...', devDependencies.length);

                const [stdout] = await run(`${cmd} --dev ${format_dep(devDependencies, latest)}`);

                stdout.split('\n')
                    .map(line => Logger.debug(line));
            }

            if (peerDependencies.length !== 0) {
                Logger.info('Updating %s peer dependencies...', peerDependencies.length);

                const [stdout] = await run(`${cmd} --dev ${format_dep(peerDependencies, latest)}`);

                stdout.split('\n')
                    .map(line => Logger.debug(line));
            }

            if (optionalDependencies.length !== 0) {
                Logger.info('Updating %s dependencies...', optionalDependencies.length);

                const [stdout] = await run(`${cmd} ${format_dep(optionalDependencies, latest)}`);

                stdout.split('\n')
                    .map(line => Logger.debug(line));
            }
        } else {
            Logger.info('Updating %s dependencies',
                dependencies.length + devDependencies.length + peerDependencies.length + optionalDependencies.length);

            const [stdout] = await run(`${cmd} upgrade${latest ? ' --latest' : ''}`);

            stdout.split('\n')
                .map(line => Logger.debug(line));
        }

        Logger.warn('Running audit checks...');

        if (is_npm) {
            const [stdout, stderr, error] = await run('npm audit fix');

            stdout.split('\n')
                .map(line => Logger.debug(line));

            if (error || stderr.length !== 0) {
                stderr.split('\n')
                    .map(line => Logger.error(line));
            }
        } else {
            const [stdout, stderr, error] = await run('yarn audit');

            stdout.split('\n')
                .map(line => Logger.debug(line));

            if (error || stderr.length !== 0) {
                stderr.split('\n')
                    .map(line => Logger.error(line));
            }
        }
    }
})();
