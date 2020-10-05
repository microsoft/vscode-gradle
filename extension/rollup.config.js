import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import builtins from 'builtin-modules';
import ignore from "rollup-plugin-ignore"
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
      ignore(['@grpc/proto-loader']),
      resolve({ preferBuiltins: true }),
      typescript({ module: 'ES2015', outDir: 'dist', declaration: true }),
      commonjs({
        ignore: ['encoding', 'google-auth-library'],
      }),
      json(),
    ],
  },
];
