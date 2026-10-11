# ClipShelf

A private, local-first clipboard history for Linux and Windows.

## Features

- Captures text copied in any application
- Instant full-text search
- Pin important snippets
- Copy again with one click
- Pause capture for passwords or private work
- Clear all unpinned history
- Optional start at login
- System tray and `Ctrl+Shift+V` shortcut
- No accounts, analytics, cloud, or network requests

History is stored locally in Electron's per-user application-data directory. ClipShelf limits history to 500 unpinned entries and ignores clips larger than 100,000 characters.

## Install

Download the newest package from [Releases](https://github.com/catsu-byte/clipshelf/releases):

- Linux: download the `.AppImage`, make it executable, and run it.
- Windows: download and run the `Setup.exe` installer.

## Development

```bash
npm ci
npm start
```

Validate and package locally:

```bash
npm test
npm run pack
```

## Security

Clipboard managers can contain sensitive text. ClipShelf stores its database locally with user-only file permissions where supported. Use **Pause** before copying secrets that should not enter history.

The renderer runs with context isolation, sandboxing, no Node.js integration, and a restrictive Content Security Policy.

## License

MIT
