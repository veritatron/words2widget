<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.png">
    <img src="assets/wordmark-light.png" alt="words2widget" width="420">
  </picture>
</h1>

<p align="center">
  <strong>Say what you want on your iPhone home screen. Your AI builds the widget.</strong><br>
  No coding. Just a sentence. Works with ChatGPT, Gemini, Claude and more.
</p>

<p align="center">
  <a href="https://github.com/veritatron/words2widget/actions/workflows/check.yml"><img src="https://img.shields.io/github/actions/workflow/status/veritatron/words2widget/check.yml?branch=master&label=checks&labelColor=212327&color=FFD500&style=flat-square" alt="Checks"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/license-MIT-FFD500?labelColor=212327&style=flat-square" alt="MIT license"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Animation: a typed sentence turns into a finished iPhone widget" width="640">
</p>

## Make the widget you always wanted

Most widgets show you numbers. Yours can answer your questions.

<br>

<img align="right" width="46%" src="assets/feature-sentence.png" alt="A sentence asking about a train, above the finished Train Commute widget">

### Say it in one sentence

Ask your AI the way you'd ask a friend. You get a finished widget back and never touch the code.

<br clear="both">
<br>

<img align="left" hspace="14" width="50%" src="assets/sizes.png" alt="The Train Commute widget in small, medium and large">

### Pick the size that fits

Small, medium or large. The layout adapts, so every size is made to be read at a glance.

<br clear="both">
<br>

<h3 align="center">In any style you want</h3>

<p align="center">Clean like Apple, retro like a terminal, loud, playful or in your team's colors.<br>Just say how it should look, and your widget follows.</p>

<p align="center"><img width="76%" src="assets/feature-design.png" alt="The same Top Repos widget in a clean style and in a terminal style"></p>

<br clear="both">
<br>

<img align="right" width="46%" src="assets/feature-day.png" alt="Weekly Load widget with booked hours per day for this week and next">

### Built around your day

Your calendar, reminders, location and the weather outside. Your widget uses what matters to you.

<br clear="both">
<br>

<img align="left" hspace="14" width="46%" src="assets/feature-any-ai.png" alt="Claude, ChatGPT, Gemini or any free chatbot, with no API key and no cost">

### Works with the AI you already use

No new app to learn, no API key and no subscription. Scriptable is free, and the setup takes five minutes.

<br clear="both">
<br>

### A few ideas to get you started

Got your own? Describe it in one sentence, and your AI builds it.

<p align="center">
  <img src="assets/card-air-out.png" alt="Air Out widget saying the windows can be opened now" width="49%">
  <img src="assets/card-top-repos.png" alt="Top Repos widget listing this week's most-starred GitHub repositories" width="49%">
</p>
<p align="center">
  <img src="assets/card-run-today.png" alt="Run Today widget with the current weather for a run" width="49%">
</p>

<sub>Train Commute uses timetable data from <a href="https://transitous.org">Transitous</a> and <a href="https://transitous.org/sources/">its data sources</a>, including OpenStreetMap.</sub>

## Quickstart

### Set up once (about five minutes)

1. **Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).** It's free.
2. **Copy the Widget Installer.** On your iPhone, open [the installer page](INSTALLER.md) in Safari and tap the copy button on the code block. If it opens in the GitHub app, touch and hold the link and choose **Open in Safari** instead.
3. **Paste it into Scriptable.** Open Scriptable, tap **+** and paste the code. Tap the name at the top, change it to `Widget Installer`, then tap **Done**.
4. **Teach your AI.** Pick the one you use:
   - **Claude:** Download [`scriptable-widget.zip`](https://github.com/veritatron/words2widget/releases/latest/download/scriptable-widget.zip) and upload it in Claude's settings under skills.
   - **ChatGPT, Gemini or any other AI:** Paste the block from [`PROMPT.md`](PROMPT.md) into a new chat.

### Make a widget

1. **Say what you want.** Your AI asks which language and style you'd like.
2. **Copy the code** with the copy button.
3. **Run Widget Installer** in Scriptable and tap **Save**.
4. **Put it on your home screen.** Touch and hold the home screen, tap **Edit**, then **Add Widget**, and choose **Scriptable**. Tap the new widget and pick your script.

## Not sure what to ask for?

The best widgets are the ones you look at every day. Steal one of these:

- "What should I wear today?"
- "Will it rain on my way to work or back home?"
- "How long until my next meeting?"
- "How much of today is still free in my calendar?"
- "What's on my to-do list for today?"
- "How many days until the weekend and until payday?"

Change a color, swap the language, make it weird. If you don't like it, just tell your AI.

## Questions

**How do I change a widget?**
Tell your AI what to change and copy the new code. Run Widget Installer, keep the same name and tap **Replace**.

**Does it cost anything?**
Scriptable is free, and widgets only use data sources that need no API key. `PROMPT.md` is made to fit free chatbots. Uploading the skill depends on your Claude plan.

**Is it safe?**
Widget Installer only saves the code you give it. Once it's on your home screen, a widget runs like any other Scriptable script, so only use code from an AI or person you trust.

**Which devices does it work on?**
iPhones with Scriptable, on the home screen. Android and lock screen widgets aren't supported.

**Widget Installer says "No widget found".**
It couldn't find a complete widget on your clipboard. Tap the copy button on the code block and run it again.

**My widget shows an error.**
It may need access to your calendar, reminders or location. Open Scriptable, run the script once and allow access.

**My widget isn't updating.**
iOS decides when widgets refresh, so new data can take a while to appear.

---

<p align="center">
  Released under the <a href="LICENSE.txt">MIT License</a>.<br><br>
  Developed by<br><br>
  <a href="https://github.com/veritatron">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/veritatron-dark.svg">
      <img src="assets/veritatron-light.svg" alt="veritatron" width="240">
    </picture>
  </a>
</p>
