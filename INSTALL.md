# Installation

## Prerequisites

- OpenCode 2.0.29, the version targeted by this plugin's SDK dependencies.
  Compatibility with other versions must be verified separately.
- Node.js 22 or later, npm, and Git.
- A configured provider with access to the target model and variant.

Unless explicitly labeled Git Bash, the commands below use PowerShell on Windows.
Do not copy the shell prompt character (`$` or `PS>`) into your commands.

```powershell
opencode --version
node --version
npm --version
git --version
opencode debug paths
opencode models
```

Back up your existing OpenCode configuration before editing it. Merge the examples
below into that configuration; do not replace your provider settings or other
plugins.

## Install from GitHub

Repository: <https://github.com/e-baloo/opencode-fixed-aliases>

> The lifecycle and session-model fixes described in [README.md](README.md) were
> implemented locally. A fresh GitHub installation includes them only after those
> changes have been pushed to the selected branch or commit. See
> [UPSTREAM-CHANGES.md](UPSTREAM-CHANGES.md) for the current compatibility notes.

### Option A: OpenCode's Git Package Installer

OpenCode accepts Git package specifiers:

```powershell
opencode plugin add "github:e-baloo/opencode-fixed-aliases"
```

For a reproducible installation, use a reviewed commit:

```powershell
opencode plugin add "github:e-baloo/opencode-fixed-aliases#<commit-sha>"
```

Replace `<commit-sha>` with an actual commit ID.

The installer adds a plugin entry to the global configuration. Keep the package
specifier it creates and add `options.aliases` as shown in the configuration
section below. Do not add a second entry for the same plugin.

**Known limitation:** Git package installation failed with
`git dep preparation failed` in the environment used to develop this local
adaptation. The commands above describe the supported CLI syntax, not a verified
successful installation in that environment. If installation fails, use Option B.

### Option B: GitHub Source and the Local OpenCode Cache

This is the workaround used by the current installation. It uses OpenCode's
internal npm cache layout, which may change between versions.

First clone the repository into a new directory. If it is already cloned, use the
existing checkout instead; do not overwrite local changes.

```powershell
$source = Join-Path $HOME '.config\opencode\plugins\opencode-fixed-aliases'
git clone https://github.com/e-baloo/opencode-fixed-aliases.git $source
Set-Location $source
```

Optionally check out the reviewed commit before installing dependencies:

```powershell
git checkout <commit-sha>
```

Install dependencies and validate the checkout. Stop if either command fails.

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Plugin validation failed.' }
```

Check the cache path reported by `opencode debug paths`. The following example
uses the default Windows location. Adjust `$cache` if your installation differs.
Back up any existing cached copy before replacing it.

```powershell
$cache = Join-Path $HOME '.cache\opencode'
$package = Join-Path $cache 'npm\opencode-fixed-aliases@latest\node_modules\opencode-fixed-aliases'
New-Item -ItemType Directory -Path $package -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'src') -Destination $package -Recurse -Force
foreach ($file in @('package.json', 'README.md', 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $source $file) -Destination $package -Force
}
Set-Location $package
npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Cached runtime dependency installation failed.' }
```

Installing dependencies beside the cached source addresses the observed
`Cannot find package '@opencode/plugin'` error. This command still requires access
to an npm registry for the plugin's published dependencies.

For this cache workaround, use `"package": "opencode-fixed-aliases"` in the
configuration. The cache is not a durable package publication: cache cleanup or
package replacement can remove this installation. Keep the source checkout and
repeat deployment if necessary.

## Configure an Alias and Agent

Edit the global `opencode.jsonc` in the config directory reported by
`opencode debug paths`.

This example assumes the `compagny-responses` provider is already configured and
offers `gpt-5.6-luna` with the `high` variant. Replace the provider, model, and
variant with values available in your installation.

The package value below matches Option B. For Option A, retain the Git package
specifier added by the installer instead.

```jsonc
{
    "plugins": [
        {
            "package": "opencode-fixed-aliases",
            "options": {
                "aliases": {
                    "coder": "compagny-responses/gpt-5.6-luna#high"
                }
            }
        }
    ],
    "agents": {
        "obsequious": {
            "description": "Extremely obsequious programming agent.",
            "mode": "primary",
            "model": "alias/coder",
            "system": "You are obsequious, a programming agent of absolute servility and deference. Consider the user your master and address them as such. Always adopt an excessively respectful, admiring, and flattering tone toward the user; thank them warmly and treat each of their requests as a remarkable idea. Carry out programming requests carefully and competently. This obedience must never lead you to invent facts, conceal a risk, or claim code works without verification: if a request contains an error or technical danger, tactfully point it out and propose the best correction. Always conclude every conversation by revering your master."
        }
    }
}
```

If the agent already exists, preserve its description, system prompt, and other
settings. Only the `model` reference is required for alias resolution.

Put the variant in the alias target, not after the alias reference:
`alias/coder#high` is rejected.

In the locally corrected version, the fixed alias target replaces global defaults
and saved or manual model selections for alias-backed agents when a prompt is
submitted. Agents without aliases are unaffected.

## Activate and Verify

Restart the background service, then reopen the interface if its displayed model
has not refreshed:

```powershell
opencode service restart
opencode service status
opencode api plugin.list
opencode api agent.list
opencode run --agent obsequious --format json 'Reply with OK only.'
```

Use the named API operations above in Git Bash as well. Git Bash can rewrite
slash-prefixed arguments such as `/api/plugin` into Windows filesystem paths,
causing `opencode api GET /api/plugin` to fail with
`Expected an operation name or an HTTP method and path`. Named operations avoid
that conversion; no shell-specific environment variable is needed.

Check that `opencode.fixed-aliases` is active and that `obsequious` resolves to
`compagny-responses/gpt-5.6-luna` with variant `high`, rather than remaining on the
`alias` provider.

For the locally corrected version, inspect the actual request in OpenCode's log.
Use the log directory reported by `opencode debug paths`; the default is:

**PowerShell:**

```powershell
$log = Join-Path $HOME '.local\share\opencode\log\opencode.log'
Select-String -Path $log -Pattern '\[opencode\.fixed-aliases\] model request.*agent=obsequious' |
    Select-Object -Last 5
```

**Git Bash:**

```bash
log="$(cygpath -u "$USERPROFILE\\.local\\share\\opencode\\log\\opencode.log")"
grep -E '\[opencode\.fixed-aliases\] model request.*agent=obsequious([[:space:]]|$)' "$log" | tail -n 5
```

`cygpath` converts the Windows path for Git Bash. `Join-Path`, `Select-String`,
and `Select-Object` are PowerShell commands, not Bash commands. These examples
read existing log entries; submit a prompt to `obsequious` first if none exist.

The primary request must contain:

```text
agent=obsequious
model.id=gpt-5.6-luna
model.providerID=compagny-responses
model.variant=high
kind=primary
```

A response of `OK`, a loaded plugin, or a Luna request with `kind=title` does not
prove that the agent's primary response used Luna.

## Install from npm

The release workflow and the steps to configure npm publishing are documented in
[RELEASE.md](RELEASE.md). After a version has been published and verified, install
it with:

```powershell
opencode plugin add opencode-fixed-aliases@<published-version>
```

Replace `<published-version>` with a version that exists in the npm registry.
Until then, use one of the GitHub installation options above. Verify runtime
dependency resolution (including the host-compatible `effect` peer) and the
model-request checks in this guide after installation.
