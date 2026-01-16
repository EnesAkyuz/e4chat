---
trigger: always_on
---

# Project Rules

## 1. Node Version & Shell

- This project uses **Node.js v25.3.0** (locked in `.nvmrc`).
- **ALWAYS** run `nvm use` or chain `nvm use && <command>` before executing any Node.js, npm, or bun commands to ensure the correct version is active.
- Example: `nvm use && bun run dev`

## 2. Package Manager

- Use **bun** for all scripts and package management.
- Never use `npm` or `yarn` directly unless instructed.

## 3. Code Quality & Formatting

- **Type Safety**: Strictly STRICT. No `any` types allowed. Address all TypeScript errors.
- **Linting**: No ignored warnings.
- **Workflow**: Always run `bun lint:fix` at the end of a task to ensure compliance.
- **Non-Null Assertions**: Avoid `!`. Use proper runtime checks (e.g. `if (!val) throw error`).

## 4. Tech Stack

- Frontend: Next.js 16, key React hooks (`useCallback` for fetch functions), Shadcn UI.
- Backend: Supabase (Auth, Realtime, DB).
- Styling: Tailwind CSS.

NEVER RUN THE BROWSER OR BUILDS UNLESS I EXPLICITLY ASK.
