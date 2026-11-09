# Top Repos

> **What's taking off on GitHub this week?**

The most-starred new repositories of the last seven days.

<img src="Top%20Repos.png" alt="Top Repos widget" width="480">

[Back to all widgets](../README.md#make-the-widget-you-always-wanted)

## Get this widget

Do this on your iPhone. You need [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) and the [Widget Installer](../INSTALLER.md).

1. Tap the copy button on the code block below.
2. Open Scriptable, run **Widget Installer** and tap **Save**.
3. Touch and hold the home screen, tap **Edit**, then **Add Widget**, and choose **Scriptable**.
4. Tap the new widget and choose **Top Repos** as the script.

**Parameter:** A programming language, for example `Rust`. Leave it empty to see all languages. To set it, touch and hold the widget and tap **Edit Widget**.

Tap a repository to open it.

## Code

````javascript
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: star;

const CONFIG = {
    title: "Top Repos",
    locale: "en_US", // Language for dates and times
    refreshMinutes: 60,
    previewSize: "large", // Size shown when run in the app: "small", "medium" or "large"
    days: 7, // How far back "this week" reaches
    resultCount: 8,
    defaultLanguage: "", // Used when the widget's Parameter field is empty, e.g. "Rust"
};

const COLORS = {
    background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
    primary: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
    secondary: Color.dynamic(new Color("#8E8E93"), new Color("#98989D")),
    accent: Color.dynamic(new Color("#007AFF"), new Color("#0A84FF")),
};

const ROW_COUNTS = { medium: 3, large: 6 };

const LANGUAGE = (args.widgetParameter || CONFIG.defaultLanguage || "").trim();

// --- Data ---

function cachePath() {
    const fm = FileManager.local();
    const key = LANGUAGE.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "all";
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

async function requestData() {
    const since = new Date(Date.now() - CONFIG.days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    let query = `created:>${since}`;
    if (LANGUAGE) {
        query += ` language:${LANGUAGE.includes(" ") ? `"${LANGUAGE}"` : LANGUAGE}`;
    }
    const url =
        "https://api.github.com/search/repositories" +
        `?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${CONFIG.resultCount}`;

    const request = new Request(url);
    request.timeoutInterval = 15;
    request.headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "Scriptable-Top-Repos",
    };
    const response = await request.loadJSON();

    if (!Array.isArray(response?.items)) {
        throw new Error(response?.message ?? "Unexpected data from GitHub.");
    }
    if (response.items.length === 0) {
        throw new Error(LANGUAGE ? `No new repos found for "${LANGUAGE}".` : "No new repos found.");
    }

    return {
        repos: response.items.map((item) => ({
            name: item.name ?? "Unknown",
            owner: item.owner?.login ?? "",
            stars: item.stargazers_count ?? 0,
            language: item.language ?? "",
            description: (item.description ?? "").trim(),
            url: item.html_url,
        })),
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

function formatStars(count) {
    if (count >= 1000) {
        const value = (count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, "");
        return `${value}k`;
    }
    return `${count}`;
}

function captionText(savedAt) {
    if (savedAt) return `Offline · ${formatDate(new Date(savedAt), "HH:mm")}`;
    return LANGUAGE ? `${LANGUAGE} · this week` : "This week";
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

function addHeader(stack, rightText) {
    const header = stack.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();
    addSymbol(header, "star.fill", 12, COLORS.accent);
    header.addSpacer(4);
    addLabel(header, CONFIG.title, Font.semiboldSystemFont(12), COLORS.accent);
    if (rightText) {
        header.addSpacer();
        addLabel(header, rightText, Font.systemFont(12), COLORS.secondary);
    }
}

function addTopRepo(stack, repo, showDescription) {
    const box = stack.addStack();
    box.layoutVertically();
    box.url = repo.url;

    const name = addLabel(box, repo.name, Font.boldSystemFont(26), COLORS.primary);
    name.minimumScaleFactor = 0.5;
    box.addSpacer(4);

    const stars = box.addStack();
    stars.layoutHorizontally();
    stars.centerAlignContent();
    addSymbol(stars, "star.fill", 14, COLORS.accent);
    stars.addSpacer(4);
    addLabel(stars, formatStars(repo.stars), Font.semiboldSystemFont(14), COLORS.primary);
    if (repo.owner) {
        stars.addSpacer(6);
        addLabel(stars, repo.owner, Font.systemFont(12), COLORS.secondary);
    }

    if (showDescription && repo.description) {
        box.addSpacer(2);
        addLabel(box, repo.description, Font.systemFont(12), COLORS.secondary);
    }
}

function addCompactRow(stack, repo) {
    const line = stack.addStack();
    line.layoutHorizontally();
    line.centerAlignContent();
    line.url = repo.url;
    addLabel(line, repo.name, Font.semiboldSystemFont(14), COLORS.primary);
    line.addSpacer();
    addSymbol(line, "star.fill", 12, COLORS.secondary);
    line.addSpacer(3);
    addLabel(line, formatStars(repo.stars), Font.systemFont(14), COLORS.secondary);
}

function addDetailedRow(stack, repo) {
    const row = stack.addStack();
    row.layoutVertically();
    row.url = repo.url;

    addCompactRow(row, repo);
    row.addSpacer(2);

    const detailLine = row.addStack();
    detailLine.layoutHorizontally();
    const details = [repo.language, repo.description || "No description"]
        .filter(Boolean)
        .join(" · ");
    const label = addLabel(detailLine, details, Font.systemFont(12), COLORS.secondary);
    label.minimumScaleFactor = 0.9;
    detailLine.addSpacer();
}

function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = COLORS.background;
    widget.setPadding(12, 16, 12, 16);
    widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);
    return widget;
}

function buildSmallWidget({ data, savedAt }) {
    const widget = createWidget();
    const top = data.repos[0];
    widget.url = top.url;
    addHeader(widget, null);
    widget.addSpacer();
    addTopRepo(widget, top, false);
    widget.addSpacer(6);
    addLabel(widget, captionText(savedAt), Font.systemFont(12), COLORS.secondary);
    return widget;
}

function buildMediumWidget({ data, savedAt }) {
    const widget = createWidget();
    addHeader(widget, captionText(savedAt));
    widget.addSpacer(10);

    const columns = widget.addStack();
    columns.layoutHorizontally();
    columns.centerAlignContent();

    const main = columns.addStack();
    main.layoutVertically();
    main.size = new Size(125, 0);
    addTopRepo(main, data.repos[0], false);

    columns.addSpacer(16);

    const list = columns.addStack();
    list.layoutVertically();
    data.repos.slice(1, 1 + ROW_COUNTS.medium).forEach((repo, index) => {
        if (index > 0) list.addSpacer(10);
        addCompactRow(list, repo);
    });

    widget.addSpacer();
    return widget;
}

function buildLargeWidget({ data, savedAt }) {
    const widget = createWidget();
    addHeader(widget, captionText(savedAt));
    widget.addSpacer(6);
    addTopRepo(widget, data.repos[0], true);
    widget.addSpacer(10);

    const list = widget.addStack();
    list.layoutVertically();
    data.repos.slice(1, 1 + ROW_COUNTS.large).forEach((repo, index) => {
        if (index > 0) list.addSpacer(4);
        addDetailedRow(list, repo);
    });

    widget.addSpacer();
    return widget;
}

function buildErrorWidget(error) {
    const widget = createWidget();
    addSymbol(widget, "exclamationmark.triangle.fill", 26, COLORS.accent);
    widget.addSpacer(8);
    addLabel(widget, "Couldn't load repos", Font.semiboldSystemFont(14), COLORS.primary);
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
````
