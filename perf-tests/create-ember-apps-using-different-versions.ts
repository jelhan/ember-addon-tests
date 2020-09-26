import TestProject from '../src';
import benchmark from './helpers/benchmark';
import path from 'path';

benchmark('create ember apps using different versions', 5, async function (i) {
  const testProject = new TestProject({
    projectRoot: path.join(__dirname, '../tests/fixtures/npm-package'),
  });

  await testProject.createEmberApp({
    version: `~3.${20 - i * 4}.0`,
  });
});
