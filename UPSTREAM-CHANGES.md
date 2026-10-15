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

## Alias Resolution Lifecycle Fix

OpenCode 2.0.29 loads user plugins before `opencode.config.agent`. An alias
transform registered during setup therefore runs before configured agents are
added. The local implementation listens for `agent.updated`, detects unresolved
aliases, and re-registers its transform after the configuration transform.
It reloads agents and verifies that no alias references remain.

Primary sessions can still use the global default or a previously selected
model even when the agent's model reference is resolved. The `prompt` hook
therefore applies the fixed target and variant to sessions using alias-backed
agents. Model selections for agents without aliases are unchanged. Manual model
overrides for alias-backed agents are replaced by their governed alias target.

Structured logs include each transform invocation, session model changes, and
`model.request` events. Verify the primary request's provider, model, and variant
instead of treating a successful text response as evidence of alias resolution.
