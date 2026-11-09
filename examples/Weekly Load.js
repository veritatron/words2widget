// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: calendar-alt;

const CONFIG = {
    title: "Weekly Load",
    locale: "en_US", // Language for dates and weekdays
    refreshMinutes: 30,
    previewSize: "large", // Size shown when run in the app: "small", "medium" or "large"
    weekStartsOn: 1, // 1 = Monday, 0 = Sunday (should match your iPhone's calendar)
    minScaleHours: 8, // Bars are scaled to at least this many hours per day
    openUrl: "calshow://", // Tapping the widget opens the Calendar app
};

const COLORS = {
    background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    secondary: Color.dynamic(new Color("#8E8E93"), new Color("#8E8E93")),
    accent: Color.dynamic(new Color("#007AFF"), new Color("#0A84FF")),
};

// Colors inside the drawn chart work on both light and dark backgrounds.
const CHART_COLORS = {
    today: new Color("#0A84FF"),
    bar: new Color("#8E8E93", 0.55),
    track: new Color("#8E8E93", 0.14),
    label: new Color("#8E8E93"),
};

const CHART_SIZES = {
    small: new Size(130, 54),
    medium: new Size(140, 60),
    large: new Size(306, 84),
};

// --- Data ---

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function weekStart(date) {
    const d = startOfDay(date);
    const diff = (d.getDay() - CONFIG.weekStartsOn + 7) % 7;
    return addDays(d, -diff);
}

// Sums the booked time within one day, counting overlapping events only once.
function bookedHours(events, dayStart, dayEnd) {
    const from = dayStart.getTime();
    const to = dayEnd.getTime();
    const intervals = events
        .map((event) => [Math.max(event.startDate.getTime(), from), Math.min(event.endDate.getTime(), to)])
        .filter(([start, end]) => end > start)
        .sort((a, b) => a[0] - b[0]);

    let total = 0;
    let currentStart = null;
    let currentEnd = null;
    for (const [start, end] of intervals) {
        if (currentEnd === null || start > currentEnd) {
            if (currentEnd !== null) total += currentEnd - currentStart;
            currentStart = start;
            currentEnd = end;
        } else {
            currentEnd = Math.max(currentEnd, end);
        }
    }
    if (currentEnd !== null) total += currentEnd - currentStart;
    return total / 3600000;
}

function buildWeek(events, start, today) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const dayStart = addDays(start, i);
        const dayEnd = addDays(start, i + 1);
        days.push({
            date: dayStart,
            hours: bookedHours(events, dayStart, dayEnd),
            isToday: dayStart.getTime() === today.getTime(),
        });
    }
    const total = days.reduce((sum, day) => sum + day.hours, 0);
    const busiest = total > 0 ? days.reduce((best, day) => (day.hours > best.hours ? day : best), days[0]) : null;
    return { days, total, busiest };
}

async function loadData() {
    const [thisWeek, nextWeek] = await Promise.all([
        CalendarEvent.thisWeek([]),
        CalendarEvent.nextWeek([]),
    ]);
    const events = [...thisWeek, ...nextWeek].filter((event) => !event.isAllDay);

    const today = startOfDay(new Date());
    const start = weekStart(today);
    const current = buildWeek(events, start, today);
    const next = buildWeek(events, addDays(start, 7), today);

    const scale = Math.max(
        CONFIG.minScaleHours,
        ...current.days.map((day) => day.hours),
        ...next.days.map((day) => day.hours)
    );
    return { current, next, scale };
}

// --- Drawing helpers ---

function formatDate(date, pattern) {
    const formatter = new DateFormatter();
    formatter.locale = CONFIG.locale;
    formatter.dateFormat = pattern;
    return formatter.string(date);
}

