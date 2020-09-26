import TestProject from '../src';
import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';

chai.use(chaiFs);
chai.use(chaiAsPromised);

const MINUTE_IN_MILLISECONDS = 60 * 1000;
const projectRoot = path.join(__dirname, 'fixtures/npm-package');

describe('create test projects', function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('provides the path to test project directory as directory property', function () {
    const testProject = new TestProject({
      projectRoot,
    });
    expect(testProject.path).to.be.a.directory();
    expect(path.isAbsolute(testProject.path)).to.be.true;
  });

  it('uses unique paths per test project', function () {
    const oneProject = new TestProject({
      projectRoot,
    });
    const anotherProject = new TestProject({
      projectRoot,
    });
    expect(oneProject.path).to.not.equal(anotherProject.path);
  });

  it('uses the same yarn workspace for all test projects without custom config', async function () {
    const oneProject = new TestProject({
      projectRoot,
    });
    const anotherProject = new TestProject({
      projectRoot,
    });

    const workspacesInfo = JSON.parse(
      (await oneProject.runCommand('yarn', '--silent', 'workspaces', 'info'))
        .stdout
    );
    expect(workspacesInfo).to.include.all.keys(
      path.basename(oneProject.path),
      path.basename(anotherProject.path)
    );
  });

  it('uses the same yarn workspace for test projects with the same config but different for others', async function () {
    const oneProject = new TestProject({
      projectRoot: path.join(__dirname, 'fixtures/npm-package'),
    });
    const anotherProjectWithSameConfig = new TestProject({
      projectRoot: path.join(__dirname, 'fixtures/npm-package'),
    });
    const projectWithDifferentConfig = new TestProject({
      projectRoot: path.join(__dirname, 'fixtures/yarn-workspace'),
    });

    const workspacesInfoForOneProject = JSON.parse(
      (await oneProject.runCommand('yarn', '--silent', 'workspaces', 'info'))
        .stdout
    );
    expect(workspacesInfoForOneProject).to.include.all.keys(
      path.basename(oneProject.path),
      path.basename(anotherProjectWithSameConfig.path)
    );
    expect(workspacesInfoForOneProject).to.not.have.any.keys(
      path.basename(projectWithDifferentConfig.path)
    );

    const workspacesInfoForProjectWithDifferentConfig = JSON.parse(
      (
        await projectWithDifferentConfig.runCommand(
          'yarn',
          '--silent',
          'workspaces',
          'info'
        )
      ).stdout
    );
    expect(workspacesInfoForProjectWithDifferentConfig).to.include.all.keys(
      path.basename(projectWithDifferentConfig.path)
    );
    expect(workspacesInfoForProjectWithDifferentConfig).to.not.have.any.keys(
      path.basename(oneProject.path),
      path.basename(anotherProjectWithSameConfig.path)
    );
  });
});

describe('it makes own packages available to test project', function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('allows to install a package developed not using yarn workspaces', async function () {
    const testProject = new TestProject({
      projectRoot: `${__dirname}/fixtures/npm-package/`,
    });

    expect(
      path.join(testProject.path, '../../packages-under-test/npm-package')
    ).to.be.a.directory();

    await testProject.addOwnPackageAsDependency('npm-package');
    expect(
      JSON.parse(
        await fs.promises.readFile(
          path.join(testProject.path, 'package.json'),
          { encoding: 'utf-8' }
        )
      ).dependencies
    ).to.include.all.keys('npm-package');
  });

  it('allows to install packages developed in a yarn workspace', async function () {
    const testProject = new TestProject({
      projectRoot: `${__dirname}/fixtures/yarn-workspace/`,
    });

    expect(
      path.join(testProject.path, '../../packages-under-test/foo')
    ).to.be.a.directory();
    expect(
      path.join(testProject.path, '../../packages-under-test/bar')
    ).to.be.a.directory();

    await testProject.addOwnPackageAsDependency('foo');
    await testProject.addOwnPackageAsDependency('bar');
    expect(
      JSON.parse(
        await fs.promises.readFile(
          path.join(testProject.path, 'package.json'),
          {
            encoding: 'utf-8',
          }
        )
      ).dependencies
    ).to.nested.include.all.keys('foo', 'bar');
  });
});

describe('createEmberApp()', function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  let testProject: TestProject;

  before(async function () {
    testProject = new TestProject({
      projectRoot,
    });
    await testProject.createEmberApp();
  });

  it('creates an Ember app', async function () {
    expect(path.join(testProject.path, 'app')).to.be.a.directory();
    expect(path.join(testProject.path, 'addon')).to.not.be.a.path();
    expect(
      JSON.parse(
        await fs.promises.readFile(
          path.join(testProject.path, 'package.json'),
          { encoding: 'utf-8' }
        )
      )
    ).to.not.deep.include({
      keywords: ['ember-addon'],
    });
  });

  it('creates a working Ember app', async function () {
    await testProject.runEmberCommand('test');
  });

  it.skip('uses latest Ember CLI version by default');

  it('allows to use a specific Ember CLI version', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.createEmberApp({ version: '3.20.0' });
    expect(
      JSON.parse(
        await fs.promises.readFile(
          path.join(testProject.path, 'package.json'),
          { encoding: 'utf-8' }
        )
      )
    ).to.deep.nested.include({
      'devDependencies.ember-cli': '~3.20.0',
    });
  });
});

