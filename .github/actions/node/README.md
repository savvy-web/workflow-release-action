# Node.js Setup Action

Composite GitHub Action for setting up Node.js environments with package manager support, dependency caching, and Turbo build system integration.

## Features

* **Automatic Node.js version detection** from `.nvmrc` or `.node-version`
* **Multi-package-manager support** with intelligent caching (pnpm, yarn, npm)
* **Turbo build cache** setup (local + optional Vercel remote cache)
* **Dependency installation** with frozen lockfiles for reproducibility
* **Automatic Biome setup** with version detection from config file (see [Biome action](../biome/))
* **Environment validation** and detailed setup logging
* **Telemetry control** for privacy-conscious environments

## Usage

### Basic Setup

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: savvy-web/github-readme-private/.github/actions/node@main
  - run: pnpm build
```

### With Specific Package Manager

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: savvy-web/github-readme-private/.github/actions/node@main
    with:
      package_manager: yarn
  - run: yarn build
```

### With Turbo Remote Cache (Vercel)

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: savvy-web/github-readme-private/.github/actions/node@main
    with:
      package_manager: pnpm
      turbo_token: ${{ secrets.TURBO_TOKEN }}
      turbo_team: ${{ vars.TURBO_TEAM }}
  - run: pnpm turbo build
```

### With Explicit Node.js Version

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: savvy-web/github-readme-private/.github/actions/node@main
    with:
      node-version: '20.x'
  - run: pnpm test
```

## Inputs

| Input | Description | Required | Default |
| ------- | ------------- | ---------- | --------- |
| `package_manager` | Package manager to use (`npm` \| `pnpm` \| `yarn`) | No | `pnpm` |
| `node-version` | Node.js version spec (SemVer notation, `lts/*`, `latest`, etc.) | No | `lts/*` |
| `turbo_token` | Turbo remote cache token (for Vercel Remote Cache) | No | `""` |
| `turbo_team` | Turbo team slug (for Vercel Remote Cache) | No | `""` |
| `do_not_track` | Disable telemetry tracking | No | `"1"` |
| `turbo_telemetry_disable` | Disable Turbo telemetry | No | `"1"` |

### Node.js Version Detection

The action automatically detects the Node.js version in this order:

1. `.nvmrc` file (preferred)
2. `.node-version` file
3. `node-version` input (fallback)

**Example `.nvmrc`:**

```text
20.11.0
```

**Example `.node-version`:**

```text
20
```

### Package Manager Support

#### pnpm (Default)

```yaml
- uses: savvy-web/github-readme-private/.github/actions/node@main
  with:
    package_manager: pnpm
```

* Uses `pnpm/action-setup@v4` for automatic pnpm installation
* Caches `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `.pnpmfile.cjs`
* Installs with `pnpm install --frozen-lockfile`

#### Yarn

```yaml
- uses: savvy-web/github-readme-private/.github/actions/node@main
  with:
    package_manager: yarn
```

* Enables Yarn via Corepack
* Caches `yarn.lock`
* Installs with `yarn install --frozen-lockfile --immutable`

#### npm

```yaml
- uses: savvy-web/github-readme-private/.github/actions/node@main
  with:
    package_manager: npm
```

* Uses built-in npm
* Caches `package-lock.json`
* Installs with `npm ci`

## Turbo Cache Setup

### Local Cache

The action automatically sets up local Turbo caching if `turbo.json` is detected:

* Cache location: `.turbo/`
* Cache key: `{os}-node{major}-turbo-{branch}`
* Restore keys: Previous builds on the same Node.js major version

### Remote Cache (Vercel)

To enable Vercel Remote Cache for faster CI builds across runners:

1. **Get Vercel access token:**
   * Go to Vercel Dashboard → Settings → Tokens
   * Create a new token with Turbo cache access

2. **Configure repository secrets:**

   ```bash
   # Add to repository or organization secrets
   TURBO_TOKEN=your_vercel_token
   ```

3. **Configure repository variables:**

   ```bash
   # Add to repository or organization variables
   TURBO_TEAM=your_team_slug
   ```

4. **Use in workflow:**

   ```yaml
   - uses: savvy-web/github-readme-private/.github/actions/node@main
     with:
       turbo_token: ${{ secrets.TURBO_TOKEN }}
       turbo_team: ${{ vars.TURBO_TEAM }}
   ```

## Outputs

This action does not expose formal outputs, but sets the following environment variables:

* `TURBO_TOKEN` - Turbo remote cache token (if provided)
* `TURBO_TEAM` - Turbo team slug (if provided)
* `DO_NOT_TRACK` - Telemetry disable flag
* `TURBO_TELEMETRY_DISABLE` - Turbo-specific telemetry flag

## Examples

### Monorepo CI with Turbo

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: savvy-web/github-readme-private/.github/actions/node@main
        with:
          package_manager: pnpm
          turbo_token: ${{ secrets.TURBO_TOKEN }}
          turbo_team: ${{ vars.TURBO_TEAM }}

      - name: Build all packages
        run: pnpm turbo build

      - name: Test all packages
        run: pnpm turbo test

      - name: Lint all packages
        run: pnpm turbo lint
```

