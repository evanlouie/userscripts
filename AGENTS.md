This project is a collection of personal user scripts and user styles.

## Organization

- Put browser userscripts in `userscripts/`.
- Put user styles in `userstyles/`.
- Keep userscripts as standalone installable `.user.js` files with their metadata blocks intact.

## Browser Manager Compatibility

- Browser userscripts must support Violentmonkey and Tampermonkey on Chrome/Firefox, plus Userscripts on Safari.
- Use standard `// ==UserScript==` metadata for `.user.js` files.
- Prefer WebExtension-compatible `@match` patterns over `@include`; Userscripts Safari, Violentmonkey, and Tampermonkey all understand `@match`.
- Keep URL patterns limited to `http`/`https` unless a manager-specific need is intentional and documented.
- Prefer plain DOM/browser APIs and `@grant none` for userscripts that do not need manager APIs.
- If manager APIs are needed, add explicit `@grant` entries and guard manager-specific differences (`GM.*`, `GM_*`, unsupported APIs) so the script still works across the target managers.
- Avoid relying on manager-specific metadata or lifecycle behavior unless the fallback path is clear.

## User Style Compatibility

- User styles must support Stylus on Chrome/Firefox and Userscripts on Safari.
- Stylus reads UserCSS metadata and reports unknown metadata such as `@match`; do not put `@match` in the Stylus metadata block.
- Userscripts Safari reads `/* ==UserStyle== ... ==/UserStyle== */` metadata and needs `@match` or `@include` to inject CSS.
- For a single cross-manager `.user.css` file, put a Stylus `UserCSS` block first, then a Safari Userscripts `UserStyle` block:

```css
/* ==UserCSS==
@name        Example
@namespace   https://github.com/evanlouie/userscripts
@version     0.1.0
@homepageURL https://github.com/evanlouie/userscripts
@supportURL  https://github.com/evanlouie/userscripts/issues
@updateURL   https://raw.githubusercontent.com/evanlouie/userscripts/master/userstyles/example.user.css
==/UserCSS== */

/* ==UserStyle==
@name        Example
@namespace   https://github.com/evanlouie/userscripts
@version     0.1.0
@homepageURL https://github.com/evanlouie/userscripts
@supportURL  https://github.com/evanlouie/userscripts/issues
@updateURL   https://raw.githubusercontent.com/evanlouie/userscripts/master/userstyles/example.user.css
@match       https://example.com/*
==/UserStyle== */
```

- Keep the shared CSS after both metadata blocks.
- Avoid wrapping shared CSS only in `@-moz-document`; Stylus can use it, but Safari Userscripts injects plain CSS and Safari may not apply that wrapper.
- Do not move intentionally theme-wide variables or overrides off `:root` just to make selectors more site-specific; solve manager scoping with metadata, separate files, or another explicit compatibility path.
- Prefer selectors that are naturally site-specific. If a user style needs broad selectors and strict URL scoping in both managers, create separate installable files or another explicit compatibility path instead of silently breaking one manager.

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
