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
    node: {
      __dirname: false,
    },
    entry: {
      extension: './src/extension.ts',
    },
    output: {
      filename: '[name].js',
      path: path.join(__dirname, 'out'),
      libraryTarget: 'commonjs2',
      pathinfo: false,
      devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
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
                module: 'es6',
              },
            },
          ],
        },
      ],
    },
    externals: {
      vscode: 'commonjs vscode',
    },
    plugins: [new NLSBundlePlugin(id)],
  };
};
