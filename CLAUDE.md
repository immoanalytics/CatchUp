# CLAUDE.md — AI Assistant Guide for CatchUp

> This file provides context and conventions for AI assistants (such as Claude) working
> in this repository. It is the single source of truth for codebase structure,
> development workflows, and contribution guidelines.

## Project Overview

**CatchUp** is a project under the `immoanalytics` organization. This repository was
initialized as a fresh project and is in its early stages of development.

- **Organization**: immoanalytics
- **Repository**: CatchUp
- **Remote**: `origin` points to the immoanalytics/CatchUp Git remote

## Repository Status

This repository is currently in its **initial setup phase**. There are no existing
source files, build configurations, or CI/CD pipelines yet. All structure documented
below should be updated as the project evolves.

## Directory Structure

```
CatchUp/
├── CLAUDE.md          # This file — AI assistant guide
└── .git/              # Git repository metadata
```

> **Action item**: Update this section as directories (`src/`, `tests/`, `docs/`, etc.)
> are added to the project.

## Development Workflow

### Branch Naming

- Feature branches: `claude/<description>-<id>` or `feature/<description>`
- Bug fixes: `fix/<description>`
- Documentation: `docs/<description>`

### Commits

- Write clear, descriptive commit messages
- Use imperative mood in the subject line (e.g., "Add feature" not "Added feature")
- Keep the subject line under 72 characters
- Reference issue numbers where applicable

### Pull Requests

- Target the main branch unless otherwise specified
- Include a summary of changes and motivation
- Ensure all checks pass before requesting review

## Tech Stack

> **To be determined** — Update this section once the tech stack is chosen.
>
> When the stack is established, document:
> - Programming language(s) and versions
> - Frameworks and major libraries
> - Package manager and dependency management
> - Database and storage solutions
> - Deployment target and infrastructure

## Build & Run

> **To be determined** — Update this section once build tooling is configured.
>
> Document the following when available:
> - How to install dependencies
> - How to build the project
> - How to run the project locally
> - How to run in production mode

## Testing

> **To be determined** — Update this section once a test framework is selected.
>
> Document the following when available:
> - Test framework and runner
> - How to run all tests
> - How to run a single test file or test case
> - Code coverage requirements and how to check coverage

## Linting & Formatting

> **To be determined** — Update this section once linters/formatters are configured.
>
> Document the following when available:
> - Linter(s) in use and configuration file locations
> - Formatter(s) in use and configuration file locations
> - How to run lint checks
> - How to auto-fix lint issues

## Code Conventions

When contributing to this project, follow these general principles:

- **Keep it simple** — prefer clarity over cleverness
- **Don't over-engineer** — only build what is needed now
- **Consistent style** — follow whatever patterns are already established in the codebase
- **Minimal changes** — when fixing a bug, fix the bug; don't refactor surrounding code
- **No dead code** — remove unused code rather than commenting it out
- **Security first** — never commit secrets, credentials, or API keys

## CI/CD

> **To be determined** — Update this section once CI/CD pipelines are set up.

## Environment Setup

> **To be determined** — Update this section once environment requirements are defined.
>
> Document the following when available:
> - Required runtime versions (Node.js, Python, etc.)
> - Environment variables and `.env` file setup
> - External service dependencies
> - How to set up a local development environment from scratch

## Key Files Reference

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI assistant guide (this file) |

> Update this table as the project grows.

## Maintaining This File

This file should be kept up to date as the project evolves. When making significant
changes to the project (new tooling, new conventions, architecture changes), update
the relevant sections here. Every contributor — human or AI — benefits from accurate
documentation.
