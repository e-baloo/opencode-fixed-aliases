import { Plugin } from "@opencode/plugin"
import { Model } from "@opencode/schema/model"

export type ModelReference = Model.Ref

export type ModelAliases = Record<string, string>

const aliasNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function validateAliases(value: unknown): ModelAliases {
  if (value === undefined) return {}
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
    parseTarget(name, target)
    aliases[name] = target
  }

  return aliases
}

export function parseAliasReference(value: unknown): string | undefined {
  if (typeof value === "string") {
    if (!value.startsWith("alias/")) return undefined
    const name = value.slice("alias/".length)
    if (!name || name.includes("#") || !aliasNamePattern.test(name)) {
      throw new Error(`Invalid alias reference '${value}'. Variants are not allowed after an alias.`)
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

export function parseTarget(alias: string, target: string): ModelReference {
  if (!/^[^/\s#]+\/[^/\s#]+(?:#[^/\s#]+)?$/.test(target)) {
    throw new Error(
      `Invalid target '${target}' for alias '${alias}'. Expected 'provider/model' with an optional fixed '#variant'.`,
    )
  }

  return Model.Ref.parse(target)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const FixedAliasesPlugin = Plugin.define({
  id: "opencode.fixed-aliases",
  async setup(ctx) {
    const aliases = validateAliases(ctx.options.aliases)

    await ctx.agent.transform((editor) => {
      for (const agent of editor.list()) {
        const name = parseAliasReference(agent.model)
        if (!name) continue

        const target = aliases[name]
        if (!target) {
          throw new Error(
            `Unknown model alias '${name}' in agent '${agent.id}'. Add it to the plugin 'aliases' options.`,
          )
        }

        const model = parseTarget(name, target)
        editor.update(`${agent.id}`, (draft) => {
          draft.model = model
        })
      }
    })
  },
})

export default FixedAliasesPlugin