// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: gift;

// Change these values to make the widget your own.
const CONFIG = {
  title: "Christmas",
  month: 12,
  day: 25,
  symbol: "gift.fill",
  todayMessage: "It's here!",
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
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const SATURDAY = 6;

// --- Data ---

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(start, end) {
  return Math.round((startOfDay(end) - startOfDay(start)) / MS_PER_DAY);
}

function nextTargetDate(today) {
  const thisYear = new Date(today.getFullYear(), CONFIG.month - 1, CONFIG.day);
  return thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, CONFIG.month - 1, CONFIG.day);
}

function countWeekends(today, dayCount) {
  let weekends = 0;
  for (let offset = 0; offset < dayCount; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    if (date.getDay() === SATURDAY) weekends++;
  }
  return weekends;
}

function percentOfYearPassed(today) {
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const nextYearStart = new Date(today.getFullYear() + 1, 0, 1);
  return Math.floor((daysBetween(yearStart, today) / daysBetween(yearStart, nextYearStart)) * 100);
}

function buildData() {
  const now = new Date();
  const today = startOfDay(now);
  const target = nextTargetDate(today);
  const days = daysBetween(today, target);

  return {
    value: days === 0 ? "Today" : String(days),
    caption: days === 0 ? CONFIG.todayMessage : `${days === 1 ? "day" : "days"} to go`,
    rows: [
      { label: "Date", value: formatDate(target, "EEE, MMM d") },
      { label: "Weeks", value: String(Math.floor(days / 7)) },
      { label: "Weekends", value: String(countWeekends(today, days)) },
      { label: "Hours", value: String(Math.max(0, Math.ceil((target - now) / MS_PER_HOUR))) },
      { label: "Year passed", value: `${percentOfYearPassed(today)}%` },
    ],
  };
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

function addMainContent(stack, data) {
  addLabel(stack, CONFIG.title, Font.boldRoundedSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, CONFIG.symbol, 30, COLORS.accent);
  stack.addSpacer(4);
  addLabel(stack, data.value, Font.boldRoundedSystemFont(42), COLORS.primary);
  addLabel(stack, data.caption, Font.boldRoundedSystemFont(12), COLORS.secondary);
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

function buildSmallWidget(data) {
  const widget = createWidget();
  addMainContent(widget, data);
  return widget;
}

function buildMediumWidget(data) {
  const widget = createWidget();
  const columns = widget.addStack();
  columns.layoutHorizontally();

  const main = columns.addStack();
  main.layoutVertically();
  addMainContent(main, data);

  columns.addSpacer(24);

  const details = columns.addStack();
  details.layoutVertically();
  addRows(details, data.rows.slice(0, ROW_COUNTS.medium));
  return widget;
}

function buildLargeWidget(data) {
  const widget = createWidget();
  const main = widget.addStack();
  main.layoutVertically();
  main.size = new Size(0, 150);
  addMainContent(main, data);

  addRows(widget, data.rows.slice(0, ROW_COUNTS.large));
  return widget;
}

function buildErrorWidget(error) {
  const widget = createWidget();
  addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.accent);
  widget.addSpacer(8);
  addLabel(widget, "Couldn't show the countdown", Font.boldRoundedSystemFont(14), COLORS.primary);
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

function buildWidget(size) {
  try {
    const data = buildData();
    if (size === "medium") return buildMediumWidget(data);
    if (size === "large") return buildLargeWidget(data);
    return buildSmallWidget(data);
  } catch (error) {
    return buildErrorWidget(error);
  }
}

const size = currentSize();
const widget = buildWidget(size);

Script.setWidget(widget);

if (!config.runsInWidget) {
  if (size === "medium") await widget.presentMedium();
  else if (size === "large") await widget.presentLarge();
  else await widget.presentSmall();
}

Script.complete();
