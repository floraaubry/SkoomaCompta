"""KhajiitEconomy WebSocket server.

One WS connection per browser tab. Requests look like:
    { "reqId": "...", "action": "...", "payload": {...} }
Responses:
    { "reqId": "...", "ok": true, "data": {...} }
    { "reqId": "...", "ok": false, "error": "message" }

Right after connecting, the server sends an unsolicited
    { "event": "hello", "setupRequired": bool }
so the frontend knows whether to show the admin-setup panel or the login
form before any credentials are sent.

After every successful mutating action, the full (password-stripped) DB
snapshot is broadcast to all connected sockets:
    { "event": "sync", "snapshot": {...} }
so every open tab stays live-in-sync.
"""

import asyncio
import json
import logging
import sys
from datetime import datetime, timezone

import websockets

import db as dbmod
import logic

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("khajiit")

ADMIN_ACTIONS = {
    "list_users", "create_user", "update_user", "delete_user", "list_logs",
    "list_backups", "create_backup", "restore_backup", "delete_backup", "get_backup_settings", "update_backup_settings",
}

MUTATING_ACTIONS = {
    "setup_admin",
    "create_user", "update_user", "delete_user",
    "create_client", "update_client", "delete_client",
    "create_employee", "update_employee", "delete_employee", "pay_employee",
    "create_product", "update_product", "delete_product",
    "create_transaction", "delete_transaction",
    "restore_backup",
}

# Auto-backup: how often the background loop checks whether a backup is due.
AUTO_BACKUP_CHECK_SECONDS = 60


class Server:
    def __init__(self):
        self.db = dbmod.Database()
        self.clients = {}  # websocket -> public user dict, or None if not logged in

    async def broadcast_sync(self):
        if not self.clients:
            return
        message = json.dumps({"event": "sync", "snapshot": self.db.snapshot()})
        await asyncio.gather(
            *(ws.send(message) for ws in list(self.clients)),
            return_exceptions=True,
        )

    def dispatch(self, websocket, action, payload):
        user = self.clients.get(websocket)

        if action == "setup_admin":
            result = logic.setup_admin(self.db, payload)
            self.clients[websocket] = result
            return {"user": result, "snapshot": self.db.snapshot()}

        if action == "login":
            result = logic.login(self.db, payload)
            self.clients[websocket] = result
            return {"user": result, "snapshot": self.db.snapshot()}

        if user is None:
            raise logic.LogicError("Vous devez être connecté.")

        if action in ADMIN_ACTIONS and not user.get("isAdmin"):
            raise logic.LogicError("Droits administrateur requis.")

        if action == "list_users":
            return [logic.public_user(u) for u in self.db.users]
        if action == "create_user":
            return logic.create_user(self.db, payload, user)
        if action == "update_user":
            return logic.update_user(self.db, payload, user)
        if action == "delete_user":
            return logic.delete_user(self.db, payload, user)

        if action == "list_logs":
            return list(reversed(self.db.logs))[:300]

        if action == "create_client":
            return logic.create_client(self.db, payload, user)
        if action == "update_client":
            return logic.update_client(self.db, payload, user)
        if action == "delete_client":
            return logic.delete_client(self.db, payload, user)

        if action == "create_employee":
            return logic.create_employee(self.db, payload, user)
        if action == "update_employee":
            return logic.update_employee(self.db, payload, user)
        if action == "delete_employee":
            return logic.delete_employee(self.db, payload, user)
        if action == "pay_employee":
            return logic.pay_employee(self.db, payload, user)

        if action == "create_product":
            return logic.create_product(self.db, payload, user)
        if action == "update_product":
            return logic.update_product(self.db, payload, user)
        if action == "delete_product":
            return logic.delete_product(self.db, payload, user)

        if action == "create_transaction":
            return logic.create_transaction(self.db, payload, user)
        if action == "delete_transaction":
            return logic.delete_transaction(self.db, payload, user)

        if action == "list_backups":
            return logic.list_backups(self.db)
        if action == "create_backup":
            return logic.create_backup(self.db, "manual", user)
        if action == "restore_backup":
            return logic.restore_backup(self.db, payload, user)
        if action == "delete_backup":
            return logic.delete_backup(self.db, payload, user)
        if action == "get_backup_settings":
            return logic.get_backup_settings(self.db)
        if action == "update_backup_settings":
            return logic.update_backup_settings(self.db, payload, user)

        raise logic.LogicError(f"Action inconnue : {action}")

    async def handle_message(self, websocket, raw):
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("Dropped malformed message: %r", raw[:200])
            return

        req_id = message.get("reqId")
        action = message.get("action")
        payload = message.get("payload") or {}

        success = False
        try:
            data = self.dispatch(websocket, action, payload)
            success = True
            await websocket.send(json.dumps({"reqId": req_id, "ok": True, "data": data}))
        except logic.LogicError as e:
            await websocket.send(json.dumps({"reqId": req_id, "ok": False, "error": str(e)}))
        except Exception:
            log.exception("Unhandled error handling action %r", action)
            await websocket.send(json.dumps({"reqId": req_id, "ok": False, "error": "Erreur du serveur."}))

        if success and action in MUTATING_ACTIONS:
            await self.broadcast_sync()

    async def auto_backup_loop(self):
        """Background task: creates a backup once the configured interval has elapsed.

        Runs independently of any client action, so it keeps backing up even
        with no browser tab open. Checked (not scheduled) every
        AUTO_BACKUP_CHECK_SECONDS so a runtime change to the interval takes
        effect on the next check rather than requiring a restart.
        """
        while True:
            await asyncio.sleep(AUTO_BACKUP_CHECK_SECONDS)
            try:
                hours = int(self.db.settings.get("autoBackupHours") or 0)
                if hours <= 0:
                    continue
                last = self.db.settings.get("lastAutoBackupAt")
                due = True
                if last:
                    last_dt = datetime.strptime(last, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
                    due = (datetime.now(timezone.utc) - last_dt).total_seconds() >= hours * 3600
                if not due:
                    continue
                logic.create_backup(self.db, "auto", None)
                self.db.settings["lastAutoBackupAt"] = logic.now_iso()
                self.db.save_one("settings")
                log.info("Auto backup created.")
            except Exception:
                log.exception("Auto backup failed")

    async def handle_connection(self, websocket, *_args):
        self.clients[websocket] = None
        peer = getattr(websocket, "remote_address", None)
        log.info("Client connected: %s", peer)
        try:
            await websocket.send(json.dumps({
                "event": "hello",
                "setupRequired": len(self.db.users) == 0,
            }))
            async for raw in websocket:
                await self.handle_message(websocket, raw)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.pop(websocket, None)
            log.info("Client disconnected: %s", peer)


async def main():
    host = "0.0.0.0"
    port = 8765
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    server = Server()
    asyncio.create_task(server.auto_backup_loop())
    async with websockets.serve(server.handle_connection, host, port, ping_interval=20, ping_timeout=20):
        log.info("KhajiitEconomy server listening on ws://%s:%s", host, port)
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
