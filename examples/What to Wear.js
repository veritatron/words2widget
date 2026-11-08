// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: tshirt;

// Change these values to make the widget your own.
const CONFIG = {
  title: "What to wear",
  place: "Köln",
  latitude: 50.9375,
  longitude: 6.9603,
  dayStartHour: 7,
  dayEndHour: 22,
  umbrellaFromRainChance: 40, // Percent
  windproofFromWindSpeed: 35, // km/h
  locale: "en_US", // Language for dates and weekdays
  refreshMinutes: 60,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: Color.dynamic(new Color("#FFF1E6"), new Color("#2B1B14")),
  primary: Color.dynamic(new Color("#4A2511"), new Color("#FFF1E6")),
  secondary: Color.dynamic(new Color("#9A6B4F"), new Color("#D4B8A6")),
  accent: Color.dynamic(new Color("#FF6B4A"), new Color("#FF9A76")),
};

const ROW_COUNTS = { medium: 3, large: 5 };
const MINIMUM_HOURS_LEFT = 3;

// Chosen by the coldest felt temperature of the day, in °C.
const OUTFITS = [
  { below: 0, text: "Winter coat" },
  { below: 8, text: "Warm jacket" },
  { below: 15, text: "Light jacket" },
  { below: 21, text: "Sweater" },
  { below: Infinity, text: "T-shirt" },
];

const EXTRAS = [
  { text: "Hat and gloves", applies: (day) => day.coldest <= 2 },
  { text: "Umbrella", applies: (day) => day.rainChance >= CONFIG.umbrellaFromRainChance },
  { text: "Windproof layer", applies: (day) => day.wind >= CONFIG.windproofFromWindSpeed },
];

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

function readHours(hourly) {
  return hourly.time.map((time, index) => ({
    date: new Date(time),
    feelsLike: hourly.apparent_temperature[index],
    rainChance: hourly.precipitation_probability[index] ?? 0,
    wind: hourly.wind_speed_10m[index],
  }));
}

function isSameDay(first, second) {
  return first.toDateString() === second.toDateString();
}

function hoursOnDay(hours, day) {
  return hours.filter(({ date }) => {
    const hour = date.getHours();
    return isSameDay(date, day) && hour >= CONFIG.dayStartHour && hour <= CONFIG.dayEndHour;
  });
}

function summarizeDay(hours) {
  return {
    now: hours[0].feelsLike,
    coldest: Math.min(...hours.map((hour) => hour.feelsLike)),
    rainChance: Math.max(...hours.map((hour) => hour.rainChance)),
    wind: Math.max(...hours.map((hour) => hour.wind)),
  };
}

function outfitFor(day) {
  return OUTFITS.find((outfit) => day.coldest < outfit.below).text;
}

function extrasFor(day) {
  return EXTRAS.filter((extra) => extra.applies(day)).map((extra) => extra.text);
}

function degrees(value) {
  return `${Math.round(value)}°`;
}

async function requestData() {
  const query = [
    `latitude=${CONFIG.latitude}`,
    `longitude=${CONFIG.longitude}`,
    "hourly=apparent_temperature,precipitation_probability,wind_speed_10m",
    "timezone=auto",
    "forecast_days=2",
  ].join("&");
  const request = new Request(`https://api.open-meteo.com/v1/forecast?${query}`);
  request.timeoutInterval = 10;
  const response = await request.loadJSON();
  if (!response?.hourly?.time?.length) throw new Error(response?.reason ?? "Unexpected data.");

  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const hours = readHours(response.hourly);
  const hoursLeftToday = hoursOnDay(hours, now).filter(({ date }) => date.getHours() >= now.getHours());
  const showsTomorrow = hoursLeftToday.length < MINIMUM_HOURS_LEFT;
  const day = summarizeDay(showsTomorrow ? hoursOnDay(hours, tomorrow) : hoursLeftToday);

  return {
    heading: showsTomorrow ? "Tomorrow" : CONFIG.title,
    value: outfitFor(day),
    caption: extrasFor(day).join(", ") || "No extras needed",
    rows: [
      { label: "Feels like", value: degrees(day.now) },
      { label: "Coldest", value: degrees(day.coldest) },
      { label: "Rain", value: `${Math.round(day.rainChance)}%` },
      { label: "Wind", value: `${Math.round(day.wind)} km/h` },
      { label: "Place", value: CONFIG.place },
    ],
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
  addLabel(stack, data.heading, Font.boldRoundedSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, "tshirt.fill", 28, COLORS.accent);
  stack.addSpacer(4);
  const outfit = addLabel(stack, data.value, Font.boldRoundedSystemFont(26), COLORS.primary);
  outfit.lineLimit = 2;
  const caption = savedAt ? `Offline · ${formatDate(new Date(savedAt), "HH:mm")}` : data.caption;
  addLabel(stack, caption, Font.boldRoundedSystemFont(12), COLORS.secondary);
}

function addRow(stack, row) {
  const line = stack.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  addLabel(line, row.label, Font.boldRoundedSystemFont(14), COLORS.primary);
  line.addSpacer();
  addLabel(line, row.value, Font.boldRoundedSystemFont(14), COLORS.secondary);
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

  columns.addSpacer(20);

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
  addLabel(widget, "Couldn't check the weather", Font.boldRoundedSystemFont(14), COLORS.primary);
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
