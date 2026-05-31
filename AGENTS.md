This project is a collection of personal user scripts and user styles.

## Organization

- Put browser userscripts in `userscripts/`.
- Put user styles in `userstyles/` when that directory is added.
- Keep userscripts as standalone installable `.user.js` files with their metadata blocks intact.

## Auto-Updates

- Keep installable userscripts and user styles published at stable raw GitHub URLs.
- Keep `@name` and `@namespace` stable; managers use them to identify existing installs.
- Bump `@version` whenever a userscript or user style should be picked up as an update.
- Userscripts must include `@version`, `@homepageURL`, `@supportURL`, `@updateURL`, and `@downloadURL`.
- User styles must include `@namespace`, `@version`, `@homepageURL`, `@supportURL`, and `@updateURL`.
- Use `https://raw.githubusercontent.com/evanlouie/userscripts/master/...` URLs for `@updateURL` and `@downloadURL`, pointing at the same installable file path.

## JavaScript

- Use plain JavaScript with JSDoc type annotations.
- Add `// @ts-check` to JavaScript files that should be type checked.
- Run `npm run typecheck` after changing JavaScript.

## Tooling

- Run `npm run check` before handing off changes. This runs TypeScript, oxlint, and oxfmt checks.
- Use `npm run lint` / `npm run lint:fix` for oxlint.
- Use `npm run format:check` / `npm run format` for oxfmt.
- Do not commit or rely on `node_modules/`; dependencies are restored from `package-lock.json`.
