// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: running;

const CONFIG = {
    title: "Run Today?",
    locale: "en_US", // Language for dates and times
    refreshMinutes: 30,
    previewSize: "medium", // Size shown when run in the app: "small", "medium" or "large"
    defaultGoal: 10000, // Daily step goal if the Parameter has none
    tapURL: "shortcuts://run-shortcut?name=Update%20Steps",
    idealFeelsMin: 5, // °C feels-like, below this the score drops
    idealFeelsMax: 18, // °C feels-like, above this the score drops
    windLimit: 15, // km/h, above this the score drops
    uvLimit: 5, // UV index, above this the score drops
    greatScore: 70, // From this score: "Great day to run"
    okayScore: 45, // From this score: "Okay for a run"
    windowHours: 2, // Length of the best time window
};

const TEXT = {
    great: "Great day to run",
    okay: "Okay for a run",
    skip: "Better skip it",
    none: "Daylight's over",
    noDaylight: "No daylight left today",
    now: "Now",
    temperature: "Temperature",
    feels: "feels",
    rain: "Rain",
    wind: "Wind",
    uv: "UV",
    chartTitle: "Running score today",
    stepsOf: "of",
    stepsLeft: "steps left",
    goalReached: "Goal reached",
    steps: "steps",
    currentLocation: "Current location",
    offline: "Offline",
    errorTitle: "Couldn't load the forecast",
    notFound: "Couldn't find this place:",
    stale: "No forecast for today yet. Connect to the internet.",
    saved: "Saved",
    noSteps: "No step count received",
};

const COLORS = {
    background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    secondary: Color.dynamic(new Color("#6E6E73"), new Color("#98989D")),
    great: Color.dynamic(new Color("#34C759"), new Color("#30D158")),
    okay: Color.dynamic(new Color("#FF9500"), new Color("#FF9F0A")),
    skip: Color.dynamic(new Color("#FF3B30"), new Color("#FF453A")),
    none: Color.dynamic(new Color("#8E8E93"), new Color("#8E8E93")),
};

// Drawn images can't switch with dark mode, so they use tones that work on both.
const DRAW = {
    great: "#32C85A",
    okay: "#FF9A05",
    skip: "#FF4138",
    none: "#8E8E93",
    track: new Color("#8E8E93", 0.25),
    label: new Color("#8E8E93"),
};

const CACHE_FILE = "run-today-cache.json";
const STEPS_FILE = "run-today-steps.json";

// --- Storage ---

function storagePath(name) {
    const fm = FileManager.local();
    return fm.joinPath(fm.libraryDirectory(), name);
}

function readJSON(name) {
    const fm = FileManager.local();
    const path = storagePath(name);
    if (!fm.fileExists(path)) return null;
    try {
        return JSON.parse(fm.readString(path));
    } catch {
        return null;
    }
}

function writeJSON(name, value) {
    FileManager.local().writeString(storagePath(name), JSON.stringify(value));
}

// --- Settings ---

function parseParameter(text) {
    const parts = (text ?? "").split(",").map((part) => part.trim());
    let place = parts[0] ?? "";
    let goal = CONFIG.defaultGoal;

    if (parts.length === 1 && /^[\d.\s]+$/.test(place) && place !== "") {
        goal = parseInt(place.replace(/\D/g, ""), 10) || goal;
        place = "";
    } else if (parts.length > 1) {
        const digits = parts.slice(1).join("").replace(/\D/g, "");
        const parsed = parseInt(digits, 10);
        if (parsed > 0) goal = parsed;
    }
    return { place, goal };
}

// --- Steps ---

function todayKey() {
    return formatDate(new Date(), "yyyy-MM-dd");
}

function parseSteps(input) {
    const value = Array.isArray(input) ? input[0] : input;
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    const text = String(value ?? "").trim().replace(/\s/g, "");
    if (/^\d{1,3}([.,]\d{3})+$/.test(text)) return parseInt(text.replace(/[.,]/g, ""), 10);
    const number = Number(text.replace(",", "."));
    return Number.isFinite(number) && number >= 0 && text !== "" ? Math.round(number) : null;
}

function readTodaySteps(goal) {
    const saved = readJSON(STEPS_FILE);
    if (!saved || saved.date !== todayKey() || !Number.isFinite(saved.steps)) return null;
    return { count: saved.steps, goal };
}

