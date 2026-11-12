# Frontend

React 18 + TypeScript, built with Vite. From this directory:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 against the local backend (`.env.local`) |
| `npm run dev:server` | Dev server against the hosted dev backend (`.env.dev`) |
| `npm test` | Vitest in watch mode (`npm test -- --run` for a single run) |
| `npm run build` | Type-check, then build into `dist/` |
| `npm run preview` | Serve the `dist/` build on port 3000 |

See [../DEVELOPMENT.md](../DEVELOPMENT.md) for the full setup.
