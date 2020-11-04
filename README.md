# Ember Addon Tests

Ember Addon Tests provides declarative test helpers for testing ember addons.

## Motivation

Ember addons provide a great developer experience for most integration test
cases out of the box. The [dummy app](https://cli.emberjs.com/release/writing-addons/#testsdummy)
allows to test components and services provided by the addon in the context of
a consuming application. [Ember-try](https://github.com/ember-cli/ember-try#ember-try)
helps to test the addon against different versions of dependencies.

But Ember addons do not provide a great test story for some less common cases:

- Addon installation (`ember install addon`) and blueprints run by it.
- Customization of the build process of a consuming application (e.g. AST
  transforms registered, pre- or postprocessors for JavaScript and CSS).
- CLI commands provided by the addon.
- Middleware added to the development server (`ember serve`).

Ember Addon Tests tries to fill that gap. It's inspired by
[Ember CLI Addon Tests](https://github.com/tomdale/ember-cli-addon-tests#ember-cli-addon-tests).
It could be seen as a rewrite of Ember CLI Addon Tests using a modernized
architecture utilizing [yarn workspaces](https://yarnpkg.com/features/workspaces).

## Installation

If using NPM:

```sh
npm install --save-dev ember-addon-tests
```

```sh
yarn add --dev ember-addon-tests
```

## Usage

```js
const TestProject = require('ember-addon-tests');
const { expect } = require('chai');
const axios = require('axios');

// Create a new test project
let testProject = new TestProject({
  projectRoot: '/path-to/npm-package/or/yarn-workspace-root',
});

// Create a new ember application within your test project
await testProject.createEmberApp();

// Install addon under test in the test project
await testProject.addOwnPackageAsDevDependency(
  'name-of-a-npm-package-within-project-root'
);

// Build the application
await testProject.runEmberCommand('build', '--prod');

// Do some assertions against build
expect(
  await fs.stat(path.join(testProject.path, 'dist', 'vendor.js')).size
).to.be.lessThan(1 * 1024 * 1024);

// Start Ember's development server
await testProject.startEmberServer();

// Do some assertions against the running development server
let response = await axios.get('http://localhost:4200');
expect(response.headers).to.include({
  'content-security-policy': "default-src: 'none';"
});

// Stop Ember's development server again
await testProject.stopEmberServer();
```

## API

Please refer to [source code](src/index.ts) as API documentation for now.

## License

This project is licensed under the [MIT License](LICENSE.md).
