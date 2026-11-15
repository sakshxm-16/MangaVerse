import express from "express";
import axios from "axios";
import nodemailer from "nodemailer";
import multer from "multer";
import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.mangadex.org";
const COVER_BASE_URL = "https://uploads.mangadex.org/covers";
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "ss9838157875@gmail.com";
const PAGE_SIZE = 24;
const TRENDING_SIZE = 6;
const SESSION_COOKIE = "mangaverse_session";
const CSRF_COOKIE = "mangaverse_csrf";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const MAX_PROFILE_PICTURE_BYTES = 2 * 1024 * 1024;
const profilePictureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PROFILE_PICTURE_BYTES, files: 1, fields: 1, parts: 2 }
}).single("profilePicture");
const DEFAULT_BOOKMARK_FOLDERS = [
    { id: "reading", name: "Reading" },
    { id: "completed", name: "Completed" },
    { id: "on-hold", name: "On Hold" },
    { id: "dropped", name: "Dropped" },
    { id: "plan-to-read", name: "Plan to Read" }
];
const DEFAULT_BOOKMARK_FOLDER_IDS = new Set(DEFAULT_BOOKMARK_FOLDERS.map((folder) => folder.id));
const DEFAULT_PREFERENCES = {
    showTrending: true,
    showContinueReading: true,
    showBookmarkedUpdates: true,
    mutedNotificationFolders: [],
    readerWidth: "wide",
    theme: "green-black",
    customThemes: []
};
const THEMES = [
    { id: "green-black", name: "Green Black", background: "#101115", surface: "#181a20", accent: "#c5f467" },
    { id: "purple-black", name: "Purple Black", background: "#100e16", surface: "#191722", accent: "#bd93f9" },
    { id: "red-black", name: "Red Black", background: "#120e10", surface: "#1d1518", accent: "#ff6b7c" },
    { id: "blue-black", name: "Blue Black", background: "#0e1118", surface: "#161b25", accent: "#69aaff" },
    { id: "pink-black", name: "Pink Black", background: "#130d13", surface: "#1f1520", accent: "#ff77bc" },
    { id: "orange-black", name: "Orange Black", background: "#14100c", surface: "#20180f", accent: "#ff9a3c" },
    { id: "violet-black", name: "Violet Black", background: "#100d17", surface: "#1b1427", accent: "#a78bfa" },
    { id: "pink-white", name: "Pink White", background: "#fff4fa", surface: "#ffffff", accent: "#df4c91" },
    { id: "violet-white", name: "Violet White", background: "#f7f3ff", surface: "#ffffff", accent: "#7952bd" },
    { id: "red-white", name: "Red White", background: "#fff5f4", surface: "#ffffff", accent: "#d94d5e" },
    { id: "blue-white", name: "Blue White", background: "#f2f7ff", surface: "#ffffff", accent: "#3478d4" },
    { id: "green-white", name: "Green White", background: "#f2faef", surface: "#ffffff", accent: "#438a3b" },
    { id: "gold-black", name: "Gold Black", background: "#13110b", surface: "#201b10", accent: "#e8c34a" },
    { id: "silver-black", name: "Silver Black", background: "#111316", surface: "#1d2025", accent: "#c3c9d2" }
];
const MAX_CUSTOM_THEMES = 12;
const scrypt = promisify(scryptCallback);
const APP_URL = new URL(APP_BASE_URL);
const DEFAULT_CONTENT_RATINGS = ["safe", "suggestive"];
const CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];
const STATUSES = ["ongoing", "completed", "hiatus", "cancelled"];
const LANGUAGES = [
    { code: "en", name: "English" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "zh", name: "Chinese" },
    { code: "es", name: "Spanish" },
    { code: "es-la", name: "Latin American Spanish" },
    { code: "fr", name: "French" },
    { code: "pt-br", name: "Brazilian Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "id", name: "Indonesian" },
    { code: "ar", name: "Arabic" },
    { code: "th", name: "Thai" },
    { code: "vi", name: "Vietnamese" },
    { code: "tr", name: "Turkish" },
    { code: "pl", name: "Polish" }
];
const MANGA_TYPES = {
    manga: { label: "Manga (Japan)", languages: ["ja", "ja-ro"] },
    manhwa: { label: "Manhwa (Korea)", languages: ["ko", "ko-ro"] },
    manhua: { label: "Manhua (China)", languages: ["zh", "zh-hk", "zh-ro"] }
};
const SORT_OPTIONS = {
    followedCount: "Most popular",
    relevance: "Best match",
    latestUploadedChapter: "Latest updates",
    createdAt: "Recently added",
    rating: "Highest rated",
    year: "Release year",
    title: "Title A-Z"
};
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 12000,
    headers: { "User-Agent": "MangaVerse/1.0 (MangaDex API reader)" }
});

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production.");
}
if (process.env.NODE_ENV === "production" && (!process.env.APP_BASE_URL || APP_URL.protocol !== "https:")) {
    throw new Error("A public HTTPS APP_BASE_URL must be set in production.");
}
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const dataDirectory = fileURLToPath(new URL("./data/", import.meta.url));
mkdirSync(dataDirectory, { recursive: true });
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(dataDirectory, "mangaverse.sqlite"));
mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        preferences TEXT NOT NULL,
        created_at TEXT NOT NULL,
        profile_picture BLOB,
        profile_picture_type TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS password_reset_user_idx
        ON password_reset_tokens(user_id, created_at);