describe('createEmberAddon()', function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  let testProject: TestProject;

  before(async function () {
    testProject = new TestProject({
      projectRoot,
    });
    await testProject.createEmberAddon();
  });

  it('creates an Ember addon', async function () {
    expect(path.join(testProject.path, 'app')).to.be.a.directory();
    expect(path.join(testProject.path, 'addon')).to.be.a.directory();
    expect(
      JSON.parse(
        await fs.promises.readFile(
          path.join(testProject.path, 'package.json'),
          { encoding: 'utf-8' }
        )
      )
    ).to.deep.include({
      keywords: ['ember-addon'],
    });
  });

  it('creates a working Ember addon', async function () {
    await testProject.runEmberCommand('test');
  });

  it.skip('uses latest Ember CLI version by default');

  it('allows to use a specific Ember CLI version', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.createEmberAddon({ version: '3.16.0' });
    expect(
      JSON.parse(
        await fs.promises.readFile(
          path.join(testProject.path, 'package.json'),
          { encoding: 'utf-8' }
        )
      )
    ).to.deep.nested.include({
      'devDependencies.ember-cli': '~3.16.0',
    });
  });
});

describe('addDependency()', async function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('installs NPM package', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.addDependency('ember-source');

    const packageJsonPath = path.join(testProject.path, 'package.json');
    expect(packageJsonPath).to.be.a.file().with.json;
    expect(
      JSON.parse(
        await fs.promises.readFile(packageJsonPath, { encoding: 'utf-8' })
      )
    ).to.have.nested.property('dependencies.ember-source');

    await testProject.runCommand('yarn', 'install', '--check-files');
  });

  it('allows to use a specific version', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.addDependency('ember-source', '^3.0.0');

    const packageJsonPath = path.join(testProject.path, 'package.json');
    expect(packageJsonPath).to.be.a.file().with.json;
    expect(
      JSON.parse(
        await fs.promises.readFile(packageJsonPath, { encoding: 'utf-8' })
      )
    ).to.deep.include({
      dependencies: {
        'ember-source': '^3.0.0',
      },
    });

    await testProject.runCommand('yarn', 'install', '--check-files');
  });
});

describe('addDevDependency()', async function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('installs NPM package', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.addDevDependency('ember-source');

    const packageJsonPath = path.join(testProject.path, 'package.json');
    expect(packageJsonPath).to.be.a.file().with.json;
    expect(
      JSON.parse(
        await fs.promises.readFile(packageJsonPath, { encoding: 'utf-8' })
      )
    ).to.have.nested.property('devDependencies.ember-source');

    await testProject.runCommand('yarn', 'install', '--check-files');
  });

  it('allows to use a specific version', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.addDevDependency('ember-source', '^3.0.0');

    const packageJsonPath = path.join(testProject.path, 'package.json');
    expect(packageJsonPath).to.be.a.file().with.json;
    expect(
      JSON.parse(
        await fs.promises.readFile(packageJsonPath, { encoding: 'utf-8' })
      )
    ).to.deep.include({
      devDependencies: {
        'ember-source': '^3.0.0',
      },
    });

    await testProject.runCommand('yarn', 'install', '--check-files');
  });
});

describe('readFile()', async function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('returns the content of a file at given location', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await fs.promises.writeFile(`${testProject.path}/foo`, 'bar');
    expect(await testProject.readFile('foo')).to.equal('bar');
  });
});

describe('writeFile()', async function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('creates a file at given location', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.writeFile('foo', 'bar');
    expect(`${testProject.path}/foo`).to.be.a.file().with.content('bar');
  });

  it('overwrites an existing file', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await fs.promises.writeFile(`${testProject.path}/foo`, 'old');
    await testProject.writeFile('foo', 'new');
    expect(`${testProject.path}/foo`).to.be.a.file().with.content('new');
  });
});

describe('deleteFile()', async function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  it('deletes a file at given location', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await fs.promises.writeFile(`${testProject.path}/foo`, '');
    await testProject.deleteFile('foo');
    expect(`${testProject.path}/foo`).to.not.be.a.path();
  });
});

describe('startEmberServer() and stopEmberServer()', async function () {
  this.timeout(2 * MINUTE_IN_MILLISECONDS);

  const DEFAULT_PORT = 4200;

  it('allows to start and stop ember development server', async function () {
    const testProject = new TestProject({
      projectRoot,
    });
    await testProject.createEmberApp();
    await testProject.startEmberServer();
    const response = await fetch(`http://localhost:${DEFAULT_PORT}`);
    expect(response.status).to.equal(200);

    await testProject.stopEmberServer();
    expect(fetch(`http://localhost:${DEFAULT_PORT}`)).to.be.rejected;
  });
});
