const LIBRARY_KEY = "mangaverse-library-v1";
const READING_HISTORY_KEY = "mangaverse-reading-history-v1";
const READING_PROGRESS_KEY = "mangaverse-reading-progress-v1";
const CUSTOM_FOLDERS_KEY = "mangaverse-bookmark-folders-v1";
const NOTIFICATIONS_KEY = "mangaverse-notifications-v1";
const CHAPTER_SNAPSHOTS_KEY = "mangaverse-bookmark-chapters-v1";
const DEFAULT_FOLDERS = [
    { id: "reading", name: "Reading" },
    { id: "completed", name: "Completed" },
    { id: "on-hold", name: "On Hold" },
    { id: "dropped", name: "Dropped" },
    { id: "plan-to-read", name: "Plan to Read" }
];
const MAX_CUSTOM_FOLDERS = 20;
const MAX_NOTIFICATIONS = 100;
let activeBookmarkFolder = "all";
let activeBookmarkSort = "recently-added";
let activeBookmarkView = "grid";
let bookmarkManga = [];
let bookmarkLoadError = "";

function getCustomFolders() {
    try {
        const saved = JSON.parse(localStorage.getItem(CUSTOM_FOLDERS_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        const names = new Set(DEFAULT_FOLDERS.map((folder) => folder.name.toLocaleLowerCase()));
        return saved
            .filter((folder) => folder &&
                typeof folder.id === "string" &&
                /^custom-[a-z0-9-]+$/.test(folder.id) &&
                typeof folder.name === "string" &&
                folder.name.trim().length > 0 &&
                folder.name.trim().length <= 32)
            .filter((folder) => {
                const normalizedName = folder.name.trim().toLocaleLowerCase();
                if (names.has(normalizedName)) return false;
                names.add(normalizedName);
                return true;
            })
            .slice(0, MAX_CUSTOM_FOLDERS)
            .map((folder) => ({ id: folder.id, name: folder.name.trim() }));
    } catch (error) {
        console.error("Could not read bookmark folders:", error);
        showNotice("Your custom bookmark folders could not be read.");
        return [];
    }
}

function getBookmarkFolders() {
    return [{ id: "all", name: "All" }, ...DEFAULT_FOLDERS, ...getCustomFolders()];
}

function saveCustomFolders(folders) {
    try {
        localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(folders));
        return true;
    } catch (error) {
        console.error("Could not save bookmark folders:", error);
        showNotice("Could not save your bookmark folders in this browser.");
        return false;
    }
}

function showNotice(message) {
    let notice = document.querySelector("[data-notice]");
    if (!notice) {
        notice = document.createElement("div");
        notice.className = "notice";
        notice.dataset.notice = "";
        notice.setAttribute("role", "status");
        document.body.append(notice);
    }
    notice.textContent = message;
    notice.classList.add("is-visible");
    window.clearTimeout(showNotice.timeout);
    showNotice.timeout = window.setTimeout(() => notice.classList.remove("is-visible"), 2600);
}

function getLibrary() {
    try {
        const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        const folders = new Set(getBookmarkFolders().map((folder) => folder.id));
        return saved
            .filter((item) => item && typeof item.id === "string")
            .map((item, index) => ({
                ...item,
                folderId: folders.has(item.folderId) && item.folderId !== "all"
                    ? item.folderId
                    : "plan-to-read",
                addedAt: typeof item.addedAt === "string" && !Number.isNaN(Date.parse(item.addedAt))
                    ? item.addedAt
                    : new Date(index).toISOString()
            }));
    } catch (error) {
        console.error("Could not read the saved manga library:", error);
        showNotice("Your saved library could not be read in this browser.");
        return [];
    }
}

function saveLibrary(items) {
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
        return true;
    } catch (error) {
        console.error("Could not save the manga library:", error);
        showNotice("Could not save your library in this browser.");
        return false;
    }
}

function updateLibraryCount(items) {
    document.querySelectorAll("[data-library-count]").forEach((count) => {
        count.textContent = String(items.length);
    });
}

function getReadingHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(READING_HISTORY_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved
            .filter((item) => item &&
                typeof item.chapterId === "string" &&
                typeof item.mangaId === "string" &&
                typeof item.mangaTitle === "string" &&
                typeof item.chapterTitle === "string" &&
                typeof item.readAt === "string" &&
                !Number.isNaN(Date.parse(item.readAt)))
            .sort((left, right) => Date.parse(right.readAt) - Date.parse(left.readAt))
            .slice(0, 20);
    } catch (error) {
        console.error("Could not read reading history:", error);
        showNotice("Your reading history could not be read in this browser.");
        return [];
    }
}

function saveReadingHistory(items) {
    try {
        localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(items));
        return true;
    } catch (error) {
        console.error("Could not save reading history:", error);
        showNotice("Could not save reading history in this browser.");
        return false;
    }
}