`);
const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
if (!userColumns.has("profile_picture")) db.exec("ALTER TABLE users ADD COLUMN profile_picture BLOB");
if (!userColumns.has("profile_picture_type")) db.exec("ALTER TABLE users ADD COLUMN profile_picture_type TEXT");
db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ?").run(Date.now());

app.set("view engine", "ejs");
app.set("views", fileURLToPath(new URL("./views", import.meta.url)));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

function localizedText(text, language = "en") {
    if (!text) return "";
    return text[language] || text.en || text["ja-ro"] || Object.values(text)[0] || "";
}

function getCover(manga) {
    const cover = manga.relationships?.find((relationship) => relationship.type === "cover_art");
    const fileName = cover?.attributes?.fileName;
    return fileName
        ? `/image/covers/${manga.id}/${encodeURIComponent(fileName)}`
        : "";
}

function getProfilePictureType(buffer) {
    if (buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    return "";
}

function toManga(manga) {
    const tags = manga.attributes?.tags || [];
    return {
        id: manga.id,
        title: localizedText(manga.attributes?.title) || "Untitled",
        description: localizedText(manga.attributes?.description) || "No description available.",
        cover: getCover(manga),
        status: manga.attributes?.status || "unknown",
        lastChapter: manga.attributes?.lastChapter || "",
        latestChapterId: manga.attributes?.latestUploadedChapter || "",
        year: manga.attributes?.year || "",
        rating: manga.attributes?.contentRating || "safe",
        originalLanguage: manga.attributes?.originalLanguage || "",
        availableTranslatedLanguages: manga.attributes?.availableTranslatedLanguages || [],
        updatedAt: manga.attributes?.updatedAt || "",
        genres: tags
            .filter((tag) => tag.attributes?.group === "genre")
            .map((tag) => localizedText(tag.attributes?.name))
            .filter(Boolean),
        creators: (manga.relationships || [])
            .filter((relationship) => ["author", "artist"].includes(relationship.type))
            .map((relationship) => relationship.attributes?.name)
            .filter(Boolean),
        tags: tags
            .map((tag) => localizedText(tag.attributes?.name))
            .filter(Boolean)
            .slice(0, 3)
    };
}

function getChapterGroup(chapter) {
    return chapter.relationships?.find((relationship) => relationship.type === "scanlation_group")
        ?.attributes?.name || "Community translation";
}

function sortChapters(chapters) {
    return chapters.sort((a, b) => {
        const chapterA = Number.parseFloat(a.attributes?.chapter);
        const chapterB = Number.parseFloat(b.attributes?.chapter);
        if (Number.isFinite(chapterA) && Number.isFinite(chapterB) && chapterA !== chapterB) {
            return chapterA - chapterB;
        }
        return new Date(a.attributes?.publishAt || 0) - new Date(b.attributes?.publishAt || 0);
    });
}

function chapterLabel(chapter) {
    const number = chapter.attributes?.chapter;
    const title = chapter.attributes?.title;
    return [number ? `Chapter ${number}` : "Oneshot", title].filter(Boolean).join(" · ");
}

function apiErrorMessage(error) {
    if (error.response?.status === 404) return "That title or chapter could not be found.";
    if (error.response?.status === 429) return "MangaDex is receiving too many requests. Please try again in a moment.";
    if (error.code === "ECONNABORTED") return "MangaDex took too long to respond. Please try again.";
    return "MangaDex could not be reached. Please try again in a moment.";
}

function renderError(res, error, status = 502) {
    console.error("MangaDex request failed:", error.message);
    return res.status(status).render("error", {
        pageTitle: "Something went wrong",
        message: apiErrorMessage(error)
    });
}

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie || "";
    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return "";
        }
    }
    return "";
}

function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashPassword(password) {
    const salt = randomBytes(16);
    const passwordHash = await scrypt(password, salt, 64);
    return { salt: salt.toString("hex"), hash: passwordHash.toString("hex") };
}

async function passwordMatches(password, user) {
    const salt = user ? Buffer.from(user.password_salt, "hex") : Buffer.alloc(16);
    const submittedHash = await scrypt(password, salt, 64);
    const storedHash = user ? Buffer.from(user.password_hash, "hex") : Buffer.alloc(64);
    return timingSafeEqual(submittedHash, storedHash) && Boolean(user);
}

function getSmtpMailer() {
    const host = process.env.SMTP_HOST?.trim();
    const from = process.env.SMTP_FROM?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASS;
    const configured = [host, from, user, password].some(Boolean);
    if (!configured) return null;
    if (!host || !from || !Number.isInteger(Number(process.env.SMTP_PORT || 587)) ||
        Number(process.env.SMTP_PORT || 587) < 1 || Number(process.env.SMTP_PORT || 587) > 65535 ||
        Boolean(user) !== Boolean(password)) {
        throw new Error("SMTP settings are incomplete or invalid.");
    }

    return {
        from,
        transporter: nodemailer.createTransport({
            host,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            ...(user ? { auth: { user, pass: password } } : {})
        })
    };
}

function appendCookie(res, name, value, { httpOnly = false, maxAge } = {}) {
    const attributes = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
    if (httpOnly) attributes.push("HttpOnly");
    if (Number.isFinite(maxAge)) attributes.push(`Max-Age=${maxAge}`);
    if (process.env.NODE_ENV === "production") attributes.push("Secure");
    res.append("Set-Cookie", attributes.join("; "));
}

function createCsrfToken() {
    const nonce = randomBytes(24).toString("base64url");
    const signature = createHmac("sha256", sessionSecret).update(nonce).digest("base64url");
    return `${nonce}.${signature}`;
}

function validCsrfValue(value) {
    if (typeof value !== "string") return false;
    const [nonce, signature, extra] = value.split(".");
    if (!nonce || !signature || extra) return false;
    const expected = createHmac("sha256", sessionSecret).update(nonce).digest("base64url");
    return constantTimeEqual(signature, expected);
}

function validCsrfToken(req) {
    const submitted = req.body?._csrf;
    const cookie = getCookie(req, CSRF_COOKIE);
    if (typeof submitted !== "string" || !constantTimeEqual(submitted, cookie)) return false;
    return validCsrfValue(submitted);
}

function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function colorChannels(color) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
}

function mixColors(first, second, amount) {
    const firstChannels = colorChannels(first);
    const secondChannels = colorChannels(second);
    const channels = firstChannels.map((channel, index) =>
        Math.round(channel + (secondChannels[index] - channel) * amount)
    );
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function colorLuminance(color) {
    const channels = colorChannels(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function themeStyle(theme) {
    const light = colorLuminance(theme.background) > 0.42;
    const text = light ? "#201a20" : "#f5f5f7";
    const muted = mixColors(text, theme.background, 0.56);
    const raised = mixColors(theme.surface, light ? "#000000" : "#ffffff", light ? 0.035 : 0.09);
    const line = mixColors(theme.surface, text, light ? 0.16 : 0.18);
    const hover = mixColors(theme.surface, text, light ? 0.075 : 0.12);
    const accentInk = colorLuminance(theme.accent) > 0.48 ? "#171717" : "#ffffff";
    const accentChannels = colorChannels(theme.accent);
    const css = {
        "color-scheme": light ? "light" : "dark",
        "--bg": theme.background,
        "--surface": theme.surface,
        "--surface-raised": raised,
        "--line": line,
        "--line-strong": mixColors(theme.surface, text, light ? 0.25 : 0.3),
        "--muted": muted,
        "--text": text,
        "--text-secondary": mixColors(text, theme.background, 0.82),
        "--text-subtle": mixColors(text, theme.background, 0.68),
        "--accent": theme.accent,
        "--accent-ink": accentInk,
        "--surface-hover": hover,
        "--field-bg": raised,
        "--field-border": line,
        "--tag-bg": mixColors(theme.surface, text, light ? 0.06 : 0.12),
        "--hero-glow": mixColors(theme.background, theme.accent, 0.22),
        "--hero-mid": mixColors(theme.background, theme.surface, 0.72),
        "--hero-end": theme.background,
        "--hero-book-start": theme.accent,
        "--hero-book-end": mixColors(theme.accent, theme.background, 0.32),
        "--hero-book-edge": mixColors(theme.accent, "#ffffff", 0.42),
        "--hero-book-shadow": mixColors(theme.accent, "#000000", 0.34),
        "--hero-book-ink": accentInk,
        "--hero-book-line": `rgb(${accentChannels.join(" ")} / 42%)`,
        "--hero-orbit": `rgb(${accentChannels.join(" ")} / 18%)`
    };
    return Object.entries(css).map(([name, value]) => `${name}: ${value}`).join("; ");
}

function readCustomThemes(value) {
    const customThemes = value ?? [];
    if (!Array.isArray(customThemes) || customThemes.length > MAX_CUSTOM_THEMES) {
        throw new Error("The saved custom themes are invalid.");
    }

    const ids = new Set();
    const names = new Set(THEMES.map((theme) => theme.name.toLocaleLowerCase()));
    return customThemes.map((theme) => {
        if (!theme || typeof theme !== "object" ||
            typeof theme.id !== "string" || !/^custom-[a-f0-9]{24}$/.test(theme.id) ||
            typeof theme.name !== "string" || theme.name.trim().length < 1 ||
            theme.name.trim().length > 32 ||
            !isHexColor(theme.background) || !isHexColor(theme.surface) || !isHexColor(theme.accent)) {
            throw new Error("The saved custom themes are invalid.");
        }
        const name = theme.name.trim();
        const normalizedName = name.toLocaleLowerCase();
        if (ids.has(theme.id) || names.has(normalizedName)) {
            throw new Error("The saved custom themes contain duplicates.");
        }
        ids.add(theme.id);
        names.add(normalizedName);
        return {
            id: theme.id,
            name,
            background: theme.background.toLowerCase(),
            surface: theme.surface.toLowerCase(),
            accent: theme.accent.toLowerCase()
        };
    });
}

function validNotificationFolderIds(value) {
    return Array.isArray(value) &&
        value.length <= DEFAULT_BOOKMARK_FOLDERS.length + 20 &&
        new Set(value).size === value.length &&
        value.every((id) => typeof id === "string" &&
            (DEFAULT_BOOKMARK_FOLDER_IDS.has(id) || /^custom-[a-z0-9-]{1,64}$/.test(id)));
}

function readPreferences(serialized) {
    const preferences = JSON.parse(serialized);
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
        throw new Error("The saved account preferences are invalid.");
    }
    const customThemes = readCustomThemes(preferences.customThemes);
    const theme = preferences.theme ?? DEFAULT_PREFERENCES.theme;
    const showContinueReading = preferences.showContinueReading ?? DEFAULT_PREFERENCES.showContinueReading;
    const showBookmarkedUpdates = preferences.showBookmarkedUpdates ?? DEFAULT_PREFERENCES.showBookmarkedUpdates;
    const mutedNotificationFolders = preferences.mutedNotificationFolders ??
        DEFAULT_PREFERENCES.mutedNotificationFolders;
    if (typeof preferences.showTrending !== "boolean" ||
        typeof showContinueReading !== "boolean" ||
        typeof showBookmarkedUpdates !== "boolean" ||
        !validNotificationFolderIds(mutedNotificationFolders) ||
        !["wide", "medium", "fit"].includes(preferences.readerWidth) ||
        !(THEMES.some((option) => option.id === theme) ||
            customThemes.some((option) => option.id === theme))) {
        throw new Error("The saved account preferences are invalid.");
    }
    return {
        ...preferences,
        customThemes,
        showContinueReading,
        showBookmarkedUpdates,
        mutedNotificationFolders,
        theme
    };
}

function resolveTheme(preferences) {
    return THEMES.find((theme) => theme.id === preferences.theme) ||
        preferences.customThemes.find((theme) => theme.id === preferences.theme) ||
        THEMES[0];
}

function loadUserContext(req, res, next) {
    const token = getCookie(req, SESSION_COOKIE);
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const row = db.prepare(`
            SELECT users.id, users.username, users.email, users.preferences,
                users.profile_picture IS NOT NULL AS has_profile_picture
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
        `).get(tokenHash, Date.now());
        if (row) {
            req.currentUser = {
                id: row.id,
                username: row.username,
                email: row.email,
                hasProfilePicture: Boolean(row.has_profile_picture),
                preferences: readPreferences(row.preferences)
            };
            req.sessionTokenHash = tokenHash;
        } else {
            db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
        }
    }

    res.locals.currentUser = req.currentUser || null;
    res.locals.userPreferences = req.currentUser?.preferences || { ...DEFAULT_PREFERENCES };
    res.locals.activeTheme = resolveTheme(res.locals.userPreferences);
    res.locals.themeMode = colorLuminance(res.locals.activeTheme.background) > 0.42 ? "light" : "dark";
    res.locals.themeStyle = themeStyle(res.locals.activeTheme);
    const csrfCookie = getCookie(req, CSRF_COOKIE);
    res.locals.csrfToken = validCsrfValue(csrfCookie) ? csrfCookie : createCsrfToken();
    appendCookie(res, CSRF_COOKIE, res.locals.csrfToken, { maxAge: 6 * 60 * 60 });

    if (req.method === "POST" && req.path !== "/profile/picture" && !validCsrfToken(req)) {
        return res.status(403).render("error", {
            pageTitle: "Request could not be verified",
            message: "Refresh the page and try again."
        });
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.currentUser) {
        return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
}

function startSession(req, res, userId) {
    if (req.sessionTokenHash) {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(req.sessionTokenHash);
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .run(tokenHash, userId, expiresAt);
    appendCookie(res, SESSION_COOKIE, token, {
        httpOnly: true,
        maxAge: Math.floor(SESSION_TTL_MS / 1000)
    });
}

function safeReturnPath(value) {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
        return "/";
    }
    return value;
}

app.use(loadUserContext);

function validId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function queryValues(value, allowedValues) {
    const values = Array.isArray(value) ? value : [value];
    return [...new Set(values.filter((item) => typeof item === "string" && allowedValues.includes(item)))];
}

function normalizeYear(value) {
    if (typeof value !== "string" || !/^\d{4}$/.test(value)) return "";
    const year = Number(value);
    return year >= 1900 && year <= new Date().getFullYear() ? value : "";
}

function normalizeBrowseFilters(query) {
    const title = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
    const requestedRatings = queryValues(query.rating, CONTENT_RATINGS);
    const language = typeof query.language === "string" &&
        LANGUAGES.some((item) => item.code === query.language)
        ? query.language
        : query.language === "" ? "" : "en";
    const type = typeof query.type === "string" && Object.hasOwn(MANGA_TYPES, query.type)
        ? query.type
        : "";
    const sort = typeof query.sort === "string" && Object.hasOwn(SORT_OPTIONS, query.sort)
        ? query.sort
        : title ? "relevance" : "followedCount";
    const minChapters = typeof query.minChapters === "string" &&
        /^\d{1,4}$/.test(query.minChapters) &&
        Number(query.minChapters) > 0
        ? query.minChapters
        : "";

    return {
        title,
        ratings: requestedRatings.length ? requestedRatings : DEFAULT_CONTENT_RATINGS,
        type,
        tags: (Array.isArray(query.tag) ? query.tag : [query.tag])
            .filter((tag) => typeof tag === "string" && validId(tag))
            .slice(0, 10),
        language,
        statuses: queryValues(query.status, STATUSES),
        author: typeof query.author === "string" ? query.author.trim().slice(0, 100) : "",
        yearFrom: normalizeYear(query.yearFrom),
        yearTo: normalizeYear(query.yearTo),
        minChapters,
        sort
    };
}

let genreTagCache;

async function getGenreTags() {
    if (genreTagCache) return genreTagCache;
    const { data } = await api.get("/manga/tag");
    genreTagCache = (data.data || [])
        .filter((tag) => tag.attributes?.group === "genre")
        .map((tag) => ({ id: tag.id, name: localizedText(tag.attributes?.name) }))
        .filter((tag) => tag.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    return genreTagCache;
}

async function findAuthorId(name) {
    if (!name) return null;
    const { data } = await api.get("/author", { params: { name, limit: 10 } });
    const authors = data.data || [];
    const exactMatch = authors.find((author) =>
        author.attributes?.name?.toLocaleLowerCase() === name.toLocaleLowerCase());
    return (exactMatch || authors[0])?.id || null;
}

function mangaQuery({ filters, offset = 0, authorId, limit = PAGE_SIZE } = {}) {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("includes[]", "cover_art");
    (filters?.ratings || DEFAULT_CONTENT_RATINGS).forEach((rating) =>
        params.append("contentRating[]", rating));
    if (filters?.language) params.set("availableTranslatedLanguage[]", filters.language);
    if (filters?.title) params.set("title", filters.title);
    if (filters?.type) {
        MANGA_TYPES[filters.type].languages.forEach((language) =>
            params.append("originalLanguage[]", language));
    }
    (filters?.tags || []).forEach((tag) => params.append("includedTags[]", tag));
    if (filters?.tags?.length) params.set("includedTagsMode", "OR");
    (filters?.statuses || []).forEach((status) => params.append("status[]", status));
    if (filters?.yearFrom && filters.yearFrom === filters.yearTo) {
        params.set("year", filters.yearFrom);
    }
    if (authorId) params.set("authorOrArtist", authorId);
    const sort = filters?.sort || "followedCount";
    params.set(`order[${sort}]`, sort === "title" ? "asc" : "desc");
    return params;
}

function matchesLocalFilters(manga, filters) {
    const year = manga.attributes?.year;
    if (filters.yearFrom && (!year || year < Number(filters.yearFrom))) return false;
    if (filters.yearTo && (!year || year > Number(filters.yearTo))) return false;
    if (filters.minChapters) {
        const latestChapter = Number.parseFloat(manga.attributes?.lastChapter);
        if (!Number.isFinite(latestChapter) || latestChapter < Number(filters.minChapters)) return false;
    }
    return true;
}

function buildBrowseUrl(filters, offset, path) {
    const params = new URLSearchParams();
    if (filters.title) params.set("q", filters.title);
    filters.ratings.forEach((rating) => params.append("rating", rating));
    if (filters.type) params.set("type", filters.type);
    filters.tags.forEach((tag) => params.append("tag", tag));
    params.set("language", filters.language);
    filters.statuses.forEach((status) => params.append("status", status));
    if (filters.author) params.set("author", filters.author);
    if (filters.yearFrom) params.set("yearFrom", filters.yearFrom);
    if (filters.yearTo) params.set("yearTo", filters.yearTo);
    if (filters.minChapters) params.set("minChapters", filters.minChapters);
    params.set("sort", filters.sort);
    params.set("offset", String(offset));
    return `${path}?${params.toString()}`;
}

async function findManga({ filters, offset = 0, authorId, limit = PAGE_SIZE } = {}) {
    const { data } = await api.get("/manga", {
        params: mangaQuery({ filters, offset, authorId, limit })
    });
    const results = data.data || [];
    return {
        manga: results.filter((manga) => matchesLocalFilters(manga, filters)).map(toManga),
        candidateCount: results.length,
        total: data.total || 0
    };
}

async function findChapters(mangaId) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("translatedLanguage[]", "en");
    params.set("order[chapter]", "desc");
    params.set("includes[]", "scanlation_group");
    const { data } = await api.get(`/manga/${mangaId}/feed`, { params });
    return sortChapters(data.data || []);
}

app.get("/image/covers/:mangaId/:fileName", async (req, res) => {
    const { mangaId, fileName } = req.params;
    if (!validId(mangaId) || !/^[a-f0-9-]+\.(?:jpe?g|png|webp)$/i.test(fileName)) {
        return res.sendStatus(404);
    }

    try {
        const upstream = await axios.get(
            `${COVER_BASE_URL}/${mangaId}/${encodeURIComponent(fileName)}`,
            {
                responseType: "stream",
                timeout: 12000,
                headers: { "User-Agent": "MangaVerse/1.0 (MangaDex API reader)" }
            }
        );
        const contentType = upstream.headers["content-type"];
        if (!contentType?.startsWith("image/")) {
            upstream.data.destroy();
            return res.status(502).type("text/plain").send("MangaDex did not return an image.");
        }

        res.set("Content-Type", contentType);
        res.set("Cache-Control", "public, max-age=86400");
        upstream.data.on("error", (error) => {
            console.error("MangaDex cover image stream failed:", error.message);
            if (res.headersSent) res.destroy(error);
            else res.status(502).end();
        });
        upstream.data.pipe(res);
    } catch (error) {
        console.error("MangaDex cover image request failed:", error.message);
        res.status(error.response?.status || 502).type("text/plain").send("Cover image unavailable.");
    }
});

async function renderBrowsePage(req, res, showFilters, path) {
    const filters = normalizeBrowseFilters(req.query);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const offset = Number.isFinite(requestedOffset)
        ? Math.min(10000, Math.max(0, Math.floor(requestedOffset / PAGE_SIZE) * PAGE_SIZE))
        : 0;

    try {
        const genreTags = showFilters || filters.tags.length ? await getGenreTags() : [];
        const knownTags = new Set(genreTags.map((tag) => tag.id));
        if (showFilters || filters.tags.length) {
            filters.tags = filters.tags.filter((tag) => knownTags.has(tag));
        }
        const authorId = filters.author ? await findAuthorId(filters.author) : null;
        const results = filters.author && !authorId
            ? { manga: [], candidateCount: 0, total: 0 }
            : await findManga({ filters, offset, authorId });
        let trending = [];
        if (!showFilters && !filters.title) {
            const trendingResults = filters.sort === "followedCount"
                ? results
                : await findManga({
                    filters: { ...filters, sort: "followedCount" },
                    limit: TRENDING_SIZE
                });
            trending = trendingResults.manga.slice(0, TRENDING_SIZE);
        }
        const hasYearRange = Boolean(
            (filters.yearFrom || filters.yearTo) && filters.yearFrom !== filters.yearTo
        );
        const localFilterActive = Boolean(hasYearRange || filters.minChapters);
        res.render("home", {
            pageTitle: filters.title ? `Search: ${filters.title}` : "Browse manga",
            manga: results.manga,
            query: filters.title,
            showFilters,
            trending,
            offset,
            total: results.total,
            candidateCount: results.candidateCount,
            sort: filters.sort,
            filters,
            genreTags,
            languages: LANGUAGES,
            mangaTypes: MANGA_TYPES,
            sortOptions: SORT_OPTIONS,
            localFilterActive,
            previousUrl: offset > 0
                ? buildBrowseUrl(filters, Math.max(0, offset - PAGE_SIZE), path)
                : "",
            nextUrl: offset + results.candidateCount < results.total
                ? buildBrowseUrl(filters, offset + PAGE_SIZE, path)
                : ""
        });
    } catch (error) {
        renderError(res, error);
    }
}

app.get("/", async (req, res) => renderBrowsePage(req, res, false, "/"));
app.get("/search", async (req, res) => renderBrowsePage(req, res, true, "/search"));

app.get("/register", (req, res) => {
    if (req.currentUser) return res.redirect("/");
    res.render("register", {
        pageTitle: "Create account",
        error: "",
        username: "",
        email: "",
        next: safeReturnPath(req.query.next)
    });
});

app.post("/register", async (req, res) => {
    if (req.currentUser) return res.redirect("/");
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const passwordConfirmation = typeof req.body.passwordConfirmation === "string"
        ? req.body.passwordConfirmation
        : "";
    const next = safeReturnPath(req.body.next);
    const renderRegistrationError = (message, status = 400) => res.status(status).render("register", {
        pageTitle: "Create account",
        error: message,
        username,
        email,
        next
    });

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        return renderRegistrationError("Use 3–24 letters, numbers, or underscores for your username.");
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return renderRegistrationError("Enter a valid email address.");
    }
    if (password.length < 8 || password.length > 128) {
        return renderRegistrationError("Your password must be between 8 and 128 characters.");
    }
    if (password !== passwordConfirmation) {
        return renderRegistrationError("The passwords do not match.");
    }

    const existing = db.prepare(
        "SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE"
    ).get(username, email);
    if (existing) return renderRegistrationError("That username or email is already registered.", 409);

    const { salt, hash } = await hashPassword(password);
    const result = db.prepare(`
        INSERT INTO users (username, email, password_salt, password_hash, preferences, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        username,
        email,
        salt,
        hash,
        JSON.stringify(DEFAULT_PREFERENCES),
        new Date().toISOString()
    );
    startSession(req, res, Number(result.lastInsertRowid));
    res.redirect(next);
});

