# Commit Message Guidelines

When working with this repository, **ALL commit messages MUST follow the Conventional Commits specification**.

## Conventional Commits Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Required Components

- **type**: The type of change (see types below)
- **subject**: Short, imperative description (e.g., "add feature" not "added feature")

### Types

Use these standard types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Changes to build process, auxiliary tools, or dependencies
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes that affect the build system or external dependencies
- `revert`: Reverts a previous commit

### Scope (Optional but Recommended)

The scope provides additional context about what part of the codebase changed:

- `deps`: Dependency updates
- `actions`: GitHub Actions changes
- `workflows`: Workflow changes
- `pre`: Pre-action changes
- `main`: Main action changes
- `post`: Post-action changes
- `tests`: Test-related changes
- `docs`: Documentation changes

### Examples

✅ **Good commit messages:**

```
feat: add token scope logging to pre.ts for GitHub App permission diagnosis
fix: address code review feedback on token validation and error handling
docs: document package permissions and token diagnostics
chore(deps): update @actions/core to v1.11.1
ci(validate): add Claude Code review integration
refactor(utils): extract token permission checking to separate utility
test(pre): add comprehensive tests for token permission checking
```

❌ **Bad commit messages:**

```
Initial plan
WIP
Fixed stuff
Updated files
Changes
```

### Body Guidelines (Optional)

- Use the body to explain **what** and **why** vs. **how**
- Wrap at 72 characters
- Separate from subject with a blank line

### Footer Guidelines (Optional)

- Reference issues: `Fixes #123` or `Closes #456`
- Breaking changes: `BREAKING CHANGE: description`
- Co-authors: `Co-authored-by: Name <email>`

## Validation

This repository enforces conventional commits using:

- **commitlint** with `@commitlint/config-conventional`
- **validate.yml** workflow that checks:
  - PR title format (must be conventional commit)
  - All commit messages in the PR

## Configuration

Commitlint config: `lib/configs/commitlint.config.ts`

Rules:
- Extends: `@commitlint/config-conventional`
- Body max line length: 300 characters

## When Making Changes

1. **ALWAYS** write commit messages in conventional commits format
2. If you accidentally create a non-conventional commit (like "Initial plan"), fix it with:
   - Interactive rebase: `git rebase -i`
   - Amend: `git commit --amend` (for the last commit)
3. PR titles must also follow conventional commits format

## Resources

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Commitlint Documentation](https://commitlint.js.org/)
