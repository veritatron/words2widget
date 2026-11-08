// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: wind;

// Change these values to make the widget your own.
// The widget only knows the air outside. It can't measure your room.
const CONFIG = {
  title: "Fresh Air",
  place: "Köln",
  latitude: 50.9375,
  longitude: 6.9603,
  maxRainChance: 30, // Percent
  maxAirQualityIndex: 60, // European AQI, higher is worse
  maxPollen: 20, // Grains per cubic meter, birch and grass added up
  maxDewPoint: 16, // °C, above this the outside air is too humid
  locale: "en_US", // Language for dates and weekdays
  refreshMinutes: 30,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: Color.dynamic(new Color("#E8F8F5"), new Color("#10231F")),
  primary: Color.dynamic(new Color("#0F3D35"), new Color("#FFFFFF")),
  secondary: Color.dynamic(new Color("#4F7A71"), new Color("#A5C4BD")),
  accent: Color.dynamic(new Color("#12A594"), new Color("#4CD9C2")),
};

const ROW_COUNTS = { medium: 3, large: 4 };
const MS_PER_HOUR = 60 * 60 * 1000;

const OBSTACLES = [
  { reason: "Rain likely", applies: (hour) => hour.rain > CONFIG.maxRainChance },
  { reason: "Poor air", applies: (hour) => hour.airQuality > CONFIG.maxAirQualityIndex },
  { reason: "High pollen", applies: (hour) => hour.pollen > CONFIG.maxPollen },
  { reason: "Humid air", applies: (hour) => hour.dewPoint > CONFIG.maxDewPoint },
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

async function requestJSON(url) {
  const request = new Request(url);
  request.timeoutInterval = 10;
  const response = await request.loadJSON();
  if (!response?.hourly?.time?.length) throw new Error(response?.reason ?? "Unexpected data.");
  return response.hourly;
}

function requestForecast() {
  const place = `latitude=${CONFIG.latitude}&longitude=${CONFIG.longitude}&timezone=auto&forecast_days=2`;
  return Promise.all([
    requestJSON(`https://api.open-meteo.com/v1/forecast?${place}&hourly=temperature_2m,precipitation_probability,dew_point_2m`),
    requestJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${place}&hourly=european_aqi,birch_pollen,grass_pollen`),
  ]);
}

function combineHours(weather, air) {
  return weather.time.map((time, index) => {
    const airIndex = air.time.indexOf(time);
    return {
      date: new Date(time),
      temperature: weather.temperature_2m[index],
      rain: weather.precipitation_probability[index] ?? 0,
      dewPoint: weather.dew_point_2m[index],
      airQuality: air.european_aqi[airIndex] ?? 0,
      pollen: (air.birch_pollen[airIndex] ?? 0) + (air.grass_pollen[airIndex] ?? 0),
    };
  });
}

function firstObstacle(hour) {
  return OBSTACLES.find((obstacle) => obstacle.applies(hour));
}

function isGoodHour(hour) {
  return firstObstacle(hour) === undefined;
}

function describeNow(hours) {
  const [now, ...later] = hours;
  if (isGoodHour(now)) {
    const lastChance = later.find((hour) => !isGoodHour(hour));
    return { open: true, value: "Open now", caption: lastChance ? `Good until ${formatDate(lastChance.date, "HH:mm")}` : "Good all day" };
  }
  const nextGood = later.find(isGoodHour);
  const when = nextGood ? `next ${formatDate(nextGood.date, "HH:mm")}` : "no good time soon";
  return { open: false, value: "Keep closed", caption: `${firstObstacle(now).reason} · ${when}` };
}

function airQualityLabel(index) {
  if (index <= 40) return "Good";
  return index <= CONFIG.maxAirQualityIndex ? "Moderate" : "Poor";
}

function pollenLabel(pollen) {
  if (pollen === 0) return "None";
  return pollen <= CONFIG.maxPollen ? "Low" : "High";
}

async function requestData() {
  const [weather, air] = await requestForecast();
  const startOfHour = Date.now() - MS_PER_HOUR;
  const hours = combineHours(weather, air).filter((hour) => hour.date.getTime() > startOfHour);
  const [now] = hours;

  return {
    ...describeNow(hours),
    rows: [
      { label: "Rain", value: `${Math.round(now.rain)}%` },
      { label: "Air", value: airQualityLabel(now.airQuality) },
      { label: "Pollen", value: pollenLabel(now.pollen) },
      { label: "Outside", value: `${Math.round(now.temperature)}°` },
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
  addLabel(stack, `${CONFIG.title} · ${CONFIG.place}`, Font.semiboldSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, data.open ? "wind" : "xmark.circle.fill", 30, COLORS.accent);
  stack.addSpacer(4);
  addLabel(stack, data.value, Font.boldSystemFont(30), COLORS.primary);
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
  addLabel(widget, "Couldn't check the air", Font.semiboldSystemFont(14), COLORS.primary);
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
