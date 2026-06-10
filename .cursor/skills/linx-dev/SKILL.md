---
name: linx-dev
description: Develop and maintain the linx relay project with consistent workflow, safe service-script handling, and mandatory prebuild checks. Use when working on linx features, fixing packaging/service scripts, or preparing release builds.
disable-model-invocation: true
---

# linx Development Workflow

## Scope

Apply this skill when editing the `linx` repository, especially for:
- relay/API logic in `src`
- packaging and release scripts in `scripts`
- Windows service scripts in `scripts/nssm` and `release-portable`
- build and release quality checks

## Project conventions

1. Keep implementation in TypeScript under `src`.
2. Keep build/release automation in `scripts`.
3. Keep portable service scripts synchronized:
   - source of truth: `scripts/nssm/*.ps1|*.bat`
   - release copy: `release-portable/*.ps1|*.bat`
4. Do not commit secrets (`linx-data/.key`, real tokens, real DB credentials).

## Required checks before build/release

Run this sequence:

```bash
npm run prebuild
npm run build
```

`prebuild` must include:
- environment template sanity check (`linx.env.example` has required keys)
- TypeScript static check (`npm run typecheck`)

If `prebuild` fails, fix the root cause first and rerun.

## Service script safety rules

When modifying install/uninstall scripts:

1. Prefer `Resolve-Path -LiteralPath` for user-provided paths.
2. Trim wrapped quotes from incoming path args before path resolution.
3. Return clear error text with an example of valid `-InstallDir`.
4. Keep both copies in sync:
   - `scripts/nssm/install-service.ps1`
   - `release-portable/install-service.ps1`

## Change checklist

- [ ] Changed files match feature scope
- [ ] `npm run prebuild` passed
- [ ] `npm run build` passed
- [ ] Portable/service script copies kept in sync (if touched)
- [ ] No secrets or machine-local values introduced
