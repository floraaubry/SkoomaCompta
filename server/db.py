"""JSON-file persistence for KhajiitEconomy.

Everything lives in memory as plain dicts/lists (see Database) and is
write-through persisted to server/data/*.json on every mutation. Writes are
atomic (temp file + os.replace) so a crash mid-write can't corrupt a file.
"""

import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")

DEFAULTS = {
    "shop": {"shopName": "", "balance": 0, "setupComplete": False},
    "users": [],
    "employees": [],
    "clients": [],
    "products": [],
    "transactions": [],
    "contracts": [],
    "recipes": [],
    "logs": [],
    "chatMessages": [],
    "settings": {"autoBackupHours": 0, "lastAutoBackupAt": None},
}

# Collections included in a backup snapshot / restore. Logs and settings are
# intentionally excluded: logs keep growing regardless of restores, and
# settings (e.g. the auto-backup interval) shouldn't be clobbered by one.
BACKUP_COLLECTIONS = ("shop", "users", "employees", "clients", "products", "transactions", "contracts", "recipes")

_BACKUP_ID_RE = re.compile(r"^[0-9A-Za-z_-]+$")


def _path(name):
    return os.path.join(DATA_DIR, f"{name}.json")


def _default(name):
    default = DEFAULTS[name]
    return dict(default) if isinstance(default, dict) else list(default)


def default_collection(name):
    """Public form of _default(), for callers outside this module (e.g. restoring
    an older backup that predates a collection added to BACKUP_COLLECTIONS)."""
    return _default(name)


def _atomic_write_json(directory, path, prefix, data):
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=prefix, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def save(name, data):
    _atomic_write_json(DATA_DIR, _path(name), f".{name}_", data)


def load(name):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = _path(name)
    if not os.path.exists(path):
        data = _default(name)
        save(name, data)
        return data
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------------ backups --
#
# Backups are stored as standalone JSON files under DATA_DIR/backups/, one per
# backup, named "<sortable timestamp>-<short id>.json". Each file holds a
# "_meta" block (id/createdAt/kind) plus a "data" block with the collections
# in BACKUP_COLLECTIONS. Restoring never touches settings.json or logs.json.

def _backup_path(backup_id):
    return os.path.join(BACKUP_DIR, f"{backup_id}.json")


def _backup_meta(backup_id, path, meta):
    return {
        "id": backup_id,
        "createdAt": meta.get("createdAt"),
        "kind": meta.get("kind", "manual"),
        "sizeBytes": os.path.getsize(path),
    }


def list_backups():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backups = []
    for fname in os.listdir(BACKUP_DIR):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(BACKUP_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        backups.append(_backup_meta(fname[:-5], path, payload.get("_meta", {})))
    backups.sort(key=lambda b: b["createdAt"] or "", reverse=True)
    return backups


def create_backup(collections, kind):
    backup_id = f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    meta = {"id": backup_id, "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), "kind": kind}
    path = _backup_path(backup_id)
    _atomic_write_json(BACKUP_DIR, path, ".backup_", {"_meta": meta, "data": collections})
    return _backup_meta(backup_id, path, meta)


def read_backup(backup_id):
    if not backup_id or not _BACKUP_ID_RE.match(backup_id):
        return None
    path = _backup_path(backup_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload.get("data")


def delete_backup(backup_id):
    if not backup_id or not _BACKUP_ID_RE.match(backup_id):
        return False
    path = _backup_path(backup_id)
    if not os.path.exists(path):
        return False
    os.remove(path)
    return True


class Database:
    """In-memory mirror of all collections."""

    def __init__(self):
        self.shop = load("shop")
        self.users = load("users")
        self.employees = load("employees")
        self.clients = load("clients")
        self.products = load("products")
        self.transactions = load("transactions")
        self.contracts = load("contracts")
        self.recipes = load("recipes")
        self.logs = load("logs")
        self.chatMessages = load("chatMessages")
        self.settings = load("settings")

    def save_all(self):
        for name in DEFAULTS:
            save(name, getattr(self, name))

    def save_one(self, name):
        save(name, getattr(self, name))

    def snapshot(self):
        """Full state broadcast to clients. Passwords are never included."""
        return {
            "shop": self.shop,
            "users": [{k: v for k, v in u.items() if k != "password"} for u in self.users],
            "employees": self.employees,
            "clients": self.clients,
            "products": self.products,
            "transactions": self.transactions,
            "contracts": self.contracts,
            "recipes": self.recipes,
        }
