import { Plugin } from "@opencode/plugin/effect"
import type { AgentEditor } from "@opencode/plugin/effect/agent"
import { Model } from "@opencode/schema/model"
import { Effect, Stream } from "effect"

export type ModelReference = Model.Ref

export type ModelAliases = Record<string, string>
export type ResolvedModelAliases = Map<string, ModelReference>

const aliasNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

const validateAliasConfig = (value: unknown): { aliases: ModelAliases; resolved: ResolvedModelAliases } => {
  if (value === undefined) return { aliases: {}, resolved: new Map() }
  if (!isRecord(value)) {
    throw new Error("The plugin option 'aliases' must be an object of alias-to-model mappings.")
  }

  const aliases: ModelAliases = {}
  for (const [name, target] of Object.entries(value)) {
    if (!aliasNamePattern.test(name)) {
      throw new Error(`Invalid alias name '${name}'. Use letters, numbers, dots, underscores, and hyphens.`)
    }
    if (typeof target !== "string") {
      throw new Error(`The target for alias '${name}' must be a model string.`)
    }
    if (target.startsWith("alias/")) parseAliasReference(target)
    else parseTarget(name, target)
    aliases[name] = target
  }

  return { aliases, resolved: resolveAliases(aliases) }
}

export const validateAliases = (value: unknown): ModelAliases => validateAliasConfig(value).aliases

export const parseAliasReference = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    if (!value.startsWith("alias/")) return undefined
    const name = value.slice("alias/".length)
    if (!name || name.includes("#") || !aliasNamePattern.test(name)) {
      throw new Error(
        `Invalid alias reference '${value}'. Variants are not allowed after an alias; additional path segments are invalid.`,
      )
    }
    return name
  }

  if (!isRecord(value) || value.providerID !== "alias") return undefined

  const modelName = value.id ?? value.model ?? value.modelID
  if (typeof modelName !== "string" || !aliasNamePattern.test(modelName) || value.variant !== undefined) {
    throw new Error("Alias model references must use 'alias/<name>' without a variant.")
  }
  return modelName
}

export const resolveAliases = (aliases: ModelAliases): ResolvedModelAliases => {
  const resolved: ResolvedModelAliases = new Map()
  const visiting: string[] = []

  const resolve = (name: string): ModelReference => {
    const cached = resolved.get(name)
    if (cached) return cached

    const cycleStart = visiting.indexOf(name)
    if (cycleStart !== -1) {
      const cycle = [...visiting.slice(cycleStart), name].join(" -> ")
      throw new Error(`Alias cycle detected: ${cycle}`)
    }

    const target = aliases[name]
    if (typeof target !== "string") {
      const source = visiting.at(-1) ?? name
      throw new Error(`Unknown model alias '${name}' referenced by alias '${source}'.`)
    }

    visiting.push(name)
    let model: ModelReference
    if (target.startsWith("alias/")) {
      const targetAlias = parseAliasReference(target)!
      if (!Object.hasOwn(aliases, targetAlias)) {
        throw new Error(`Unknown model alias '${targetAlias}' referenced by alias '${name}'.`)
      }
      model = resolve(targetAlias)
    } else {
      model = parseTarget(name, target)
    }
    visiting.pop()

    resolved.set(name, model)
    return model
  }

  for (const name of Object.keys(aliases)) resolve(name)
  return resolved
}

