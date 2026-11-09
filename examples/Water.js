// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: tint;

const CONFIG = {
    title: "Water",
    locale: "en_US", // Language for dates and weekdays
    defaultGoal: 8, // Glasses per day when the widget's Parameter field is empty
    glassesPerTap: 1, // Glasses logged with each tap
    historyDays: 7, // Days shown in the large widget's chart
    keepDays: 60, // Days of history kept on the device
    refreshMinutes: 30,
    previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
};

const COLORS = {
    background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    secondary: Color.dynamic(new Color("#6E6E73"), new Color("#98989D")),
    accent: Color.dynamic(new Color("#007AFF"), new Color("#0A84FF")),
    done: Color.dynamic(new Color("#34C759"), new Color("#30D158")),
};

// Colors drawn into images can't switch between light and dark mode,
// so these are chosen to look right on both backgrounds.
const DRAW_COLORS = {
    track: new Color("#8E8E93", 0.25),
    progress: new Color("#0A84FF"),
    done: new Color("#30D158"),
    goalLine: new Color("#8E8E93", 0.6),
};

const CHART = { width: 284, height: 84 };

// --- Data ---

function dataPath() {
    const fm = FileManager.local();
    return fm.joinPath(fm.libraryDirectory(), `${Script.name()}-log.json`);
}

function dayKey(date) {
    const formatter = new DateFormatter();
    formatter.locale = "en_US_POSIX";
    formatter.dateFormat = "yyyy-MM-dd";
    return formatter.string(date);
}

function lastDays(count) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = [];
    for (let offset = count - 1; offset >= 0; offset--) {
        const day = new Date(today);
        day.setDate(today.getDate() - offset);
        days.push(day);
    }
    return days;
}

function readLog() {
    const fm = FileManager.local();
    const path = dataPath();
    if (!fm.fileExists(path)) return {};
    try {
        const log = JSON.parse(fm.readString(path));
        return log && typeof log === "object" && !Array.isArray(log) ? log : {};
    } catch {
        return {};
    }
}

function saveLog(log) {
    const keep = new Set(lastDays(CONFIG.keepDays).map(dayKey));
    const trimmed = {};
    Object.keys(log).forEach((key) => {
        if (keep.has(key)) trimmed[key] = log[key];
    });
    FileManager.local().writeString(dataPath(), JSON.stringify(trimmed));
}

function logGlasses(amount) {
    const log = readLog();
    const key = dayKey(new Date());
    log[key] = (Number(log[key]) || 0) + amount;
    saveLog(log);
}

function parsePositive(value) {
    const number = parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(number) && number > 0 ? number : null;
}

// The goal comes from the widget's Parameter field. When the widget is
// tapped, the goal travels along in the link so the app shows the same goal.
function readGoal() {
    const goal = parsePositive(args.widgetParameter) ?? parsePositive(args.queryParameters?.goal);
    return goal ? Math.min(goal, 99) : CONFIG.defaultGoal;
}

function loadData(goal) {
    const log = readLog();
    const days = lastDays(CONFIG.historyDays).map((date) => ({
        date,
        count: Number(log[dayKey(date)]) || 0,
    }));
    const count = days[days.length - 1].count;
    return {
        goal,
        count,
        remaining: Math.max(goal - count, 0),
        reached: count >= goal,
        days,
    };
}

