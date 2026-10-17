# TODO

Follow-up actions from the project review, ordered by priority.

## High Priority

- [ ] **Support model IDs containing slashes.**
  - Update `parseTarget` to accept hierarchical model IDs supported by the OpenCode SDK, such as `openrouter/anthropic/claude-sonnet-4.5`.
  - Preserve validation of empty providers, empty model IDs, whitespace, and malformed variants.
  - Replace the test that rejects all additional slashes with cases distinguishing supported model IDs from invalid references.
  - Add regression tests with and without a fixed variant.
  - Update the target-format documentation in [README.md](./README.md).
  - Acceptance: supported hierarchical IDs parse consistently with `Model.Ref.parse`, and malformed references still fail explicitly.

## Medium Priority

- [ ] **Run continuous integration before release.**
  - Run dependency installation, `npm test`, and `npm pack --dry-run` on pull requests targeting `main` and pushes to `main`.
  - Keep publishing restricted to validated release tags.
  - Keep OIDC publishing permissions out of ordinary validation jobs.
  - Update [RELEASE.md](./RELEASE.md) to describe the validation triggers.
  - Acceptance: pull requests receive automatic validation results, and ordinary pushes cannot publish a package.

- [ ] **Make SDK mocks type-safe.**
  - Replace `context as never` in tests with fixtures checked against the relevant SDK interfaces.
  - Model scoped registrations and their disposal accurately.
  - Keep any necessary test-only type assertions narrow and justified.
  - Acceptance: incompatible mock signatures fail TypeScript compilation, and all existing scenarios still pass.

- [ ] **Automate integration tests against OpenCode.**
  - Verify alias resolution for agents registered during startup.
  - Verify resolution and fixed-model enforcement after agent reloads and repeated update events.
  - Verify that a persisted or manually selected session model is replaced by the configured target before a prompt, including its fixed variant.
  - Verify that agents without aliases retain their existing behavior.
  - Assert the actual primary model request rather than relying on the agent's response text.
  - Document how to run the integration checks and any provider requirements.
  - Acceptance: a reproducible test validates the plugin against a real OpenCode runtime.

- [ ] **Reject alias targets that reference the reserved `alias` provider.**
  - Reject self-references such as `{ "fast": "alias/fast" }` during configuration validation.
  - Reject chained references such as `{ "fast": "alias/review" }` with a clear error explaining that targets must identify a real provider and model.
  - Add regression tests for self-references, chains, and cycles.
  - Document that recursive alias resolution is unsupported.
  - Acceptance: these configurations fail immediately with an actionable error instead of leaving unresolved aliases for later processing.

## Completion Checklist

- [ ] Run `npm test` after implementation changes.
- [ ] Run `npm pack --dry-run` after packaging or workflow changes.
- [ ] Record user-visible fixes and compatibility changes in [CHANGELOG.md](./CHANGELOG.md).