function getReadingProgress() {
    try {
        const saved = JSON.parse(localStorage.getItem(READING_PROGRESS_KEY) || "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
        return Object.fromEntries(Object.entries(saved)
            .filter(([mangaId, chapterId]) => mangaId && typeof chapterId === "string"));
    } catch (error) {
        console.error("Could not read reading progress:", error);
        showNotice("Your reading progress could not be read in this browser.");
        return {};
    }
}

function saveReadingProgress(progress) {
    try {
        localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
        return true;
    } catch (error) {
        console.error("Could not save reading progress:", error);
        showNotice("Could not save reading progress in this browser.");
        return false;
    }
}

function createReadingHistoryLink(item, className) {
    const link = document.createElement("a");
    link.className = className;
    link.href = `/read/${encodeURIComponent(item.chapterId)}`;

    const mangaTitle = document.createElement("span");
    mangaTitle.className = "reading-history-manga";
    mangaTitle.textContent = item.mangaTitle;

    const chapterTitle = document.createElement("strong");
    chapterTitle.className = "reading-history-chapter";
    chapterTitle.textContent = item.chapterTitle;

    const timestamp = new Date(item.readAt);
    const time = document.createElement("time");
    time.dateTime = timestamp.toISOString();
    time.title = timestamp.toLocaleString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(timestamp);

    link.append(mangaTitle, chapterTitle, time);
    return link;
}

function renderContinueReading() {
    const history = getReadingHistory();
    const historyPage = document.querySelector("[data-reading-history-page]");
    if (historyPage) {
        historyPage.replaceChildren(...history.map((item) =>
            createReadingHistoryLink(item, "reading-history-link reading-history-page-card")));
        const pageEmpty = document.querySelector("[data-reading-history-page-empty]");
        if (pageEmpty) pageEmpty.hidden = history.length > 0;
    }

    const homeSection = document.querySelector("[data-home-reading-section]");
    const homeList = document.querySelector("[data-home-reading-list]");
    if (!homeSection || !homeList) return;
    homeSection.hidden = history.length === 0;
    homeList.replaceChildren(...history.slice(0, 6).map((item) =>
        createReadingHistoryLink(item, "reading-history-link home-reading-card")));
}

function recordCurrentChapter(reader) {
    if (!reader?.dataset.chapterId) return;
    const item = {
        chapterId: reader.dataset.chapterId,
        mangaId: reader.dataset.mangaId,
        mangaTitle: reader.dataset.mangaTitle || "Manga",
        chapterTitle: reader.dataset.chapterTitle || "Chapter",
        readAt: new Date().toISOString()
    };
    const history = getReadingHistory().filter((saved) => saved.chapterId !== item.chapterId);
    saveReadingHistory([item, ...history].slice(0, 20));
    if (item.mangaId) {
        const progress = getReadingProgress();
        progress[item.mangaId] = item.chapterId;
        saveReadingProgress(progress);
    }
}

function updateStartReadingLink() {
    const link = document.querySelector("[data-start-reading]");
    if (!link) return;
    const chapters = [...document.querySelectorAll("[data-title-chapter-id]")]
        .sort((left, right) =>
            Number(left.dataset.titleChapterIndex) - Number(right.dataset.titleChapterIndex))
        .map((chapter) => chapter.dataset.titleChapterId);
    if (chapters.length === 0) return;

    const progress = getReadingProgress();
    const lastReadChapterId = progress[link.dataset.mangaId] ||
        getReadingHistory().find((item) => item.mangaId === link.dataset.mangaId)?.chapterId;
    const lastReadIndex = chapters.indexOf(lastReadChapterId);
    const nextUnreadIndex = lastReadIndex < 0
        ? 0
        : Math.min(lastReadIndex + 1, chapters.length - 1);
    link.href = `/read/${encodeURIComponent(chapters[nextUnreadIndex])}`;
}

const headerMenus = [
    document.querySelector("[data-account-menu]"),
    document.querySelector("[data-notifications-menu]")
].filter(Boolean);

document.addEventListener("click", (event) => {
    headerMenus.forEach((menu) => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
});
document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    headerMenus.forEach((menu) => {
        if (!menu.open) return;
        menu.open = false;
        menu.querySelector("summary").focus();
    });
    closeBookmarkFolderMenus(true);
});
document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || event.target.closest("[data-bookmark-dropdown]")) return;
    closeBookmarkFolderMenus();
});