app.get("/login", (req, res) => {
    if (req.currentUser) return res.redirect("/");
    res.render("login", {
        pageTitle: "Sign in",
        error: "",
        identifier: "",
        reset: req.query.reset === "1",
        next: safeReturnPath(req.query.next)
    });
});

app.post("/login", async (req, res) => {
    if (req.currentUser) return res.redirect("/");
    const identifier = typeof req.body.identifier === "string" ? req.body.identifier.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const next = safeReturnPath(req.body.next);
    const user = db.prepare(`
        SELECT id, password_salt, password_hash
        FROM users
        WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
    `).get(identifier, identifier);
    if (!await passwordMatches(password, user)) {
        return res.status(401).render("login", {
            pageTitle: "Sign in",
            error: "The username/email or password is incorrect.",
            identifier,
            reset: false,
            next
        });
    }

    startSession(req, res, user.id);
    res.redirect(next);
});

app.post("/logout", (req, res) => {
    if (req.sessionTokenHash) {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(req.sessionTokenHash);
    }
    appendCookie(res, SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 });
    res.redirect("/");
});

app.get("/contact", (req, res) => {
    res.render("contact", {
        pageTitle: "Contact us",
        email: req.currentUser?.email || "",
        subject: "",
        message: "",
        error: "",
        sent: false
    });
});

