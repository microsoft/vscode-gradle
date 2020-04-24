/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');
const { NLSBundlePlugin } = require('vscode-nls-dev/lib/webpack-bundler');

/**
 * @returns {WebpackConfig}
 */
module.exports = () => {
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = require(pkgPath);
  const id = `${pkg.publisher}.${pkg.name}`;

  /** @type WebpackConfig */
  return {
    mode: 'none',
    target: 'node',
    entry: {
      extension: './src/extension.ts',
      runTests: './src/test/runTests.ts',
    },
    output: {
      filename: '[name].js',
      path: path.join(__dirname, 'out'),
      libraryTarget: 'commonjs',
      pathinfo: false,
    },
    resolve: {
      mainFields: ['module', 'main'],
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: [/node_modules/],
          use: [
            {
              loader: 'vscode-nls-dev/lib/webpack-loader',
              options: {
                base: path.join(__dirname, 'src'),
              },
            },
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
              },
            },
          ],
        },
      ],
    },
    externals: {
      vscode: 'commonjs vscode',
      'vscode-test': 'commonjs vscode-test',
    },
    plugins: [new NLSBundlePlugin(id)],
  };
};