// --- Weather data ---

async function resolvePlace(place) {
    if (!place) {
        Location.setAccuracyToThreeKilometers();
        const location = await Location.current();
        let name = TEXT.currentLocation;
        try {
            const geo = await Location.reverseGeocode(location.latitude, location.longitude);
            name = geo?.[0]?.locality ?? name;
        } catch { }
        return { latitude: location.latitude, longitude: location.longitude, name };
    }

    const request = new Request(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&format=json`
    );
    request.timeoutInterval = 10;
    const response = await request.loadJSON();
    const hit = response?.results?.[0];
    if (!hit) throw new Error(`${TEXT.notFound} ${place}`);
    return { latitude: hit.latitude, longitude: hit.longitude, name: place };
}

async function requestData(place) {
    const spot = await resolvePlace(place);
    const request = new Request(
        `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}` +
        "&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,uv_index" +
        "&daily=sunrise,sunset&timezone=auto&forecast_days=1"
    );
    request.timeoutInterval = 10;
    const forecast = await request.loadJSON();
    if (!forecast?.hourly?.time || !forecast?.daily?.sunrise) {
        throw new Error(forecast?.reason ?? "Unexpected data.");
    }
    return { name: spot.name, forecast };
}

// Returns fresh data if possible and the last saved data for the same place otherwise.
async function loadData(place) {
    try {
        const data = await requestData(place);
        writeJSON(CACHE_FILE, { savedAt: Date.now(), place, data });
        return { data, savedAt: null };
    } catch (error) {
        const cache = readJSON(CACHE_FILE);
        if (cache?.data && cache.place === place) return { data: cache.data, savedAt: cache.savedAt };
        throw error;
    }
}

// --- Scoring ---

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function scoreHour(hour) {
    let score = 100;
    const feels = hour.feels ?? hour.temp;
    if (feels < CONFIG.idealFeelsMin) score -= (CONFIG.idealFeelsMin - feels) * 3;
    if (feels > CONFIG.idealFeelsMax) score -= (feels - CONFIG.idealFeelsMax) * 5;
    if (hour.temp < 0) score -= 10; // Risk of ice
    score -= hour.rain * 0.6;
    if (hour.wind > CONFIG.windLimit) score -= (hour.wind - CONFIG.windLimit) * 1.5;
    if (hour.uv > CONFIG.uvLimit) score -= (hour.uv - CONFIG.uvLimit) * 6;
    return Math.round(clamp(score, 0, 100));
}

function statusFor(score) {
    if (score >= CONFIG.greatScore) return "great";
    if (score >= CONFIG.okayScore) return "okay";
    return "skip";
}

function pad(number) {
    return String(number).padStart(2, "0");
}

function analyze(forecast) {
    const hourly = forecast.hourly;
    const localNow = new Date(Date.now() + (forecast.utc_offset_seconds ?? 0) * 1000);
    const day = `${localNow.getUTCFullYear()}-${pad(localNow.getUTCMonth() + 1)}-${pad(localNow.getUTCDate())}`;
    const nowKey = `${day}T${pad(localNow.getUTCHours())}:00`;

    if (forecast.daily.time?.[0] !== day) throw new Error(TEXT.stale);

    const sunrise = forecast.daily.sunrise[0];
    const sunset = forecast.daily.sunset[0];

    const allHours = hourly.time.map((time, i) => {
        const hour = {
            time,
            label: time.slice(11, 16),
            temp: hourly.temperature_2m[i] ?? 0,
            feels: hourly.apparent_temperature[i],
            rain: hourly.precipitation_probability[i] ?? 0,
            wind: hourly.wind_speed_10m[i] ?? 0,
            uv: hourly.uv_index[i] ?? 0,
            past: time < nowKey,
        };
        hour.score = scoreHour(hour);
        return hour;
    });

    const daylight = allHours.filter((hour) => {
        const middle = `${hour.time.slice(0, 13)}:30`;
        return hour.time.startsWith(day) && middle > sunrise && middle < sunset;
    });
    const remaining = daylight.filter((hour) => !hour.past);
    const now = allHours.find((hour) => hour.time === nowKey) ?? allHours[0];

    if (remaining.length === 0) {
        return { status: "none", score: null, bestText: TEXT.noDaylight, now, daylight };
    }

    const size = Math.min(CONFIG.windowHours, remaining.length);
    let bestStart = 0;
    let bestAverage = -1;
    for (let i = 0; i + size <= remaining.length; i++) {
        const slice = remaining.slice(i, i + size);
        const average = slice.reduce((sum, hour) => sum + hour.score, 0) / size;
        if (average > bestAverage) {
            bestAverage = average;
            bestStart = i;
        }
    }

    const first = remaining[bestStart];
    const last = remaining[bestStart + size - 1];
    const endHour = parseInt(last.label.slice(0, 2), 10) + 1;
    const score = Math.round(bestAverage);

    return {
        status: statusFor(score),
        score,
        bestText: `Best ${first.label}–${pad(endHour)}:00`,
        now,
        daylight,
    };
}

// --- Drawing helpers ---

function formatDate(date, pattern) {
    const formatter = new DateFormatter();
    formatter.locale = CONFIG.locale;
    formatter.dateFormat = pattern;
    return formatter.string(date);
}

function formatNumber(number) {
    return String(Math.round(number)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function addLabel(stack, text, font, color) {
    const label = stack.addText(text);
    label.font = font;
    label.textColor = color;
    label.lineLimit = 1;
    label.minimumScaleFactor = 0.6;
    return label;
}

function addCenteredLabel(stack, text, font, color) {
    const row = stack.addStack();
    row.layoutHorizontally();
    row.addSpacer();
    const label = addLabel(row, text, font, color);
    row.addSpacer();
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

function ringImage(progress, size, lineWidth) {
    const ctx = new DrawContext();
    ctx.size = new Size(size, size);
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    const center = size / 2;
    const radius = (size - lineWidth) / 2;
    const pointAt = (degrees) => {
        const angle = ((degrees - 90) * Math.PI) / 180;
        return new Point(center + radius * Math.cos(angle), center + radius * Math.sin(angle));
    };

    ctx.setStrokeColor(DRAW.track);
    ctx.setLineWidth(lineWidth);
    ctx.strokeEllipse(new Rect(lineWidth / 2, lineWidth / 2, size - lineWidth, size - lineWidth));

    const share = clamp(progress, 0, 1);
    if (share > 0) {
        const end = 360 * share;
        const ringColor = new Color(DRAW.great);
        const path = new Path();
        path.move(pointAt(0));
        for (let degrees = 2; degrees < end; degrees += 2) path.addLine(pointAt(degrees));
        path.addLine(pointAt(end));
        ctx.addPath(path);
        ctx.setStrokeColor(ringColor);
        ctx.setLineWidth(lineWidth);
        ctx.strokePath();

        ctx.setFillColor(ringColor);
        [0, end].forEach((degrees) => {
            const point = pointAt(degrees);
            ctx.fillEllipse(new Rect(point.x - lineWidth / 2, point.y - lineWidth / 2, lineWidth, lineWidth));
        });
    }
    return ctx.getImage();
}

function fillBar(ctx, rect, color) {
    const corner = Math.min(4, rect.width / 2, rect.height / 2);
    const path = new Path();
    path.addRoundedRect(rect, corner, corner);
    ctx.addPath(path);
    ctx.setFillColor(color);
    ctx.fillPath();
}

function chartImage(hours, width, height) {
    const ctx = new DrawContext();
    ctx.size = new Size(width, height);
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    const labelHeight = 14;
    const barArea = height - labelHeight - 2;
    const slot = width / hours.length;
    const barWidth = Math.min(22, slot * 0.62);
    const labelEvery = hours.length > 10 ? 2 : 1;

    hours.forEach((hour, i) => {
        const x = i * slot + (slot - barWidth) / 2;
        fillBar(ctx, new Rect(x, 0, barWidth, barArea), DRAW.track);
        const barHeight = Math.max(4, (barArea * hour.score) / 100);
        const color = new Color(DRAW[statusFor(hour.score)], hour.past ? 0.35 : 1);
        fillBar(ctx, new Rect(x, barArea - barHeight, barWidth, barHeight), color);

        if (i % labelEvery === 0) {
            ctx.setFont(Font.systemFont(10));
            ctx.setTextColor(DRAW.label);
            ctx.setTextAlignedCenter();
            ctx.drawTextInRect(hour.label.slice(0, 2), new Rect(i * slot, barArea + 3, slot, labelHeight));
        }
    });
    return ctx.getImage();
}

// --- Layout ---

function addHeader(stack, analysis) {
    const row = stack.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    addSymbol(row, "figure.run", 14, COLORS[analysis.status]);
    row.addSpacer(5);
    addLabel(row, CONFIG.title, Font.semiboldSystemFont(13), COLORS.secondary);
    row.addSpacer();
    if (analysis.score !== null) {
        addLabel(row, String(analysis.score), Font.semiboldSystemFont(13), COLORS[analysis.status]);
    }
}

function addAnswer(stack, analysis, result) {
    addHeader(stack, analysis);
    stack.addSpacer();
    const verdict = addLabel(stack, TEXT[analysis.status], Font.boldSystemFont(20), COLORS[analysis.status]);
    verdict.lineLimit = 2;
    verdict.minimumScaleFactor = 0.7;
    stack.addSpacer(4);
    addLabel(stack, analysis.bestText, Font.semiboldSystemFont(13), COLORS.primary);
    stack.addSpacer();
    const caption = result.savedAt
        ? `${TEXT.offline} · ${formatDate(new Date(result.savedAt), "HH:mm")}`
        : result.data.name;
    addLabel(stack, caption, Font.systemFont(11), COLORS.secondary);
}

function addDetails(stack, analysis, wide) {
    const now = analysis.now;
    const temperature = `${Math.round(now.temp)}°`;
    const rows = [
        {
            symbol: "thermometer.medium",
            label: TEXT.temperature,
            value: wide ? `${temperature} · ${TEXT.feels} ${Math.round(now.feels ?? now.temp)}°` : temperature,
        },
        { symbol: "cloud.rain", label: TEXT.rain, value: `${Math.round(now.rain)}%` },
        { symbol: "wind", label: TEXT.wind, value: `${Math.round(now.wind)} km/h` },
    ];
    if (wide) rows.push({ symbol: "sun.max", label: TEXT.uv, value: String(Math.round(now.uv)) });

    addLabel(stack, TEXT.now, Font.systemFont(11), COLORS.secondary);
    stack.addSpacer(6);
    rows.forEach((row, i) => {
        const line = stack.addStack();
        line.layoutHorizontally();
        line.centerAlignContent();
        addSymbol(line, row.symbol, 13, COLORS.secondary);
        line.addSpacer(6);
        if (wide) {
            addLabel(line, row.label, Font.systemFont(13), COLORS.secondary);
            line.addSpacer();
        }
        addLabel(line, row.value, Font.semiboldSystemFont(13), COLORS.primary);
        if (!wide) line.addSpacer();
        if (i < rows.length - 1) stack.addSpacer(6);
    });
}

function addRing(stack, steps, size) {
    const ring = stack.addStack();
    ring.size = new Size(size, size);
    ring.backgroundImage = ringImage(steps.count / steps.goal, size, Math.round(size * 0.13));
    ring.layoutHorizontally();
    ring.centerAlignContent();
    ring.addSpacer();
    const percent = Math.round((steps.count / steps.goal) * 100);
    addLabel(ring, `${percent}%`, Font.semiboldSystemFont(11), COLORS.primary);
    ring.addSpacer();
}

function stepsLeftText(steps) {
    const left = steps.goal - steps.count;
    return left > 0 ? `${formatNumber(left)} ${TEXT.stepsLeft}` : TEXT.goalReached;
}

function addStepsColumn(stack, steps) {
    const column = stack.addStack();
    column.layoutVertically();
    column.size = new Size(86, 0);
    column.addSpacer();
    const ringRow = column.addStack();
    ringRow.layoutHorizontally();
    ringRow.addSpacer();
    addRing(ringRow, steps, 56);
    ringRow.addSpacer();
    column.addSpacer(8);
    addCenteredLabel(
        column,
        `${formatNumber(steps.count)} ${TEXT.stepsOf} ${formatNumber(steps.goal)}`,
        Font.semiboldSystemFont(11),
        COLORS.primary
    );
    addCenteredLabel(column, stepsLeftText(steps), Font.systemFont(11), COLORS.secondary);
    column.addSpacer();
}

function addStepsRow(stack, steps) {
    const row = stack.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    addRing(row, steps, 46);
    row.addSpacer(12);
    const texts = row.addStack();
    texts.layoutVertically();
    addLabel(
        texts,
        `${formatNumber(steps.count)} ${TEXT.stepsOf} ${formatNumber(steps.goal)} ${TEXT.steps}`,
        Font.semiboldSystemFont(13),
        COLORS.primary
    );
    texts.addSpacer(2);
    addLabel(texts, stepsLeftText(steps), Font.systemFont(11), COLORS.secondary);
    row.addSpacer();
}

function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = COLORS.background;
    widget.setPadding(14, 16, 14, 16);
    widget.url = CONFIG.tapURL;
    widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);
    return widget;
}

function buildSmallWidget(result, analysis) {
    const widget = createWidget();
    addAnswer(widget, analysis, result);
    return widget;
}

function buildMediumWidget(result, analysis, steps) {
    const widget = createWidget();
    const columns = widget.addStack();
    columns.layoutHorizontally();

    const main = columns.addStack();
    main.layoutVertically();
    main.size = new Size(steps ? 112 : 140, 0);
    addAnswer(main, analysis, result);

    columns.addSpacer(steps ? 10 : 18);

    const details = columns.addStack();
    details.layoutVertically();
    addDetails(details, analysis, !steps);

    if (steps) {
        columns.addSpacer(10);
        addStepsColumn(columns, steps);
    }
    return widget;
}

function buildLargeWidget(result, analysis, steps) {
    const widget = createWidget();

    const top = widget.addStack();
    top.layoutHorizontally();
    top.size = new Size(0, 128);
    const main = top.addStack();
    main.layoutVertically();
    main.size = new Size(140, 128);
    addAnswer(main, analysis, result);
    top.addSpacer(18);
    const details = top.addStack();
    details.layoutVertically();
    addDetails(details, analysis, true);

    widget.addSpacer(12);

    if (steps) {
        addStepsRow(widget, steps);
        widget.addSpacer(12);
    }

    if (analysis.daylight.length > 0) {
        addLabel(widget, TEXT.chartTitle, Font.systemFont(11), COLORS.secondary);
        widget.addSpacer(6);
        const chartHeight = steps ? 80 : 120;
        const chart = widget.addImage(chartImage(analysis.daylight, 290, chartHeight));
        chart.imageSize = new Size(290, chartHeight);
    }
    widget.addSpacer();
    return widget;
}

function buildErrorWidget(error) {
    const widget = createWidget();
    addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.okay);
    widget.addSpacer(8);
    addLabel(widget, TEXT.errorTitle, Font.semiboldSystemFont(13), COLORS.primary);
    widget.addSpacer(4);
    const message = addLabel(widget, error.message, Font.systemFont(11), COLORS.secondary);
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
        const settings = parseParameter(args.widgetParameter);
        const result = await loadData(settings.place);
        const analysis = analyze(result.data.forecast);
        const steps = readTodaySteps(settings.goal);
        if (size === "medium") return buildMediumWidget(result, analysis, steps);
        if (size === "large") return buildLargeWidget(result, analysis, steps);
        return buildSmallWidget(result, analysis);
    } catch (error) {
        return buildErrorWidget(error);
    }
}

const stepsInput = args.shortcutParameter;

if (stepsInput !== undefined && stepsInput !== null && stepsInput !== "") {
    // Called from Shortcuts with today's step count.
    const steps = parseSteps(stepsInput);
    if (steps === null) {
        Script.setShortcutOutput(TEXT.noSteps);
    } else {
        writeJSON(STEPS_FILE, { date: todayKey(), steps, savedAt: Date.now() });
        Script.setShortcutOutput(TEXT.saved);
    }
} else {
    const size = currentSize();
    const widget = await buildWidget(size);

    Script.setWidget(widget);

    if (!config.runsInWidget) {
        if (size === "medium") await widget.presentMedium();
        else if (size === "large") await widget.presentLarge();
        else await widget.presentSmall();
    }
}

Script.complete();