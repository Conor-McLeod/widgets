# widgets

A personal gallery of interactive explanations. Each **exploration** is one MDX page (prose + frontmatter)
with one or more **widgets** embedded in it. Astro is the shell; widgets are framework-agnostic.

```
src/explorations/<slug>/
├── index.mdx            # frontmatter (schema in src/content.config.ts) + prose
└── <widget>/
    ├── index.ts         # export const mount: Mount = (el) => { ...; return cleanup }
    └── ...              # Foo.vue / Foo.tsx / Foo.svelte / plain TS, plus helpers
```

## Adding something

Always scaffold first, then edit:

```bash
pnpm new <slug>                        # new exploration + Vue widget "main"
pnpm new <slug> <widget> --fw vanilla  # add another widget (vue | vanilla | react | svelte)
```

Then `pnpm dev` and open `http://localhost:4321/<slug>`.

## Rules

- **The contract is `mount(el)`** (`src/widget.ts`). A widget's `index.ts` exports `mount`, renders into `el`, and
  returns a cleanup function. Never import Astro things into a widget, and never make a widget depend on the page
  around it. That keeps widgets portable (bare route, blog posts, single-file export).
- **Embed with `<Widget src="name" />`** in MDX. It's injected globally; no import needed. Props: `height`
  (reserved px before mount), `caption`. `src="other-slug/name"` reuses a widget from another exploration.
- **Default to Vue.** Use vanilla TS for canvas/SVG/d3-style drawing where a framework adds nothing; React or Svelte
  only when there's a reason (e.g. a library that needs it). Only one JSX framework (React) is configured.
- **Frontmatter is validated**: `title`, `summary` (one sentence), `date`, `tags` (lowercase, kebab-case; reuse
  existing tags where they fit, check with `rg -o "tags: .*" src/explorations`), `draft`. New pages start as
  `draft: true`; drafts show in dev only. Flip it off when the page is done.
- **Style with the theme tokens** from `src/layouts/Base.astro` (`--text`, `--muted`, `--border`, `--surface`,
  `--bg`, `--accent`, `--accent-soft`, `--danger`, `--mono`). They switch for dark mode; hard-coded colours don't.
  Scope widget styles (Vue `scoped`, Svelte default, or class prefixes in vanilla).
- **Widgets must fit the column at phone width** (the prose column is 720px max). No horizontal page scroll.
- **All maths goes through KaTeX**, never Unicode look-alikes (no `x₁`, `α`, `∂`, `<sub>`). In MDX use the global
  `<M t="x_1 + x_2" />` (inline) or `<M block t="..." />` (display, on its own line); it renders at build time and a TeX
  error fails the build. Widget captions accept `$...$`. In Vue widgets use `<Tex t="\alpha" />` (`~/math/Tex.vue`); elsewhere
  `tex()` / `texText()` from `~/math/tex` (returns HTML), and `svgLabel()` for maths inside SVG.
- **Prose should motivate the widget**: what question prompted it, what to try, what to notice.
- **Ask before adding a dependency.** Add it to the root `package.json` with `pnpm add`.

## Routes

- `/`: gallery, tag filter via `?tags=a,b` (a card must have every selected tag)
- `/<slug>`: the exploration page
- `/w/<slug>/<widget>`: one widget, full viewport, no chrome

## Checks

`pnpm check` (types) and `pnpm build` must pass before calling a widget done.
