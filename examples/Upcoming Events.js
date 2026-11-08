// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: calendar-alt;

// Change these values to make the widget your own.
const CONFIG = {
  title: "Upcoming",
  daysAhead: 14,
  emptyMessage: "Nothing planned",
  todayLabel: "Today",
  allDayLabel: "All day",
  locale: "en_US", // Language for dates and weekdays
  refreshMinutes: 15,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: Color.dynamic(new Color("#FFFFFF"), new Color("#000000")),
  primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
  secondary: Color.dynamic(new Color("#6E6E73"), new Color("#98989D")),
  accent: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
};

const ROW_COUNTS = { medium: 3, large: 6 };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Data ---

async function requestEvents() {
  const now = new Date();
  const end = new Date(now.getTime() + CONFIG.daysAhead * MS_PER_DAY);
  const events = await CalendarEvent.between(now, end, []);

  return events
    .filter((event) => event.endDate > now)
    .sort((first, second) => first.startDate - second.startDate);
}

function isToday(date) {
  return date.toDateString() === new Date().toDateString();
}

function formatEventTime(event) {
  const day = isToday(event.startDate) ? CONFIG.todayLabel : formatDate(event.startDate, "EEE");
  const time = event.isAllDay ? CONFIG.allDayLabel : formatDate(event.startDate, "HH:mm");
  return `${day} · ${time}`;
}

async function loadData() {
  const [nextEvent, ...laterEvents] = await requestEvents();
  return {
    value: nextEvent?.title ?? CONFIG.emptyMessage,
    caption: nextEvent ? formatEventTime(nextEvent) : "",
    rows: laterEvents.map((event) => ({ label: event.title, value: formatEventTime(event) })),
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
  addLabel(stack, CONFIG.title, Font.lightSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, "calendar", 24, COLORS.accent);
  stack.addSpacer(6);
  const title = addLabel(stack, data.value, Font.lightSystemFont(22), COLORS.primary);
  title.lineLimit = 2;
  addLabel(stack, data.caption, Font.lightSystemFont(12), COLORS.secondary);
}

function addRow(stack, row) {
  const line = stack.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  addLabel(line, row.label, Font.lightSystemFont(14), COLORS.primary);
  line.addSpacer();
  addLabel(line, row.value, Font.lightSystemFont(12), COLORS.secondary);
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

  columns.addSpacer(16);

  const details = columns.addStack();
  details.layoutVertically();
  addRows(details, data.rows.slice(0, ROW_COUNTS.medium));
  return widget;
}

function buildLargeWidget(data) {
  const widget = createWidget();
  const main = widget.addStack();
  main.layoutVertically();
  main.size = new Size(0, 130);
  addMainContent(main, data);

  addRows(widget, data.rows.slice(0, ROW_COUNTS.large));
  return widget;
}

function buildErrorWidget() {
  const widget = createWidget();
  addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.accent);
  widget.addSpacer(8);
  addLabel(widget, "Couldn't read your calendar", Font.lightSystemFont(14), COLORS.primary);
  widget.addSpacer(4);
  const hint = "Run this script once in Scriptable and allow calendar access.";
  const message = addLabel(widget, hint, Font.lightSystemFont(12), COLORS.secondary);
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
    const data = await loadData();
    if (size === "medium") return buildMediumWidget(data);
    if (size === "large") return buildLargeWidget(data);
    return buildSmallWidget(data);
  } catch {
    return buildErrorWidget();
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
