// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-sun;

// Change these values to make the widget your own.
const CONFIG = {
  title: "Weather",
  location: "Koblenz",
  latitude: 50.3569,
  longitude: 7.589,
  temperatureUnit: "celsius", // "celsius" or "fahrenheit"
  refreshMinutes: 30,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: Color.dynamic(new Color("#EAF3FF"), new Color("#14202E")),
  primary: Color.dynamic(new Color("#10253F"), new Color("#FFFFFF")),
  secondary: Color.dynamic(new Color("#52657C"), new Color("#A9B8C9")),
  accent: Color.dynamic(new Color("#E88A00"), new Color("#FFC24D")),
};

const CACHE_FILE = "weather-cache.json";

// WMO weather codes used by Open-Meteo.
const WEATHER_TYPES = [
  { codes: [0], label: "Clear", day: "sun.max.fill", night: "moon.stars.fill" },
  { codes: [1], label: "Mostly clear", day: "sun.max.fill", night: "moon.stars.fill" },
  { codes: [2], label: "Partly cloudy", day: "cloud.sun.fill", night: "cloud.moon.fill" },
  { codes: [3], label: "Overcast", day: "cloud.fill", night: "cloud.fill" },
  { codes: [45, 48], label: "Fog", day: "cloud.fog.fill", night: "cloud.fog.fill" },
  { codes: [51, 53, 55], label: "Drizzle", day: "cloud.drizzle.fill", night: "cloud.drizzle.fill" },
  { codes: [56, 57, 66, 67], label: "Freezing rain", day: "cloud.sleet.fill", night: "cloud.sleet.fill" },
  { codes: [61, 63], label: "Rain", day: "cloud.rain.fill", night: "cloud.rain.fill" },
  { codes: [65], label: "Heavy rain", day: "cloud.heavyrain.fill", night: "cloud.heavyrain.fill" },
  { codes: [71, 73, 75, 77], label: "Snow", day: "cloud.snow.fill", night: "cloud.snow.fill" },
  { codes: [80, 81, 82], label: "Showers", day: "cloud.heavyrain.fill", night: "cloud.heavyrain.fill" },
  { codes: [85, 86], label: "Snow showers", day: "cloud.snow.fill", night: "cloud.snow.fill" },
  { codes: [95, 96, 99], label: "Thunderstorm", day: "cloud.bolt.rain.fill", night: "cloud.bolt.rain.fill" },
];

function weatherType(code, isDay) {
  const type = WEATHER_TYPES.find((entry) => entry.codes.includes(code));
  if (!type) return { label: "Unknown", symbol: "questionmark.circle.fill" };
  return { label: type.label, symbol: isDay ? type.day : type.night };
}

// --- Data ---

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.libraryDirectory(), CACHE_FILE);
}

