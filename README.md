# Design Tokens Starter

One JSON file of design decisions, compiled into CSS custom properties, SCSS, a JS module and a Tailwind theme fragment. Contrast is verified at build time, so a pairing that fails WCAG AA cannot merge.

**[Live preview →](https://coteyanezg.github.io/design-tokens-starter/)** Every value on that page is read from the generated CSS.

No dependencies. Node 18+. The build script is about 150 readable lines.

## Why this exists

Brand guidelines live in a PDF, the site uses hex codes typed by hand, the email templates use different hex codes typed by hand, and nobody notices until the third one ships. The fix is not a bigger PDF: it is making the guideline the thing that compiles.

This repo is the smallest version of that idea that is still useful. It is deliberately not a token pipeline framework: a build step nobody on the team can read is a build step nobody maintains.

## Use it

```bash
git clone https://github.com/coteyanezg/design-tokens-starter.git
cd design-tokens-starter
node build.mjs
```

Edit `tokens/tokens.json`, run the build, ship `dist/`.

```
tokens/tokens.json  →  dist/tokens.css            CSS custom properties
                       dist/_tokens.scss          SCSS variables
                       dist/tokens.js             ES module
                       dist/tailwind.tokens.js    Tailwind theme fragment
                       dist/contrast-report.txt   WCAG check
                       docs/tokens.css            the live preview
```

Then:

```html
<link rel="stylesheet" href="dist/tokens.css">
```

```css
.button {
  background: var(--color-brand-700);
  color: var(--color-neutral-0);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
}
```

## Token shape

```json
"color": {
  "brand": {
    "700": { "value": "#1F3480", "comment": "Primary actions" }
  }
}
```

Nesting becomes naming: `color.brand.700` → `--color-brand-700` → `$color-brand-700` → `colorBrand700`. Nest however you like; the script flattens whatever it finds.

The `comment` field is optional and travels into the CSS output. Use it for the usage rule, not for the color name. `"Primary actions"` is useful; `"dark blue"` is not.

## Contrast gate

`build.mjs` computes WCAG relative luminance for a declared list of foreground/background pairings and exits non-zero if any falls below 4.5:1.

```
PASS  18.11:1  body text on cards   (color-neutral-900 on color-neutral-0)
PASS  11.28:1  button label         (color-neutral-0 on color-brand-700)
```

Add pairings to the `PAIRS` array as the system grows. Every pairing you add is a regression you can no longer ship, which is the whole value. Catching this in CI costs seconds; catching it in an accessibility audit costs a redesign.

## CI

`.github/workflows/build.yml` runs the build on every push and pull request. A failing contrast check fails the check, so a token change that breaks legibility never reaches `main`.

## Extending

- **More outputs?** Add a block at the bottom of `build.mjs`. Each output format is independent and roughly 10 lines.
- **Dark mode?** Add a second token file and emit into a `[data-theme="dark"]` block instead of `:root`.
- **Aliases** (`--button-bg: var(--color-brand-700)`) are worth adding once two components disagree about which raw token to use. Not before: premature aliasing produces a second vocabulary nobody learns.

## License

MIT. See [LICENSE](LICENSE).
