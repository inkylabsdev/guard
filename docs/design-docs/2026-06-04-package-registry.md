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
2. Reads dependencies from `GUARD.md` frontmatter, unless package names are passed as command arguments. Exits 0 with an informational message when the dependency list is empty.
3. Fetches `registry.json` from the guard registry.
4. Skips each dependency whose `.guard_modules/<name>/` directory already exists, unless `--reinstall` is passed.
5. Clones each package source to a temporary directory.
6. Copies the requested repository root or subdirectory into `.guard_modules/<name>/`.
7. Appends `.guard_modules/` to the project `.gitignore` if not already present.

`guard check` follows the same dependency install path for root `GUARD.md` projects (mode `single`) before it resolves linked files, includes, and target input.

Installed packages must be explicitly included in the root `GUARD.md` to affect policy evaluation:

```yaml
include: .guard_modules/<name>/GUARD.md
```

## Security Considerations

**Dependency names** must match `/^[a-z0-9][a-z0-9_-]+$/`. Guard rejects names that contain path separators, `.`, `..`, spaces, or characters outside this pattern.

**Subdirectory paths** extracted from `url` fields are validated so they cannot traverse outside the cloned repository (no `..` components after path resolution).

**Registry name uniqueness** is enforced at load time; duplicate `name` values in `registry.json` cause a hard error.

**`GUARD_REGISTRY_URL`** must use an `https://` origin. Setting it grants full package-install authority to that endpoint and should be treated as a privileged override.

**Version model:** packages are intentionally always-latest — `guard install` always clones the default branch HEAD, and registry maintainers are responsible for stability. Reproducible installs via a lockfile recording resolved commit SHAs are planned as follow-on work.

**Threat model:** The three highest-impact supply-chain vectors are:

1. *Registry poisoning* — compromise of `inkylabsdev/guard-registry` silently redirects all `git clone` calls to attacker-controlled repositories. Mitigation: registry integrity verification in future lockfile work.
2. *Subdirectory path traversal* — a crafted `url` field escapes the temporary clone directory via `..` components. Mitigation: path resolution check at install time (see above).
3. *Name squatting* — a malicious or typo-squatted package name in the public registry installs attacker-controlled policy rules. Mitigation: strict name allowlist enforced at both registry load time and `GUARD.md` parse time.

## Notes

- The default registry URL is `https://raw.githubusercontent.com/inkylabsdev/guard-registry/main/registry.json`.
- `GUARD_REGISTRY_PATH` can point to a local `registry.json` for tests, local development, and air-gapped environments.
- `GUARD_REGISTRY_URL` can point to another `https://` registry endpoint.
- The registry only accepts HTTPS git URLs in the documented format.
- `projectRoot` is the directory containing the root `GUARD.md`; `.guard_modules/` is always a sibling of that file.
