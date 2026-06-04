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

## Dependency Formats

GUARD.md frontmatter supports three dependency formats:

| Format | Example | Resolution |
|---|---|---|
| Registry name | `simple-writing-guard` | Looked up in `registry.json`; downloaded via git clone |
| Relative path | `./local-guard` | Resolved relative to the project root; directory is copied |
| Absolute path | `/home/user/guard-packages/my-guard` | Copied from the given filesystem path |

Relative paths **must** start with `./`. Bare names without `./` are treated as registry names.

The module name installed into `.guard_modules/` is the final path component of the path. For example, `./packages/my-guard` installs to `.guard_modules/my-guard/`. For registry names the dependency name is used directly.

## Project Frontmatter

A root `GUARD.md` declares dependencies with a `dependencies` array:

```yaml
---
dependencies:
  - simple-writing-guard
  - ./local-guard
  - /absolute/path/to/my-guard
---
```

Registry names must match registry entries exactly. Relative paths must start with `./`. Absolute paths must be absolute filesystem paths. Installation writes each dependency to:

```text
.guard_modules/<module-name>/
```

where `<module-name>` is the registry name or the final path component of a local path.

## Install Flow

`guard install`:

1. Finds the nearest root `GUARD.md` project.
2. Reads dependencies from `GUARD.md` frontmatter, unless dependency values are passed as command arguments. Exits 0 with an informational message when the dependency list is empty.
3. For each dependency:
   - **Registry name** — fetches `registry.json`, resolves the `url`, clones the repository to a temporary directory, and copies the requested subdirectory (or repository root) into `.guard_modules/<name>/`.
   - **Relative path** — resolves the path relative to the project root; validates the resolved path does not escape the project root; copies the directory into `.guard_modules/<basename>/`.
   - **Absolute path** — validates the path exists and is a directory; copies it into `.guard_modules/<basename>/`.
4. Skips each dependency whose `.guard_modules/<module-name>/` directory already exists, unless `--reinstall` is passed.
5. Appends `.guard_modules/` to the project `.gitignore` if not already present.

`guard check` follows the same dependency install path for root `GUARD.md` projects (mode `single`) before it resolves linked files, includes, and target input.

Installed packages must be explicitly included in the root `GUARD.md` to affect policy evaluation:

```yaml
include: .guard_modules/<module-name>/GUARD.md
```

## Security Considerations

**Registry dependency names** must match `/^[a-z0-9][a-z0-9_-]+$/`. Guard rejects names that contain path separators, `.`, `..`, spaces, or characters outside this pattern.

**Relative paths** must start with `./` and must resolve to a path inside the project root after normalization. Guard rejects relative paths whose normalized form contains `..` components that escape the project root.

**Absolute paths** must point to an existing directory. Guard does not restrict which absolute paths are allowed; the operator is responsible for ensuring only trusted directories are referenced.

**Module name collisions** — if two path-based dependencies share the same final path component (e.g., `./a/my-guard` and `/other/my-guard`), Guard reports a hard error at install time.

**Subdirectory paths** extracted from `url` fields are validated so they cannot traverse outside the cloned repository (no `..` components after path resolution).

**Registry name uniqueness** is enforced at load time; duplicate `name` values in `registry.json` cause a hard error.

**`GUARD_REGISTRY_URL`** must use an `https://` origin. Setting it grants full package-install authority to that endpoint and should be treated as a privileged override.

**Version model:** registry packages are intentionally always-latest — `guard install` always clones the default branch HEAD, and registry maintainers are responsible for stability. Path-based dependencies always reflect the current state of the source directory at install time. Reproducible installs via a lockfile recording resolved commit SHAs are planned as follow-on work.

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
