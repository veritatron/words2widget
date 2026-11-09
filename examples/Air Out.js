// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: wind;

const CONFIG = {
    title: "Air Out?",
    locale: "en_US", // Language for dates and weekdays
    refreshMinutes: 30,
    previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
    defaultPlace: "", // Used when the widget's Parameter is empty. Leave empty for current location.
    limits: {
        rainChance: 30, // % – above this, rain counts as likely
        dewPoint: 16, // °C – above this, the outside air counts as humid
        aqi: 60, // European AQI – above this, the air counts as poor
        birchPollen: 50, // grains/m³ – above this, birch pollen counts as high
        grassPollen: 30, // grains/m³ – above this, grass pollen counts as high
    },
    dayHours: { start: 7, end: 23 }, // "Next good time" and today's windows only look inside these hours
    maxWindows: 5, // Good times listed in the large widget
};

const COLORS = {
    background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    secondary: Color.dynamic(new Color("#8A8A8E"), new Color("#98989D")),
    open: Color.dynamic(new Color("#34C759"), new Color("#30D158")),
    closed: Color.dynamic(new Color("#FF9500"), new Color("#FF9F0A")),
    separator: Color.dynamic(new Color("#E5E5EA"), new Color("#38383A")),
};

const HOUR = 60 * 60 * 1000;

// --- Data ---

function placeQuery() {
    return (args.widgetParameter || CONFIG.defaultPlace || "").trim();
}