function syncBookmarkButtons(items) {
    const savedIds = new Set(items.map((item) => item.id));
    document.querySelectorAll("[data-bookmark-id]").forEach((button) => {
        const saved = savedIds.has(button.dataset.bookmarkId);
        button.classList.toggle("is-saved", saved);
        if (button.matches("[data-bookmark-folder-menu-trigger]")) {
            const label = button.querySelector("[data-bookmark-label]");
            if (label) label.textContent = saved ? "✓ Saved to library" : "＋ Add to library";
            button.title = saved ? "Choose another bookmark folder" : "Add to a bookmark folder";
            button.setAttribute("aria-label", `${saved ? "Change" : "Add"} ${button.dataset.bookmarkTitle || "manga"} ${saved ? "bookmark folder" : "to a bookmark folder"}`);
            return;
        }
        button.textContent = saved ? "✓" : "＋";
        button.title = saved ? "Remove from library" : "Add to library";
        button.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${button.dataset.bookmarkTitle || "manga"} ${saved ? "from" : "to"} library`);
    });
}

function closeBookmarkFolderMenus(restoreFocus = false) {
    document.querySelectorAll("[data-bookmark-folder-menu]:not([hidden])").forEach((menu) => {
        menu.hidden = true;
        const trigger = menu.parentElement.querySelector("[data-bookmark-folder-menu-trigger]");
        trigger.setAttribute("aria-expanded", "false");
        if (restoreFocus) trigger.focus();
    });
}

function renderBookmarkFolderMenu(trigger) {
    const menu = trigger.parentElement.querySelector("[data-bookmark-folder-menu]");
    const savedItem = getLibrary().find((item) => item.id === trigger.dataset.bookmarkId);
    const options = getBookmarkFolders()
        .filter((folder) => folder.id !== "all")
        .map((folder) => {
            const option = document.createElement("button");
            option.className = "bookmark-folder-option";
            option.type = "button";
            option.dataset.bookmarkFolderChoice = folder.id;
            option.textContent = folder.name;
            option.setAttribute("aria-pressed", String(savedItem?.folderId === folder.id));
            return option;
        });
    menu.replaceChildren(...options);
}

function makeMangaCard(manga, savedItem) {
    const article = document.createElement("article");
    article.className = "manga-card";
    article.dataset.mangaTitle = manga.title || "";

    const coverLink = document.createElement("a");
    coverLink.className = "cover-link";
    coverLink.href = `/title/${encodeURIComponent(manga.id)}`;
    coverLink.setAttribute("aria-label", `View ${manga.title}`);
    if (manga.cover) {
        const image = document.createElement("img");
        image.className = "manga-cover";
        image.src = manga.cover;
        image.alt = `Cover of ${manga.title}`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        coverLink.append(image);
    } else {
        const placeholder = document.createElement("div");
        placeholder.className = "cover-placeholder";
        const initial = document.createElement("span");
        initial.textContent = (manga.title || "?").slice(0, 1);
        placeholder.append(initial);
        coverLink.append(placeholder);
    }

    const info = document.createElement("div");
    info.className = "manga-card-info";
    const row = document.createElement("div");
    row.className = "manga-card-title-row";
    const heading = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.href = coverLink.href;
    titleLink.textContent = manga.title || "Untitled";
    heading.append(titleLink);

    const removeButton = document.createElement("button");
    removeButton.className = "bookmark-button is-saved";
    removeButton.type = "button";
    removeButton.dataset.bookmarkId = manga.id;
    removeButton.dataset.bookmarkTitle = manga.title || "Untitled";
    removeButton.dataset.bookmarkCover = manga.cover || "";
    removeButton.setAttribute("aria-label", `Remove ${manga.title} from library`);
    removeButton.title = "Remove from library";
    removeButton.textContent = "✓";
    row.append(heading, removeButton);
    info.append(row);

    const meta = document.createElement("p");
    meta.className = "manga-meta bookmark-card-meta";
    meta.textContent = [manga.status, manga.year, manga.lastChapter ? `Ch. ${manga.lastChapter}` : ""]
        .filter(Boolean)
        .join(" · ");

    const folderLabel = document.createElement("label");
    folderLabel.className = "bookmark-card-folder";
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = `Folder for ${manga.title || "manga"}`;
    const select = document.createElement("select");
    select.dataset.bookmarkFolderSelect = manga.id;
    getBookmarkFolders().filter((folder) => folder.id !== "all").forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder.id;
        option.textContent = folder.name;
        option.selected = folder.id === savedItem.folderId;
        select.append(option);
    });
    folderLabel.append(label, select);
    info.append(meta, folderLabel);
    article.append(coverLink, info);
    return article;
}

function renderBookmarkFolderTabs() {
    const tabs = document.querySelector("[data-bookmark-folder-tabs]");
    if (!tabs) return;

    const saved = getLibrary();
    const folders = getBookmarkFolders();
    if (!folders.some((folder) => folder.id === activeBookmarkFolder)) activeBookmarkFolder = "all";
    tabs.replaceChildren(...folders.map((folder) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bookmark-folder-tab";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(folder.id === activeBookmarkFolder));
        button.dataset.bookmarkFolder = folder.id;
        const name = document.createElement("span");
        name.textContent = folder.name;
        const count = document.createElement("span");
        count.className = "bookmark-folder-count";
        count.textContent = String(folder.id === "all"
            ? saved.length
            : saved.filter((item) => item.folderId === folder.id).length);
        button.append(name, count);
        button.addEventListener("click", () => {
            activeBookmarkFolder = folder.id;
            renderBookmarkFolderTabs();
            renderLibraryResults();
        });
        return button;
    }));
}

function renderBookmarkGenreOptions(manga) {
    const select = document.querySelector("[data-bookmark-genre]");
    if (!select) return;
    const selected = select.value;
    const genres = [...new Set(manga.flatMap((item) => item.genres || []))]
        .sort((left, right) => left.localeCompare(right));
    select.replaceChildren(new Option("Any genre", ""));
    genres.forEach((genre) => select.append(new Option(genre, genre)));
    if (genres.includes(selected)) select.value = selected;
}

function getBookmarkFilterValues() {
    const value = (selector) => document.querySelector(selector)?.value || "";
    return {
        query: value("[data-bookmark-filter]").trim().toLocaleLowerCase(),
        rating: value("[data-bookmark-rating]"),
        type: value("[data-bookmark-type]"),
        genre: value("[data-bookmark-genre]"),
        language: value("[data-bookmark-language]"),
        status: value("[data-bookmark-status]"),
        creator: value("[data-bookmark-creator]").trim().toLocaleLowerCase(),
        yearFrom: Number(value("[data-bookmark-year-from]")) || 0,
        yearTo: Number(value("[data-bookmark-year-to]")) || 0,
        minChapters: Number(value("[data-bookmark-min-chapters]")) || 0
    };
}

function bookmarkMatchesFilters(manga, savedItem, filters) {
    const originalLanguage = manga.originalLanguage || "";
    const type = ["ja", "ja-ro"].includes(originalLanguage)
        ? "manga"
        : ["ko", "ko-ro"].includes(originalLanguage)
            ? "manhwa"
            : ["zh", "zh-hk", "zh-ro"].includes(originalLanguage)
                ? "manhua"
                : "";
    const year = Number(manga.year);
    const chapter = Number.parseFloat(manga.lastChapter);
    const creators = (manga.creators || []).join(" ").toLocaleLowerCase();
    const languageMatches = !filters.language ||
        (manga.availableTranslatedLanguages || []).includes(filters.language) ||
        originalLanguage === filters.language;

    return (activeBookmarkFolder === "all" || savedItem.folderId === activeBookmarkFolder) &&
        (!filters.query || (manga.title || "").toLocaleLowerCase().includes(filters.query)) &&
        (!filters.rating || manga.rating === filters.rating) &&
        (!filters.type || type === filters.type) &&
        (!filters.genre || (manga.genres || []).includes(filters.genre)) &&
        languageMatches &&
        (!filters.status || manga.status === filters.status) &&
        (!filters.creator || creators.includes(filters.creator)) &&
        (!filters.yearFrom || (Number.isFinite(year) && year >= filters.yearFrom)) &&
        (!filters.yearTo || (Number.isFinite(year) && year <= filters.yearTo)) &&
        (!filters.minChapters || (Number.isFinite(chapter) && chapter >= filters.minChapters));
}

function renderLibraryResults() {
    const grid = document.querySelector("[data-library-grid]");
    if (!grid) return;

    const saved = getLibrary();
    const savedById = new Map(saved.map((item) => [item.id, item]));
    const filters = getBookmarkFilterValues();
    const historyDates = new Map(getReadingHistory().map((item) => [
        item.mangaId,
        Date.parse(item.readAt)
    ]));
    const results = bookmarkManga
        .filter((manga) => savedById.has(manga.id) &&
            bookmarkMatchesFilters(manga, savedById.get(manga.id), filters))
        .sort((left, right) => {
            if (activeBookmarkSort === "recently-read") {
                return (historyDates.get(right.id) || 0) - (historyDates.get(left.id) || 0);
            }
            if (activeBookmarkSort === "latest-update") {
                const byDate = Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || "");
                if (Number.isFinite(byDate) && byDate !== 0) return byDate;
                return (Number.parseFloat(right.lastChapter) || 0) -
                    (Number.parseFloat(left.lastChapter) || 0);
            }
            return Date.parse(savedById.get(right.id).addedAt) -
                Date.parse(savedById.get(left.id).addedAt);
        });

    grid.dataset.view = activeBookmarkView;
    grid.replaceChildren(...results.map((manga) => makeMangaCard(manga, savedById.get(manga.id))));
    const count = document.querySelector("[data-bookmark-filter-count]");
    if (count) count.textContent = `${results.length} shown · ${saved.length} saved`;
    const noMatches = document.querySelector("[data-library-no-matches]");
    const empty = document.querySelector("[data-library-empty]");
    if (bookmarkLoadError) {
        if (noMatches) noMatches.hidden = true;
        if (empty) {
            empty.querySelector("h3").textContent = "Your library couldn't load";
            empty.querySelector("p").textContent = bookmarkLoadError;
            empty.hidden = false;
        }
        return;
    }
    if (noMatches) noMatches.hidden = saved.length === 0 || results.length > 0 || grid.getAttribute("aria-busy") === "true";
    if (empty) {
        empty.querySelector("h3").textContent = "Your bookmarks are waiting";
        empty.querySelector("p").textContent = "Save a manga with the plus button and it will show up here.";
        empty.hidden = saved.length > 0;
    }
}

async function fetchBookmarkedManga(saved) {
    const results = [];
    for (let index = 0; index < saved.length; index += 100) {
        const params = new URLSearchParams();
        saved.slice(index, index + 100).forEach((item) => params.append("ids", item.id));
        const response = await fetch(`/api/manga?${params.toString()}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load your bookmarks.");
        if (!Array.isArray(result.manga)) throw new Error("The MangaDex response was not a manga list.");
        results.push(...result.manga);
    }
    return results;
}

async function renderLibrary() {
    const grid = document.querySelector("[data-library-grid]");
    if (!grid) return;

    const saved = getLibrary();
    const empty = document.querySelector("[data-library-empty]");
    const emptyHeading = empty.querySelector("h3");
    const emptyMessage = empty.querySelector("p");
    bookmarkLoadError = "";
    emptyHeading.textContent = "Your bookmarks are waiting";
    emptyMessage.textContent = "Save a manga with the plus button and it will show up here.";
    renderBookmarkFolderTabs();
    if (saved.length === 0) {
        bookmarkManga = [];
        grid.replaceChildren();
        empty.hidden = false;
        updateLibraryCount(saved);
        renderLibraryResults();
        recordChapterNotifications([]);
        return;
    }

    grid.setAttribute("aria-busy", "true");
    try {
        const manga = await fetchBookmarkedManga(saved);
        const savedById = new Map(saved.map((item) => [item.id, item]));
        bookmarkManga = manga.map((item) => ({
            ...item,
            title: item.title || savedById.get(item.id)?.title || "Untitled",
            cover: item.cover || savedById.get(item.id)?.cover || ""
        }));
        renderBookmarkGenreOptions(bookmarkManga);
        renderLibraryResults();
        empty.hidden = saved.length > 0;
        if (manga.length === 0) {
            emptyHeading.textContent = "No bookmarked titles are available";
            emptyMessage.textContent = "These titles could not be found in the MangaDex catalog.";
            empty.hidden = false;
        } else if (manga.length < saved.length) {
            showNotice("Some saved titles are no longer available from MangaDex.");
        }
        updateLibraryCount(saved);
        recordChapterNotifications(manga);
    } catch (error) {
        console.error("Could not load the saved manga library:", error);
        bookmarkLoadError = error.message;
        renderLibraryResults();
        empty.hidden = false;
    } finally {
        grid.removeAttribute("aria-busy");
        renderLibraryResults();
    }
}

function getNotifications() {
    try {
        const saved = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved
            .filter((item) => item &&
                typeof item.id === "string" &&
                typeof item.mangaId === "string" &&
                typeof item.title === "string" &&
                typeof item.createdAt === "string" &&
                !Number.isNaN(Date.parse(item.createdAt)))
            .map((item) => ({
                ...item,
                chapter: typeof item.chapter === "string" ? item.chapter : "",
                readAt: typeof item.readAt === "string" ? item.readAt : ""
            }))
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
            .slice(0, MAX_NOTIFICATIONS);
    } catch (error) {
        console.error("Could not read notifications:", error);
        showNotice("Your notifications could not be read in this browser.");
        return [];
    }
}

function getMutedNotificationFolders() {
    const serialized = document.body.dataset.mutedNotificationFolders;
    if (!serialized) return new Set();
    try {
        const folders = JSON.parse(serialized);
        if (!Array.isArray(folders) || folders.some((folder) => typeof folder !== "string")) {
            throw new Error("Saved notification folders are invalid.");
        }
        return new Set(folders);
    } catch (error) {
        console.error("Could not read notification folder preferences:", error);
        showNotice("Notification folder preferences could not be read.");
        return new Set();
    }
}

function renderBookmarkNotificationSettings() {
    const container = document.querySelector("[data-custom-notification-folders]");
    if (!container) return;
    const folders = getCustomFolders();
    const mutedFolders = getMutedNotificationFolders();
    container.replaceChildren(...folders.map((folder) => {
        const label = document.createElement("label");
        label.className = "settings-option settings-notification-option";
        const description = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = folder.name;
        const detail = document.createElement("small");
        detail.textContent = "Notify me about updates in this folder.";
        description.append(name, detail);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "notificationFolders";
        checkbox.value = folder.id;
        const folderId = document.createElement("input");
        folderId.type = "hidden";
        folderId.name = "notificationFolderIds";
        folderId.value = folder.id;
        checkbox.checked = !mutedFolders.has(folder.id);
        label.append(description, folderId, checkbox);
        return label;
    }));
    const empty = document.querySelector("[data-no-custom-notification-folders]");
    if (empty) empty.hidden = folders.length > 0;
}

function saveNotifications(items) {
    try {
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)));
        return true;
    } catch (error) {
        console.error("Could not save notifications:", error);
        showNotice("Could not save notifications in this browser.");
        return false;
    }
}

