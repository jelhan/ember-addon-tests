import execa from 'execa';
import debug from './debug';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

export default function initalizeWorkspace(projectRoot: string): string {
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

function getPackagesUnderTest(projectRoot: string): { [key: string]: string } {
  debug(
    `Indentifying packages under test for package located at ${projectRoot}`
  );

  if (isYarnWorkspaces(projectRoot)) {
    return getPackagesUnderTestForYarnWorkspace(projectRoot);
  } else {
    return getPackagesUnderTestForClassicProject(projectRoot);
  }
}

function getPackagesUnderTestForClassicProject(
  projectRoot: string
): { [key: string]: string } {
  const packagesUnderTest: { [key: string]: string } = {};
  const { name: packageName } = JSON.parse(
    fs.readFileSync(`${projectRoot}/package.json`, { encoding: 'utf-8' })
  );

  packagesUnderTest[packageName] = projectRoot;

  return packagesUnderTest;
}

function getPackagesUnderTestForYarnWorkspace(
  projectRoot: string
): { [key: string]: string } {
  const packagesUnderTest: { [key: string]: string } = {};
  const { stdout } = execa.sync('yarn', ['--silent', 'workspaces', 'info'], {
    cwd: projectRoot,
  });

  const workspaces: { [key: string]: { location: string } } = JSON.parse(
    stdout
  );

  Object.keys(workspaces).forEach((packageName) => {
    const workspaceLocation = workspaces[packageName].location;
    packagesUnderTest[packageName] = `${projectRoot}/${workspaceLocation}`;
  });

  return packagesUnderTest;
}
