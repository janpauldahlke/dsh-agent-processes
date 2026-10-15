import { buildDshPlugin } from 'dsh-build-tools'

await buildDshPlugin({
  modules: [
    { entry: 'src/host/vault.ts', out: 'vault.mjs' },
    { entry: 'src/host/service.ts', out: 'service.mjs' },
  ],
})
