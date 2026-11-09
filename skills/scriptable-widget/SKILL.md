---
name: scriptable-widget
description: Builds ready-to-use iPhone home screen widgets for the Scriptable app from one sentence. Use when someone asks for an iPhone widget or a Scriptable script.
---

# Scriptable Widget Builder

Turn one sentence into a finished JavaScript widget for the [Scriptable](https://scriptable.app) iPhone app. The user does not code, so never ask them to edit the script.

## Workflow

1. Work out what the widget shows and where the data comes from.
2. Send one short follow-up message before building. Ask for the widget's **language** and **style** (offer the styles below), plus anything else the widget can't be built without, such as the place for a weather widget. Leave out what the user already stated, and if they stated everything, build right away. Never send a second follow-up. Choose sensible defaults for everything else.
3. Write the script by adapting the template below.
4. Go through the checklist.
5. Reply in the format described under "Reply format".

## Data sources

Never use a service that needs an API key, account or login. Scripts never contain secrets. If the request depends on such a service, use the closest free source and say so in one sentence. If there is none, say what can't be done and offer the closest widget.

Prefer native data, then these free sources:

| Data | Source |
|---|---|
| Weather | `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto` |
| Air quality, pollen | `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=..&longitude=..&current=european_aqi,birch_pollen` |
| Coordinates of a place | `https://geocoding-api.open-meteo.com/v1/search?name=..&count=1` |
| Exchange rates | `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD` |
| Crypto prices | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur` |

Put a place's coordinates directly into `CONFIG`. Use `Location.current()` only if the user asks for their current location.

Native data needs no network: `CalendarEvent`, `Reminder`, `Device`, dates. For these, remove the cache functions and `loadData`, and build the data directly. Calendar, reminders and location need permission, so tell the user to run the script once in the Scriptable app.

## Styles

Offer these four by name with their short description. If the user describes their own style, follow it. Put the colors into `COLORS` as `Color.dynamic(new Color(light), new Color(dark))`.

| Style | Description | Background | Primary | Secondary | Accent | Fonts |
|---|---|---|---|---|---|---|
| Clean | Calm and tidy, blue tones | `#EAF3FF` / `#14202E` | `#10253F` / `#FFFFFF` | `#52657C` / `#A9B8C9` | `#E88A00` / `#FFC24D` | System |
| Minimal | Black and white only | `#FFFFFF` / `#000000` | `#000000` / `#FFFFFF` | `#6E6E73` / `#98989D` | `#000000` / `#FFFFFF` | Light system, large values |
| Bold | Strong color that stands out | `#2F54EB` / `#1D39C4` | `#FFFFFF` / `#FFFFFF` | `#D6E0FF` / `#D6E0FF` | `#FFD666` / `#FFD666` | Bold system |
| Playful | Warm and friendly | `#FFF1E6` / `#2B1B14` | `#4A2511` / `#FFF1E6` | `#9A6B4F` / `#D4B8A6` | `#FF6B4A` / `#FF9A76` | Bold rounded system |

## Script rules

- Start from the template and keep its structure. The Scriptable header must stay at the very top.
- `CONFIG` must have a short `title` as its first entry. It becomes the suggested script name. Everything a person might want to change belongs in `CONFIG`.
- Keep `Script.setWidget(widget)` and end the script with `Script.complete();` as the last line.
- Set `refreshAfterDate`. iOS decides when widgets actually refresh, so never promise exact times. Use at least 15 minutes.
- Show readable errors through `buildErrorWidget`. Never leave a widget blank.
- For network data, keep the cache so the widget still works offline.
- Only use what Scriptable provides. There is no `fetch`, `document`, `window`, `require`, `localStorage`, `import` or `export`. Use `Request` for network and `FileManager` for files. npm packages can't be used.
- The code must not contain triple backticks.
- Widgets can't react to taps beyond opening a URL, can't animate, and can't show `Alert`. For a live countdown, use `addDate` with `applyTimerStyle()`.
- To log something with a tap, set `widget.url` to `` `${URLScheme.forRunningScript()}?add=1` `` and handle `args.queryParameters.add` when the script runs, without showing the widget preview. The tap opens Scriptable, and iOS decides when the widget redraws, so tell the user in one sentence.
- Home screen sizes only. If someone asks for a lock screen widget, build a home screen widget and say so in one sentence.

## Design rules

- Show one main piece of information, large and readable at a glance.
- Use all three sizes: small shows only the essentials, medium adds detail beside them, large adds more below.
- Apply the chosen style. Support light and dark mode with `Color.dynamic`, and keep colors in `COLORS`.
- Use SF Symbols for icons, not emoji or downloaded images.
- Use at most three text sizes and one accent color.
- Keep `lineLimit` and `minimumScaleFactor` on text so it never gets cut off awkwardly. Test long values in your head.
- Write all visible text in the chosen language, including the error and offline messages. Set `locale` in `CONFIG` to match, for example `de_DE`, so `DateFormatter` uses that language too.

## Template

Replace `requestData`, the `CONFIG` values, the `COLORS` and the icon. Adapt the layout functions to the content.

```javascript
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: star;

const CONFIG = {
  title: "My Widget",
  locale: "en_US", // Language for dates and weekdays
  refreshMinutes: 30,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: Color.dynamic(new Color("#EAF3FF"), new Color("#14202E")),
  primary: Color.dynamic(new Color("#10253F"), new Color("#FFFFFF")),
  secondary: Color.dynamic(new Color("#52657C"), new Color("#A9B8C9")),
  accent: Color.dynamic(new Color("#E88A00"), new Color("#FFC24D")),
};

const ROW_COUNTS = { medium: 3, large: 6 };

// --- Data ---

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.libraryDirectory(), `${Script.name()}-cache.json`);
}

function saveCache(data) {
  FileManager.local().writeString(cachePath(), JSON.stringify({ savedAt: Date.now(), data }));
}

function readCache() {
  const fm = FileManager.local();
  const path = cachePath();
  if (!fm.fileExists(path)) return null;
  try {
    return JSON.parse(fm.readString(path));
  } catch {
    return null;
  }
}

// Replace this function. It returns what the layout shows.
async function requestData() {
  const request = new Request(
    "https://api.open-meteo.com/v1/forecast?latitude=50.94&longitude=6.96&current=temperature_2m&daily=temperature_2m_max&timezone=auto"
  );
  request.timeoutInterval = 10;
  const response = await request.loadJSON();

  if (response?.current?.temperature_2m === undefined) {
    throw new Error(response?.reason ?? "Unexpected data.");
  }
  return {
    symbol: "thermometer.medium",
    value: `${Math.round(response.current.temperature_2m)}°`,
    caption: "Köln",
    rows: response.daily.time.slice(1).map((day, index) => ({
      label: formatDate(new Date(`${day}T12:00:00`), "EEE"),
      value: `${Math.round(response.daily.temperature_2m_max[index + 1])}°`,
    })),
  };
}

// Returns fresh data if possible and the last saved data otherwise.
async function loadData() {
  try {
    const data = await requestData();
    saveCache(data);
    return { data, savedAt: null };
  } catch (error) {
    const cache = readCache();
    if (cache?.data) return { data: cache.data, savedAt: cache.savedAt };
    throw error;
  }
}

// --- Drawing helpers ---

function formatDate(date, pattern) {
  const formatter = new DateFormatter();
  formatter.locale = CONFIG.locale;
  formatter.dateFormat = pattern;
  return formatter.string(date);
}

function addLabel(stack, text, font, color) {
  const label = stack.addText(text);
  label.font = font;
  label.textColor = color;
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.6;
  return label;
}

function addSymbol(stack, name, size, color) {
  const symbol = SFSymbol.named(name) ?? SFSymbol.named("questionmark.circle.fill");
  symbol.applyFont(Font.systemFont(size));
  const image = stack.addImage(symbol.image);
  image.imageSize = new Size(size, size);
  image.tintColor = color;
  return image;
}

// --- Layout ---

function addMainContent(stack, { data, savedAt }) {
  addLabel(stack, CONFIG.title, Font.semiboldSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, data.symbol, 30, COLORS.accent);
  stack.addSpacer(4);
  addLabel(stack, data.value, Font.boldSystemFont(38), COLORS.primary);
  const caption = savedAt ? `Offline · ${formatDate(new Date(savedAt), "HH:mm")}` : data.caption;
  addLabel(stack, caption, Font.systemFont(12), COLORS.secondary);
}

function addRow(stack, row) {
  const line = stack.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  addLabel(line, row.label, Font.semiboldSystemFont(14), COLORS.primary);
  line.addSpacer();
  addLabel(line, row.value, Font.systemFont(14), COLORS.secondary);
}

function addRows(stack, rows) {
  stack.addSpacer();
  rows.forEach((row) => {
    addRow(stack, row);
    stack.addSpacer();
  });
}

function createWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.background;
  widget.setPadding(14, 16, 14, 16);
  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);
  return widget;
}

function buildSmallWidget(result) {
  const widget = createWidget();
  addMainContent(widget, result);
  return widget;
}

function buildMediumWidget(result) {
  const widget = createWidget();
  const columns = widget.addStack();
  columns.layoutHorizontally();

  const main = columns.addStack();
  main.layoutVertically();
  addMainContent(main, result);

  columns.addSpacer(24);

  const details = columns.addStack();
  details.layoutVertically();
  addRows(details, result.data.rows.slice(0, ROW_COUNTS.medium));
  return widget;
}

function buildLargeWidget(result) {
  const widget = createWidget();
  const main = widget.addStack();
  main.layoutVertically();
  main.size = new Size(0, 150);
  addMainContent(main, result);

  addRows(widget, result.data.rows.slice(0, ROW_COUNTS.large));
  return widget;
}

function buildErrorWidget(error) {
  const widget = createWidget();
  addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.accent);
  widget.addSpacer(8);
  addLabel(widget, "Couldn't load the data", Font.semiboldSystemFont(14), COLORS.primary);
  widget.addSpacer(4);
  const message = addLabel(widget, error.message, Font.systemFont(12), COLORS.secondary);
  message.lineLimit = 3;
  return widget;
}

// --- Run ---

function currentSize() {
  const family = config.widgetFamily ?? CONFIG.previewSize;
  if (family === "medium") return "medium";
  if (family === "large" || family === "extraLarge") return "large";
  return "small";
}

async function buildWidget(size) {
  try {
    const result = await loadData();
    if (size === "medium") return buildMediumWidget(result);
    if (size === "large") return buildLargeWidget(result);
    return buildSmallWidget(result);
  } catch (error) {
    return buildErrorWidget(error);
  }
}

const size = currentSize();
const widget = await buildWidget(size);

Script.setWidget(widget);

if (!config.runsInWidget) {
  if (size === "medium") await widget.presentMedium();
  else if (size === "large") await widget.presentLarge();
  else await widget.presentSmall();
}

Script.complete();
```

## API reference

Only use members listed here unless you are sure they exist in Scriptable.

**`ListWidget`**: `addText(text)`, `addDate(date)`, `addImage(image)`, `addSpacer(length?)`, `addStack()`, `backgroundColor`, `backgroundImage`, `backgroundGradient`, `setPadding(top, leading, bottom, trailing)`, `spacing`, `url`, `refreshAfterDate`, `presentSmall()`, `presentMedium()`, `presentLarge()`

**`WidgetStack`** (from `addStack()`): same `add…` methods, `layoutHorizontally()`, `layoutVertically()`, `topAlignContent()`, `centerAlignContent()`, `bottomAlignContent()`, `size`, `spacing`, `backgroundColor`, `cornerRadius`, `borderWidth`, `borderColor`, `setPadding(…)`, `url`

**`WidgetText`**: `font`, `textColor`, `textOpacity`, `lineLimit`, `minimumScaleFactor`, `leftAlignText()`, `centerAlignText()`, `rightAlignText()`, `url`

**`WidgetDate`**: same as `WidgetText`, plus `applyTimeStyle()`, `applyDateStyle()`, `applyRelativeStyle()`, `applyOffsetStyle()`, `applyTimerStyle()`

**`WidgetImage`**: `imageSize`, `tintColor`, `imageOpacity`, `cornerRadius`, `resizable`, `applyFittingContentMode()`, `applyFillingContentMode()`

**`Font`**: `Font.systemFont(size)`, `lightSystemFont`, `mediumSystemFont`, `semiboldSystemFont`, `boldSystemFont`, `boldRoundedSystemFont`, `regularMonospacedSystemFont`

**`Color`**: `new Color(hex, alpha?)`, `Color.dynamic(light, dark)`, `Color.white()`, `Color.black()`, `Color.clear()`

**`LinearGradient`**: `new LinearGradient()`, `colors`, `locations`, `startPoint`, `endPoint`. Use plain colors in gradients, not `Color.dynamic`.

**`SFSymbol`**: `SFSymbol.named(name)` (can return null), `applyFont(font)`, `image`

**`Size`, `Point`**: `new Size(width, height)`, where 0 means flexible. `new Point(x, y)`.

**`DrawContext`** (for charts and rings): `new DrawContext()`, `size`, `opaque`, `respectScreenScale`, `setFillColor(color)`, `setStrokeColor(color)`, `setLineWidth(width)`, `fillRect(rect)`, `fillEllipse(rect)`, `addPath(path)`, `strokePath()`, `fillPath()`, `getImage()`. **`Path`**: `move(point)`, `addLine(point)`. `new Rect(x, y, width, height)`.

**`Request`**: `new Request(url)`, `method`, `headers`, `body`, `timeoutInterval`, `loadJSON()`, `loadString()`, `loadImage()`, `response`

**`FileManager`**: `FileManager.local()`, `libraryDirectory()`, `joinPath(a, b)`, `fileExists(path)`, `readString(path)`, `writeString(path, text)`

**`DateFormatter`**: `new DateFormatter()`, `locale`, `dateFormat`, `string(date)`

**`Device`**: `Device.batteryLevel()` (0 to 1), `Device.isCharging()`, `Device.locale()`, `Device.isUsingDarkAppearance()`

**`CalendarEvent`**: `await CalendarEvent.today([])`, `tomorrow([])`, `thisWeek([])`, `nextWeek([])`. Each event has `title`, `startDate`, `endDate`, `isAllDay`, `calendar.color`.

**`Reminder`**: `await Reminder.allIncomplete()`, `await Reminder.incompleteDueToday()`. Each reminder has `title`, `dueDate`, `isCompleted`.

**`Location`**: `Location.setAccuracyToThreeKilometers()`, `await Location.current()` returns `latitude` and `longitude`.

**`config`**: `runsInWidget`, `widgetFamily` (`small`, `medium`, `large`, `extraLarge`). **`args.widgetParameter`**: text the user entered in the widget's settings. **`args.queryParameters`**: values from the URL that started the script. **`args.shortcutParameter`**: value passed in by the Shortcuts app.

**`URLScheme`**: `URLScheme.forRunningScript()` returns a URL that runs the current script.

**`Script`**: `setWidget(widget)`, `complete()`, `name()`, `setShortcutOutput(value)`

## Checklist

- [ ] The Scriptable header is at the very top.
- [ ] `CONFIG` starts with a short `title`.
- [ ] No API key, login or secret, and only Scriptable APIs.
- [ ] Small, medium and large are all handled.
- [ ] Errors show a readable message, and network data has a cache.
- [ ] The chosen style is applied, and colors work in light and dark mode.
- [ ] All visible text and `locale` match the chosen language.
- [ ] `refreshAfterDate` and `Script.setWidget(widget)` are set.
- [ ] `Script.complete();` is the last line.
- [ ] No placeholder values or sample data are left.

## Reply format

Reply in the language of the user's request, with exactly one code block (language `javascript`) containing the whole script, followed by these short steps:

1. Tap the copy button on the code block.
2. Open Scriptable and run **Widget Installer**, then tap **Save**.
3. Add a Scriptable widget to your home screen, tap it and choose your new script.

Add one sentence only if something needs attention, such as running the script once to grant calendar access. Don't explain the code.
