import TestProject from '../src';
import benchmark from './helpers/benchmark';
import path from 'path';

benchmark('create ember app and ember addon alternating', 5, async function (
  i
) {
  const testProject = new TestProject({
    projectRoot: path.join(__dirname, '../tests/fixtures/npm-package'),
  });

  if (i % 2 === 0) {
    await testProject.createEmberApp();
  } else {
    await testProject.createEmberAddon();
  }
});