function cachePath() {
    const fm = FileManager.local();
    const key = (placeQuery() || "current").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return fm.joinPath(fm.libraryDirectory(), `${Script.name()}-${key}-cache.json`);
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

async function getJSON(url) {
    const request = new Request(url);
    request.timeoutInterval = 10;
    return await request.loadJSON();
}

async function resolvePlace() {
    const query = placeQuery();
    if (query) {
        const name = query.split(",")[0].trim();
        const result = await getJSON(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
        );
        const place = result?.results?.[0];
        if (!place) throw new Error(`Couldn't find "${query}". Check the widget's Parameter.`);
        return { latitude: place.latitude, longitude: place.longitude, name: place.name };
    }

    let location;
    try {
        Location.setAccuracyToThreeKilometers();
        location = await Location.current();
    } catch {
        throw new Error("Location unavailable. Run the script once in Scriptable, or enter a place in the widget's Parameter.");
    }
    let name = "Current location";
    try {
        const marks = await Location.reverseGeocode(location.latitude, location.longitude, CONFIG.locale);
        name = marks?.[0]?.locality ?? name;
    } catch { }
    return { latitude: location.latitude, longitude: location.longitude, name };
}

async function requestData() {
    const place = await resolvePlace();
    const coords = `latitude=${place.latitude.toFixed(3)}&longitude=${place.longitude.toFixed(3)}`;
    const [weather, air] = await Promise.all([
        getJSON(
            `https://api.open-meteo.com/v1/forecast?${coords}&hourly=precipitation_probability,dew_point_2m&timezone=auto&forecast_days=2`
        ),
        getJSON(
            `https://air-quality-api.open-meteo.com/v1/air-quality?${coords}&hourly=european_aqi,birch_pollen,grass_pollen&timezone=auto&forecast_days=2`
        ),
    ]);

    if (!weather?.hourly?.time) throw new Error(weather?.reason ?? "Unexpected weather data.");
    if (!air?.hourly?.time) throw new Error(air?.reason ?? "Unexpected air quality data.");

    const airByTime = {};
    air.hourly.time.forEach((time, i) => {
        airByTime[time] = {
            aqi: air.hourly.european_aqi?.[i],
            birch: air.hourly.birch_pollen?.[i],
            grass: air.hourly.grass_pollen?.[i],
        };
    });

    const offset = (weather.utc_offset_seconds ?? 0) * 1000;
    const hours = weather.hourly.time.map((time, i) => ({
        time,
        start: Date.parse(`${time}:00Z`) - offset,
        rain: weather.hourly.precipitation_probability?.[i],
        dew: weather.hourly.dew_point_2m?.[i],
        ...(airByTime[time] ?? {}),
    }));

    return { place: place.name, hours };
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

// --- Decision ---

function isKnown(value) {
    return typeof value === "number" && !Number.isNaN(value);
}

function problemsAt(hour) {
    const L = CONFIG.limits;
    const problems = [];
    if (isKnown(hour.rain) && hour.rain > L.rainChance) problems.push("rain");
    if (isKnown(hour.aqi) && hour.aqi > L.aqi) problems.push("air");
    if ((isKnown(hour.birch) && hour.birch > L.birchPollen) || (isKnown(hour.grass) && hour.grass > L.grassPollen)) {
        problems.push("pollen");
    }
    if (isKnown(hour.dew) && hour.dew > L.dewPoint) problems.push("humid");
    return problems;
}

const isGood = (hour) => problemsAt(hour).length === 0;
const hourOfDay = (hour) => Number(hour.time.slice(11, 13));
const dayOf = (hour) => hour.time.slice(0, 10);
const clock = (hour) => hour.time.slice(11, 16);
const isDaytime = (hour) => hourOfDay(hour) >= CONFIG.dayHours.start && hourOfDay(hour) < CONFIG.dayHours.end;
const endClock = (hour) => `${String(hourOfDay(hour) + 1).padStart(2, "0")}:00`;

function aqiLabel(aqi) {
    if (aqi <= 20) return "Good";
    if (aqi <= 40) return "Fair";
    if (aqi <= 60) return "Moderate";
    if (aqi <= 80) return "Poor";
    if (aqi <= 100) return "Very poor";
    return "Extremely poor";
}

function pollenLevel(hour) {
    const L = CONFIG.limits;
    const levels = [
        { name: "Birch", value: hour.birch, limit: L.birchPollen },
        { name: "Grass", value: hour.grass, limit: L.grassPollen },
    ]
        .filter((p) => isKnown(p.value))
        .map((p) => ({ name: p.name, ratio: p.value / p.limit }));
    if (!levels.length) return null;
    const top = levels.sort((a, b) => b.ratio - a.ratio)[0];
    if (top.ratio > 1) return { text: `${top.name} high`, name: top.name };
    if (top.ratio > 0.5) return { text: `${top.name} moderate`, name: top.name };
    return { text: "Low", name: top.name };
}

function goodReason(hour) {
    const parts = [!isKnown(hour.rain) || hour.rain <= 10 ? "Dry" : "Low rain risk"];
    if (isKnown(hour.aqi)) parts.push(hour.aqi <= 20 ? "clean air" : "air OK");
    const pollen = pollenLevel(hour);
    if (pollen) parts.push(pollen.text === "Low" ? "low pollen" : "pollen OK");
    return parts.join(", ");
}

function badReason(problem, hour) {
    if (problem === "rain") return `Rain likely (${Math.round(hour.rain)}%)`;
    if (problem === "air") return `Poor air (AQI ${Math.round(hour.aqi)})`;
    if (problem === "pollen") return `High ${pollenLevel(hour).name.toLowerCase()} pollen`;
    return `Humid outside (dew point ${Math.round(hour.dew)}°)`;
}

function windowsToday(hours, index) {
    const today = dayOf(hours[index]);
    const fits = (i) => i < hours.length && dayOf(hours[i]) === today && isDaytime(hours[i]) && isGood(hours[i]);
    const windows = [];
    let i = index;
    while (i < hours.length && dayOf(hours[i]) === today) {
        if (fits(i)) {
            let end = i;
            while (fits(end + 1)) end++;
            windows.push({ from: i === index ? "Now" : clock(hours[i]), to: endClock(hours[end]), length: end - i + 1 });
            i = end + 1;
        } else {
            i++;
        }
    }
    return windows;
}

function assess(data) {
    const hours = data.hours;
    const now = Date.now();
    const index = hours.findIndex((h) => h.start <= now && now < h.start + HOUR);
    if (index < 0) throw new Error("The forecast is out of date. Check your connection.");

    const current = hours[index];
    const problems = problemsAt(current);
    const open = problems.length === 0;
    let detail;

    if (open) {
        let end = index;
        while (end + 1 < hours.length && isGood(hours[end + 1])) end++;
        if (end + 1 < hours.length) {
            const next = hours[end + 1];
            detail = `Good until ${dayOf(next) === dayOf(current) ? "" : "tomorrow "}${clock(next)}`;
        } else {
            detail = `Good for ${end - index + 1}h+`;
        }
    } else {
        const next = hours.slice(index + 1).find((h) => isDaytime(h) && isGood(h));
        if (!next) detail = "No good time soon";
        else detail = `Next good ${dayOf(next) === dayOf(current) ? "at" : "tomorrow"} ${clock(next)}`;
    }

    return {
        open,
        problems,
        current,
        detail,
        reason: open ? goodReason(current) : badReason(problems[0], current),
        windows: windowsToday(hours, index),
    };
}

function metricRows(a, includeDew) {
    const h = a.current;
    const pollen = pollenLevel(h);
    const rows = [
        { symbol: "cloud.rain", label: "Rain", value: isKnown(h.rain) ? `${Math.round(h.rain)}%` : "–", bad: a.problems.includes("rain") },
        { symbol: "aqi.medium", label: "Air", value: isKnown(h.aqi) ? `${Math.round(h.aqi)} · ${aqiLabel(h.aqi)}` : "–", bad: a.problems.includes("air") },
        { symbol: "leaf", label: "Pollen", value: pollen ? pollen.text : "No data", bad: a.problems.includes("pollen") },
    ];
    if (includeDew) {
        rows.push({ symbol: "humidity", label: "Dew point", value: isKnown(h.dew) ? `${Math.round(h.dew)}°` : "–", bad: a.problems.includes("humid") });
    }
    return rows;
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

function addSymbol(stack, names, size, color) {
    const symbol = names.map((name) => SFSymbol.named(name)).find(Boolean) ?? SFSymbol.named("questionmark.circle.fill");
    symbol.applyFont(Font.systemFont(size));
    const image = stack.addImage(symbol.image);
    image.imageSize = new Size(size, size);
    image.tintColor = color;
    return image;
}

const accentFor = (a) => (a.open ? COLORS.open : COLORS.closed);

// --- Layout ---

function addMainContent(stack, a, result) {
    const accent = accentFor(a);

    const header = stack.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();
    addSymbol(header, a.open ? ["window.vertical.open", "wind"] : ["window.vertical.closed", "xmark.circle"], 14, accent);
    header.addSpacer(4);
    addLabel(header, CONFIG.title, Font.semiboldSystemFont(13), accent);

    stack.addSpacer();
    addLabel(stack, a.open ? "Open now" : "Keep closed", Font.boldSystemFont(24), COLORS.primary);
    stack.addSpacer(2);
    const reason = addLabel(stack, a.reason, Font.systemFont(13), COLORS.secondary);
    reason.lineLimit = 2;
    stack.addSpacer(4);
    addLabel(stack, a.detail, Font.semiboldSystemFont(13), accent);
    stack.addSpacer(2);
    const caption = result.savedAt ? `Offline · ${formatDate(new Date(result.savedAt), "HH:mm")}` : result.data.place;
    addLabel(stack, caption, Font.systemFont(11), COLORS.secondary);
}

function addMetricRow(stack, row, accent) {
    const line = stack.addStack();
    line.layoutHorizontally();
    line.centerAlignContent();
    addSymbol(line, [row.symbol, "circle"], 13, row.bad ? accent : COLORS.secondary);
    line.addSpacer(6);
    addLabel(line, row.label, Font.systemFont(13), COLORS.primary);
    line.addSpacer();
    addLabel(line, row.value, Font.semiboldSystemFont(13), row.bad ? accent : COLORS.secondary);
}

function addMetrics(stack, a, includeDew) {
    stack.addSpacer();
    metricRows(a, includeDew).forEach((row) => {
        addMetricRow(stack, row, accentFor(a));
        stack.addSpacer();
    });
}

function addWindowRow(stack, slot) {
    const line = stack.addStack();
    line.layoutHorizontally();
    line.centerAlignContent();
    addSymbol(line, ["clock", "circle"], 13, COLORS.open);
    line.addSpacer(6);
    addLabel(line, `${slot.from} – ${slot.to}`, Font.semiboldSystemFont(13), COLORS.primary);
    line.addSpacer();
    addLabel(line, `${slot.length}h`, Font.systemFont(13), COLORS.secondary);
}

function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = COLORS.background;
    widget.setPadding(14, 16, 14, 16);
    widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);
    return widget;
}

function buildSmallWidget(result, a) {
    const widget = createWidget();
    addMainContent(widget, a, result);
    return widget;
}

function buildMediumWidget(result, a) {
    const widget = createWidget();
    const columns = widget.addStack();
    columns.layoutHorizontally();

    const main = columns.addStack();
    main.layoutVertically();
    main.size = new Size(150, 0);
    addMainContent(main, a, result);

    columns.addSpacer(16);

    const details = columns.addStack();
    details.layoutVertically();
    addMetrics(details, a, false);
    return widget;
}

function buildLargeWidget(result, a) {
    const widget = createWidget();

    const top = widget.addStack();
    top.layoutHorizontally();
    top.size = new Size(0, 140);

    const main = top.addStack();
    main.layoutVertically();
    main.size = new Size(150, 140);
    addMainContent(main, a, result);

    top.addSpacer(16);

    const details = top.addStack();
    details.layoutVertically();
    addMetrics(details, a, true);

    widget.addSpacer(10);
    const separator = widget.addStack();
    separator.size = new Size(0, 1);
    separator.backgroundColor = COLORS.separator;
    separator.addSpacer();
    widget.addSpacer(10);

    addLabel(widget, "Good times today", Font.semiboldSystemFont(13), COLORS.secondary);
    widget.addSpacer(8);

    if (!a.windows.length) {
        addLabel(widget, "No more good times today", Font.systemFont(13), COLORS.primary);
    } else {
        a.windows.slice(0, CONFIG.maxWindows).forEach((slot) => {
            addWindowRow(widget, slot);
            widget.addSpacer(8);
        });
    }
    widget.addSpacer();
    return widget;
}

function buildErrorWidget(error) {
    const widget = createWidget();
    addSymbol(widget, ["exclamationmark.triangle.fill"], 26, COLORS.closed);
    widget.addSpacer(8);
    addLabel(widget, "Couldn't load air data", Font.semiboldSystemFont(14), COLORS.primary);
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
        const assessment = assess(result.data);
        if (size === "medium") return buildMediumWidget(result, assessment);
        if (size === "large") return buildLargeWidget(result, assessment);
        return buildSmallWidget(result, assessment);
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