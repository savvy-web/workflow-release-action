---
title: GitHub Action Builder Architecture
type: architecture
status: current
completeness: 90
created: 2026-01-29
updated: 2026-01-30
last-synced: 2026-01-30
authors:
  - C. Spencer Beggs
tags:
  - architecture
  - github-actions
  - build-tool
  - ncc
  - effect-ts
  - node24
---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Service Layer](#service-layer)
4. [Schemas](#schemas)
5. [Smart Defaults](#smart-defaults)
6. [Configuration System](#configuration-system)
7. [Build Pipeline](#build-pipeline)
8. [Validation System](#validation-system)
9. [CLI Design](#cli-design)
10. [API Design](#api-design)
11. [Error Handling](#error-handling)
12. [Rationale](#rationale)
13. [Decisions](#decisions)

---

## Overview

`@savvy-web/github-action-builder` is a build tool for creating **Node.js 24**
GitHub Actions from TypeScript source code. It uses Vercel's `@vercel/ncc` to
bundle actions into self-contained JavaScript files that can be committed to
a repository.

**Key Features:**

- Zero-config builds with smart defaults
- **Node.js 24 only** - validates `action.yml` requires `runs.using: "node24"`
- TypeScript support with proper compilation
- Effect-TS service architecture for testability and composability
- CLI with `build`, `validate`, and `init` commands
- Programmatic API via `GitHubAction` class
- Validates `action.yml` against GitHub's official schema
- Auto-detects entry points: `src/main.ts` (required), `src/pre.ts`, `src/post.ts`
- Flat output structure: `dist/main.js`, `dist/pre.js`, `dist/post.js`
- Source maps disabled by default for smaller bundles

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Consumer Layer                           │
├──────────────────────┬──────────────────────────────────────┤
│   CLI (@effect/cli)  │   GitHubAction Class                 │
│   - build command    │   - Promise-based wrapper            │
│   - validate command │   - ManagedRuntime for services      │
│   - init command     │   - For non-Effect consumers         │
└──────────────────────┴──────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer (Effect)                    │
├─────────────────────────────────────────────────────────────┤
│  ConfigService       │  ValidationService │  BuildService   │
│  - load()            │  - validate()      │  - build()      │
│  - resolve()         │  - validateActionYml()│  - bundle()  │
│  - detectEntries()   │  - formatResult()  │  - clean()      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Foundation Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Typed Errors        │  Schemas           │  Layers         │
│  - ConfigError       │  - @effect/schema  │  - AppLayer     │
│  - ValidationError   │  - Config schemas  │  - ConfigLayer  │
│  - BuildError        │  - ActionYml schema│  - BuildLayer   │
└─────────────────────────────────────────────────────────────┘
```

The architecture follows an Effect-first design where:

1. **Services** define interfaces with `Context.Tag`
2. **Layers** provide live implementations
3. **CLI** consumes services directly via Effect
4. **GitHubAction** wraps services with `ManagedRuntime.runPromise`

---

## Service Layer

### ConfigService (`src/services/config.ts`)

Handles configuration loading and entry point detection.

```typescript
interface ConfigService {
  // Load configuration from file or use defaults
  readonly load: (options?: LoadConfigOptions) => Effect<LoadConfigResult, ConfigError>

  // Resolve partial config input to full Config
  readonly resolve: (input?: Partial<ConfigInput>) => Effect<Config, ConfigError>

  // Detect entry points in the project
  readonly detectEntries: (cwd: string, entries?: {...}) => Effect<DetectEntriesResult, MainEntryMissing>
}
```

**Key behaviors:**

- Searches for `action.config.ts` in working directory
- Auto-detects `src/main.ts` (required), `src/pre.ts`, `src/post.ts` (optional)
- Applies schema defaults for missing configuration

### ValidationService (`src/services/validation.ts`)

Validates configuration and `action.yml` files.

```typescript
interface ValidationService {
  // Validate config and project structure
  readonly validate: (config: Config, options?: ValidateOptions) => Effect<ValidationResult, ValidationError>

  // Validate action.yml against schema
  readonly validateActionYml: (path: string) => Effect<ActionYmlResult, ValidationError>

  // Check if running in CI environment
  readonly isCI: () => Effect<boolean>

  // Check if strict mode is enabled (auto-detects CI)
  readonly isStrict: (configStrict?: boolean) => Effect<boolean>
}
```

**Key behaviors:**

- Validates `action.yml` requires `runs.using: "node24"` only
- In CI: warnings become errors, build fails
- In development: warnings displayed, build continues

### BuildService (`src/services/build.ts`)

Bundles TypeScript entry points with `@vercel/ncc`.

```typescript
interface BuildService {
  // Build all entries from configuration
  readonly build: (config: Config, options?: BuildRunnerOptions) => Effect<BuildResult, BuildError>

  // Bundle a single entry point
  readonly bundle: (entry: DetectedEntry, config: Config) => Effect<BundleResult, BuildError>

  // Clean output directory
  readonly clean: (outputDir: string) => Effect<void, BuildError>
}
```

**Key behaviors:**

- Cleans `dist/` directory before building (configurable)
- Bundles each detected entry point
- Writes `dist/package.json` with `{ "type": "module" }`
- Handles assets from dynamic imports (ncc chunks)

### Layer Composition (`src/layers/app.ts`)

```typescript
// Individual service layers
export const ConfigLayer = ConfigServiceLive
export const ValidationLayer = ValidationServiceLive.pipe(Layer.provide(ConfigServiceLive))
export const BuildLayer = BuildServiceLive.pipe(Layer.provide(ConfigServiceLive))

// Combined application layer
export const AppLayer = Layer.mergeAll(ConfigServiceLive, ValidationLayer, BuildLayer)
```

---

## Schemas

All configuration schemas use `@effect/schema` (not Zod).

### Config Schema (`src/schemas/config.ts`)

```typescript
const EntriesSchema = Schema.Struct({
  main: Schema.optionalWith(Schema.String, { default: () => "src/main.ts" }),
  pre: Schema.optional(Schema.String),
  post: Schema.optional(Schema.String),
})

const BuildOptionsSchema = Schema.Struct({
  minify: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  target: Schema.optionalWith(EsTarget, { default: () => "es2022" }),
  sourceMap: Schema.optionalWith(Schema.Boolean, { default: () => false }), // Off by default
  externals: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  quiet: Schema.optionalWith(Schema.Boolean, { default: () => false }),
})

const ValidationOptionsSchema = Schema.Struct({
  requireActionYml: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  maxBundleSize: Schema.optional(Schema.String),
  strict: Schema.optional(Schema.Boolean), // Auto-detects from CI
})
```

### ActionYml Schema (`src/schemas/action-yml.ts`)

Validates `action.yml` against GitHub's metadata specification.

```typescript
// Only node24 is supported - this is enforced
const Runs = Schema.Struct({
  using: Schema.Literal("node24"),  // Strictly node24 only
  main: Schema.String,
  pre: Schema.optional(Schema.String),
  "pre-if": Schema.optional(Schema.String),
  post: Schema.optional(Schema.String),
  "post-if": Schema.optional(Schema.String),
})

const ActionYml = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  author: Schema.optional(Schema.String),
  inputs: Schema.optional(Schema.Record({ key: Schema.String, value: ActionInput })),
  outputs: Schema.optional(Schema.Record({ key: Schema.String, value: ActionOutput })),
  runs: Runs,
  branding: Schema.optional(Branding),
})
```

---

## Smart Defaults

The builder works with zero configuration by making smart assumptions:

### Entry Point Detection

| File | Required | Role |
| ---- | -------- | ---- |
| `src/main.ts` | **Yes** | Main action logic |
| `src/pre.ts` | No | Pre-action hook (setup) |
| `src/post.ts` | No | Post-action hook (cleanup) |

The builder automatically detects which optional entry points exist using
`existsSync()` checks in the working directory.

### Output Structure (Flat)

| Input | Output |
| ----- | ------ |
| `src/main.ts` | `dist/main.js` |
| `src/pre.ts` | `dist/pre.js` |
| `src/post.ts` | `dist/post.js` |
| (generated) | `dist/package.json` |
| (if chunks exist) | `dist/*.js` (dynamic imports) |

All outputs are self-contained ESM bundles with all dependencies included.
The output structure is **flat** - all files go directly in `dist/`.

### Build Defaults

| Option | Default | Description |
| ------ | ------- | ----------- |
| `minify` | `true` | Minify output for smaller bundles |
| `target` | `"es2022"` | ECMAScript target version |
| `sourceMap` | `false` | Source maps disabled by default |
| `externals` | `[]` | No packages excluded from bundle |
| `quiet` | `false` | Show build output |

### Zero-Config Example

```bash
# Project structure:
my-action/
├── src/
│   ├── main.ts    # Required
│   └── post.ts    # Optional, auto-detected
├── action.yml     # Must have runs.using: "node24"
└── package.json

# Just run:
github-action-builder build

# Produces:
my-action/
├── dist/
│   ├── main.js
│   ├── post.js
│   └── package.json  # { "type": "module" }
└── ...
```

---

## Configuration System

### Config File: `action.config.ts`

Optional TypeScript configuration file for customization:

```typescript
import { defineConfig } from "@savvy-web/github-action-builder";

export default defineConfig({
  // Override entry points (optional - auto-detected by default)
  entries: {
    main: "src/main.ts",      // Required, default: "src/main.ts"
    pre: "src/setup.ts",      // Custom pre script path
    post: "src/cleanup.ts",   // Custom post script path
  },

  // Build options
  build: {
    minify: true,             // Default: true
    target: "es2022",         // Default: "es2022"
    sourceMap: false,         // Default: false (disabled for smaller bundles)
    externals: [],            // Packages to exclude from bundle
    quiet: false,             // Default: false
  },

  // Validation rules
  validation: {
    requireActionYml: true,   // Default: true
    maxBundleSize: "5mb",     // Warn if bundle exceeds (optional)
    strict: undefined,        // Auto-detects from CI environment
  },
});
```

### Config Resolution

1. Look for `action.config.ts` in CWD
2. Override path with `-c` / `--config` flag
3. Use smart defaults if no config found

Only `.ts` config files are supported to ensure proper ESM/Node 24 compatibility.

### defineConfig Helper

The `defineConfig()` function provides type-safe configuration with defaults:

```typescript
import { Schema } from "effect";

export function defineConfig(config: Partial<ConfigInput> = {}): Config {
  return Schema.decodeUnknownSync(ConfigSchema)({
    entries: config.entries ?? {},
    build: config.build ?? {},
    validation: config.validation ?? {},
  });
}
```

All schemas use `@effect/schema` with `Schema.optionalWith()` for defaults.

---

## Build Pipeline

### Pipeline Stages

```text
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Load    │───▶│ Detect   │───▶│ Validate │───▶│  Build   │
│  Config  │    │ Entries  │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │
     ▼               ▼               ▼               ▼
  ConfigService  ConfigService  ValidationService  BuildService
  .load()        .detectEntries()  .validate()     .build()
```

### BuildService.build() Flow

1. **Detect entries** via `ConfigService.detectEntries()`
2. **Clean output directory** (`dist/`) if `options.clean` is true (default)
3. **Bundle each entry** sequentially using `@vercel/ncc`
4. **Write outputs** to `dist/{type}.js`
5. **Write source maps** if `config.build.sourceMap` is true
6. **Write dynamic chunks** (assets from ncc) to `dist/`
7. **Create `dist/package.json`** with `{ "type": "module" }`
8. **Return BuildResult** with stats for each entry

### Build Result Schema

```typescript
const BuildResultSchema = Schema.Struct({
  success: Schema.Boolean,
  entries: Schema.Array(BundleResultSchema),
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
});

const BundleResultSchema = Schema.Struct({
  success: Schema.Boolean,
  stats: Schema.optional(BundleStatsSchema),
  error: Schema.optional(Schema.String),
});

const BundleStatsSchema = Schema.Struct({
  entry: Schema.String,      // "main", "pre", or "post"
  size: Schema.Number,       // Bundle size in bytes
  duration: Schema.Number,   // Build duration in ms
  outputPath: Schema.String, // "dist/main.js"
});
```

### NCC Bundler Options

```typescript
const nccOptions = {
  minify: config.build.minify,     // Default: true
  sourceMap: config.build.sourceMap, // Default: false
  target: config.build.target,     // Default: "es2022"
  externals: config.build.externals, // Default: []
  quiet: true,                     // Always quiet internally
};
```

### Example Build Output

```text
Loading configuration...
  Using default configuration

Validating...
  All checks passed

Building...

Build Summary:
  ✓ main: 89.2 KB (1234ms) → dist/main.js
  ✓ post: 12.5 KB (567ms) → dist/post.js

Total time: 1801ms

Build completed successfully!
```

---

## Validation System

### CI Environment Detection

The validator detects CI environments via environment variables:

- `CI=true` or `CI=1`
- `GITHUB_ACTIONS=true` or `GITHUB_ACTIONS=1`

**Behavior:**

- **Local development**: Validation issues emit warnings, build continues
- **CI environment**: Validation issues throw errors, build fails

This ensures developers get fast feedback locally while maintaining strict
quality gates in CI pipelines.

### action.yml Schema Validation

The `action.yml` file is validated against an `@effect/schema` definition
based on GitHub's official metadata specification.

**Critical constraint:** This tool **only supports Node.js 24 actions**. The
schema requires `runs.using: "node24"` exactly. Other values (`node16`,
`node20`, `composite`, `docker`) will fail validation.

```typescript
const Runs = Schema.Struct({
  using: Schema.Literal("node24"),  // STRICTLY node24 only
  main: Schema.String,
  pre: Schema.optional(Schema.String),
  "pre-if": Schema.optional(Schema.String),
  post: Schema.optional(Schema.String),
  "post-if": Schema.optional(Schema.String),
});
```

This catches issues like:

- Missing required fields (`name`, `description`, `runs`)
- Invalid `runs.using` values (anything other than `node24`)
- Malformed input/output definitions
- Invalid branding options (icon/color)

**Note:** Input/output business logic validation (mutual exclusivity, conditional
requirements, type coercion) is left to the action author's code. The builder
validates structure, not semantics.

### Pre-Build Validation Checks

| Check | Severity | Message |
| ----- | -------- | ------- |
| main.ts exists | Error | `Required entry not found: src/main.ts` |
| action.yml exists | Error | `action.yml not found in project root` |
| action.yml valid YAML | Error | `YAML parse error at line X` |
| action.yml schema valid | Error | Schema validation errors |
| runs.using = node24 | Error | `runs.using must be "node24"` |

### Validation Result Schema

```typescript
const ValidationResultSchema = Schema.Struct({
  valid: Schema.Boolean,
  errors: Schema.Array(ValidationErrorSchema),
  warnings: Schema.Array(ValidationWarningSchema),
});

const ValidationErrorSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  file: Schema.optional(Schema.String),
  suggestion: Schema.optional(Schema.String),
});
```

### ValidationService.validate() Flow

1. **Check entry files exist** - main.ts required, pre/post optional
2. **Load action.yml** - read and parse YAML
3. **Validate against schema** - check structure and node24 requirement
4. **Apply strict mode** - auto-detect from CI or use config override
5. **Return ValidationResult** - with errors, warnings, valid flag

---

## CLI Design

Built with `@effect/cli` for type-safe argument parsing.

### Implementation Files

- `src/cli/index.ts` - CLI entry point and command composition
- `src/cli/commands/build.ts` - Build command handler
- `src/cli/commands/validate.ts` - Validate command handler
- `src/cli/commands/init.ts` - Init command handler

### Commands

```bash
# Build action
github-action-builder build

# Validate without building
github-action-builder validate

# Initialize config in new project
github-action-builder init
```

### Build Command Options

```bash
github-action-builder build [options]

Options:
  -c, --config <path>   Path to config file (default: action.config.ts)
  -q, --quiet           Suppress non-error output
  --no-validate         Skip validation step
```

### Validate Command Options

```bash
github-action-builder validate [options]

Options:
  -c, --config <path>   Path to config file
  -q, --quiet           Suppress non-error output
```

### Init Command Options

```bash
github-action-builder init [options]

Options:
  -f, --force           Overwrite existing configuration file
```

### CLI Handler Pattern

CLI commands consume services directly via Effect:

```typescript
const buildHandler = ({ config, quiet, noValidate }) =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const validationService = yield* ValidationService;
    const buildService = yield* BuildService;

    // Load configuration
    const configResult = yield* configService.load(loadOptions);

    // Validate (unless skipped)
    if (!noValidate) {
      const validationResult = yield* validationService.validate(configResult.config, { cwd });
      if (!validationResult.valid) {
        yield* Effect.fail(new Error("Validation failed"));
      }
    }

    // Build
    const buildResult = yield* buildService.build(configResult.config, { cwd });
    // ...
  });
```

---

## API Design

### Programmatic Usage

The `GitHubAction` class provides a Promise-based API wrapping Effect services:

```typescript
import { GitHubAction } from "@savvy-web/github-action-builder";

// Zero-config: auto-detects entries
const action = GitHubAction.create();
const result = await action.build();

if (result.success) {
  console.log(`Built ${result.build?.entries.length} entry points`);
} else {
  console.error(`Build failed: ${result.error}`);
}
```

### GitHubAction Options

```typescript
interface GitHubActionOptions {
  // Configuration object or path to config file
  config?: Partial<ConfigInput> | string;

  // Working directory (default: process.cwd())
  cwd?: string;

  // Skip validation before building (default: false)
  skipValidation?: boolean;

  // Clean output directory before building (default: true)
  clean?: boolean;

  // Custom Effect Layer (advanced)
  layer?: Layer<ConfigService | ValidationService | BuildService>;
}
```

### GitHubAction Class

```typescript
class GitHubAction {
  // Factory method
  static create(options?: GitHubActionOptions): GitHubAction;

  // Load and cache configuration
  async loadConfig(): Promise<Config>;

  // Validate without building
  async validate(options?: ValidateOptions): Promise<ValidationResult>;

  // Full build workflow
  async build(): Promise<GitHubActionBuildResult>;

  // Cleanup resources
  async dispose(): Promise<void>;
}
```

### Internal Architecture

The `GitHubAction` class uses `ManagedRuntime` to execute Effects:

```typescript
class GitHubAction {
  private readonly runtime: ManagedRuntime<ConfigService | ValidationService | BuildService, never>;

  private constructor(options: GitHubActionOptions = {}) {
    const layer = options.layer ?? AppLayer;
    this.runtime = ManagedRuntime.make(layer);
    // ...
  }

  async build(): Promise<GitHubActionBuildResult> {
    const program = Effect.gen(function* () {
      const buildService = yield* BuildService;
      return yield* buildService.build(config, buildOptions);
    });
    return this.runtime.runPromise(program);
  }
}
```

### Public Exports (`src/index.ts`)

```typescript
// Primary API
export { GitHubAction } from "./github-action.js";
export type { GitHubActionOptions, GitHubActionBuildResult } from "./github-action.js";

// Configuration
export { defineConfig } from "./schemas/config.js";
export type { Config, ConfigInput, BuildOptions, Entries } from "./schemas/config.js";

// Services (for Effect consumers)
export { ConfigService, ValidationService, BuildService } from "./services/...";
export { AppLayer, ConfigLayer, ValidationLayer, BuildLayer } from "./layers/app.js";

// Errors
export type { ConfigError, ValidationError, BuildError, AppError } from "./errors.js";
export { ConfigNotFound, ConfigInvalid, MainEntryMissing, ... } from "./errors.js";

// Schemas (for extending)
export { ConfigSchema, EntriesSchema, BuildOptionsSchema, ... } from "./schemas/config.js";
```

### Effect Consumer Usage

Effect consumers can use services directly:

```typescript
import { Effect } from "effect";
import { AppLayer, BuildService, ConfigService } from "@savvy-web/github-action-builder";

const program = Effect.gen(function* () {
  const configService = yield* ConfigService;
  const buildService = yield* BuildService;

  const { config } = yield* configService.load();
  const result = yield* buildService.build(config);

  return result;
});

Effect.runPromise(program.pipe(Effect.provide(AppLayer)));
```

---

## Error Handling

All errors use Effect's `Data.TaggedError` pattern for type-safe error handling
with pattern matching support.

### Error Categories (`src/errors.ts`)

**Config Errors:**

```typescript
type ConfigError = ConfigNotFound | ConfigInvalid | ConfigLoadFailed;

class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly path: string;
  readonly message?: string;
}> {}
```

**Validation Errors:**

```typescript
type ValidationError =
  | MainEntryMissing
  | EntryFileMissing
  | ActionYmlMissing
  | ActionYmlSyntaxError
  | ActionYmlSchemaError
  | ValidationFailed;
```

**Build Errors:**

```typescript
type BuildError = BundleFailed | WriteError | CleanError | BuildFailed;
```

### Error Handling Pattern

```typescript
import { Effect } from "effect";

Effect.gen(function* () {
  // ...
}).pipe(
  Effect.catchTags({
    ConfigNotFound: (e) => Console.error(`Config not found: ${e.path}`),
    MainEntryMissing: (e) => Console.error(`Missing main entry: ${e.expectedPath}`),
    BundleFailed: (e) => Console.error(`Bundle failed: ${e.cause}`),
  })
);
```

### Error Data

Each error carries contextual data:

| Error | Data Fields |
| ----- | ----------- |
| `ConfigNotFound` | `path`, `message?` |
| `ConfigInvalid` | `path`, `errors[]` |
| `MainEntryMissing` | `expectedPath`, `cwd` |
| `ActionYmlSyntaxError` | `path`, `message`, `line?`, `column?` |
| `ActionYmlSchemaError` | `path`, `errors[]` |
| `BundleFailed` | `entry`, `cause` |
| `WriteError` | `path`, `cause` |

---

## Rationale

### Why `@vercel/ncc`?

- Industry standard for bundling Node.js CLIs and GitHub Actions
- Handles CommonJS/ESM interop well
- Tree-shaking and minification built-in
- Used by GitHub's own `actions/toolkit`
- Supports dynamic imports as separate chunks

### Why Effect-TS?

- Type-safe error handling with `Effect<A, E, R>`
- Service composition via Layers
- Testability through dependency injection
- Resource safety for file operations
- Consistent with modern Effect ecosystem patterns

### Why `@effect/schema` (not Zod)?

- Native Effect integration
- Better error messages with path information
- Works with Effect's error handling
- Supports defaults via `Schema.optionalWith`
- Part of the Effect ecosystem

### Why Node.js 24 only?

- GitHub Actions now supports `node24`
- Modern ESM support
- Better performance
- Simpler configuration (no CJS fallbacks)
- Forces users to stay current

### Why source maps off by default?

- Smaller bundle sizes
- Faster builds
- GitHub Actions don't typically need source maps
- Can be enabled via config when debugging

### Why TypeScript config files only?

- Full IDE support (autocomplete, type checking)
- Node 24 runs ESM natively
- Consistent with modern tooling patterns
- Avoids CJS/ESM configuration complexity

### Why no local action testing?

- Self-referential action testing is problematic
- Users should use tools like `act` for local testing
- Keeps the tool focused on building, not testing

### Why no watch mode?

- GitHub Actions can't be tested in real-time
- Changes require push to test
- Build is fast enough to run manually

---

## Decisions

Resolved questions from initial design:

| Question | Decision | Rationale |
| -------- | -------- | --------- |
| Config file format | `.ts` only | Node 24 ESM, consistent patterns |
| Schema library | `@effect/schema` | Native Effect integration |
| Node version | `node24` only | Modern runtime, simplifies code |
| Source maps | Off by default | Smaller bundles, rarely needed |
| Watch mode | Not included | Can't test actions in real-time |
| Multiple actions | User responsibility | Programmatic API allows this |
| Pre-commit hook | Not included | Leave to users/lint-staged |
| Release directory copy | Removed | Use `act` for local testing |
| Input validation | User responsibility | Business logic varies per action |
| action.yml validation | Effect Schema | Validates structure, enforces node24 |
| CI strictness | Warn local, error CI | Fast dev feedback, strict CI gates |
| Output structure | Flat `dist/` | Simple, no nested directories |
| Service architecture | Effect Services | Testability, composability |

---

## File Structure

```text
src/
├── index.ts                 # Public exports (services, layers, API)
├── github-action.ts         # Promise wrapper for non-Effect consumers
├── errors.ts                # Typed error classes (Data.TaggedError)
├── schemas/
│   ├── config.ts            # Config schemas (@effect/schema)
│   ├── config.test.ts       # Config schema tests
│   ├── action-yml.ts        # action.yml schema (node24 only)
│   └── path.ts              # PathLike schema helpers
├── services/
│   ├── config.ts            # ConfigService definition
│   ├── config-live.ts       # ConfigService implementation
│   ├── validation.ts        # ValidationService definition
│   ├── validation-live.ts   # ValidationService implementation
│   ├── build.ts             # BuildService definition
│   ├── build-live.ts        # BuildService implementation
│   └── services.test.ts     # Service tests
├── layers/
│   └── app.ts               # Layer composition (AppLayer)
└── cli/
    ├── index.ts             # CLI entry point
    └── commands/
        ├── index.ts         # Command exports
        ├── build.ts         # Build command handler
        ├── validate.ts      # Validate command handler
        └── init.ts          # Init command handler
```

---

## Implementation Status

The implementation follows the Effect-first architecture from
`.claude/plans/effect-first-refactor.md`. Key phases completed:

- [x] Phase 1: Foundation - Typed Errors (`src/errors.ts`)
- [x] Phase 2: Schema Migration (`src/schemas/*.ts`)
- [x] Phase 3: Service Definitions (`src/services/*.ts`)
- [x] Phase 4: Service Implementations (`src/services/*-live.ts`)
- [x] Phase 5: CLI Refactor (`src/cli/`)
- [x] Phase 6: Public API Wrapper (`src/github-action.ts`)
- [ ] Phase 7: Testing with Effect (in progress)
