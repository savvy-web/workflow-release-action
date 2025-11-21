# Setup New Package

Create a new package in the monorepo following workspace conventions.

Parameters:

* Package name (e.g., "prettier-config")
* Package description
* Export type (config/utility)

Steps:

1. Create package directory in `pkgs/`
2. Set up package.json with proper exports and publishConfig
3. Create tsconfig.json extending workspace config
4. Set up source structure (src/ or exports/)
5. Configure build with rslib
6. Add to turbo.json pipeline
7. Create initial exports
8. Run build to verify setup
