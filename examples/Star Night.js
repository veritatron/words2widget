// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: moon;

// Change these values to make the widget your own.
const CONFIG = {
  title: "Stars tonight",
  place: "Köln",
  latitude: 50.9375,
  longitude: 6.9603,
  maxCloudCover: 30, // Percent of sky that may be covered for a clear hour
  brightMoon: 70, // Percent of moon lit at which the sky counts as bright
  locale: "en_US", // Language for dates and weekdays
  refreshMinutes: 60,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: new Color("#0B1026"),
  primary: new Color("#FFFFFF"),
  secondary: new Color("#AEB8D6"),
  accent: new Color("#FFD666"),
};

const ROW_COUNTS = { medium: 3, large: 6 };
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const FORECAST_NIGHTS = 6;
const MOON_CYCLE_DAYS = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

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

function moonIllumination(date) {
  const daysSinceNewMoon = (date.getTime() - KNOWN_NEW_MOON) / MS_PER_DAY;
  const phase = (daysSinceNewMoon % MOON_CYCLE_DAYS) / MOON_CYCLE_DAYS;
  return Math.round(((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100);
}

// A night runs from one hour after sunset to one hour before the next sunrise.
function readNight(response, dayIndex) {
  const { hourly, daily } = response;
  const start = new Date(daily.sunset[dayIndex]).getTime() + MS_PER_HOUR;
  const end = new Date(daily.sunrise[dayIndex + 1]).getTime() - MS_PER_HOUR;
  const earliest = Math.max(start, Date.now() - MS_PER_HOUR);

  const hours = hourly.time
    .map((time, index) => ({ date: new Date(time), isClear: hourly.cloud_cover[index] <= CONFIG.maxCloudCover }))
    .filter(({ date }) => date.getTime() >= earliest && date.getTime() < end);

  return { date: new Date(daily.sunset[dayIndex]), end: new Date(end), hours };
}

function clearWindow(night) {
  const first = night.hours.findIndex((hour) => hour.isClear);
  if (first === -1) return null;
  const nextCloudy = night.hours.findIndex((hour, index) => index > first && !hour.isClear);
  return { start: night.hours[first].date, end: nextCloudy === -1 ? night.end : night.hours[nextCloudy].date };
}

function countClearHours(night) {
  return night.hours.filter((hour) => hour.isClear).length;
}

function describeNight(clearSpan, moon) {
  if (!clearSpan) return { value: "No stars", caption: "Too cloudy tonight" };
  const moonNote = moon >= CONFIG.brightMoon ? " · bright moon" : "";
  return {
    value: formatDate(clearSpan.start, "HH:mm"),
    caption: `Clear until ${formatDate(clearSpan.end, "HH:mm")}${moonNote}`,
  };
}

async function requestData() {
  const query = [
    `latitude=${CONFIG.latitude}`,
    `longitude=${CONFIG.longitude}`,
    "hourly=cloud_cover",
    "daily=sunrise,sunset",
    "timezone=auto",
    `forecast_days=${FORECAST_NIGHTS + 1}`,
  ].join("&");
  const request = new Request(`https://api.open-meteo.com/v1/forecast?${query}`);
  request.timeoutInterval = 10;
  const response = await request.loadJSON();
  if (!response?.hourly?.time?.length || !response?.daily?.sunset?.length) {
    throw new Error(response?.reason ?? "Unexpected data.");
  }

  const [tonight, ...laterNights] = [...Array(FORECAST_NIGHTS).keys()].map((index) => readNight(response, index));
  const moon = moonIllumination(new Date());

  return {
    ...describeNight(clearWindow(tonight), moon),
    rows: [
      { label: "Moon", value: `${moon}%` },
      { label: "Clear hours", value: String(countClearHours(tonight)) },
      ...laterNights.map((night) => ({
        label: formatDate(night.date, "EEE"),
        value: `${countClearHours(night)} h clear`,
      })),
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
  addLabel(stack, CONFIG.title, Font.semiboldSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, "moon.stars.fill", 30, COLORS.accent);
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
  addLabel(widget, "Couldn't load the night sky", Font.semiboldSystemFont(14), COLORS.primary);
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