app.post("/contact", async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const pageData = { pageTitle: "Contact us", email, subject, message, error: "", sent: false };

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        subject.length < 1 || subject.length > 120 || /[\r\n]/.test(subject) ||
        message.length < 1 || message.length > 1000) {
        return res.status(400).render("contact", {
            ...pageData,
            error: "Enter a valid email, a subject, and a message of up to 1,000 characters."
        });
    }

    let mailer;
    try {
        mailer = getSmtpMailer();
    } catch (error) {
        console.error("Contact email configuration is invalid:", error.message);
        return res.status(503).render("contact", {
            ...pageData,
            error: "Contact messages are unavailable because the email settings are incomplete."
        });
    }
    if (!mailer) {
        return res.status(503).render("contact", {
            ...pageData,
            error: "Contact messages are not configured yet. Please try again later."
        });
    }

    try {
        await mailer.transporter.sendMail({
            from: mailer.from,
            to: CONTACT_EMAIL,
            replyTo: email,
            subject: `MangaVerse contact: ${subject}`,
            text: `From: ${email}\n\n${message}`
        });
    } catch (error) {
        console.error("Contact message delivery failed:", error.message);
        return res.status(502).render("contact", {
            ...pageData,
            error: "Your message could not be sent right now. Please try again later."
        });
    }

    res.render("contact", { ...pageData, sent: true });
});

