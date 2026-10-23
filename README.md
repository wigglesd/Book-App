# Book App

A small web app for keeping a log of the books you've read and a wishlist,
with a public page where anyone can check whether you've read a book.

- **Add books** by scanning the barcode with your phone camera or typing the
  ISBN. The ISBN is validated (ISBN-10 or ISBN-13) and looked up in
  [Open Library](https://openlibrary.org), falling back to
  [Google Books](https://books.google.com). If neither has it, you can enter
  the title and author yourself.
- **Two lists:** *Read* and *Wishlist*. Move wishlist books to Read when you
  finish them, add private notes, or remove books.
- **Public page** (`/share.html`) — no login needed. Visitors can:
  - paste a list of books (one per line: an ISBN, a title, or
    `Title by Author`) and see which are read, on the wishlist, or not read;
  - scan a barcode (handy in a bookshop) to check one book;
  - browse the read list and the wishlist.

  An ISBN for a *different edition* of a book you've logged still matches,
  because unmatched ISBNs are looked up and compared by title and author.
  Your notes are never shown to visitors.

## Running it

Requires Node.js 20.12+.

```sh
npm install
OWNER_PASSWORD='choose-a-password' OWNER_NAME='David' npm start
```

Settings can also go in a `.env` file (see `.env.example`).

Then open <http://localhost:3000> to log in and add books, and share
`http://<your-host>/share.html` with other people.

| Variable | Purpose |
| --- | --- |
| `OWNER_PASSWORD` | **Required.** Password for editing your lists. |
| `OWNER_NAME` | Name shown on the public page ("Has David read it?"). |
| `PORT` | Port to listen on (default `3000`). |
| `DATA_FILE` | Where books are stored (default `data/books.json`). Back this file up. |
| `GOOGLE_BOOKS_API_KEY` | Optional key for the Google Books fallback (the keyless quota is small). |

### Hosting on a Windows PC

See **[HOSTING-WINDOWS.md](HOSTING-WINDOWS.md)** for a step-by-step guide. A
setup script runs the app in the background at startup and gives it a free
HTTPS address via Tailscale Funnel.

### Camera scanning needs HTTPS

Browsers only allow camera access on `https://` pages (or `localhost`). To
scan from your phone, deploy behind HTTPS — for example on Render, Railway or
Fly.io, or locally via a tunnel such as `cloudflared tunnel --url
http://localhost:3000`. Typing the ISBN works everywhere.

If you deploy to a host with an ephemeral filesystem, point `DATA_FILE` at a
persistent volume so your lists survive restarts.

## Development

```sh
npm test
```

| Path | What it is |
| --- | --- |
| `server.js` | Entry point; reads env vars and starts the server. |
| `src/app.js` | Express routes (public queries and owner-only editing). |
| `src/isbn.js` | ISBN-10/13 validation and conversion. |
| `src/lookup.js` | Open Library / Google Books lookup. |
| `src/match.js` | Title matching for list checks. |
| `src/store.js` | JSON-file storage. |
| `src/auth.js` | Password login with a signed session cookie. |
| `scripts/windows/` | Setup, run and uninstall scripts for hosting on Windows. |
| `public/` | The owner page (`index.html`), public page (`share.html`) and shared browser code. |
