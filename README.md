<h1 align="center">words2widget</h1>

<p align="center">
  <strong>Say what you want on your iPhone home screen. Your AI builds the widget.</strong><br>
  No coding. No API key. Just a sentence.
</p>

<p align="center">
  <a href="https://github.com/veritatron/words2widget/actions/workflows/check.yml"><img src="https://github.com/veritatron/words2widget/actions/workflows/check.yml/badge.svg" alt="Checks"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/API%20key-not%20needed-brightgreen" alt="No API key needed">
  <a href="https://scriptable.app"><img src="https://img.shields.io/badge/built%20for-Scriptable-black" alt="Built for Scriptable"></a>
</p>

## Widgets that answer your questions

Your weather app shows you numbers. These tell you what to do.

| "What should I put on?" | "Is tonight's sunset worth it?" |
|:---:|:---:|
| <img src="examples/What%20to%20Wear.png" alt="What to Wear widget recommending a warm jacket" width="400"> | <img src="examples/Sunset%20Score.png" alt="Sunset Score widget rating tonight's sunset" width="400"> |
| **"When can I see the stars?"** | **"Can I open the windows?"** |
| <img src="examples/Star%20Night.png" alt="Star Night widget showing when the sky is clear" width="400"> | <img src="examples/Fresh%20Air.png" alt="Fresh Air widget saying the windows can be opened" width="400"> |
| **"How long have I been alive?"** | **"What's the weather doing?"** |
| <img src="examples/Days%20Alive.png" alt="Days Alive widget counting days lived" width="400"> | <img src="examples/Weather.png" alt="Weather widget with a three-day forecast" width="400"> |

Every one of these started as a single sentence. Yours can be next.

## Get started

You only set this up once. It takes about five minutes.

**1. Get the free [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) app.**

**2. Add the Widget Installer.** On your iPhone, open [this code](https://raw.githubusercontent.com/veritatron/words2widget/master/scriptable/Widget%20Installer.js) in Safari. Touch and hold the text, tap **Select All**, then **Copy**. In Scriptable, tap **+**, paste it and name the script `Widget Installer`.

**3. Teach your AI.** Pick the one you use:

- **Claude:** Download [`scriptable-widget.zip`](https://github.com/veritatron/words2widget/releases/latest/download/scriptable-widget.zip) and upload it in Claude's settings under skills.
- **ChatGPT, Gemini or any other AI:** Paste the block from [`PROMPT.md`](PROMPT.md) into a new chat.

That's it. You're ready.

## Make your first widget

1. **Say what you want.** Your AI asks which language and style you'd like.
2. **Copy the code** with the copy button.
3. **Run Widget Installer** in Scriptable and tap **Save**.
4. **Put it on your home screen.** Touch and hold the home screen, tap **Edit**, then **Add Widget**, and choose **Scriptable**. Tap the new widget and pick your script.

## Not sure what to ask for?

Steal one of these:

- "Is it barbecue weather this weekend?"
- "Should I bike or take the bus today?"
- "Do I need sunscreen at noon?"
- "How much of this week is already over?"
- "How many days until my next vacation?"
- "How much of my day is still free?"

Change a color, swap the language, make it weird. If you don't like it, just tell your AI.

## Questions

**Do I need to know how to code?**
No. You never have to read or change the code.

**Is it safe?**
Widget Installer only saves code you hand to it. It never runs that code and never downloads anything.

**What does it cost?**
Scriptable is free, and there are no API keys to pay for. `PROMPT.md` is made to fit free chatbots. Uploading skills depends on your Claude plan.

**It says "No widget found".**
Part of the code is probably missing. Use the copy button on the code block and try again.

**My widget isn't updating.**
iOS decides when widgets refresh, so it can take a while.

## For developers

Using Claude Code? Run `npx skills add veritatron/words2widget`.

The widget rules live in [`SKILL.md`](skills/scriptable-widget/SKILL.md), and ready-made widgets in [`examples/`](examples). Run `node scripts/check.mjs` to check all scripts.

## License

[MIT](LICENSE.txt)

---

<p align="center">
  Developed by<br><br>
  <a href="https://github.com/veritatron">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/veritatron-dark.svg">
      <img src="assets/veritatron-light.svg" alt="veritatron" width="240">
    </picture>
  </a>
</p>
