/* eslint-disable */
const babelConfig = require('@jupyterlab/testutils/lib/babel.config');
module.exports = {
  env: {
    test: {
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }
  }
};
