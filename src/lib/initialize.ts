import execa from 'execa';
import debug from './debug';
import findWorkspaceRoot from 'find-yarn-workspace-root';
import findUp from 'find-up';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

export default function initalizeWorkspace(
  projectRoot: string | undefined
): string {
  debug('initalize workspace');

  const workspaceDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ember-addon-tests-')
  );
  debug(`created workspace directory at ${workspaceDir}`);

  fs.writeFileSync(
    path.join(workspaceDir, 'package.json'),
    JSON.stringify({
      private: true,
      workspaces: ['packages-under-test/*', 'test-projects/*'],
    })
  );
  fs.mkdirSync(path.join(workspaceDir, 'packages-under-test'));
  fs.mkdirSync(path.join(workspaceDir, 'test-projects'));
  debug(`configured workspace`);

  const packagesUnderTest = getPackagesUnderTest(projectRoot);
  for (const [packageName, packageLocation] of Object.entries(
    packagesUnderTest
  )) {
    debug(
      `link package ${packageName} located at ${packageLocation} into yarn workspace`
    );
    // TODO: Use `.npmignore`, `.gitignore` and `files` property in package.json
    //       to only copy files those files, which will end up in NPM package.
    const ignoreFolders = ['.git', 'node_modules'];

    fs.copySync(
      packageLocation,
      `${workspaceDir}/packages-under-test/${path.basename(packageName)}`,
      {
        filter(src) {
          return !ignoreFolders.some((ignoreFolder) => {
            const fileName = src.replace(`${packageLocation}/`, '');
            return fileName.startsWith(ignoreFolder);
          });
        },
      }
    );
  }
  debug('linked all packages under test into yarn workspace');

  debug('install dependencies of packages under test');
  execa.sync('yarn', ['install'], { cwd: workspaceDir });
  debug('installed dependencies of packages under test');

  return workspaceDir;
}

function isYarnWorkspaces(basePath: string): boolean {
  try {
    execa.sync('yarn', ['--silent', 'workspaces', 'info'], {
      cwd: basePath,
    });

    debug('Project uses Yarn workspaces');
    return true;
  } catch (error) {
    debug('Project does not use Yarn workspaces');
    return false;
  }
}

function findProjectRoot(): string {
  const basePath = __dirname;

  return isYarnWorkspaces(basePath)
    ? findProjectRootForYarnWorkspaces(basePath)
    : findProjectRootForRegularProject(basePath);
}

function findProjectRootForYarnWorkspaces(basePath: string): string {
  const workspaceRoot = findWorkspaceRoot(basePath);
  if (!workspaceRoot) {
    throw new Error('Unable to detect workspace root.');
  }
  debug(`Found project root at ${workspaceRoot}`);
  return workspaceRoot;
}

function findProjectRootForRegularProject(basePath: string): string {
  let packageJsonPath;
  let packageName;
  let searchFrom = basePath;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    debug(`Searching for package.json in parent directories of ${searchFrom}`);
    packageJsonPath = findUp.sync('package.json', {
      cwd: searchFrom,
    });

    if (!packageJsonPath) {
      throw new Error(
        `Could not find package.json in any parent folder of consuming application located at ${basePath}`
      );
    }

    debug(`Found package.json at ${packageJsonPath}`);
    const packageJsonContent = JSON.parse(
      fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })
    );
    packageName = packageJsonContent.name;

    if (!packageName) {
      throw new Error(
        `Missing name in package.json located at ${packageJsonPath}`
      );
    }

    if (packageName === 'ember-addon-tests') {
      debug(
        'package.json seems to belong to ember-addon-tests installation in node_modules folder. Ignoring it.'
      );
      searchFrom = path.join(path.dirname(packageJsonPath), '..');

      debug(`Continuing search from ${searchFrom} in next iteration`);
      continue;
    }

    debug(`Found package.json of consuming project at ${packageJsonPath}`);
    break;
  }

  const projectRoot = path.dirname(packageJsonPath);
  debug(`Found project root for regular project at ${projectRoot}`);
  return projectRoot;
}

function getPackagesUnderTest(
  projectRoot: string | undefined
): { [key: string]: string } {
  if (!projectRoot) {
    projectRoot = findProjectRoot();
  }

  debug(
    `Indentifying packages under test for package located at ${projectRoot}`
  );

  const packagesUnderTest: { [key: string]: string } = {};

  if (isYarnWorkspaces(projectRoot)) {
    const { stdout } = execa.sync('yarn', ['--silent', 'workspaces', 'info'], {
      cwd: projectRoot,
    });
    debug('Project is using yarn workspaces');

    const workspaces: { [key: string]: { location: string } } = JSON.parse(
      stdout
    );

    Object.keys(workspaces).forEach((packageName) => {
      const workspaceLocation = workspaces[packageName].location;
      packagesUnderTest[packageName] = `${projectRoot}/${workspaceLocation}`;
    });
  } else {
    const { name: packageName } = JSON.parse(
      fs.readFileSync(`${projectRoot}/package.json`, { encoding: 'utf-8' })
    );
    packagesUnderTest[packageName] = projectRoot;
  }

  return packagesUnderTest;
}
