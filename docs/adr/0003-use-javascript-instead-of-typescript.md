# Use JavaScript Across All Packages

The project stack was updated per explicit requirement to use modern JavaScript (ES Modules, Node.js native ESM, and JSX) instead of TypeScript across all workspaces (`packages/engine`, `apps/server`, and `apps/web`). This avoids compilation steps in the shared engine and server while leveraging standard JSDoc annotations where type clarity is beneficial.
