# jpi-base

Shared TypeScript helpers for the `jpi` family of Pi coding-agent plugins.

The first thing it holds is config-file handling: finding the Pi agent
directory, and loading or saving a plugin's JSON config file. Each `jpi-*`
plugin used to carry its own copy of this logic. Now they share one.

## Using it in a plugin

There is no npm registry entry for this package. Plugins depend on it
straight from GitHub, pinned to a semver range:

```json
{
  "dependencies": {
    "jpi-base": "github:josh-sola/jpi-base#semver:^0.1.0"
  }
}
```

`npm install` runs this package's `prepare` script, which compiles
`src/` to `dist/` before anything imports it. You do not need to build it
yourself.

## Development

```sh
npm install
npm test
```

`npm test` runs the tests directly against `src/*.ts` with `node --test`,
using Node's built-in TypeScript support. `npm run build` compiles `src/`
to `dist/`, which is what published consumers actually import.
