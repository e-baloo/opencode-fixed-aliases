import assert from "node:assert/strict"
import test from "node:test"
import { Model } from "@opencode/schema/model"
import { Deferred, Effect, Stream } from "effect"
import {
  FixedAliasesPlugin,
  parseAliasReference,
  parseTarget,
  validateAliases,
} from "../src/index.js"

type TestAgent = { id: string; model: Model.Ref }
type TestEditor = {
  list(): TestAgent[]
  update(id: string, update: (agent: TestAgent) => void): void
}

test("validates fixed model mappings, including a configured variant", () => {
  assert.deepEqual(
    validateAliases({ fast: "openai/gpt-5.5-luna#mini", review: "anthropic/claude-4.5-haiku" }),
    { fast: "openai/gpt-5.5-luna#mini", review: "anthropic/claude-4.5-haiku" },
  )
})

test("rejects malformed aliases and targets", () => {
  assert.throws(() => validateAliases([]), /must be an object/i)
  assert.throws(() => validateAliases({ "not/an-alias": "openai/gpt-5" }), /invalid alias name/i)
  assert.throws(() => validateAliases({ fast: "openai/#mini" }), /invalid target/i)
  assert.throws(() => validateAliases({ fast: "openai/gpt-5##mini" }), /invalid target/i)
  assert.throws(() => validateAliases({ fast: "openai/gpt-5/extra" }), /invalid target/i)
  assert.throws(() => validateAliases({ fast: "openai/gpt-5#" }), /invalid target/i)
})

test("recognizes string and structured alias references", () => {
  assert.equal(parseAliasReference("alias/company-fast"), "company-fast")
  assert.equal(parseAliasReference({ providerID: "alias", id: "company-fast" }), "company-fast")
  assert.equal(parseAliasReference("openai/gpt-5"), undefined)
})

test("rejects per-use variants and unknown alias reference shapes", () => {
  assert.throws(() => parseAliasReference("alias/company-fast#mini"), /variants are not allowed/i)
  assert.throws(
    () => parseAliasReference({ providerID: "alias", id: "company-fast", variant: "mini" }),
    /without a variant/i,
  )
})

test("parses the configured model and its fixed variant", () => {
  assert.deepEqual(parseTarget("fast", "openai/gpt-5.5-luna#mini"), {
    providerID: "openai",
    id: "gpt-5.5-luna",
    variant: "mini",
  })
})

test("rewrites alias-backed agents through the OpenCode v2 agent transform", async () => {
  const reviewer: TestAgent = {
    id: "reviewer",
    model: Model.Ref.parse("alias/company-review"),
  }
  const editor: TestEditor = {
    list: () => [reviewer],
    update: (id, update) => {
      assert.equal(id, "reviewer")
      update(reviewer)
    },
  }
  const context = {
    event: { subscribe: () => Stream.empty },
    session: { hook: () => Effect.void },
    options: { aliases: { "company-review": "anthropic/claude-haiku-4-5" } },
    agent: {
      transform: (callback: (editor: TestEditor) => void) => Effect.sync(() => callback(editor)),
    },
  }

  await Effect.runPromise(Effect.scoped(FixedAliasesPlugin.effect(context as never)))

  assert.deepEqual(reviewer.model, Model.Ref.parse("anthropic/claude-haiku-4-5"))
})

test("fails with an English error when an agent references an undefined alias", async () => {
  const reviewer: TestAgent = {
    id: "reviewer",
    model: Model.Ref.parse("alias/missing-reviewer"),
  }
  const editor: TestEditor = {
    list: () => [reviewer],
    update: () => assert.fail("An undefined alias must not update the agent."),
  }
  const context = {
    event: { subscribe: () => Stream.empty },
    session: { hook: () => Effect.void },
    options: { aliases: {} },
    agent: {
      transform: (callback: (editor: TestEditor) => void) => Effect.sync(() => callback(editor)),
    },
  }

  await assert.rejects(
    Effect.runPromise(Effect.scoped(FixedAliasesPlugin.effect(context as never))),
    /unknown model alias 'missing-reviewer'/i,
  )
})

test("resolves aliases after configured agents are registered", { timeout: 5000 }, async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const resolved = yield* Deferred.make<void>()
    const reviewer: TestAgent = { id: "reviewer", model: Model.Ref.parse("alias/company-review") }
    let registrations = 0
    let reloads = 0
    const context = {
      location: { directory: "test-directory" },
      options: { aliases: { "company-review": "openai/gpt-5.6-luna#high" } },
      event: {
        subscribe: () => Stream.make({
          type: "agent.updated",
          location: { directory: "test-directory" },
        }),
      },
      session: { hook: () => Effect.void },
      agent: {
        transform: (callback: (editor: TestEditor) => void) => Effect.sync(() => {
          registrations++
          callback({
            list: () => registrations === 1 ? [] : [reviewer],
            update: (_, update) => update(reviewer),
          })
          return { dispose: Effect.void }
        }),
        reload: () => Effect.sync(() => { reloads++ }),
        list: () => Effect.gen(function* () {
          if (registrations > 1) yield* Deferred.succeed(resolved, undefined)
          return { data: [reviewer] }
        }),
      },
    }

    yield* FixedAliasesPlugin.effect(context as never)
    yield* Deferred.await(resolved)
    assert.equal(registrations, 2)
    assert.equal(reloads, 1)
    assert.deepEqual(reviewer.model, Model.Ref.parse("openai/gpt-5.6-luna#high"))
  })))
})

for (const scenario of [
  { name: "overrides a session's global default for an alias-backed agent", agent: "reviewer", model: undefined, switches: 1 },
  { name: "replaces a persisted Sol model with the fixed Luna model", agent: "reviewer", model: "openai/gpt-5.6-sol", switches: 1 },
  { name: "keeps an already matching model and variant", agent: "reviewer", model: "openai/gpt-5.6-luna#high", switches: 0 },
  { name: "preserves the session model for agents without aliases", agent: "other", model: "openai/gpt-5.6-sol", switches: 0 },
]) {
  test(scenario.name, async () => {
    const reviewer: TestAgent = { id: "reviewer", model: Model.Ref.parse("alias/company-review") }
    let prompt: ((request: { sessionID: string }) => Effect.Effect<void>) | undefined
    const switches: Model.Ref[] = []
    const context = {
      options: { aliases: { "company-review": "openai/gpt-5.6-luna#high" } },
      event: { subscribe: () => Stream.empty },
      agent: {
        transform: (callback: (editor: TestEditor) => void) => Effect.sync(() => callback({
          list: () => [reviewer],
          update: (_, update) => update(reviewer),
        })),
      },
      session: {
        hook: (name: string, callback: (request: { sessionID: string }) => Effect.Effect<void>) =>
          Effect.sync(() => { if (name === "prompt") prompt = callback }),
        get: () => Effect.succeed({
          agent: scenario.agent,
          model: scenario.model ? Model.Ref.parse(scenario.model) : undefined,
        }),
        switchModel: (input: { model: Model.Ref }) => Effect.sync(() => { switches.push(input.model) }),
      },
    }

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      yield* FixedAliasesPlugin.effect(context as never)
      assert.ok(prompt)
      yield* prompt({ sessionID: "test-session" })
    })))
    assert.equal(switches.length, scenario.switches)
    if (switches.length) assert.deepEqual(switches[0], Model.Ref.parse("openai/gpt-5.6-luna#high"))
  })
}