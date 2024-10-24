/* eslint-disable */
const jestJupyterLab = require('@jupyterlab/testutils/lib/jest-config');

/** @type {import('ts-jest').JestConfigWithTsJest} **/

const baseConfig = jestJupyterLab(__dirname);

const esModules = [
  '@codemirror',
  '@jupyter/ydoc',
  '@jupyterlab/',
  '@jupyter/',
  '@microsoft/',
  'lib0',
  'exenv-es6',
  'nanoid',
  'vscode-ws-jsonrpc',
  'y-protocols',
  'y-websocket',
  'yjs',
  '@rjsf',
  '@xyflow/',
  '@waldiez/react/'
].join('|');

module.exports = {
  ...baseConfig,
  globals: {
    NODE_ENV: 'test'
  },
  testEnvironment: 'jsdom',
  testRegex: 'src/.*/.*.spec.ts[x]?$',
  preset: 'ts-jest',
  automock: false,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/.ipynb_checkpoints/*'
  ],
  transformIgnorePatterns: [
    `<rootDir>/node_modules/(?!${esModules}).+`,
    `<rootDir>/.venv/`,
    `<rootDir>/jest.setup.ts`
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['dist'],
  modulePaths: ['<rootDir>/src', '<rootDir>/node_modules'],
  roots: ['src'],
  moduleNameMapper: {
    yjs: '<rootDir>/node_modules/yjs',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  }
};
