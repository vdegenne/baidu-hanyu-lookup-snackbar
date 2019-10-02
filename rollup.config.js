import resolve from 'rollup-plugin-node-resolve'
import typescript from 'rollup-plugin-typescript'

export default {
  input: 'content.ts',
  output: { file: 'content.js', format: 'iife' },
  plugins: [resolve(), typescript({ tsconfig: 'tsconfig.json' })]
}
