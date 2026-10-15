import assert from "node:assert/strict"
import test from "node:test"
import { Model } from "@opencode/schema/model"
import { Effect } from "effect"
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