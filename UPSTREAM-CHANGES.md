# Upstream Changes Needed

## Local Workaround

The plugin source is installed from GitHub into OpenCode's npm cache because
`opencode-fixed-aliases` is not published to npm. In this environment, OpenCode
could not resolve `@opencode/plugin` from the cache's shared `node_modules`;
installing the package's declared runtime dependencies beside the plugin source
made it load correctly. The active `opencode.jsonc` keeps the normal
`plugins`/`options.aliases` configuration.

## Required Changes

1. Publish `opencode-fixed-aliases` to npm, or document and test a Git install
   reference supported by `opencode plugin add`.
2. Verify dependency resolution when OpenCode loads the plugin from its isolated
   npm cache. Either bundle runtime dependencies in the published artifact or
   add an integration test proving declared dependencies resolve from that
   cache.
3. Declare `effect` as a peer and development dependency and use the Effect
   plugin entry point for structured diagnostics visible in OpenCode logs.
4. Add an OpenCode 2.0.29 integration test that installs the packaged plugin,
   configures `plugins` with `options.aliases`, and invokes an agent using
   `alias/coder` to verify its provider, model, and fixed variant.
5. Update README installation instructions to state whether the package is
   published and which OpenCode versions support the configuration format.
