// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: sun;

// Change these values to make the widget your own.
const CONFIG = {
  title: "Sunset",
  place: "Köln",
  latitude: 50.9375,
  longitude: 6.9603,
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

const ROW_COUNTS = { medium: 3, large: 6 };
const MS_AFTER_SUNSET_FOR_NEXT_DAY = 30 * 60 * 1000;

// How the score works: high and middle clouds catch the color, low clouds block
// the horizon and rain ruins it. A clear sky is nice but not spectacular.
const SCORE = { clearSky: 55, colorBonus: 45, idealCloudCover: 50, lowCloudPenalty: 0.7, rainPenalty: 0.3 };
const VERDICTS = [
  { minimumScore: 75, text: "Go outside!" },
  { minimumScore: 50, text: "Could be nice" },
  { minimumScore: 0, text: "Stay in" },
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

function closestHourIndex(times, date) {
  const distance = (time) => Math.abs(new Date(time) - date);
  return times.reduce((best, time, index) => (distance(time) < distance(times[best]) ? index : best), 0);
}

function scoreSunset(hourly, sunset) {
  const hour = closestHourIndex(hourly.time, sunset);
  const colorClouds = Math.max(hourly.cloud_cover_mid[hour], hourly.cloud_cover_high[hour]);
  const distanceFromIdeal = Math.abs(colorClouds - SCORE.idealCloudCover) / SCORE.idealCloudCover;
  const score =
    SCORE.clearSky +
    SCORE.colorBonus * (1 - distanceFromIdeal) -
    hourly.cloud_cover_low[hour] * SCORE.lowCloudPenalty -
    (hourly.precipitation_probability[hour] ?? 0) * SCORE.rainPenalty;
  return Math.round(Math.min(100, Math.max(0, score)));
}

function verdictFor(score) {
  return VERDICTS.find((verdict) => score >= verdict.minimumScore).text;
}

function firstUpcomingDay(sunsets) {
  const hasPassed = new Date(sunsets[0]).getTime() + MS_AFTER_SUNSET_FOR_NEXT_DAY < Date.now();
  return hasPassed ? 1 : 0;
}

async function requestData() {
  const query = [
    `latitude=${CONFIG.latitude}`,
    `longitude=${CONFIG.longitude}`,
    "hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability",
    "daily=sunset",
    "timezone=auto",
    "forecast_days=7",
  ].join("&");
  const request = new Request(`https://api.open-meteo.com/v1/forecast?${query}`);
  request.timeoutInterval = 10;
  const response = await request.loadJSON();
  if (!response?.hourly?.time?.length || !response?.daily?.sunset?.length) {
    throw new Error(response?.reason ?? "Unexpected data.");
  }

  const days = response.daily.sunset
    .map((sunset) => ({ sunset: new Date(sunset), score: scoreSunset(response.hourly, new Date(sunset)) }))
    .slice(firstUpcomingDay(response.daily.sunset));
  const [next, ...later] = days;

  return {
    value: `${next.score}%`,
    caption: verdictFor(next.score),
    rows: [
      { label: "Sunset at", value: formatDate(next.sunset, "HH:mm") },
      ...later.map((day) => ({ label: formatDate(day.sunset, "EEE"), value: `${day.score}%` })),
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
  addLabel(stack, `${CONFIG.title} · ${CONFIG.place}`, Font.boldRoundedSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, "sunset.fill", 30, COLORS.accent);
  stack.addSpacer(4);
  addLabel(stack, data.value, Font.boldRoundedSystemFont(40), COLORS.primary);
  const caption = savedAt ? `Offline · ${formatDate(new Date(savedAt), "HH:mm")}` : data.caption;
  addLabel(stack, caption, Font.boldRoundedSystemFont(13), COLORS.secondary);
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
  addLabel(widget, "Couldn't load the sky", Font.boldRoundedSystemFont(14), COLORS.primary);
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