function glassWord(count) {
    return count === 1 ? "glass" : "glasses";
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

function pointOnCircle(center, radius, fraction) {
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    return new Point(center + radius * Math.cos(angle), center + radius * Math.sin(angle));
}

function strokeArc(ctx, center, radius, to, color, lineWidth, roundCaps) {
    const steps = Math.max(Math.ceil(to * 120), 2);
    const path = new Path();
    for (let i = 0; i <= steps; i++) {
        const point = pointOnCircle(center, radius, to * (i / steps));
        if (i === 0) path.move(point);
        else path.addLine(point);
    }
    ctx.addPath(path);
    ctx.setStrokeColor(color);
    ctx.setLineWidth(lineWidth);
    ctx.strokePath();

    if (roundCaps) {
        ctx.setFillColor(color);
        [0, to].forEach((fraction) => {
            const point = pointOnCircle(center, radius, fraction);
            ctx.fillEllipse(new Rect(point.x - lineWidth / 2, point.y - lineWidth / 2, lineWidth, lineWidth));
        });
    }
}

function drawRing(progress, color) {
    const size = 120;
    const lineWidth = 14;
    const ctx = new DrawContext();
    ctx.size = new Size(size, size);
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    const center = size / 2;
    const radius = (size - lineWidth) / 2;
    strokeArc(ctx, center, radius, 1, DRAW_COLORS.track, lineWidth, false);
    if (progress > 0) strokeArc(ctx, center, radius, Math.min(progress, 1), color, lineWidth, true);
    return ctx.getImage();
}

function drawChart(data) {
    const ctx = new DrawContext();
    ctx.size = new Size(CHART.width, CHART.height);
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    const maxValue = Math.max(data.goal, ...data.days.map((day) => day.count), 1);
    const slot = CHART.width / data.days.length;
    const barWidth = Math.min(slot * 0.5, 22);
    const usable = CHART.height - 4;

    // Dashed goal line behind the bars
    const goalY = CHART.height - (data.goal / maxValue) * usable;
    ctx.setFillColor(DRAW_COLORS.goalLine);
    for (let x = 0; x < CHART.width; x += 8) {
        ctx.fillRect(new Rect(x, goalY - 0.5, 4, 1));
    }

    data.days.forEach((day, index) => {
        const x = index * slot + (slot - barWidth) / 2;
        const height = Math.max((day.count / maxValue) * usable, 4);
        const y = CHART.height - height;
        let color = DRAW_COLORS.progress;
        if (day.count === 0) color = DRAW_COLORS.track;
        else if (day.count >= data.goal) color = DRAW_COLORS.done;
        ctx.setFillColor(color);

        if (height >= barWidth) {
            ctx.fillEllipse(new Rect(x, y, barWidth, barWidth));
            ctx.fillRect(new Rect(x, y + barWidth / 2, barWidth, height - barWidth / 2));
        } else {
            ctx.fillRect(new Rect(x, y, barWidth, height));
        }
    });
    return ctx.getImage();
}

// --- Layout ---

function addRing(stack, data, size) {
    const ring = stack.addStack();
    ring.size = new Size(size, size);
    ring.backgroundImage = drawRing(data.count / data.goal, data.reached ? DRAW_COLORS.done : DRAW_COLORS.progress);
    ring.layoutHorizontally();
    ring.centerAlignContent();
    ring.addSpacer();
    addSymbol(ring, data.reached ? "checkmark" : "drop.fill", Math.round(size * 0.34), data.reached ? COLORS.done : COLORS.accent);
    ring.addSpacer();
}

function addMainContent(stack, data, note) {
    const top = stack.addStack();
    top.layoutHorizontally();
    top.topAlignContent();
    addRing(top, data, 58);
    top.addSpacer();
    addLabel(top, CONFIG.title, Font.semiboldSystemFont(15), data.reached ? COLORS.done : COLORS.accent);

    stack.addSpacer();
    addLabel(stack, `${data.count} of ${data.goal}`, Font.boldRoundedSystemFont(30), COLORS.primary);
    const caption = note ?? (data.reached ? "Goal reached" : `${glassWord(data.goal)} today`);
    addLabel(stack, caption, Font.systemFont(12), note ? COLORS.accent : COLORS.secondary);
}

function addDrops(stack, data) {
    if (data.goal > 12) return;
    const perRow = data.goal <= 8 ? data.goal : Math.ceil(data.goal / 2);
    for (let start = 0; start < data.goal; start += perRow) {
        const row = stack.addStack();
        row.layoutHorizontally();
        row.spacing = 5;
        for (let i = start; i < Math.min(start + perRow, data.goal); i++) {
            const filled = i < data.count;
            const color = filled ? (data.reached ? COLORS.done : COLORS.accent) : COLORS.secondary;
            addSymbol(row, filled ? "drop.fill" : "drop", 14, color);
        }
        stack.addSpacer(4);
    }
}

function addRemaining(stack, data) {
    addLabel(stack, "Remaining", Font.systemFont(12), COLORS.secondary);
    stack.addSpacer(2);
    const value = data.reached ? "None – well done" : `${data.remaining} ${glassWord(data.remaining)}`;
    addLabel(stack, value, Font.semiboldSystemFont(15), data.reached ? COLORS.done : COLORS.primary);
    stack.addSpacer(8);
    addDrops(stack, data);
    stack.addSpacer();
    addLabel(stack, "Tap to log a glass", Font.systemFont(12), COLORS.secondary);
}

function addColumns(stack, data, note) {
    const columns = stack.addStack();
    columns.layoutHorizontally();

    const main = columns.addStack();
    main.layoutVertically();
    main.size = new Size(124, 0);
    addMainContent(main, data, note);

    columns.addSpacer(16);

    const details = columns.addStack();
    details.layoutVertically();
    addRemaining(details, data);
    return columns;
}

function addCenteredRow(stack, texts, font, color) {
    const row = stack.addStack();
    row.layoutHorizontally();
    const slot = CHART.width / texts.length;
    texts.forEach((text) => {
        const cell = row.addStack();
        cell.size = new Size(slot, 0);
        cell.layoutHorizontally();
        cell.addSpacer();
        addLabel(cell, text, font, color);
        cell.addSpacer();
    });
}

function addWeekChart(stack, data) {
    const header = stack.addStack();
    header.layoutHorizontally();
    header.bottomAlignContent();
    addLabel(header, "Last 7 days", Font.semiboldSystemFont(15), COLORS.primary);
    header.addSpacer();
    const total = data.days.reduce((sum, day) => sum + day.count, 0);
    const onGoal = data.days.filter((day) => day.count >= data.goal).length;
    addLabel(header, `Avg ${(total / data.days.length).toFixed(1)} · ${onGoal} of ${data.days.length} on goal`, Font.systemFont(12), COLORS.secondary);

    stack.addSpacer(8);
    const chart = stack.addImage(drawChart(data));
    chart.imageSize = new Size(CHART.width, CHART.height);
    stack.addSpacer(4);

    addCenteredRow(stack, data.days.map((day) => String(day.count)), Font.semiboldSystemFont(12), COLORS.primary);
    const labels = data.days.map((day, index) => (index === data.days.length - 1 ? "Today" : formatDate(day.date, "EEE")));
    addCenteredRow(stack, labels, Font.systemFont(12), COLORS.secondary);
}

function nextRefresh() {
    const now = Date.now();
    const soon = now + CONFIG.refreshMinutes * 60 * 1000;
    const midnight = new Date();
    midnight.setHours(24, 0, 30, 0);
    return new Date(Math.max(Math.min(soon, midnight.getTime()), now + 15 * 60 * 1000));
}

function createWidget(goal) {
    const widget = new ListWidget();
    widget.backgroundColor = COLORS.background;
    widget.setPadding(14, 16, 14, 16);
    widget.refreshAfterDate = nextRefresh();
    widget.url = `${URLScheme.forRunningScript()}?add=${CONFIG.glassesPerTap}&goal=${goal}`;
    return widget;
}

function buildSmallWidget(data, note) {
    const widget = createWidget(data.goal);
    addMainContent(widget, data, note);
    return widget;
}

function buildMediumWidget(data, note) {
    const widget = createWidget(data.goal);
    addColumns(widget, data, note);
    return widget;
}

function buildLargeWidget(data, note) {
    const widget = createWidget(data.goal);
    const top = addColumns(widget, data, note);
    top.size = new Size(0, 124);
    widget.addSpacer(14);
    addWeekChart(widget, data);
    widget.addSpacer();
    return widget;
}

function buildErrorWidget(error, goal) {
    const widget = createWidget(goal);
    addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.accent);
    widget.addSpacer(8);
    addLabel(widget, "Couldn't load your water log", Font.semiboldSystemFont(15), COLORS.primary);
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

function handleTap() {
    const added = parsePositive(args.queryParameters?.add);
    if (!added) return null;
    const amount = Math.min(added, 10);
    logGlasses(amount);
    return `+${amount} ${glassWord(amount)} logged`;
}

function buildWidget(size, goal, note) {
    try {
        const data = loadData(goal);
        if (size === "medium") return buildMediumWidget(data, note);
        if (size === "large") return buildLargeWidget(data, note);
        return buildSmallWidget(data, note);
    } catch (error) {
        return buildErrorWidget(error, goal);
    }
}

const goal = readGoal();
let note = null;
try {
    note = handleTap();
} catch {
    note = "Couldn't save this glass";
}

const size = currentSize();
const widget = buildWidget(size, goal, note);

Script.setWidget(widget);

if (!config.runsInWidget) {
    if (size === "medium") await widget.presentMedium();
    else if (size === "large") await widget.presentLarge();
    else await widget.presentSmall();
}

Script.complete();