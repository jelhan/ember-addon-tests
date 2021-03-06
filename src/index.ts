import execa, { ExecaChildProcess } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import rimraf from 'rimraf';
import { kebabCase } from 'lodash';
import initalizeWorkspace from './lib/initialize';
import debug from './lib/debug';
import { merge } from 'lodash';
import os from 'os';

const WORKSPACES: Map<string, string> = new Map();

async function execaLogged(
  cmd: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<ExecaChildProcess> {
  debug(`execute command \`${cmd} ${args.join(' ')}\` in ${options.cwd}`);
  const result = await execa(cmd, args, options);
  debug(`executed command \`${cmd} ${args.join(' ')}\` in ${options.cwd}`);
  return result;
}

export default class TestProject {
  // absolute path to test project
  path: string;

  // absolut path to workspace root containing test project
  #workspaceRoot: string;

  // ember server process if one is running
  #emberServerProcess: ExecaChildProcess | undefined;

  constructor(options: { projectRoot: string }) {
    const workspaceId = JSON.stringify(options, Object.keys(options));
    let workspaceRoot = WORKSPACES.get(workspaceId);

    // ensure workspace is initalized
    if (!workspaceRoot) {
      workspaceRoot = initalizeWorkspace(options.projectRoot);
      WORKSPACES.set(workspaceId, workspaceRoot);
      debug(`initalized workspace at ${workspaceRoot}`);
    } else {
      debug(`use existing workspace at ${workspaceRoot}`);
    }

    this.#workspaceRoot = workspaceRoot;

    // create folder for test project package
    // Prefix the package folder with a letter cause many tools do not support
    // names starting with a number.
    this.path = fs.mkdtempSync(`${workspaceRoot}/test-projects/a`);

    // initialize test project package
    execa.sync('yarn', ['init', '--yes'], { cwd: this.path });
    debug(`created test project at ${this.path}`);
  }

  async runCommand(cmd: string, ...args: string[]): Promise<ExecaChildProcess> {
    return execaLogged(cmd, args, { cwd: this.path });
  }

  async runEmberCommand(
    cmd: string,
    ...args: string[]
  ): Promise<ExecaChildProcess> {
    return this.runCommand('ember', cmd, ...args);
  }

  async runPackageScript(
    cmd: string,
    ...args: string[]
  ): Promise<ExecaChildProcess> {
    return this.runCommand('yarn', cmd, ...args);
  }

  async createEmberApp(): Promise<ExecaChildProcess> {
    return this.installEmberProject('app');
  }

  async createEmberAddon(): Promise<ExecaChildProcess> {
    return this.installEmberProject('addon');
  }

  async startEmberServer(
    additionalArgs: { [key: string]: string } = {}
  ): Promise<void> {
    debug('Starting Ember development server');

    if (this.#emberServerProcess) {
      throw new Error(
        'Tried to start ember development server but another instance was already running.'
      );
    }

    const args = ['serve'];

    for (const [arg, value] of Object.entries(additionalArgs)) {
      args.push(`--${kebabCase(arg)}`, value);
    }

    this.#emberServerProcess = execa('ember', args, {
      cwd: this.path,
    });

    this.#emberServerProcess.catch((error) => {
      error.message = `Starting ember development server failed: ${error.message}`;
      throw error;
    });

    // wait until ember development server is up and running
    await new Promise((resolve, reject) => {
      const indicators = ['Ember FastBoot running at', 'Build successful'];

      if (!this.#emberServerProcess) {
        reject(
          'Ember server process terminated before detecting successful start'
        );
      }

      this.#emberServerProcess?.stdout?.on('data', function (data: string) {
        indicators.forEach((indicator) => {
          if (data.includes(indicator)) {
            debug(
              `Detected start of Ember development server by indicator ${indicator}`
            );

            resolve();
          }
        });
      });
    });

    debug('Started Ember development server');
  }

  async stopEmberServer(): Promise<void> {
    debug('Stopping Ember development server');

    if (!this.#emberServerProcess) {
      throw new Error(
        'Tried to stop ember development server but no instance was running'
      );
    }

    this.#emberServerProcess.cancel();

    // wait until ember server process has been terminated
    await this.#emberServerProcess;

    // reset ember server process handler
    this.#emberServerProcess = undefined;

    debug('Stoped Ember development server');
  }

  async addDependency(
    dependency: string,
    version = 'latest'
  ): Promise<ExecaChildProcess> {
    return this.runCommand('yarn', 'add', `${dependency}@${version}`);
  }

  async addDevDependency(
    dependency: string,
    version = 'latest'
  ): Promise<ExecaChildProcess> {
    return this.runCommand('yarn', 'add', '--dev', `${dependency}@${version}`);
  }

  async addOwnPackageAsDependency(
    packageName: string
  ): Promise<ExecaChildProcess> {
    const packageVersion = this.getVersionOfPackage(packageName);

    await this.modifyPackageJson({
      dependencies: {
        [packageName]: packageVersion,
      },
    });

    return this.runCommand('yarn', 'install');
  }

  async addOwnPackageAsDevDependency(
    packageName: string
  ): Promise<ExecaChildProcess> {
    const packageVersion = this.getVersionOfPackage(packageName);

    await this.modifyPackageJson({
      devDependencies: {
        [packageName]: packageVersion,
      },
    });

    return this.runCommand('yarn', 'install');
  }

  async readFile(relativeLocation: string): Promise<string> {
    return fs.readFile(`${this.path}/${relativeLocation}`, {
      encoding: 'utf-8',
    });
  }

  async writeFile(relativeLocation: string, content: string): Promise<void> {
    await fs.writeFile(`${this.path}/${relativeLocation}`, content);
  }

  async deleteFile(relativeLocation: string): Promise<void> {
    await fs.unlink(`${this.path}/${relativeLocation}`);
  }

  private getVersionOfPackage(packageName: string): string {
    return JSON.parse(
      fs.readFileSync(
        path.join(
          this.#workspaceRoot,
          'packages-under-test',
          packageName,
          'package.json'
        ),
        { encoding: 'utf-8' }
      )
    ).version;
  }

  private async modifyPackageJson(
    changes: Record<string, unknown>
  ): Promise<void> {
    const packageJsonOfApp = JSON.parse(await this.readFile('package.json'));

    // apply changes to content of package.json
    merge(packageJsonOfApp, changes);

    await this.writeFile('package.json', JSON.stringify(packageJsonOfApp));
  }

  private async installEmberProject(
    type: 'app' | 'addon'
  ): Promise<ExecaChildProcess> {
    // A new ember project can not be created in an existing directory.
    // `ember init` could be used as an alternative for `ember new` in an
    // existing directory. But there isn't anything like that for
    // `ember addon`.
    // Therefore we delete the existing test project folder and let Ember
    // CLI create a new one for us. It will take care of all initialization
    // work needed.
    rimraf.sync(this.path);

    // Can not use `runEmberCommand` method cause it uses test project as
    // current working directory. But that one does not exist anymore.
    return execaLogged(
      'ember',
      [
        type === 'app' ? 'new' : 'addon',
        path.basename(this.path),
        '--skip-git',
        '--yarn',
        '--directory',
        this.path,
      ],
      {
        // Ember CLI will either use the version of itself installed in the
        // workspace if executed within workspace root. This is even true
        // if `ember-cli` package is not installed within the workspace root
        // but only as a dependency of some other package in the workspace.
        // Some technical background could be found in this issue:
        // https://github.com/ember-cli/ember-cli/issues/9331
        // This behavior makes it less easy to predict and control which
        // Ember CLI version is used. This issue can be avoided by running
        // `ember new` (or `ember addon`) command outside of the workspace
        // root.
        cwd: os.homedir(),
      }
    );
  }
}