function formatHours(hours) {
    const rounded = Math.round(hours * 10) / 10;
    const text = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return `${text} h`;
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

function drawBar(ctx, rect, radius, color) {
    const path = new Path();
    path.addRoundedRect(rect, radius, radius);
    ctx.addPath(path);
    ctx.setFillColor(color);
    ctx.fillPath();
}

function drawChart(week, scale, size, labelPattern, labelSize) {
    const ctx = new DrawContext();
    ctx.size = size;
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    const labelHeight = labelSize + 4;
    const chartHeight = size.height - labelHeight - 4;
    const slot = size.width / 7;
    const barWidth = Math.min(slot * 0.55, 20);
    const radius = barWidth / 2;

    ctx.setFont(Font.semiboldSystemFont(labelSize));
    ctx.setTextAlignedCenter();

    week.days.forEach((day, i) => {
        const x = i * slot + (slot - barWidth) / 2;
        drawBar(ctx, new Rect(x, 0, barWidth, chartHeight), radius, CHART_COLORS.track);

        if (day.hours > 0) {
            const height = Math.max(4, Math.min(chartHeight, (chartHeight * day.hours) / scale));
            drawBar(
                ctx,
                new Rect(x, chartHeight - height, barWidth, height),
                Math.min(radius, height / 2),
                day.isToday ? CHART_COLORS.today : CHART_COLORS.bar
            );
        }

        ctx.setTextColor(day.isToday ? CHART_COLORS.today : CHART_COLORS.label);
        ctx.drawTextInRect(formatDate(day.date, labelPattern), new Rect(i * slot, chartHeight + 4, slot, labelHeight));
    });

    return ctx.getImage();
}

function addChart(stack, week, scale, size, labelPattern, labelSize) {
    const image = stack.addImage(drawChart(week, scale, size, labelPattern, labelSize));
    image.imageSize = size;
    return image;
}

function busiestText(week) {
    if (!week.busiest) return "Nothing booked";
    return `Busiest: ${formatDate(week.busiest.date, "EEEE")} · ${formatHours(week.busiest.hours)}`;
}

// --- Layout ---

function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = COLORS.background;
    widget.setPadding(14, 14, 14, 14);
    widget.url = CONFIG.openUrl;
    widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);
    return widget;
}

function addWeekColumn(stack, label, week, scale, isCurrent, chartSize) {
    addLabel(stack, label, Font.semiboldSystemFont(13), COLORS.secondary);
    stack.addSpacer(2);
    const number = isCurrent ? Font.boldRoundedSystemFont(34) : Font.semiboldSystemFont(22);
    addLabel(stack, formatHours(week.total), number, COLORS.primary);
    stack.addSpacer();
    addChart(stack, week, scale, chartSize, "EEEEE", 10);
}

function buildSmallWidget(data) {
    const widget = createWidget();
    addWeekColumn(widget, "This Week", data.current, data.scale, true, CHART_SIZES.small);
    return widget;
}

function buildMediumWidget(data) {
    const widget = createWidget();
    const columns = widget.addStack();
    columns.layoutHorizontally();

    const left = columns.addStack();
    left.layoutVertically();
    addWeekColumn(left, "This Week", data.current, data.scale, true, CHART_SIZES.medium);

    columns.addSpacer();

    const right = columns.addStack();
    right.layoutVertically();
    addWeekColumn(right, "Next Week", data.next, data.scale, false, CHART_SIZES.medium);
    return widget;
}

function addLargeSection(widget, label, week, scale, isCurrent) {
    const header = widget.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();
    addLabel(header, label, Font.semiboldSystemFont(13), isCurrent ? COLORS.accent : COLORS.secondary);
    header.addSpacer(8);
    header.addSpacer();
    addLabel(header, busiestText(week), Font.systemFont(13), COLORS.secondary);

    widget.addSpacer(2);
    const number = isCurrent ? Font.boldRoundedSystemFont(34) : Font.semiboldSystemFont(22);
    addLabel(widget, formatHours(week.total), number, COLORS.primary);
    widget.addSpacer(6);
    addChart(widget, week, scale, CHART_SIZES.large, "EEE", 11);
}

function buildLargeWidget(data) {
    const widget = createWidget();
    addLargeSection(widget, "This Week", data.current, data.scale, true);
    widget.addSpacer();
    addLargeSection(widget, "Next Week", data.next, data.scale, false);
    return widget;
}

function buildErrorWidget(error) {
    const widget = createWidget();
    addSymbol(widget, "calendar.badge.exclamationmark", 26, COLORS.accent);
    widget.addSpacer(8);
    addLabel(widget, "Couldn't read your calendar", Font.semiboldSystemFont(14), COLORS.primary);
    widget.addSpacer(4);
    const message = addLabel(
        widget,
        `Run this script once in Scriptable to allow calendar access. (${error.message})`,
        Font.systemFont(12),
        COLORS.secondary
    );
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