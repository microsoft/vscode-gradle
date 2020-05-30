/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');

/**
 * @returns {WebpackConfig}
 */
module.exports = () => {
  return {
    mode: 'none',
    target: 'node',
    node: {
      __dirname: false,
    },
    entry: {
      extension: './src/index.ts',
    },
    output: {
      filename: '[name].js',
      path: path.join(__dirname, 'dist'),
      libraryTarget: 'commonjs2',
      pathinfo: false,
      devtoolModuleFilenameTemplate: '../[resource-path]',
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
              loader: 'ts-loader',
            },
          ],
        },
      ],
    },
    devtool: 'source-map',
    externals: {
      vscode: 'commonjs vscode',
    },
  };
};