function saveCache(weather) {
  const cache = { savedAt: Date.now(), weather };
  FileManager.local().writeString(cachePath(), JSON.stringify(cache));
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

async function requestWeather() {
  const query = [
    `latitude=${CONFIG.latitude}`,
    `longitude=${CONFIG.longitude}`,
    "current=temperature_2m,weather_code,is_day",
    "daily=weather_code,temperature_2m_max,temperature_2m_min",
    `temperature_unit=${CONFIG.temperatureUnit}`,
    "timezone=auto",
    "forecast_days=6",
  ].join("&");

  const request = new Request(`https://api.open-meteo.com/v1/forecast?${query}`);
  request.timeoutInterval = 10;
  const weather = await request.loadJSON();

  if (!weather?.current || !weather?.daily?.time?.length) {
    throw new Error(weather?.reason ?? "Unexpected weather data.");
  }
  return weather;
}

// Returns fresh data if possible and the last saved data otherwise.
async function loadWeather() {
  try {
    const weather = await requestWeather();
    saveCache(weather);
    return { weather, savedAt: null };
  } catch (error) {
    const cache = readCache();
    if (cache?.weather) return { weather: cache.weather, savedAt: cache.savedAt };
    throw error;
  }
}

function dailyForecast(weather) {
  const { time, weather_code, temperature_2m_max, temperature_2m_min } = weather.daily;
  return time.map((day, index) => ({
    date: new Date(`${day}T12:00:00`),
    code: weather_code[index],
    high: temperature_2m_max[index],
    low: temperature_2m_min[index],
  }));
}

// --- Drawing helpers ---

function formatDate(date, pattern) {
  const formatter = new DateFormatter();
  formatter.dateFormat = pattern;
  return formatter.string(date);
}

function degrees(value) {
  return `${Math.round(value)}°`;
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
  const symbol = SFSymbol.named(name) ?? SFSymbol.named("cloud.fill");
  symbol.applyFont(Font.systemFont(size));
  const image = stack.addImage(symbol.image);
  image.imageSize = new Size(size, size);
  image.tintColor = color;
  image.resizable = true;
  return image;
}

// --- Layout ---

function addCurrentWeather(stack, weather, savedAt) {
  const { temperature_2m, weather_code, is_day } = weather.current;
  const today = dailyForecast(weather)[0];
  const type = weatherType(weather_code, is_day === 1);

  addLabel(stack, CONFIG.location, Font.semiboldSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, type.symbol, 32, COLORS.accent);
  stack.addSpacer(4);
  addLabel(stack, degrees(temperature_2m), Font.boldSystemFont(38), COLORS.primary);
  addLabel(stack, type.label, Font.mediumSystemFont(13), COLORS.primary);

  const details = savedAt
    ? `Offline · ${formatDate(new Date(savedAt), "HH:mm")}`
    : `H ${degrees(today.high)}  L ${degrees(today.low)}`;
  addLabel(stack, details, Font.systemFont(12), COLORS.secondary);
}

function addForecastDay(stack, day) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  addLabel(row, formatDate(day.date, "EEE"), Font.semiboldSystemFont(14), COLORS.primary);
  row.addSpacer();
  addSymbol(row, weatherType(day.code, true).symbol, 18, COLORS.accent);
  row.addSpacer();
  addLabel(row, degrees(day.high), Font.semiboldSystemFont(14), COLORS.primary);
  row.addSpacer(8);
  addLabel(row, degrees(day.low), Font.systemFont(14), COLORS.secondary);
}

function addForecast(stack, weather, dayCount) {
  const days = dailyForecast(weather).slice(1, dayCount + 1);
  stack.addSpacer();
  days.forEach((day) => {
    addForecastDay(stack, day);
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

function buildSmallWidget({ weather, savedAt }) {
  const widget = createWidget();
  addCurrentWeather(widget, weather, savedAt);
  return widget;
}

function buildMediumWidget({ weather, savedAt }) {
  const widget = createWidget();
  const columns = widget.addStack();
  columns.layoutHorizontally();

  const current = columns.addStack();
  current.layoutVertically();
  addCurrentWeather(current, weather, savedAt);

  columns.addSpacer(24);

  const forecast = columns.addStack();
  forecast.layoutVertically();
  addForecast(forecast, weather, 3);
  return widget;
}

function buildLargeWidget({ weather, savedAt }) {
  const widget = createWidget();
  const current = widget.addStack();
  current.layoutVertically();
  current.size = new Size(0, 150);
  addCurrentWeather(current, weather, savedAt);

  addForecast(widget, weather, 5);
  return widget;
}

function buildErrorWidget(error) {
  const widget = createWidget();
  addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.accent);
  widget.addSpacer(8);
  addLabel(widget, "Couldn't load the weather", Font.semiboldSystemFont(14), COLORS.primary);
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
    const data = await loadWeather();
    if (size === "medium") return buildMediumWidget(data);
    if (size === "large") return buildLargeWidget(data);
    return buildSmallWidget(data);
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
