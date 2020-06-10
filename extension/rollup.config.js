// @ts-check
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import builtins from 'builtin-modules';
import { terser } from 'rollup-plugin-terser';

const outputPlugins = [];
if (process.env.NODE_ENV === 'production') {
  outputPlugins.push(terser());
}

export default [
  {
    input: 'src/index.ts',
    external: builtins.concat(['vscode']),
    output: {
      dir: './dist',
      format: 'cjs',
      sourcemap: true,
      plugins: outputPlugins,
    },
    plugins: [
      typescript({ module: 'ES2015', outDir: 'dist', declaration: true }),
      commonjs({ ignore: ['encoding'] }),
      json(),
      resolve({ preferBuiltins: true }),
    ],
  },
];