export const parseTarget = (alias: string, target: string): ModelReference => {
  if (!/^[^/\s#]+\/[^/\s#]+(?:#[^/\s#]+)?$/.test(target)) {
    throw new Error(
      `Invalid target '${target}' for alias '${alias}'. Expected 'provider/model' with an optional fixed '#variant'.`,
    )
  }

  return Model.Ref.parse(target)
}

export const formatAliases = (
  aliases: ModelAliases,
  models: readonly Pick<Model.Info, "providerID" | "id" | "enabled">[],
  resolved: ResolvedModelAliases = resolveAliases(aliases),
): string => {
  const rows = Object.entries(aliases)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([alias, target]) => {
      const model = resolved.get(alias)!
      const available = models.some((candidate) =>
        candidate.providerID === model.providerID && candidate.id === model.id && candidate.enabled,
      )
      const status = available ? "🟢 Disponible" : "🔴 Indisponible"
      const resolvedTarget = `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`
      const displayTarget = target.startsWith("alias/") ? `${target} → ${resolvedTarget}` : target
      return `| \`${alias}\` | \`${displayTarget.replaceAll("|", "\\|")}\` | ${status} |`
    })

  if (rows.length === 0) return "Aucun alias de modèle n’est configuré."

  return [
    "| Alias | Modèle cible | Disponibilité |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "La disponibilité indique si le modèle est présent et activé dans le catalogue OpenCode.",
  ].join("\n")
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const FixedAliasesPlugin = Plugin.define({
  id: "opencode.fixed-aliases",
  effect: (ctx) =>
    Effect.gen(function* () {
      const { aliases, resolved: resolvedAliases } = validateAliasConfig(ctx.options.aliases)
      yield* Effect.logInfo("[opencode.fixed-aliases] setup started", { aliases: Object.keys(aliases) })

      yield* ctx.command.transform((editor) => editor.add({
        name: "aliases",
        description: "Liste les alias de modèles configurés et leur disponibilité.",
        execute: (input) =>
          Effect.gen(function* () {
            const catalog = yield* ctx.model.list({ location: { directory: ctx.location.directory } })
            const text = formatAliases(aliases, catalog.data, resolvedAliases)
            yield* ctx.session.synthetic({
              sessionID: input.sessionID,
              text,
              description: "Alias de modèles",
              delivery: input.delivery,
            })
          }),
      }))

      const loggingContext = yield* Effect.context()
      let agentTargets = new Map<string, ModelReference>()
      const transform = (editor: AgentEditor) => {
        const mappings: Array<{ agent: string; alias: string; target: string; resolved: ModelReference }> = []
        const targets = new Map<string, ModelReference>()
        for (const agent of editor.list()) {
          const name = parseAliasReference(agent.model)
          if (!name) continue

          const target = aliases[name]
          const model = resolvedAliases.get(name)
          if (!target || !model) {
            throw new Error(
              `Unknown model alias '${name}' in agent '${agent.id}'. Add it to the plugin 'aliases' options.`,
            )
          }

          editor.update(`${agent.id}`, (draft) => {
            draft.model = model
          })
          mappings.push({ agent: agent.id, alias: name, target, resolved: model })
          targets.set(agent.id, model)
        }
        agentTargets = targets
        Effect.runSync(Effect.provideContext(
          Effect.logInfo("[opencode.fixed-aliases] agent transform invoked", {
            agentCount: editor.list().length,
            mappings,
          }),
          loggingContext,
        ))
      }
      let registration = yield* ctx.agent.transform(transform)

      yield* Effect.logInfo("[opencode.fixed-aliases] alias transform registered", {
        aliases: Object.keys(aliases),
      })

      // Configured agents can be registered after user plugins during startup.
      yield* Effect.forkScoped(Stream.runForEach(ctx.event.subscribe(), (event) =>
        Effect.gen(function* () {
          if (event.type !== "agent.updated" || event.location?.directory !== ctx.location.directory) return

          const input = { location: { directory: ctx.location.directory } }
          const agents = yield* Effect.orDie(ctx.agent.list(input))
          if (!agents.data.some((agent) => parseAliasReference(agent.model))) return

          yield* Effect.logInfo("[opencode.fixed-aliases] resolving configured agents after update")
          yield* registration.dispose
          registration = yield* ctx.agent.transform(transform)
          yield* ctx.agent.reload()

          const resolved = yield* Effect.orDie(ctx.agent.list(input))
          const unresolved = resolved.data.filter((agent) => parseAliasReference(agent.model))
          if (unresolved.length) {
            yield* Effect.logError("[opencode.fixed-aliases] alias resolution failed", {
              agents: unresolved.map((agent) => agent.id),
            })
            return yield* Effect.die(new Error("Configured agent aliases remain unresolved after reload."))
          }
          yield* Effect.logInfo("[opencode.fixed-aliases] configured agent models resolved", {
            agents: resolved.data.map(({ id, model }) => ({ id, model })),
          })
        }),
      ).pipe(Effect.orDie))

      yield* ctx.session.hook("prompt", (request) =>
        Effect.gen(function* () {
          const session = yield* Effect.orDie(ctx.session.get({ sessionID: request.sessionID }))
          const target = session.agent ? agentTargets.get(session.agent) : undefined
          if (!target) return
          if (session.model?.providerID === target.providerID &&
              session.model?.id === target.id &&
              session.model?.variant === target.variant) return

          yield* Effect.logInfo("[opencode.fixed-aliases] applying fixed model to session", {
            agent: session.agent,
            previous: session.model,
            target,
            sessionID: request.sessionID,
          })
          yield* Effect.orDie(ctx.session.switchModel({ sessionID: request.sessionID, model: target }))
        }),
      )

      yield* ctx.session.hook("model.request", (request) =>
        Effect.logInfo("[opencode.fixed-aliases] model request", {
          agent: request.agent,
          model: request.model,
          kind: request.kind,
          sessionID: request.sessionID,
        }),
      )
    })
})

export default FixedAliasesPlugin