function getChapterSnapshots() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAPTER_SNAPSHOTS_KEY) || "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
        return Object.fromEntries(Object.entries(saved)
            .filter(([id, value]) => typeof id === "string" && typeof value === "string"));
    } catch (error) {
        console.error("Could not read bookmarked chapter snapshots:", error);
        showNotice("Chapter update history could not be read in this browser.");
        return {};
    }
}

function saveChapterSnapshots(snapshots) {
    try {
        localStorage.setItem(CHAPTER_SNAPSHOTS_KEY, JSON.stringify(snapshots));
        return true;
    } catch (error) {
        console.error("Could not save bookmarked chapter snapshots:", error);
        showNotice("Chapter update history could not be saved in this browser.");
        return false;
    }
}

function makeNotificationLink(notification, className) {
    const link = document.createElement("a");
    link.className = className;
    link.href = `/title/${encodeURIComponent(notification.mangaId)}`;
    link.dataset.notificationId = notification.id;
    if (!notification.readAt) link.classList.add("is-unread");

    const title = document.createElement("span");
    title.className = "notification-title";
    title.textContent = notification.title;

    const detail = document.createElement("strong");
    detail.className = "notification-detail";
    detail.textContent = notification.chapter
        ? `New chapter ${notification.chapter} is available`
        : "A new chapter is available";

    const time = document.createElement("time");
    const timestamp = new Date(notification.createdAt);
    time.dateTime = timestamp.toISOString();
    time.title = timestamp.toLocaleString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(timestamp);
    link.append(title, detail, time);
    return link;
}

