# Khajiit Economy

A small shop-management / accounting tool for RP shopkeepers, themed for
Skyrim. Spiritual successor to `GTACOMPTA`, rebuilt as a plain HTML/CSS/JS
frontend talking to a Python WebSocket server, with JSON files as the
database.

- **Frontend**: static HTML/CSS/JS, no build step, no framework. Deployable
  as-is to GitHub Pages (or opened directly from disk / served by any static
  file server).
- **Backend**: `server/server.py`, a single Python process (one dependency:
  `websockets`). Owns all state, persists it to `server/data/*.json`, and
  pushes live updates to every connected client.

## Running the server

```bash
cd server
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
python server.py            # listens on ws://0.0.0.0:8765 by default
```

Pass a port as the first argument to use something else: `python server.py 9000`.

Data is stored in `server/data/` as plain JSON files, created automatically
on first run. That folder is gitignored — back it up if you care about the
shop's history.

## Running the frontend locally

Any static file server works, e.g.:

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080`. On first load you'll be asked for a
**server address** — enter `localhost:8765` (or wherever `server.py` is
listening). If no admin account exists yet on that server, you'll land on
the setup panel to create your shop and admin account; otherwise you'll get
the login form.

## Deploying for real (GitHub Pages + home server + Cloudflare)

The frontend folder can be pushed to a GitHub Pages branch/repo as-is —
nothing to build.

**Important — HTTPS/WSS caveat:** GitHub Pages serves the site over HTTPS,
and browsers block a plain `ws://` connection from an HTTPS page (mixed
content). For that combination to work, the server needs to be reachable
over `wss://` with a valid TLS certificate — e.g. by exposing it through a
Cloudflare Tunnel (`cloudflared`) or a Cloudflare-proxied domain, terminating
TLS at Cloudflare's edge. This wasn't set up in this first pass (current
target was local testing over `ws://`); when you're ready to go live, point
the login screen's "server address" field at that `wss://your-domain`
instead of a raw IP, since a public TLS cert can't be issued for a bare IP
address.

The frontend auto-detects the scheme: type a bare `host:port` and it'll use
`wss://` when the page itself is loaded over HTTPS, `ws://` when loaded over
HTTP. You can also type a full `ws://…` or `wss://…` address explicitly to
override that.

## Data model

Six JSON collections under `server/data/`: `shop`, `users`, `employees`,
`clients`, `products`, `transactions`. See `server/db.py` for the exact
shape and `server/logic.py` for every validation/business rule (stock
checks, balance updates, commission math, etc.) — it's the single source of
truth for how the numbers move.

## Notes / assumptions worth knowing about

- Transaction **"in"** = a sale to the client (money in, stock down —
  checked against current quantity). **"out"** = a purchase/restock from
  the client (money out, stock up, uncapped).
- The employee **Pay** dialog computes `salary + amountSold * commission%`,
  logs it as an "out" transaction, deducts it from the balance, and resets
  that employee's tracked `amountSold` back to zero (starting a fresh
  commission period).
- Passwords are stored in plaintext in `users.json` (by explicit choice —
  only the server owner has filesystem access) but are never sent back to
  any client.
- Every mutating action broadcasts the full DB snapshot to all connected
  clients, so multiple simultaneous tabs/users stay in sync live.