app.get("/forgot-password", (req, res) => {
    res.render("forgot-password", {
        pageTitle: "Forgot password",
        error: "",
        sent: false
    });
});

app.post("/forgot-password", async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    let mailer;
    try {
        mailer = getSmtpMailer();
    } catch (error) {
        console.error("Password reset email configuration is invalid:", error.message);
        return res.status(503).render("forgot-password", {
            pageTitle: "Forgot password",
            error: "Password recovery is not available because the email settings are incomplete.",
            sent: false
        });
    }
    if (!mailer) {
        return res.status(503).render("forgot-password", {
            pageTitle: "Forgot password",
            error: "Password recovery is not configured yet. Please contact the site administrator.",
            sent: false
        });
    }

    const user = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? db.prepare("SELECT id, username, email FROM users WHERE email = ? COLLATE NOCASE").get(email)
        : null;
    if (user) {
        const now = Date.now();
        const recentRequest = db.prepare(`
            SELECT 1 FROM password_reset_tokens
            WHERE user_id = ? AND created_at > ?
            LIMIT 1
        `).get(user.id, now - 5 * 60 * 1000);
        if (!recentRequest) {
            db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(user.id);
            const token = randomBytes(32).toString("base64url");
            const tokenHash = createHash("sha256").update(token).digest("hex");
            db.prepare(`
                INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
            `).run(tokenHash, user.id, now + PASSWORD_RESET_TTL_MS, now);
            const resetUrl = `${APP_BASE_URL.replace(/\/+$/, "")}/reset-password/${token}`;
            try {
                await mailer.transporter.sendMail({
                    from: mailer.from,
                    to: user.email,
                    subject: "Reset your MangaVerse password",
                    text: `Hello ${user.username},\n\nUse this link within one hour to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`
                });
            } catch (error) {
                db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
                console.error("Password reset email delivery failed:", error.message);
            }
        }
    }

    res.render("forgot-password", {
        pageTitle: "Forgot password",
        error: "",
        sent: true
    });
});