function renderNotificationList(container, notifications, className, limit) {
    if (!container) return;
    container.replaceChildren(...notifications.slice(0, limit).map((notification) => {
        const item = document.createElement("li");
        item.className = "notification-item";
        item.append(makeNotificationLink(notification, className));
        return item;
    }));
}

function getVisibleNotifications() {
    const mutedFolders = getMutedNotificationFolders();
    const folderByMangaId = new Map(getLibrary().map((item) => [item.id, item.folderId]));
    return getNotifications().filter((item) => {
        const folderId = folderByMangaId.get(item.mangaId);
        return folderId !== undefined && !mutedFolders.has(folderId);
    });
}

function renderNotifications() {
    const notifications = getVisibleNotifications();
    const unreadCount = notifications.filter((item) => !item.readAt).length;
    const badge = document.querySelector("[data-notification-badge]");
    if (badge) {
        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        badge.hidden = unreadCount === 0;
        badge.setAttribute("aria-label", `${unreadCount} unread notifications`);
    }

    const unreadLabel = document.querySelector("[data-notification-unread]");
    if (unreadLabel) unreadLabel.textContent = unreadCount ? `${unreadCount} unread` : "";

    const preview = document.querySelector("[data-notification-preview]");
    renderNotificationList(preview, notifications, "notification-preview-link", 10);
    const previewEmpty = document.querySelector("[data-notification-preview-empty]");
    if (previewEmpty) previewEmpty.hidden = notifications.length > 0;

    const pageList = document.querySelector("[data-notifications-page-list]");
    renderNotificationList(pageList, notifications, "notification-page-link", notifications.length);
    const pageEmpty = document.querySelector("[data-notifications-page-empty]");
    if (pageEmpty) pageEmpty.hidden = notifications.length > 0;
    const markRead = document.querySelector("[data-mark-notifications-read]");
    if (markRead) markRead.hidden = unreadCount === 0;
}

function recordChapterNotifications(manga) {
    const library = getLibrary();
    const bookmarkById = new Map(library.map((item) => [item.id, item]));
    const bookmarkIds = new Set(bookmarkById.keys());
    const mutedFolders = getMutedNotificationFolders();
    const snapshots = getChapterSnapshots();
    Object.keys(snapshots).forEach((id) => {
        if (!bookmarkIds.has(id)) delete snapshots[id];
    });

    const notifications = getNotifications();
    const notificationIds = new Set(notifications.map((item) => item.id));
    let hasNewNotification = false;
    manga.forEach((item) => {
        if (!bookmarkIds.has(item.id)) return;
        const chapterKey = item.latestChapterId || item.lastChapter || "";
        if (!chapterKey) return;
        const previous = snapshots[item.id];
        const notificationId = `${item.id}:${chapterKey}`;
        const notificationsEnabled = !mutedFolders.has(bookmarkById.get(item.id)?.folderId);
        if (previous && previous !== chapterKey && notificationsEnabled &&
            !notificationIds.has(notificationId)) {
            notifications.unshift({
                id: notificationId,
                mangaId: item.id,
                title: item.title || "Bookmarked manga",
                chapter: item.lastChapter || "",
                createdAt: new Date().toISOString(),
                readAt: ""
            });
            notificationIds.add(notificationId);
            hasNewNotification = true;
        }
        snapshots[item.id] = chapterKey;
    });

    saveChapterSnapshots(snapshots);
    if (hasNewNotification) saveNotifications(notifications);
    renderNotifications();
}

