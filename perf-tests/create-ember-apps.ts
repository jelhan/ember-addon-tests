import TestProject from '../src';
import benchmark from './helpers/benchmark';
import path from 'path';

benchmark('create ember apps', 5, async function () {
  const testProject = new TestProject({
    projectRoot: path.join(__dirname, '../tests/fixtures/npm-package'),
  });

  await testProject.createEmberApp();
});