app.get("/reset-password/:token", (req, res) => {
    const token = req.params.token;
    const tokenHash = /^[A-Za-z0-9_-]{43}$/.test(token)
        ? createHash("sha256").update(token).digest("hex")
        : "";
    const valid = tokenHash && db.prepare(`
        SELECT 1 FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash, Date.now());
    if (!valid) {
        return res.status(400).render("reset-password", {
            pageTitle: "Reset password",
            token: "",
            error: "This password reset link is invalid or has expired.",
            expired: true
        });
    }
    res.render("reset-password", {
        pageTitle: "Reset password",
        token,
        error: "",
        expired: false
    });
});

app.post("/reset-password/:token", async (req, res) => {
    const token = req.params.token;
    const tokenHash = /^[A-Za-z0-9_-]{43}$/.test(token)
        ? createHash("sha256").update(token).digest("hex")
        : "";
    const reset = tokenHash ? db.prepare(`
        SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash, Date.now()) : null;
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const confirmation = typeof req.body.passwordConfirmation === "string"
        ? req.body.passwordConfirmation
        : "";
    const renderResetError = (message) => res.status(400).render("reset-password", {
        pageTitle: "Reset password",
        token: reset ? token : "",
        error: message,
        expired: !reset
    });
    if (!reset) return renderResetError("This password reset link is invalid or has expired.");
    if (password.length < 8 || password.length > 128) {
        return renderResetError("Your password must be between 8 and 128 characters.");
    }
    if (password !== confirmation) return renderResetError("The passwords do not match.");

    const { salt, hash } = await hashPassword(password);
    db.exec("BEGIN IMMEDIATE");
    try {
        const stillValid = db.prepare(`
            SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?
        `).get(tokenHash, Date.now());
        if (!stillValid) {
            db.exec("ROLLBACK");
            return renderResetError("This password reset link has already been used or has expired.");
        }
        db.prepare("UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?")
            .run(salt, hash, reset.user_id);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(reset.user_id);
        db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(reset.user_id);
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }

    appendCookie(res, SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 });
    res.redirect("/login?reset=1");
});

app.get("/settings", requireAuth, (req, res) => {
    res.render("settings", {
        pageTitle: "Settings",
        preferences: req.currentUser.preferences,
        bookmarkFolders: DEFAULT_BOOKMARK_FOLDERS,
        saved: req.query.saved === "1"
    });
});

app.post("/settings", requireAuth, (req, res) => {
    const settingsPage = {
        pageTitle: "Settings",
        preferences: req.currentUser.preferences,
        bookmarkFolders: DEFAULT_BOOKMARK_FOLDERS,
        saved: false
    };
    const readerWidth = typeof req.body.readerWidth === "string" ? req.body.readerWidth : "";
    if (!["wide", "medium", "fit"].includes(readerWidth)) {
        return res.status(400).render("settings", {
            ...settingsPage,
            error: "Choose a valid reader page width."
        });
    }

    const submittedFolderIds = req.body.notificationFolderIds;
    const folderIds = submittedFolderIds === undefined
        ? []
        : Array.isArray(submittedFolderIds) ? submittedFolderIds : [submittedFolderIds];
    const submittedEnabledFolders = req.body.notificationFolders;
    const enabledFolders = submittedEnabledFolders === undefined
        ? []
        : Array.isArray(submittedEnabledFolders) ? submittedEnabledFolders : [submittedEnabledFolders];
    if (!validNotificationFolderIds(folderIds) ||
        !validNotificationFolderIds(enabledFolders) ||
        !DEFAULT_BOOKMARK_FOLDERS.every((folder) => folderIds.includes(folder.id)) ||
        enabledFolders.some((id) => !folderIds.includes(id))) {
        return res.status(400).render("settings", {
            ...settingsPage,
            error: "Choose valid bookmark folders for chapter notifications."
        });
    }
    const enabledFolderIds = new Set(enabledFolders);
    const mutedNotificationFolders = folderIds.filter((id) => !enabledFolderIds.has(id));

    const preferences = {
        ...req.currentUser.preferences,
        showTrending: req.body.showTrending === "on",
        showContinueReading: req.body.showContinueReading === "on",
        showBookmarkedUpdates: req.body.showBookmarkedUpdates === "on",
        mutedNotificationFolders,
        readerWidth
    };
    db.prepare("UPDATE users SET preferences = ? WHERE id = ?")
        .run(JSON.stringify(preferences), req.currentUser.id);
    res.redirect("/settings?saved=1");
});

function themePageLocals(req, overrides = {}) {
    return {
        pageTitle: "Themes",
        preferences: req.currentUser.preferences,
        themes: THEMES,
        customThemes: req.currentUser.preferences.customThemes,
        customThemeDraft: {
            id: "",
            name: "",
            background: "#101115",
            surface: "#181a20",
            accent: "#c5f467"
        },
        saved: req.query.saved === "1",
        customSaved: req.query.custom === "1",
        customDeleted: req.query.deleted === "1",
        ...overrides
    };
}

app.get("/settings/themes", requireAuth, (req, res) => {
    res.render("themes", themePageLocals(req));
});