function makeBookmarkedUpdateCard(manga) {
    const article = document.createElement("article");
    article.className = "bookmark-update-card";

    const coverLink = document.createElement("a");
    coverLink.className = "bookmark-update-cover";
    coverLink.href = `/title/${encodeURIComponent(manga.id)}`;
    coverLink.setAttribute("aria-label", `View ${manga.title}`);
    if (manga.cover) {
        const image = document.createElement("img");
        image.src = manga.cover;
        image.alt = `Cover of ${manga.title}`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        coverLink.append(image);
    } else {
        const placeholder = document.createElement("span");
        placeholder.className = "cover-placeholder";
        placeholder.textContent = (manga.title || "?").slice(0, 1);
        coverLink.append(placeholder);
    }

    const details = document.createElement("div");
    details.className = "bookmark-update-info";
    const title = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.href = coverLink.href;
    titleLink.textContent = manga.title || "Untitled";
    title.append(titleLink);

    const chapter = document.createElement("p");
    chapter.className = "bookmark-update-chapter";
    chapter.textContent = manga.lastChapter
        ? `Latest chapter ${manga.lastChapter}`
        : "Latest chapter information unavailable";

    const chaptersLink = document.createElement("a");
    chaptersLink.className = "bookmark-update-link";
    chaptersLink.href = coverLink.href;
    chaptersLink.textContent = "View chapters";
    details.append(title, chapter, chaptersLink);
    article.append(coverLink, details);
    return article;
}

async function renderHomeBookmarkUpdates() {
    const grid = document.querySelector("[data-home-bookmarks-grid]");
    if (!grid) return;

    const empty = document.querySelector("[data-home-bookmarks-empty]");
    const saved = getLibrary();
    if (saved.length === 0) {
        grid.replaceChildren();
        empty.hidden = false;
        recordChapterNotifications([]);
        return;
    }

    grid.setAttribute("aria-busy", "true");
    try {
        const manga = await fetchBookmarkedManga(saved);
        recordChapterNotifications(manga);
        const mangaById = new Map(manga.map((item) => [item.id, item]));
        const updates = saved.slice(0, 12).map((item) => ({
            ...mangaById.get(item.id),
            ...item,
            lastChapter: mangaById.get(item.id)?.lastChapter || ""
        }));
        grid.replaceChildren(...updates.map(makeBookmarkedUpdateCard));
        empty.hidden = updates.length > 0;
        if (updates.length === 0) {
            empty.querySelector("h3").textContent = "No bookmarked titles are available";
            empty.querySelector("p").textContent = "These titles could not be found in the MangaDex catalog.";
        }
    } catch (error) {
        console.error("Could not load bookmarked chapter updates:", error);
        grid.replaceChildren();
        empty.hidden = false;
        empty.querySelector("h3").textContent = "Bookmark updates couldn't load";
        empty.querySelector("p").textContent = error.message;
    } finally {
        grid.removeAttribute("aria-busy");
    }
}

