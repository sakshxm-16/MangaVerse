# MangaVerse

MangaVerse is a server-rendered manga discovery and reading app powered by the [MangaDex API](https://api.mangadex.org). Browse titles, organize a personal library, and continue reading from where you left off.

## Features

- Discover and search MangaDex titles, including manga, manhwa, and manhua.
- Browse title details and read available chapters.
- Create an account and manage your profile and preferences.
- Save titles to built-in or custom bookmark folders.
- Resume a title at the next unread chapter.
- View new-chapter alerts and control them by bookmark folder.
- Customize the site with themes and reader display settings.
- Contact the site owner through the contact form.

## Tech stack

- Node.js and Express
- EJS templates and client-side JavaScript
- SQLite for accounts, sessions, and account preferences
- MangaDex API for catalog, cover, and chapter data
- Nodemailer for contact and password-reset email

## Requirements

- Node.js **22.13 or newer**
- npm
- Network access to the MangaDex API

## Run locally

From this directory:

```sh
npm ci
```

Create a local environment file as `.env`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Optional server port; defaults to `6307`. |
| `APP_BASE_URL` | Base URL used when generating links such as password-reset links. Defaults to the local server URL. |
| `SESSION_SECRET` | Secret used to sign session-related tokens. Required in production. |
| `DATABASE_PATH` | Optional SQLite database path; defaults to `data/mangaverse.sqlite`. |
| `SMTP_HOST` | SMTP server host for contact and password-reset email. |
| `SMTP_PORT` | SMTP server port; defaults to `587`. |
| `SMTP_SECURE` | Set to `true` when the SMTP server requires a secure connection from the start. |
| `SMTP_USER` / `SMTP_PASS` | SMTP authentication credentials. |
| `SMTP_FROM` | Sender address used for outgoing email. |

Email delivery is unavailable until SMTP is configured. For production, set a strong `SESSION_SECRET` and a public HTTPS `APP_BASE_URL`.

Then start the app:

```sh
npm start
```

Open [http://localhost:6307](http://localhost:6307). Set `PORT` in `.env` to use a different port.

## Data storage

The app creates its SQLite database automatically. The `data/` directory, `.env`, and `node_modules/` are excluded from Git.

Account data and account preferences are stored in SQLite. Bookmarks, custom bookmark folders, reading progress, and notification entries are stored in the browser's local storage, so they are specific to that browser.

## Project structure

```text
.
├── index.js              # Express server, routes, and SQLite setup
├── public/
│   ├── scripts/          # Client-side behavior
│   └── styles/           # Site styles
├── views/                # EJS pages and shared partials
├── data/                 # Runtime SQLite database (created automatically)
└── package.json
```

## Content and attribution

Catalog and chapter data are provided by MangaDex. Manga and chapter content remain subject to MangaDex availability, its terms, and the rights of their respective creators and credited scanlation groups. MangaVerse is an independent reader interface and is not affiliated with MangaDex.

## Hosting note

MangaVerse is a Node.js server application and needs a host that can run Node.js and preserve its SQLite database. GitHub Pages can display this README, but it cannot run the application server.