app.post("/settings/themes", requireAuth, (req, res) => {
    const theme = typeof req.body.theme === "string" ? req.body.theme : "";
    const preferences = req.currentUser.preferences;
    if (!THEMES.some((option) => option.id === theme) &&
        !preferences.customThemes.some((option) => option.id === theme)) {
        return res.status(400).render("themes", themePageLocals(req, {
            saved: false,
            error: "Choose one of the available themes."
        }));
    }

    db.prepare("UPDATE users SET preferences = ? WHERE id = ?")
        .run(JSON.stringify({ ...preferences, theme }), req.currentUser.id);
    res.redirect("/settings/themes?saved=1");
});

app.post("/settings/themes/custom", requireAuth, (req, res) => {
    const id = typeof req.body.id === "string" ? req.body.id.trim() : "";
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const background = typeof req.body.background === "string" ? req.body.background : "";
    const surface = typeof req.body.surface === "string" ? req.body.surface : "";
    const accent = typeof req.body.accent === "string" ? req.body.accent : "";
    const customThemeDraft = {
        id,
        name,
        background: isHexColor(background) ? background.toLowerCase() : "#101115",
        surface: isHexColor(surface) ? surface.toLowerCase() : "#181a20",
        accent: isHexColor(accent) ? accent.toLowerCase() : "#c5f467"
    };
    const renderError = (message) => res.status(400).render("themes", themePageLocals(req, {
        saved: false,
        customSaved: false,
        error: message,
        customThemeDraft
    }));
    const preferences = req.currentUser.preferences;
    const existing = id ? preferences.customThemes.find((theme) => theme.id === id) : null;

    if (id && (!/^custom-[a-f0-9]{24}$/.test(id) || !existing)) {
        return renderError("That custom theme could not be found.");
    }
    if (name.length < 1 || name.length > 32) {
        return renderError("Theme names must be between 1 and 32 characters.");
    }
    if (!isHexColor(background) || !isHexColor(surface) || !isHexColor(accent)) {
        return renderError("Choose valid colors for the background, surface, and accent.");
    }
    if ([...THEMES, ...preferences.customThemes.filter((theme) => theme.id !== id)]
        .some((theme) => theme.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        return renderError("A theme with that name already exists.");
    }
    if (!id && preferences.customThemes.length >= MAX_CUSTOM_THEMES) {
        return renderError(`You can save up to ${MAX_CUSTOM_THEMES} custom themes.`);
    }

    const theme = {
        id: existing?.id || `custom-${randomBytes(12).toString("hex")}`,
        name,
        background: background.toLowerCase(),
        surface: surface.toLowerCase(),
        accent: accent.toLowerCase()
    };
    const customThemes = existing
        ? preferences.customThemes.map((savedTheme) => savedTheme.id === id ? theme : savedTheme)
        : [...preferences.customThemes, theme];
    db.prepare("UPDATE users SET preferences = ? WHERE id = ?")
        .run(JSON.stringify({
            ...preferences,
            customThemes,
            theme: existing ? preferences.theme : theme.id
        }), req.currentUser.id);
    res.redirect("/settings/themes?custom=1");
});

app.post("/settings/themes/custom/:id/delete", requireAuth, (req, res) => {
    const preferences = req.currentUser.preferences;
    if (!/^custom-[a-f0-9]{24}$/.test(req.params.id) ||
        !preferences.customThemes.some((theme) => theme.id === req.params.id)) {
        return res.status(404).render("error", {
            pageTitle: "Theme not found",
            message: "That custom theme could not be found."
        });
    }

    const nextPreferences = {
        ...preferences,
        customThemes: preferences.customThemes.filter((theme) => theme.id !== req.params.id),
        theme: preferences.theme === req.params.id ? DEFAULT_PREFERENCES.theme : preferences.theme
    };
    db.prepare("UPDATE users SET preferences = ? WHERE id = ?")
        .run(JSON.stringify(nextPreferences), req.currentUser.id);
    res.redirect("/settings/themes?deleted=1");
});

function profilePageLocals(req, overrides = {}) {
    return {
        pageTitle: "Profile",
        saved: req.query.saved === "1",
        passwordSaved: req.query.password === "1",
        pictureSaved: req.query.picture === "1",
        pictureRemoved: req.query.pictureRemoved === "1",
        profileError: "",
        passwordError: "",
        pictureError: "",
        username: req.currentUser.username,
        email: req.currentUser.email,
        ...overrides
    };
}

app.get("/profile", requireAuth, (req, res) => {
    res.render("profile", profilePageLocals(req));
});

app.post("/profile", requireAuth, async (req, res) => {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const renderProfileError = (message, status = 400) => res.status(status).render("profile", profilePageLocals(req, {
        saved: false,
        passwordSaved: false,
        profileError: message,
        username,
        email
    }));

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        return renderProfileError("Use 3–24 letters, numbers, or underscores for your username.");
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return renderProfileError("Enter a valid email address.");
    }

    const user = db.prepare("SELECT password_salt, password_hash FROM users WHERE id = ?")
        .get(req.currentUser.id);
    if (!await passwordMatches(currentPassword, user)) {
        return renderProfileError("Your current password is incorrect.", 401);
    }

    const existing = db.prepare(`
        SELECT id FROM users
        WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE) AND id != ?
    `).get(username, email, req.currentUser.id);
    if (existing) return renderProfileError("That username or email is already in use.", 409);

    db.prepare("UPDATE users SET username = ?, email = ? WHERE id = ?")
        .run(username, email, req.currentUser.id);
    res.redirect("/profile?saved=1");
});

app.get("/profile/picture", requireAuth, (req, res) => {
    const picture = db.prepare(`
        SELECT profile_picture, profile_picture_type FROM users WHERE id = ?
    `).get(req.currentUser.id);
    if (!picture?.profile_picture || !picture.profile_picture_type) return res.sendStatus(404);
    res.set("Content-Type", picture.profile_picture_type)
        .set("Cache-Control", "private, no-store")
        .set("X-Content-Type-Options", "nosniff")
        .send(Buffer.from(picture.profile_picture));
});

app.post("/profile/picture", requireAuth, (req, res, next) => {
    profilePictureUpload(req, res, (error) => {
        if (!validCsrfToken(req)) {
            return res.status(403).render("error", {
                pageTitle: "Request could not be verified",
                message: "Refresh the page and try again."
            });
        }
        if (error) {
            const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
                ? "Profile pictures must be 2 MB or smaller."
                : "Choose one PNG, JPEG, or WebP image to upload.";
            return res.status(400).render("profile", profilePageLocals(req, {
                pictureError: message
            }));
        }
        next();
    });
}, (req, res) => {
    if (!req.file) {
        return res.status(400).render("profile", profilePageLocals(req, {
            pictureError: "Choose an image to upload."
        }));
    }

    const pictureType = getProfilePictureType(req.file.buffer);
    if (!pictureType) {
        return res.status(400).render("profile", profilePageLocals(req, {
            pictureError: "Only PNG, JPEG, and WebP images are supported."
        }));
    }

    db.prepare("UPDATE users SET profile_picture = ?, profile_picture_type = ? WHERE id = ?")
        .run(req.file.buffer, pictureType, req.currentUser.id);
    res.redirect("/profile?picture=1");
});

