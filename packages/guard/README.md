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

## Provider setup

The default provider is `faux`, which uses deterministic local checks and does not call an LLM. It needs no API key:

```bash
guard check src/
```

To use a real provider, set that provider's API key in the environment, then select the provider and model with CLI flags or `GUARD_PROVIDER` / `GUARD_MODEL`.

Supported providers are `faux` plus the text-model providers known to pi-ai.

```bash
OPENAI_API_KEY=<key> guard check --provider openai --model gpt-4o src/
ANTHROPIC_API_KEY=<key> guard check --provider anthropic --model claude-sonnet-4-5 src/
MISTRAL_API_KEY=<key> guard check --provider mistral --model codestral-latest src/
```

Equivalent environment-variable form:

```bash
export OPENAI_API_KEY=<key>
export GUARD_PROVIDER=openai
export GUARD_MODEL=gpt-4o
guard check src/
```

`guard` does not manage provider login. It passes the selected provider and model to pi-ai, and pi-ai reads credentials from the provider's environment variables. Common pi-ai credential variables include:

| Provider | Credential environment variable |
|---|---|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN` |
| `google` | `GEMINI_API_KEY` |
| `google-vertex` | `GOOGLE_CLOUD_API_KEY`, or Google ADC with `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` |
| `mistral` | `MISTRAL_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `together` | `TOGETHER_API_KEY` |
| `amazon-bedrock` | AWS credentials such as `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |

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

The default `faux` provider uses simple keyword checks and does not call any LLM. For real providers, `guard` relies on pi-ai's provider catalog and credential handling.

## Examples

See the `examples/` directory:

- `examples/GUARD.md` — example policy
- `examples/unsafe.ts` — file with intentional violations
- `examples/test-output.txt` — sample test output for stdin checking
- `examples/file-list.txt` — sample `@list` file
