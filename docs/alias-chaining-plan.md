# Alias Chaining Feature Plan

**Status: Implemented.** The unit suite and package dry run pass.

## Goal

Allow one configured model alias to target another configured alias. This separates concrete model and variant choices from the semantic aliases used by agents.

For example, `model-base` and `model-max` identify concrete model choices, while `coder` and `architect` identify agent roles:

```jsonc
{
  "aliases": {
    "model-base": "test/model-6-base#mini",
    "model-medium": "test/model-6-base#max",
    "model-max": "test/model-6-advance",
    "architect": "alias/model-max",
    "coder": "alias/model-base"
  }
}
```

The existing `aliases` option remains an object of alias-to-target mappings. Agent model references remain `alias/<name>`.

## Proposed Behavior

- An alias target may be either a concrete `provider/model[#variant]` reference or an `alias/<name>` reference.
- Alias references in targets cannot specify a variant. The terminal concrete model alias owns the fixed variant.
- Resolve alias targets transitively, independent of declaration order, until reaching a concrete model reference.
- Support finite chains without imposing an arbitrary maximum depth, but recommend keeping configuration chains short (preferably one indirection) for readability.
- Resolve and validate the complete alias map during plugin setup, including aliases not currently referenced by an agent. Invalid configuration should fail early.
- Agents using `alias/<name>` continue to receive a concrete `Model.Ref`; an unresolved alias must never reach OpenCode as a model provider.
- Preserve existing behavior for direct aliases, including fixed-model enforcement for alias-backed agents.

## Validation and Error Handling

Reject configuration with actionable errors when:

- an alias target refers to an alias that is not configured;
- an alias refers to itself, directly or through another alias (cycle);
- an alias target uses an invalid alias name or attempts to add a variant to `alias/<name>`;
- a terminal concrete target is invalid.

Cycle errors should identify the aliases involved, for example: `Alias cycle detected: architect -> reviewer -> architect`.

The existing target parser has a separate limitation around model IDs containing slashes, tracked in `TODO.md`. Alias resolution should use the same concrete-target parsing rules as direct aliases and must not silently introduce a different interpretation. Handle that parser limitation in its own change or coordinate the two changes explicitly.

## Resolution Design

1. Validate the option shape and alias names as today.
2. Build a resolver over the complete alias map. Each alias resolves to one terminal concrete `Model.Ref`.
3. Track the current traversal path (or use DFS visiting/visited states) to detect cycles and produce a useful error path.
4. Cache successful resolutions so shared aliases are resolved once.
5. Use the resolved alias map for agent transformations and fixed-model enforcement; do not re-traverse the graph during prompts.

Keep the resolver as a pure, independently testable function where practical. Preserve the configured direct target as well as the resolved target if both are needed for diagnostics and `/aliases` output.

## `/aliases` Output

Update `/aliases` so chained mappings remain understandable:

- show the configured direct target (such as `alias/model-max`);
- show the resolved concrete model, including its fixed variant;
- determine availability from the resolved concrete provider and model, not from the reserved `alias` provider.

Direct aliases should remain easy to read; avoid duplicating the same target unnecessarily if the existing output can be extended cleanly.

## Implementation Steps

1. Add a pure alias-map resolver and tests for direct aliases, chains, declaration-order independence, and shared targets.
2. Extend configuration validation to accept alias references as targets and reject unknown references and cycles with actionable errors.
3. Switch agent transformation and model enforcement to the resolved concrete targets.
4. Update `/aliases` formatting and availability checks to show resolved targets.
5. Update the README configuration and usage sections with a concise chained-alias example and document variant and cycle rules.
6. Update the changelog when the feature is implemented and released; revise or remove the TODO item that currently calls for rejecting alias targets.
7. Run the test suite and package dry run before release.

## Test Plan

### Resolver and validation tests

- Existing direct model aliases still resolve unchanged.
- A one-level alias target resolves to its concrete model.
- A multi-level chain resolves to the same terminal model regardless of declaration order.
- Multiple aliases may share a target.
- A fixed variant on the terminal model is preserved.
- Unknown target aliases fail during validation with the alias name in the error.
- Self-cycles and multi-alias cycles fail with a useful cycle path.
- Variants on alias references (for example, `alias/model-max#high`) are rejected.
- Invalid terminal concrete targets are rejected using the existing target parsing behavior.

### Plugin behavior tests

- Agents referencing a chained alias are transformed to a concrete `Model.Ref`.
- Fixed-model enforcement continues to apply the resolved model and variant.
- Unaliased agents retain their existing behavior.
- `/aliases` displays the direct and resolved targets and reports availability for the concrete model.
- No unresolved `alias/...` target is passed to model selection or a model request.

## Acceptance Criteria

- Valid alias chains resolve to concrete models during setup.
- Missing references, invalid targets, and cycles fail early with actionable errors.
- Existing direct-alias behavior and fixed-variant behavior remain covered by tests and unchanged.
- The `/aliases` command reports the effective target and its availability correctly.
- Documentation explains the configuration format and the limits on alias references and variants.
- `npm test` and `npm pack --dry-run` pass.