app.post("/profile/picture/delete", requireAuth, (req, res) => {
    if (!req.currentUser.hasProfilePicture) {
        return res.status(404).render("error", {
            pageTitle: "Profile picture not found",
            message: "There is no profile picture to remove."
        });
    }
    db.prepare("UPDATE users SET profile_picture = NULL, profile_picture_type = NULL WHERE id = ?")
        .run(req.currentUser.id);
    res.redirect("/profile?pictureRemoved=1");
});

app.post("/profile/password", requireAuth, async (req, res) => {
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const confirmation = typeof req.body.passwordConfirmation === "string"
        ? req.body.passwordConfirmation
        : "";
    const renderPasswordError = (message, status = 400) => res.status(status).render("profile", profilePageLocals(req, {
        saved: false,
        passwordSaved: false,
        passwordError: message,
        username: req.currentUser.username,
        email: req.currentUser.email
    }));

    const user = db.prepare("SELECT password_salt, password_hash FROM users WHERE id = ?")
        .get(req.currentUser.id);
    if (!await passwordMatches(currentPassword, user)) {
        return renderPasswordError("Your current password is incorrect.", 401);
    }
    if (password.length < 8 || password.length > 128) {
        return renderPasswordError("Your new password must be between 8 and 128 characters.");
    }
    if (password !== confirmation) return renderPasswordError("The new passwords do not match.");

    const { salt, hash } = await hashPassword(password);
    db.prepare("UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?")
        .run(salt, hash, req.currentUser.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
        .run(req.currentUser.id, req.sessionTokenHash);
    res.redirect("/profile?password=1");
});

app.get("/title/:id", async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(404).render("error", {
            pageTitle: "Title not found",
            message: "That title could not be found."
        });
    }

    try {
        const params = new URLSearchParams();
        params.set("includes[]", "cover_art");
        const [titleResponse, chapters] = await Promise.all([
            api.get(`/manga/${req.params.id}`, { params }),
            findChapters(req.params.id)
        ]);
        const manga = toManga(titleResponse.data.data);

        res.render("title", {
            pageTitle: manga.title,
            manga,
            chapters: chapters.map((chapter) => ({
                id: chapter.id,
                label: chapterLabel(chapter),
                group: getChapterGroup(chapter),
                volume: chapter.attributes?.volume || "",
                published: chapter.attributes?.publishAt,
                externalUrl: chapter.attributes?.externalUrl
            }))
        });
    } catch (error) {
        renderError(res, error, error.response?.status === 404 ? 404 : 502);
    }
});

app.get("/read/:id", async (req, res) => {
    if (!validId(req.params.id)) {
        return res.status(404).render("error", {
            pageTitle: "Chapter not found",
            message: "That chapter could not be found."
        });
    }

    try {
        const chapterParams = new URLSearchParams();
        chapterParams.append("includes[]", "manga");
        chapterParams.append("includes[]", "scanlation_group");
        const [chapterResponse, atHomeResponse] = await Promise.all([
            api.get(`/chapter/${req.params.id}`, { params: chapterParams }),
            api.get(`/at-home/server/${req.params.id}`)
        ]);
        const chapter = chapterResponse.data.data;
        const atHome = atHomeResponse.data;
        const mangaRelationship = chapter.relationships?.find((relationship) => relationship.type === "manga");
        const mangaId = mangaRelationship?.id;

        if (!mangaId) {
            return res.status(404).render("error", {
                pageTitle: "Chapter unavailable",
                message: "This chapter is not linked to a manga title."
            });
        }

        const chapters = await findChapters(mangaId);
        if (!atHome.chapter?.hash || !atHome.chapter?.data?.length) {
            return res.status(404).render("chapter-unavailable", {
                pageTitle: "Chapter unavailable",
                mangaTitle: localizedText(mangaRelationship.attributes?.title) || "Manga",
                mangaId,
                chapterTitle: chapterLabel(chapter),
                externalUrl: chapter.attributes?.externalUrl || "",
                alternatives: chapters
                    .filter((item) => item.id !== chapter.id)
                    .slice(-10)
                    .reverse()
                    .map((item) => ({ id: item.id, label: chapterLabel(item) }))
            });
        }

        const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
        const pages = atHome.chapter.data.map((fileName) =>
            `${atHome.baseUrl}/data/${atHome.chapter.hash}/${encodeURIComponent(fileName)}`);

        res.render("reader", {
            pageTitle: chapterLabel(chapter),
            mangaTitle: localizedText(mangaRelationship.attributes?.title) || "Manga",
            mangaId,
            chapterId: chapter.id,
            chapterTitle: chapterLabel(chapter),
            group: getChapterGroup(chapter),
            pages,
            previous: chapterIndex > 0 ? chapters[chapterIndex - 1].id : null,
            next: chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1].id : null
        });
    } catch (error) {
        renderError(res, error, error.response?.status === 404 ? 404 : 502);
    }
});

app.get("/bookmarks", (req, res) => {
    res.render("library", { pageTitle: "Bookmarks" });
});

app.get("/library", (req, res) => {
    res.redirect("/bookmarks");
});

app.get("/continue-reading", requireAuth, (req, res) => {
    res.render("continue-reading", { pageTitle: "Continue Reading" });
});

app.get("/notifications", requireAuth, (req, res) => {
    res.render("notifications", { pageTitle: "Notifications" });
});

app.get("/api/manga", async (req, res) => {
    const ids = (Array.isArray(req.query.ids) ? req.query.ids : [req.query.ids])
        .filter((id) => typeof id === "string" && validId(id))
        .slice(0, 100);
    if (ids.length === 0) return res.json({ manga: [] });

    try {
        const params = mangaQuery();
        params.delete("contentRating[]");
        params.delete("availableTranslatedLanguage[]");
        params.delete("order[followedCount]");
        params.delete("offset");
        params.set("limit", String(ids.length));
        params.append("includes[]", "author");
        params.append("includes[]", "artist");
        ids.forEach((id) => params.append("ids[]", id));
        const { data } = await api.get("/manga", { params });
        return res.json({ manga: (data.data || []).map(toManga) });
    } catch (error) {
        console.error("MangaDex library lookup failed:", error.message);
        return res.status(502).json({ error: apiErrorMessage(error) });
    }
});

app.use((req, res) => {
    res.status(404).render("error", {
        pageTitle: "Page not found",
        message: "We couldn't find that page."
    });
});

app.listen(PORT, () => {
    console.log(`MangaVerse is running at http://localhost:${PORT}`);
});
