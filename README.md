# Guard

Guard is an LLM-powered policy checker for code, diffs, test output, logs, and
plain text. It reads rules from a `GUARD.md` policy or a guard package, collects
the requested input, asks a model to evaluate the input, and prints a concise
report with findings and exit codes.

This repository is a pnpm workspace. The CLI package lives in
`packages/guard`.

## Repository Layout

```text
packages/
  guard/        CLI, runtime, examples, and tests
```

## Requirements

- Node.js 22.19.0 or newer
- pnpm

## Install

```bash
pnpm install
```

## Run Locally

From the repository root:

```bash
pnpm --dir packages/guard dev version
pnpm --dir packages/guard dev check packages/guard/examples/unsafe.ts
pnpm --dir packages/guard dev check --diff
cat packages/guard/examples/test-output.txt | pnpm --dir packages/guard dev check --stdin
```

The default provider is `mock`, so the CLI can run without API keys. Override it
with CLI flags or environment variables:

```bash
GUARD_PROVIDER=openai GUARD_MODEL=<model> pnpm --dir packages/guard dev check src/
pnpm --dir packages/guard dev check --provider anthropic --model <model> src/
```

## Policy Formats

Guard supports two project formats.

### Single Policy

Place a `GUARD.md` at the project root:

```markdown
---
severity_threshold: warning
include: []
---

# Guard Policy

## Do Not

- Do not log secrets.
- Do not swallow errors silently.
```

### Guard Package

Use `package.json` plus one rule directory per check under `src/`:

```text
package.json
src/
  no-secret-logging/
    GUARD.md
    evals/
      bad/
        sample.ts
      good/
        sample.ts
```

Each rule `GUARD.md` uses frontmatter with `id`, `severity`, `description`, and
optional `depends_on`. Rule ids must match their directory names. Package rules
run one at a time in stable dependency order.

## Development

```bash
pnpm --dir packages/guard build
pnpm --dir packages/guard lint
pnpm --dir packages/guard test
pnpm --dir packages/guard test:coverage
```

The coverage target is 100%.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | No findings at or above the configured threshold |
| `1` | One or more findings at or above the configured threshold |
| `2` | CLI, configuration, package-load, or evaluation error |

## Examples

See `packages/guard/examples` for a sample policy, unsafe input, stdin input,
and file-list input.
