# Train Commute

> **Which train should I take, and is it on time?**

Shows your next connections with live delays.

<img src="Train%20Commute.png" alt="Train Commute widget" width="480">

[Back to all widgets](../README.md#make-the-widget-you-always-wanted)

## Get this widget

Do this on your iPhone. You need [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) and the [Widget Installer](../INSTALLER.md).

1. Tap the copy button on the code block below.
2. Open Scriptable, run **Widget Installer** and tap **Save**.
3. Touch and hold the home screen, tap **Edit**, then **Add Widget**, and choose **Scriptable**.
4. Tap the new widget and choose **Train Commute** as the script.

**Parameter:** Your route as start `>` destination, for example `Köln Hbf > Düsseldorf Hbf`. To set it, touch and hold the widget and tap **Edit Widget**.

Timetable data comes from [Transitous](https://transitous.org) and [its data sources](https://transitous.org/sources/), including OpenStreetMap. The service is free and offered on a best-effort basis.

## Code

````javascript
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: train;

// Connection data by Transitous (https://transitous.org), based on MOTIS.
// Data sources and licenses: https://transitous.org/sources/

const CONFIG = {
    title: "Train Commute",
    locale: "en_US", // Language for dates and weekdays
    refreshMinutes: 30, // Never asks Transitous more often than this
    previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
    previewRoute: "Köln Hbf > Düsseldorf Hbf", // Only used when running in the app
    userAgent: "words2widget/1.0 (https://github.com/veritatron/words2widget)",
    geocodeUrl: "https://api.transitous.org/api/v1/geocode",
    planUrl: "https://api.transitous.org/api/v5/plan",
    connectionsToLoad: { small: 3, medium: 3, large: 6 },
    rowCounts: { medium: 3, large: 6 },
    onTimeToleranceMinutes: 0, // Delays up to this many minutes count as on time
};

const COLORS = {
    background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    secondary: Color.dynamic(new Color("#8E8E93"), new Color("#98989D")),
    fill: Color.dynamic(new Color("#F2F2F7"), new Color("#2C2C2E")),
    accent: Color.dynamic(new Color("#007AFF"), new Color("#0A84FF")),
    onTime: Color.dynamic(new Color("#34C759"), new Color("#30D158")),
    late: Color.dynamic(new Color("#FF9500"), new Color("#FF9F0A")),
};

const NON_TRANSIT_MODES = ["WALK", "BIKE", "CAR", "RENTAL", "CAR_PARKING", "CAR_DROPOFF", "ODM", "FLEX"];

// --- Route ---

function readRoute() {
    const fallback = config.runsInWidget ? "" : CONFIG.previewRoute;
    const raw = (args.widgetParameter ?? fallback ?? "").trim();
    const parts = raw.split(/\s*(?:>|→)\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) return null;
    return { from: parts[0], to: parts[1], key: `${parts[0]}>${parts[1]}`.toLowerCase() };
}

// --- Files ---

function filePath(name) {
    const fm = FileManager.local();
    return fm.joinPath(fm.libraryDirectory(), `${Script.name()}-${name}.json`);
}

function readJSON(name) {
    const fm = FileManager.local();
    const path = filePath(name);
    if (!fm.fileExists(path)) return null;
    try {
        return JSON.parse(fm.readString(path));
    } catch {
        return null;
    }
}

function writeJSON(name, value) {
    FileManager.local().writeString(filePath(name), JSON.stringify(value));
}

// --- Data ---

async function requestJSON(url) {
    const request = new Request(url);
    request.headers = { "User-Agent": CONFIG.userAgent, Accept: "application/json" };
    request.timeoutInterval = 15;
    const json = await request.loadJSON();
    const status = request.response?.statusCode;
    if (status && status >= 400) {
        throw new Error(json?.error ?? `Transitous answered with status ${status}.`);
    }
    return json;
}

// Looks a station up once and keeps its coordinates.
async function resolveStation(name) {
    const stations = readJSON("stations") ?? {};
    const key = name.toLowerCase();
    if (stations[key]) return stations[key];

    const results = await requestJSON(`${CONFIG.geocodeUrl}?text=${encodeURIComponent(name)}`);
    if (!Array.isArray(results) || results.length === 0) {
        throw new Error(`Station not found: ${name}`);
    }
    const match = results.find((result) => result.type === "STOP") ?? results[0];
    if (typeof match.lat !== "number" || typeof match.lon !== "number") {
        throw new Error(`No coordinates found for ${name}.`);
    }
    const station = { name: match.name ?? name, lat: match.lat, lon: match.lon };
    stations[key] = station;
    writeJSON("stations", stations);
    return station;
}

function isTransit(leg) {
    return leg?.mode && !NON_TRANSIT_MODES.includes(leg.mode);
}

function lineName(leg) {
    return leg.routeShortName || leg.displayName || leg.tripShortName || leg.routeLongName || leg.mode;
}

function toConnection(itinerary) {
    const legs = (itinerary.legs ?? []).filter(isTransit);
    if (legs.length === 0) return null;
    const first = legs[0];
    const last = legs[legs.length - 1];
    return {
        line: lineName(first),
        depart: first.startTime,
        scheduledDepart: first.scheduledStartTime ?? first.startTime,
        arrive: last.endTime,
        transfers: itinerary.transfers ?? Math.max(0, legs.length - 1),
        realTime: first.realTime === true,
        cancelled: legs.some((leg) => leg.cancelled === true),
    };
}

async function requestConnections(route, count) {
    const from = await resolveStation(route.from);
    const to = await resolveStation(route.to);
    const url =
        `${CONFIG.planUrl}?fromPlace=${from.lat},${from.lon}` +
        `&toPlace=${to.lat},${to.lon}&numItineraries=${count}`;
    const response = await requestJSON(url);
    if (!Array.isArray(response?.itineraries)) {
        throw new Error(response?.error ?? "Unexpected data from Transitous.");
    }
    const connections = response.itineraries.map(toConnection).filter(Boolean);
    return { from: from.name, to: to.name, connections };
}

function upcoming(connections) {
    const now = Date.now() - 30 * 1000;
    return (connections ?? [])
        .filter((connection) => new Date(connection.depart).getTime() >= now)
        .sort((a, b) => new Date(a.depart) - new Date(b.depart));
}

// Uses saved data if it is recent, loads new data otherwise, and falls back to the cache offline.
async function loadData(route, count) {
    const cache = readJSON("connections");
    const sameRoute = cache?.routeKey === route.key && cache?.data;
    const now = Date.now();

    if (
        sameRoute &&
        cache.count >= count &&
        now - cache.savedAt < CONFIG.refreshMinutes * 60 * 1000 &&
        upcoming(cache.data.connections).length > 0
    ) {
        return { data: cache.data, savedAt: null };
    }

    try {
        const data = await requestConnections(route, count);
        writeJSON("connections", { routeKey: route.key, count, savedAt: now, data });
        return { data, savedAt: null };
    } catch (error) {
        if (sameRoute) return { data: cache.data, savedAt: cache.savedAt };
        throw error;
    }
}

// --- Status ---

function delayMinutes(connection) {
    return Math.round((new Date(connection.depart) - new Date(connection.scheduledDepart)) / 60000);
}

function statusOf(connection) {
    if (connection.cancelled) {
        return { text: "Cancelled", short: "cancelled", color: COLORS.late, timeColor: COLORS.late };
    }
    if (!connection.realTime) {
        return { text: "No live data", short: null, color: COLORS.secondary, timeColor: COLORS.primary };
    }
    const delay = delayMinutes(connection);
    if (delay <= CONFIG.onTimeToleranceMinutes) {
        return { text: "On time", short: null, color: COLORS.onTime, timeColor: COLORS.onTime };
    }
    return {
        text: `+${delay} min · planned ${formatTime(connection.scheduledDepart)}`,
        short: `+${delay}`,
        color: COLORS.late,
        timeColor: COLORS.late,
    };
}

function transferText(count) {
    if (count === 0) return "Direct";
    return count === 1 ? "1 transfer" : `${count} transfers`;
}

// --- Drawing helpers ---

function formatDate(date, pattern) {
    const formatter = new DateFormatter();
    formatter.locale = CONFIG.locale;
    formatter.dateFormat = pattern;
    return formatter.string(date);
}

function formatTime(value) {
    return formatDate(new Date(value), "HH:mm");
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

function addBadge(stack, text) {
    const badge = stack.addStack();
    badge.backgroundColor = COLORS.fill;
    badge.cornerRadius = 5;
    badge.setPadding(2, 6, 2, 6);
    addLabel(badge, text, Font.semiboldSystemFont(12), COLORS.primary);
}

// --- Layout ---

function addMainContent(stack, { data, savedAt }) {
    const next = upcoming(data.connections)[0];

    const header = stack.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();
    addSymbol(header, "tram.fill", 12, COLORS.secondary);
    header.addSpacer(4);
    addLabel(header, `To ${data.to}`, Font.semiboldSystemFont(12), COLORS.secondary);

    stack.addSpacer();

    if (!next) {
        addLabel(stack, "No trains", Font.semiboldSystemFont(15), COLORS.primary);
        stack.addSpacer(2);
        const hint = addLabel(stack, "No upcoming connections found.", Font.systemFont(12), COLORS.secondary);
        hint.lineLimit = 2;
        return;
    }

    const status = statusOf(next);
    addLabel(stack, formatTime(next.depart), Font.boldSystemFont(36), COLORS.primary);
    stack.addSpacer(2);

    const lineRow = stack.addStack();
    lineRow.layoutHorizontally();
    lineRow.centerAlignContent();
    addBadge(lineRow, next.line);
    lineRow.addSpacer(6);
    if (savedAt) {
        addLabel(lineRow, `Offline · ${formatTime(savedAt)}`, Font.systemFont(12), COLORS.secondary);
    } else {
        const relative = lineRow.addDate(new Date(next.depart));
        relative.applyRelativeStyle();
        relative.font = Font.systemFont(12);
        relative.textColor = COLORS.secondary;
        relative.lineLimit = 1;
        relative.minimumScaleFactor = 0.6;
    }

    stack.addSpacer(4);
    addLabel(stack, status.text, Font.semiboldSystemFont(12), status.color);
}

function addConnectionRow(stack, connection, compact) {
    const status = statusOf(connection);
    const row = stack.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    addLabel(row, formatTime(connection.depart), Font.semiboldSystemFont(15), status.timeColor);
    if (status.short) {
        row.addSpacer(3);
        addLabel(row, status.short, Font.semiboldSystemFont(12), status.color);
    }
    row.addSpacer(8);
    addBadge(row, connection.line);
    row.addSpacer();

    if (compact) {
        if (connection.transfers > 0) {
            addSymbol(row, "arrow.triangle.swap", 10, COLORS.secondary);
            row.addSpacer(2);
            addLabel(row, `${connection.transfers}`, Font.systemFont(12), COLORS.secondary);
            row.addSpacer(6);
        }
    } else {
        addLabel(row, transferText(connection.transfers), Font.systemFont(12), COLORS.secondary);
        row.addSpacer(10);
    }
    addLabel(row, `→ ${formatTime(connection.arrive)}`, Font.systemFont(12), COLORS.secondary);
}

function addRows(stack, connections, compact) {
    stack.addSpacer();
    connections.forEach((connection) => {
        addConnectionRow(stack, connection, compact);
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
    main.size = new Size(125, 0);
    addMainContent(main, result);

    columns.addSpacer(16);

    const details = columns.addStack();
    details.layoutVertically();
    addRows(details, upcoming(result.data.connections).slice(0, CONFIG.rowCounts.medium), true);
    return widget;
}

function buildLargeWidget(result) {
    const widget = createWidget();
    const main = widget.addStack();
    main.layoutVertically();
    main.size = new Size(0, 130);
    addMainContent(main, result);

    const list = upcoming(result.data.connections).slice(0, CONFIG.rowCounts.large);
    if (list.length > 0) {
        widget.addSpacer(12);
        addLabel(widget, `From ${result.data.from}`, Font.semiboldSystemFont(12), COLORS.secondary);
        addRows(widget, list, false);
    } else {
        widget.addSpacer();
    }
    return widget;
}

function buildSetupWidget() {
    const widget = createWidget();
    addSymbol(widget, "tram.fill", 22, COLORS.accent);
    widget.addSpacer(8);
    addLabel(widget, "Set your route", Font.semiboldSystemFont(15), COLORS.primary);
    widget.addSpacer(4);
    const help = addLabel(
        widget,
        "Long-press this widget, tap Edit Widget and enter a Parameter like:",
        Font.systemFont(12),
        COLORS.secondary
    );
    help.lineLimit = 4;
    widget.addSpacer(4);
    addLabel(widget, "Köln Hbf > Düsseldorf Hbf", Font.semiboldSystemFont(12), COLORS.primary);
    return widget;
}

function buildErrorWidget(error) {
    const widget = createWidget();
    addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.late);
    widget.addSpacer(8);
    addLabel(widget, "Couldn't load connections", Font.semiboldSystemFont(15), COLORS.primary);
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
    const route = readRoute();
    if (!route) return buildSetupWidget();
    try {
        const result = await loadData(route, CONFIG.connectionsToLoad[size]);
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
````
