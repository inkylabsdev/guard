# Guard Package Registry

## Goal

Guard packages need a small registry so projects can declare reusable policy packages and install them into a local project cache.

Success criteria:

1. The public registry is maintained as `registry.json` in `https://github.com/inkylabsdev/guard-registry`.
2. `registry.json` is an array of package records with `{ name, description, license, homepage, url }`.
3. A root `GUARD.md` can declare registry dependencies in frontmatter.
4. `guard install` downloads dependencies into `.guard_modules/`.
5. `guard check` installs declared root dependencies before evaluating the project policy.

## Registry Format

`registry.json` is a JSON array:

```json
[
  {
    "name": "simple-writing-guard",
    "description": "Plain-language writing checks for common AI-writing patterns.",
    "license": "MIT",
    "homepage": "https://github.com/inkylabsdev/guard-registry/tree/main/packages/simple-writing-guard",
    "url": "git::https://github.com/inkylabsdev/guard-registry.git//packages/simple-writing-guard"
  }
]
```

Fields:

- `name`: unique dependency name used in `GUARD.md`.
- `description`: short human-readable summary.
- `license`: SPDX license string or license label.
- `homepage`: documentation or source page for the package.
- `url`: source location in the form `git::https://<HOST>/<PATH>.git//<SUBDIRECTORY>`.

The `//<SUBDIRECTORY>` suffix is optional. When omitted, Guard installs the repository root.

## Project Frontmatter

A root `GUARD.md` declares dependencies with a `dependencies` array:

```yaml
---
dependencies:
  - simple-writing-guard
---
```

Dependency names must match registry entries exactly. Installation writes each dependency to:

```text
.guard_modules/<dependency-name>/
```

## Install Flow

`guard install`:

1. Finds the nearest root `GUARD.md` project.
2. Reads dependencies from `GUARD.md` frontmatter, unless package names are passed as command arguments.
3. Fetches `registry.json` from the guard registry.
4. Clones each package source to a temporary directory.
5. Copies the requested repository root or subdirectory into `.guard_modules/<name>/`.

`guard check` follows the same dependency install path for root `GUARD.md` projects before it resolves linked files, includes, and target input.

## Notes

- The default registry URL is `https://raw.githubusercontent.com/inkylabsdev/guard-registry/main/registry.json`.
- `GUARD_REGISTRY_PATH` can point to a local `registry.json` for tests and local development.
- `GUARD_REGISTRY_URL` can point to another registry endpoint.
- The registry only accepts HTTPS git URLs in the documented format.
