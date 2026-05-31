This project is a collection of personal user scripts and user styles.

## Organization

- Put browser userscripts in `userscripts/`.
- Put user styles in `userstyles/` when that directory is added.
- Keep userscripts as standalone installable `.user.js` files with their metadata blocks intact.

## JavaScript

- Use plain JavaScript with JSDoc type annotations.
- Add `// @ts-check` to JavaScript files that should be type checked.
- Run `npm run typecheck` after changing JavaScript.

## Tooling

- Run `npm run check` before handing off changes. This runs TypeScript, oxlint, and oxfmt checks.
- Use `npm run lint` / `npm run lint:fix` for oxlint.
- Use `npm run format:check` / `npm run format` for oxfmt.
- Do not commit or rely on `node_modules/`; dependencies are restored from `package-lock.json`.
