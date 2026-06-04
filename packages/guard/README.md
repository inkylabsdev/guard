# @inkylabsdev/guard

A lightweight LLM-powered policy checker for code, diffs, test results, logs, or arbitrary text. CLI ergonomics: fast, cheap, clear reports, and useful defaults.

## What it does

Guard reads policies from `GUARD.md`, collects input from git diffs, files, directories, globs, file lists, or stdin, and evaluates the input against your policies using an LLM provider.

## Installation

```bash
npm install -g @inkylabsdev/guard
# or
pnpm add -g @inkylabsdev/guard
```

## Commands

### `guard version`

```bash
guard version
# @inkylabsdev/guard 0.1.0
```

### `guard check`

```bash
guard check --diff                  # check changed files in current git diff
guard check src/                    # check all files under src/
guard check "src/**/*.ts"           # check files matching a glob
guard check src/index.ts            # check a single file
guard check @changed-files.txt      # check files listed in a text file
cat test-output.txt | guard check --stdin  # check arbitrary stdin text
```

## GUARD.md format

Place a `GUARD.md` in your repo root (guard walks up from cwd to find it).

```markdown
---
severity_threshold: warning
include:
  - github:inkylabs/guard-rules/javascript
---

# Guard Policy

## Do

- Prefer simple, readable code.

## Do Not

- Do not log secrets.
- Do not swallow errors silently.
```

### Frontmatter fields

| Field | Type | Default | Description |
|---|---|---|---|
| `severity_threshold` | `info` \| `warning` \| `error` | `info` | Minimum severity to fail |
| `include` | array | `[]` | Remote rule sets to include |

### Linked files

Reference additional local markdown files with `@filename.md`:

```markdown
Please also follow @SECURITY.md and @STYLE.md.
```

### Remote includes

```yaml
include:
  - github:owner/repo/path
  - github: owner/repo
    ref: main
    path: rules/GUARD.md
```

Fetches from `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}`. On failure, emits a warning and continues.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Pass — no findings at or above threshold |
| `1` | Fail — one or more findings at or above threshold |
| `2` | CLI or configuration error |

## Current limitations

The default `mock` provider uses simple keyword checks and does not call any LLM. This is intentional so guard works without API keys. Real providers (OpenAI, Anthropic) will be added as plugins.

## Examples

See the `examples/` directory:

- `examples/GUARD.md` — example policy
- `examples/unsafe.ts` — file with intentional violations
- `examples/test-output.txt` — sample test output for stdin checking
- `examples/file-list.txt` — sample `@list` file
