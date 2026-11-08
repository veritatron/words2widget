// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: heart;

// Change these values to make the widget your own.
// You can also enter a birth date in the widget's Parameter field, for example 1990-06-15.
const CONFIG = {
  title: "Days Alive",
  birthDate: "2000-01-01",
  refreshMinutes: 360,
  previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
  background: Color.dynamic(new Color("#2F54EB"), new Color("#1D39C4")),
  primary: new Color("#FFFFFF"),
  secondary: new Color("#D6E0FF"),
  accent: new Color("#FFD666"),
};

const ROW_COUNTS = { medium: 3, large: 6 };
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DAYS_PER_WEEK = 7;
const HEARTBEATS_PER_DAY = 100800;
const BIRTH_DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

// --- Data ---

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(start, end) {
  return Math.round((startOfDay(end) - startOfDay(start)) / MS_PER_DAY);
}

function readBirthDate(today) {
  const text = (args.widgetParameter || CONFIG.birthDate).trim();
  const match = text.match(BIRTH_DATE_FORMAT);
  if (!match) throw new Error("Enter your birth date as YYYY-MM-DD.");

  const birthDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (birthDate > today) throw new Error("The birth date is in the future.");
  return birthDate;
}

function hadBirthdayThisYear(birthDate, today) {
  return new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) <= today;
}

function fullYears(birthDate, today) {
  const years = today.getFullYear() - birthDate.getFullYear();
  return hadBirthdayThisYear(birthDate, today) ? years : years - 1;
}

function fullMonths(birthDate, today) {
  const months = (today.getFullYear() - birthDate.getFullYear()) * 12 + today.getMonth() - birthDate.getMonth();
  return today.getDate() < birthDate.getDate() ? months - 1 : months;
}

function daysUntilBirthday(birthDate, today) {
  const birthdayIn = (year) => new Date(year, birthDate.getMonth(), birthDate.getDate());
  const thisYear = birthdayIn(today.getFullYear());
  return daysBetween(today, thisYear >= today ? thisYear : birthdayIn(today.getFullYear() + 1));
}

function formatBirthdayCountdown(days) {
  if (days === 0) return "Today!";
  return days === 1 ? "1 day" : `${days} days`;
}

function formatNumber(number) {
  return String(number).replace(/\B(?=(\d{3})+$)/g, ",");
}

function buildData() {
  const now = new Date();
  const today = startOfDay(now);
  const birthDate = readBirthDate(today);
  const days = daysBetween(birthDate, today);

  return {
    value: formatNumber(days),
    caption: "days so far",
    rows: [
      { label: "Years", value: formatNumber(fullYears(birthDate, today)) },
      { label: "Next birthday", value: formatBirthdayCountdown(daysUntilBirthday(birthDate, today)) },
      { label: "Weeks", value: formatNumber(Math.floor(days / DAYS_PER_WEEK)) },
      { label: "Months", value: formatNumber(fullMonths(birthDate, today)) },
      { label: "Hours", value: formatNumber(Math.floor((now - birthDate) / MS_PER_HOUR)) },
      { label: "Heartbeats", value: `~${formatNumber(days * HEARTBEATS_PER_DAY)}` },
    ],
  };
}

// --- Drawing helpers ---

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
  addLabel(stack, CONFIG.title, Font.boldSystemFont(14), COLORS.primary);
  stack.addSpacer();
  addSymbol(stack, "heart.fill", 28, COLORS.accent);
  stack.addSpacer(4);
  addLabel(stack, data.value, Font.boldSystemFont(36), COLORS.primary);
  addLabel(stack, data.caption, Font.boldSystemFont(12), COLORS.secondary);
}

function addRow(stack, row) {
  const line = stack.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  addLabel(line, row.label, Font.boldSystemFont(14), COLORS.primary);
  line.addSpacer();
  addLabel(line, row.value, Font.boldSystemFont(14), COLORS.secondary);
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
  addLabel(widget, "Couldn't count your days", Font.boldSystemFont(14), COLORS.primary);
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