function renderCustomFolderList() {
    const list = document.querySelector("[data-custom-folder-list]");
    if (!list) return;
    const folders = getCustomFolders();
    if (folders.length === 0) {
        const empty = document.createElement("li");
        empty.className = "custom-folder-empty";
        empty.textContent = "No custom folders yet.";
        list.replaceChildren(empty);
        return;
    }

    list.replaceChildren(...folders.map((folder) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = folder.name;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button-secondary";
        remove.dataset.removeCustomFolder = folder.id;
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${folder.name} folder`);
        item.append(name, remove);
        return item;
    }));
}

function renderBookmarkControls() {
    renderBookmarkFolderTabs();
    renderCustomFolderList();
    const grid = document.querySelector("[data-library-grid]");
    if (grid) grid.dataset.view = activeBookmarkView;
    document.querySelectorAll("[data-bookmark-sort]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.bookmarkSort === activeBookmarkSort));
    });
    document.querySelectorAll("[data-bookmark-view]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.bookmarkView === activeBookmarkView));
    });
}

function addCustomFolder(name) {
    const normalizedName = name.trim();
    const error = document.querySelector("[data-folder-manager-error]");
    const showError = (message) => {
        if (!error) return;
        error.textContent = message;
        error.hidden = false;
    };
    if (!normalizedName || normalizedName.length > 32) {
        showError("Folder names must be between 1 and 32 characters.");
        return;
    }
    if (getBookmarkFolders().some((folder) => folder.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
        showError("A folder with that name already exists.");
        return;
    }
    const folders = getCustomFolders();
    if (folders.length >= MAX_CUSTOM_FOLDERS) {
        showError(`You can create up to ${MAX_CUSTOM_FOLDERS} custom folders.`);
        return;
    }
    folders.push({
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: normalizedName
    });
    if (!saveCustomFolders(folders)) return;
    if (error) error.hidden = true;
    renderBookmarkControls();
    renderLibraryResults();
    document.querySelector("[data-folder-add-form]")?.reset();
}

function removeCustomFolder(folderId) {
    const folders = getCustomFolders();
    if (!folders.some((folder) => folder.id === folderId)) return;
    if (!saveCustomFolders(folders.filter((folder) => folder.id !== folderId))) return;
    const library = getLibrary().map((item) => item.folderId === folderId
        ? { ...item, folderId: "plan-to-read" }
        : item);
    if (!saveLibrary(library)) return;
    if (activeBookmarkFolder === folderId) activeBookmarkFolder = "all";
    renderBookmarkControls();
    renderLibraryResults();
    showNotice("Folder removed. Its bookmarks were moved to Plan to Read.");
}

function setNotificationRead(notificationId) {
    const notifications = getNotifications();
    let changed = false;
    const updated = notifications.map((item) => {
        if (item.id !== notificationId || item.readAt) return item;
        changed = true;
        return { ...item, readAt: new Date().toISOString() };
    });
    if (changed && saveNotifications(updated)) renderNotifications();
}

async function checkBookmarkedChapterNotifications() {
    if (window.location.pathname !== "/" || document.querySelector("[data-home-bookmarks-grid]")) return;
    const mutedFolders = getMutedNotificationFolders();
    const saved = getLibrary().filter((item) =>
        !mutedFolders.has(item.folderId));
    if (saved.length === 0) {
        recordChapterNotifications([]);
        return;
    }
    try {
        const manga = await fetchBookmarkedManga(saved);
        recordChapterNotifications(manga);
    } catch (error) {
        console.error("Could not check bookmarked chapter notifications:", error);
        showNotice("Could not check for new chapters right now.");
    }
}

document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const notificationLink = event.target.closest("[data-notification-id]");
    if (notificationLink) setNotificationRead(notificationLink.dataset.notificationId);

    const removeFolder = event.target.closest("[data-remove-custom-folder]");
    if (removeFolder) {
        removeCustomFolder(removeFolder.dataset.removeCustomFolder);
        return;
    }

    if (event.target.closest("[data-close-folder-manager]")) {
        document.querySelector("[data-folder-manager]")?.close();
        return;
    }

    if (event.target.closest("[data-manage-folders]")) {
        renderCustomFolderList();
        document.querySelector("[data-folder-manager]")?.showModal();
        return;
    }

    if (event.target.closest("[data-mark-notifications-read]")) {
        const readAt = new Date().toISOString();
        const visibleNotificationIds = new Set(getVisibleNotifications().map((item) => item.id));
        const notifications = getNotifications().map((item) => ({
            ...item,
            readAt: visibleNotificationIds.has(item.id) ? item.readAt || readAt : item.readAt
        }));
        if (saveNotifications(notifications)) renderNotifications();
        return;
    }

    if (event.target.closest("[data-bookmark-filters-toggle]")) {
        const toggle = event.target.closest("[data-bookmark-filters-toggle]");
        const filters = document.querySelector("[data-bookmark-filters]");
        if (filters) {
            filters.hidden = !filters.hidden;
            toggle.setAttribute("aria-expanded", String(!filters.hidden));
        }
        return;
    }

    if (event.target.closest("[data-reset-bookmark-filters]")) {
        document.querySelectorAll("#bookmark-filters input, #bookmark-filters select").forEach((control) => {
            control.value = "";
        });
        renderLibraryResults();
        return;
    }

    const sortButton = event.target.closest("[data-bookmark-sort]");
    if (sortButton) {
        activeBookmarkSort = sortButton.dataset.bookmarkSort;
        renderBookmarkControls();
        renderLibraryResults();
        return;
    }
    const viewButton = event.target.closest("[data-bookmark-view]");
    if (viewButton) {
        activeBookmarkView = viewButton.dataset.bookmarkView;
        renderBookmarkControls();
        renderLibraryResults();
        return;
    }

    const folderMenuTrigger = event.target.closest("[data-bookmark-folder-menu-trigger]");
    if (folderMenuTrigger) {
        const menu = folderMenuTrigger.parentElement.querySelector("[data-bookmark-folder-menu]");
        const shouldOpen = menu.hidden;
        closeBookmarkFolderMenus();
        if (shouldOpen) {
            renderBookmarkFolderMenu(folderMenuTrigger);
            menu.hidden = false;
            folderMenuTrigger.setAttribute("aria-expanded", "true");
        }
        return;
    }

    const folderChoice = event.target.closest("[data-bookmark-folder-choice]");
    if (folderChoice) {
        const dropdown = folderChoice.closest("[data-bookmark-dropdown]");
        const trigger = dropdown.querySelector("[data-bookmark-folder-menu-trigger]");
        const folder = getBookmarkFolders().find((item) =>
            item.id === folderChoice.dataset.bookmarkFolderChoice && item.id !== "all");
        if (!folder) return;

        const library = getLibrary();
        const existing = library.find((item) => item.id === trigger.dataset.bookmarkId);
        if (existing?.folderId === folder.id) {
            closeBookmarkFolderMenus();
            showNotice(`${folder.name} is already selected.`);
            return;
        }
        const nextLibrary = existing
            ? library.map((item) => item.id === trigger.dataset.bookmarkId
                ? { ...item, folderId: folder.id }
                : item)
            : [...library, {
                id: trigger.dataset.bookmarkId,
                title: trigger.dataset.bookmarkTitle || "Untitled",
                cover: trigger.dataset.bookmarkCover || "",
                folderId: folder.id,
                addedAt: new Date().toISOString()
            }];

        if (!saveLibrary(nextLibrary)) return;
        updateLibraryCount(nextLibrary);
        syncBookmarkButtons(nextLibrary);
        closeBookmarkFolderMenus();
        showNotice(existing ? `Moved to ${folder.name}.` : `Added to ${folder.name}.`);
        recordChapterNotifications([]);
        if (document.querySelector("[data-library-grid]")) renderLibrary();
        if (document.querySelector("[data-home-bookmarks-grid]")) renderHomeBookmarkUpdates();
        return;
    }

    const bookmarkButton = event.target.closest("[data-bookmark-id]");
    if (!bookmarkButton) return;
    const library = getLibrary();
    const saved = library.some((item) => item.id === bookmarkButton.dataset.bookmarkId);
    const nextLibrary = saved
        ? library.filter((item) => item.id !== bookmarkButton.dataset.bookmarkId)
        : [...library, {
            id: bookmarkButton.dataset.bookmarkId,
            title: bookmarkButton.dataset.bookmarkTitle || "Untitled",
            cover: bookmarkButton.dataset.bookmarkCover || "",
            folderId: "plan-to-read",
            addedAt: new Date().toISOString()
        }];

    if (!saveLibrary(nextLibrary)) return;
    updateLibraryCount(nextLibrary);
    bookmarkButton.classList.toggle("is-saved", !saved);
    bookmarkButton.textContent = saved ? "＋" : "✓";
    bookmarkButton.title = saved ? "Add to library" : "Remove from library";
    bookmarkButton.setAttribute("aria-label", `${saved ? "Add" : "Remove"} ${bookmarkButton.dataset.bookmarkTitle || "manga"} ${saved ? "to" : "from"} library`);
    showNotice(saved ? "Removed from your library." : "Added to your library.");
    recordChapterNotifications([]);
    if (document.querySelector("[data-library-grid]")) renderLibrary();
    if (document.querySelector("[data-home-bookmarks-grid]")) renderHomeBookmarkUpdates();
});

document.addEventListener("input", (event) => {
    if (event.target instanceof Element && event.target.closest("#bookmark-filters")) {
        renderLibraryResults();
    }
});

document.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    if (event.target.matches("[data-bookmark-folder-select]")) {
        const folderId = event.target.value;
        if (!getBookmarkFolders().some((folder) => folder.id === folderId && folderId !== "all")) return;
        const library = getLibrary().map((item) => item.id === event.target.dataset.bookmarkFolderSelect
            ? { ...item, folderId }
            : item);
        if (saveLibrary(library)) {
            renderBookmarkFolderTabs();
            renderLibraryResults();
        }
        return;
    }
    if (event.target.closest("#bookmark-filters")) renderLibraryResults();
});

document.querySelector("[data-folder-add-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("[name=name]");
    addCustomFolder(input.value);
});

const initialLibrary = getLibrary();
updateLibraryCount(initialLibrary);
syncBookmarkButtons(initialLibrary);
renderNotifications();
renderBookmarkControls();
renderBookmarkNotificationSettings();
renderLibrary();
document.querySelector("[data-bookmark-filter]")?.addEventListener("input", renderLibraryResults);
recordCurrentChapter(document.querySelector("[data-reader]"));
updateStartReadingLink();
renderContinueReading();
renderHomeBookmarkUpdates();
checkBookmarkedChapterNotifications();

const customThemeForm = document.querySelector("[data-custom-theme-form]");
if (customThemeForm) {
    const colorInputs = [...customThemeForm.querySelectorAll("[data-custom-theme-color]")];
    const themeName = customThemeForm.querySelector("[data-custom-theme-name]");
    const themeId = customThemeForm.querySelector("[data-custom-theme-id]");
    const preview = document.querySelector("[data-custom-theme-preview]");
    const editorTitle = document.querySelector("[data-custom-theme-editor-title]");
    const submit = customThemeForm.querySelector("[data-custom-theme-submit]");
    const cancel = customThemeForm.querySelector("[data-custom-theme-cancel]");

    const updatePreview = () => {
        colorInputs.forEach((input) => {
            const colorName = input.dataset.customThemeColor;
            const previewName = colorName === "background" ? "bg" : colorName;
            preview.style.setProperty(`--preview-${previewName}`, input.value);
        });
    };
    const resetEditor = () => {
        customThemeForm.reset();
        editorTitle.textContent = "Create a custom theme";
        submit.textContent = "Save and apply theme";
        cancel.hidden = true;
        updatePreview();
    };

    colorInputs.forEach((input) => input.addEventListener("input", updatePreview));
    cancel.addEventListener("click", resetEditor);
    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const editButton = event.target.closest("[data-theme-edit]");
        if (!editButton) return;
        themeId.value = editButton.dataset.themeId;
        themeName.value = editButton.dataset.themeName;
        colorInputs.forEach((input) => {
            const colorName = input.dataset.customThemeColor;
            const dataName = `theme${colorName[0].toUpperCase()}${colorName.slice(1)}`;
            input.value = editButton.dataset[dataName];
        });
        editorTitle.textContent = `Edit ${themeName.value}`;
        submit.textContent = "Save theme changes";
        cancel.hidden = false;
        updatePreview();
        customThemeForm.scrollIntoView({ behavior: "smooth", block: "center" });
        themeName.focus();
    });
}

const settingsForm = document.querySelector("[data-settings-form]");
if (settingsForm?.dataset.saved === "true") {
    try {
        localStorage.setItem(
            "mangaverse-reader-width",
            settingsForm.querySelector("[data-settings-reader-width]").value
        );
    } catch (error) {
        console.error("Could not sync reader preferences:", error);
        showNotice("Reader preference could not be saved in this browser.");
    }
}

const reader = document.querySelector("[data-reader]");
if (reader) {
    const widthSelect = document.querySelector("[data-reader-width]");
    const pages = document.querySelector(".reader-pages");
    try {
        widthSelect.value = localStorage.getItem("mangaverse-reader-width") ||
            reader.dataset.defaultWidth ||
            "wide";
    } catch (error) {
        console.error("Could not read reader preferences:", error);
    }
    pages.dataset.pageWidth = widthSelect.value;
    widthSelect.addEventListener("change", () => {
        pages.dataset.pageWidth = widthSelect.value;
        try {
            localStorage.setItem("mangaverse-reader-width", widthSelect.value);
        } catch (error) {
            console.error("Could not save reader preferences:", error);
            showNotice("Reader preference could not be saved.");
        }
    });

    let lastReaderTap = null;
    reader.addEventListener("pointerup", (event) => {
        if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
        if (event.target instanceof Element &&
            event.target.closest("a, button, input, select, textarea, summary")) {
            lastReaderTap = null;
            return;
        }

        const now = performance.now();
        const isDoubleTap = lastReaderTap &&
            now - lastReaderTap.time < 350 &&
            Math.hypot(event.clientX - lastReaderTap.x, event.clientY - lastReaderTap.y) < 40;
        if (isDoubleTap) {
            document.body.classList.toggle("reader-chrome-hidden");
            lastReaderTap = null;
            return;
        }
        lastReaderTap = { time: now, x: event.clientX, y: event.clientY };
    });

    document.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches("input, select, textarea")) return;
        if (event.key === "ArrowLeft") {
            const previous = document.querySelector(".reader-nav a[href]");
            if (previous) window.location.href = previous.href;
        }
        if (event.key === "ArrowRight") {
            const links = document.querySelectorAll(".reader-nav a[href]");
            const next = links[links.length - 1];
            if (next) window.location.href = next.href;
        }
    });
}