### Multi-Platform Matrix

```yaml
name: Cross-Platform CI

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: ['18.x', '20.x', '22.x']

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v5

      - uses: savvy-web/github-readme-private/.github/actions/node@main
        with:
          node-version: ${{ matrix.node-version }}
          package_manager: pnpm

      - run: pnpm test
```

### Deployment with Remote Cache

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: savvy-web/github-readme-private/.github/actions/node@main
        with:
          package_manager: pnpm
          turbo_token: ${{ secrets.TURBO_TOKEN }}
          turbo_team: ${{ vars.TURBO_TEAM }}

      - name: Build for production
        run: pnpm turbo build --filter=@app/web

      - name: Deploy
        run: pnpm deploy
```

### Using Different Package Managers

```yaml
name: Multi-PM Test

on: [push]

jobs:
  test-pnpm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/github-readme-private/.github/actions/node@main
        with:
          package_manager: pnpm
      - run: pnpm test

  test-yarn:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/github-readme-private/.github/actions/node@main
        with:
          package_manager: yarn
      - run: yarn test

  test-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: savvy-web/github-readme-private/.github/actions/node@main
        with:
          package_manager: npm
      - run: npm test
```

## How It Works

1. **Input Validation** - Validates that `package_manager` is one of the supported options
2. **Version Detection** - Checks for `.nvmrc` or `.node-version` files
3. **Package Manager Setup** - Installs and configures the selected package manager
4. **Node.js Setup** - Uses `actions/setup-node@v6` with caching
5. **Turbo Detection** - Checks for `turbo.json` to determine if Turbo caching should be enabled
6. **Cache Setup** - Configures local and/or remote Turbo caching
7. **Dependency Installation** - Installs dependencies with frozen lockfiles
8. **Biome Setup** - Automatically sets up Biome with version detection (see [Biome action](../biome/))
9. **Environment Logging** - Outputs detailed setup information for debugging

## Troubleshooting

### Package Manager Not Found

**Error:** `pnpm: command not found`

**Solution:** Ensure `package_manager` input matches your lockfile:

* `pnpm-lock.yaml` → `package_manager: pnpm`
* `yarn.lock` → `package_manager: yarn`
* `package-lock.json` → `package_manager: npm`

### Cache Not Restored

**Symptom:** Dependencies are always installed from scratch

**Solution:** Check that:

1. Lockfile exists and is committed
2. `package_manager` input matches your lockfile
3. Lockfile name is correct (e.g., `pnpm-lock.yaml` not `pnpm-lock.yml`)

### Turbo Remote Cache Not Working

**Symptom:** Builds don't use remote cache

**Solution:** Verify:

1. `turbo_token` and `turbo_team` are both provided
2. Secrets are configured correctly in repository/organization settings
3. Vercel token has appropriate permissions
4. `turbo.json` exists in repository root

### Wrong Node.js Version

**Symptom:** CI uses unexpected Node.js version

**Solution:** Check version detection order:

1. Remove `.nvmrc` if you want to use `.node-version`
2. Or set explicit `node-version` input to override file-based detection

## Performance Tips

1. **Enable Turbo remote cache** - Dramatically speeds up CI across runners
2. **Use pnpm** - Faster and more efficient than npm/yarn in most cases
3. **Cache restoration** - The action uses `actions/setup-node@v6` caching for dependencies
4. **Parallel jobs** - Combine with matrix strategies for multi-platform testing

## Security

* Sensitive inputs (`turbo_token`) are automatically masked in logs
* Frozen lockfiles prevent dependency hijacking attacks
* Telemetry is disabled by default for privacy

## License

Private - Savvy Web Systems © 2024
