# Installation

## Install the Plugin

Install the GitHub version with OpenCode:

```sh
opencode plugin add github:e-baloo/opencode-fixed-aliases
```

This installs from GitHub, not from the npm package registry. The repository
must contain the version you want to install; local commits that have not been
pushed are not included.

## Configure an Alias

Add an alias to the plugin entry created in your OpenCode configuration. Replace
the provider, model, and variant with values available in your setup.

```jsonc
{
    "plugins": [
        {
            "package": "github:e-baloo/opencode-fixed-aliases",
            "options": {
                "aliases": {
                    "coder": "provider/model#variant"
                }
            }
        }
    ],
    "agents": {
        "reviewer": {
            "model": "alias/coder"
        }
    }
}
```

Merge this with your existing configuration. Keep the variant in the alias
target; alias references such as `alias/coder#high` are not supported. Restart
OpenCode after changing the configuration.
