# words2widget

> Words in, iPhone widget out. Describe what you want on your home screen, and an AI builds a ready-to-use widget for the [Scriptable](https://scriptable.app) app.

## What this project is about

Creating your own iPhone widgets should be as easy as sending a message: "I'd like a widget that shows the weather in Koblenz." The AI turns that into a working Scriptable script, and the user moves it onto their iPhone with a few taps, without knowing JavaScript or the Scriptable API.

The repo is meant to be usable by **anyone, with no technical background**. It will be promoted on the **veritatron** social media channel, for example with a "new widget every week" series.

## Target audience

- **Primary:** iPhone users with access to an AI chatbot (Claude or any other) who want to customize their home screen but don't code.
- **Secondary:** Developers who want to build Scriptable widgets faster, for example with Claude Code.

## Principles

These are deliberate decisions. Do not change them without asking first.

1. **No API key.** There is no solution that calls the Claude API or any other paid API directly. Users work in their normal AI app; the repo provides the skill, the prompt and the installer. This means no costs and no keys lying around.
2. **Simplicity over features.** Every step a user has to take loses users. Setup must take less than five minutes.
3. **Works with any AI.** The skill is optimized for Claude, but `PROMPT.md` must make the whole thing work with ChatGPT, Gemini and free chatbots as well. The installer only receives code and is AI-agnostic.
4. **Security.** The installer only saves code the user hands to it. It never downloads code from the internet and never executes anything automatically. Scripts never contain secrets.
5. **Showable.** Example widgets and the README should look good in screen recordings, because they double as material for the videos.

## How it works for users

1. **Once:** Upload the skill to Claude (or copy `PROMPT.md` into another AI) and add the `Widget Installer.js` script to Scriptable.
2. **Ask for a widget:** In the AI app, write: "I'd like a widget for X."
3. **Hand it over:** Share the answer or the `.js` file via **Share → Scriptable** to the Widget Installer. Alternatively, copy the code and run the installer, which reads the clipboard.
4. **Place it:** Add a Scriptable widget to the home screen and select the new script.

## Repository structure

```text
words2widget/
├── CLAUDE.md                         # This file
├── README.md                         # GIF, one-liner, quickstart
├── PROMPT.md                         # Copy-paste prompt for any AI
├── LICENSE                           # MIT
├── CHANGELOG.md
├── skills/
│   └── scriptable-widget/
│       └── SKILL.md                  # Core: rules, template, API reference
├── scriptable/
│   └── Widget Installer.js           # Takes code from share sheet/clipboard, saves it as a script
├── examples/                         # Ready-made widgets, one .js file plus screenshot each
├── scripts/
│   └── check.mjs                     # Syntax and rule checks for all scripts
└── .github/
    └── workflows/
        ├── check.yml                 # Checks on every pull request
        └── release.yml               # Release with the skill as a ZIP
```

`skills/scriptable-widget/SKILL.md` is the single source of truth for widget rules. `PROMPT.md` is derived from it and must stay consistent with it. Whenever a rule changes in the skill, update `PROMPT.md` too.

## Components

### Skill (`skills/scriptable-widget/SKILL.md`)

- Turns one sentence into a finished script and asks at most one follow-up question.
- Contains the script template, the Scriptable API reference, design rules and a checklist.
- Must be uploadable to Claude as a ZIP and work in Claude Code via `npx skills add veritatron/words2widget`.

### Prompt (`PROMPT.md`)

- The same rules as the skill, condensed into one block users can paste into any chatbot.
- Starts with a short "how to use" line, followed by the prompt in a single copyable code block.
- Keep it short enough to fit comfortably into free chatbot tiers.

### Widget Installer (`scriptable/Widget Installer.js`)

- Receives code via the share sheet (`args.plainTexts`, `args.fileURLs`) or from the clipboard (`Pasteboard.paste()`).
- Strips Markdown code fences (` ```javascript … ``` `) and any text before or after the code, in case the whole AI answer was shared.
- Suggests a name (from `CONFIG.title` or a header comment), lets the user confirm it, and warns before overwriting an existing script.
- Saves into Scriptable's documents directory, preferring `FileManager.iCloud()` and falling back to `FileManager.local()`.
- Ends with short instructions on adding the widget to the home screen.
- Does **not** execute the received code.

### Examples (`examples/`)

- Every example follows the skill's template exactly.
- Prefer data sources without API keys, such as Open-Meteo, or native data like calendar events and battery level.
- Every example comes with a screenshot (`<name>.png`) for the README.
- First candidates: weather, countdown, upcoming events, days-alive counter.

## Conventions

- **Language:** Everything is in English: code, comments, docs, README, `PROMPT.md`, commit messages.
- **JavaScript:** Modern JavaScript as supported by Scriptable (top-level `await`, `async`/`await`, optional chaining). No TypeScript, no build step, no npm dependencies in Scriptable scripts.
- **Scriptable limits:** No DOM, no `fetch`, no `require`, no `localStorage`. Networking only via `Request`, files via `FileManager`. Details are in the skill.
- **File names:** Scriptable scripts are named exactly as they should appear in the app, with spaces and capitals (`Widget Installer.js`, `Weather.js`).
- **Metadata header:** Every Scriptable script starts with Scriptable's comment header (`icon-color`, `icon-glyph`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).

## Checks and testing

- `node scripts/check.mjs` checks every `.js` file in `scriptable/` and `examples/`:
  - Syntax, parsed as an ES module (because of top-level `await`).
  - Forbidden APIs (`fetch`, `document`, `window`, `require`, `localStorage`).
  - Required parts: metadata header, `Script.setWidget` (widgets only), `Script.complete`.
- These checks do not replace testing on an iPhone, since Scriptable only runs on iOS. Run every changed script on a real device before a release.
- For quick testing, keep the repo in an iCloud folder or copy scripts into `iCloud Drive/Scriptable/`.

## Releases

- Semantic versioning, tags `vX.Y.Z`.
- On a tag, `release.yml` builds a ZIP of `skills/scriptable-widget/` and attaches it, together with `Widget Installer.js`, to the GitHub release.
- Changes are recorded in `CHANGELOG.md`.

## Scope of the first version (MVP)

Included:
- Skill, `PROMPT.md`, Widget Installer
- Three to four examples with screenshots
- README with GIF and quickstarts for Claude and for other AIs
- Check script and GitHub Actions for checks and releases
- MIT license

Deliberately excluded:
- Browser preview or simulator on desktop. It is a lot of work, will never be exact, and can come later if users ask for it.
- Any solution involving an API key or a server of our own.
- Support for other widget apps such as Await or Scripting.

## Possible later additions

- Example gallery on GitHub Pages
- More templates for lock screen widgets
- Browser preview for developers
