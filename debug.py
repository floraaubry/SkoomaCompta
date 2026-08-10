"""Convenience launcher for local development.

Starts the WebSocket server (server/server.py, default ws://localhost:8765)
and a plain static file server for frontend/ on http://localhost:8080, so
you can just run `python debug.py` and open the frontend in a browser.

Pass --wipe to delete server/data first, resetting the shop to a clean
first-run state (admin setup panel) before starting.

Pass --testdb to seed server/data with a small French, Skyrim-themed sample
shop (3 users/employees, 5 clients, 15 alchemy products, 8 transactions)
instead of starting empty. Implies --wipe.

Ctrl+C stops both.
"""

import argparse
import json
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVER_DIR = ROOT / "server"
FRONTEND_DIR = ROOT / "frontend"
DATA_DIR = SERVER_DIR / "data"
FRONTEND_PORT = 8080
SERVER_PORT = 8765

TESTDB_PASSWORD = "test1234"


def wipe_data():
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
        print(f"[debug] wiped {DATA_DIR}")
    else:
        print("[debug] nothing to wipe, data directory doesn't exist")


def _new_id():
    return uuid.uuid4().hex


def generate_testdb():
    """Seed server/data with a small French, Skyrim-themed sample shop.

    Built as plain dicts written straight to disk (bypassing server/logic.py)
    so balances, stock levels and employee commissions are computed once
    here and match the resulting transaction history exactly.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    def product(name, quantity, sell_price):
        return {"id": _new_id(), "name": name, "quantity": quantity, "sellPrice": sell_price}

    products = {
        "nirnroot": product("Nirnroot", 12, 25),
        "bolet": product("Bolet géant", 20, 8),
        "aile": product("Aile de papillon de lune", 16, 12),
        "griffe": product("Griffe de troll", 10, 15),
        "oeuf": product("Œuf d'araignée gelée", 18, 10),
        "racine": product("Racine de belladone", 14, 18),
        "ecaille": product("Écaille de dragon", 5, 120),
        "coeur": product("Cœur de loup", 9, 22),
        "pot_mineure": product("Potion de guérison mineure", 25, 15),
        "pot_majeure": product("Potion de guérison majeure", 10, 45),
        "pot_poison_res": product("Potion de résistance au poison", 8, 30),
        "pot_force": product("Potion de force géante", 6, 60),
        "philtre_invis": product("Philtre d'invisibilité", 4, 150),
        "pot_magie": product("Potion de régénération de magie", 12, 35),
        "poison_paral": product("Poison paralysant", 7, 80),
    }

    def client(name, note):
        return {"id": _new_id(), "name": name, "totalEarned": 0, "note": note}

    clients = {
        "ysolda": client("Ysolda", "Marchande ambulante de Blancherive."),
        "sven": client("Sven", "Habitué, passe souvent après ses gardes."),
        "anoriath": client("Anoriath", "Chasseur, fournit parfois des ingrédients rares."),
        "nazir": client("Nazir", ""),
        "brelyna": client("Brelyna Maryon", "Apprentie mage, achète en gros pour le Collège."),
    }

    def employee(name, salary, note=""):
        return {"id": _new_id(), "name": name, "salary": salary, "amountSold": 0, "note": note}

    employees = {
        "lionor": employee("Lionor Mistyshore", 300, "Propriétaire de la boutique."),
        "kharjo": employee("Kharjo", 150, "Ancien caravanier, connaît bien les clients."),
        "ahkari": employee("Ahkari", 140),
    }

    users = [
        {"id": _new_id(), "name": "Lionor Mistyshore", "password": TESTDB_PASSWORD,
         "isAdmin": True, "employeeId": employees["lionor"]["id"]},
        {"id": _new_id(), "name": "Kharjo", "password": TESTDB_PASSWORD,
         "isAdmin": False, "employeeId": employees["kharjo"]["id"]},
        {"id": _new_id(), "name": "Ahkari", "password": TESTDB_PASSWORD,
         "isAdmin": False, "employeeId": employees["ahkari"]["id"]},
    ]

    def line(key, quantity):
        p = products[key]
        return {
            "productId": p["id"], "productName": p["name"], "quantity": quantity,
            "unitPrice": p["sellPrice"], "lineTotal": p["sellPrice"] * quantity,
        }

    # (direction, client key, employee key, date, item lines as (productKey, qty))
    plan = [
        ("in", "ysolda", "lionor", "2026-08-01 10:15", [("nirnroot", 3), ("pot_mineure", 2)]),
        ("in", "sven", "kharjo", "2026-08-02 14:30", [("pot_force", 1), ("bolet", 2)]),
        ("out", "anoriath", "lionor", "2026-08-03 09:00", [("ecaille", 5)]),
        ("in", "nazir", "ahkari", "2026-08-04 16:45", [("poison_paral", 1), ("pot_poison_res", 1)]),
        ("out", "brelyna", "ahkari", "2026-08-05 11:20", [("bolet", 10), ("oeuf", 5)]),
        ("in", "ysolda", "lionor", "2026-08-06 13:10", [("philtre_invis", 1), ("pot_majeure", 2)]),
        ("in", "anoriath", "kharjo", "2026-08-08 10:05", [("griffe", 3), ("coeur", 2)]),
        ("out", "sven", "kharjo", "2026-08-09 15:40", [("racine", 4), ("aile", 6)]),
    ]

    balance = 10000
    transactions = []
    for direction, client_key, employee_key, date, items in plan:
        c = clients[client_key]
        content = [line(key, qty) for key, qty in items]
        total = sum(l["lineTotal"] for l in content)

        for key, qty in items:
            products[key]["quantity"] += -qty if direction == "in" else qty

        if direction == "in":
            balance += total
            c["totalEarned"] += total
            employees[employee_key]["amountSold"] += total
        else:
            balance -= total

        transactions.append({
            "id": _new_id(), "name": c["name"], "direction": direction, "amount": total,
            "date": date, "employeeId": employees[employee_key]["id"], "clientId": c["id"],
            "content": content,
        })

    shop = {"shopName": "La Troisième Lune", "balance": balance, "setupComplete": True}

    logs = [{
        "id": _new_id(),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "userId": None,
        "userName": "Système",
        "action": "generate_testdb",
        "message": "Génération d'une base de données de test (3 utilisateurs, 5 clients, 15 produits, 8 transactions).",
    }]

    collections = {
        "shop": shop,
        "users": users,
        "employees": list(employees.values()),
        "clients": list(clients.values()),
        "products": list(products.values()),
        "transactions": transactions,
        "logs": logs,
    }
    for name, data in collections.items():
        with open(DATA_DIR / f"{name}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"[debug] generated test database in {DATA_DIR}")
    print(f"[debug]   shop: « {shop['shopName']} », balance {balance} septims")
    print(f"[debug]   login: Lionor Mistyshore / {TESTDB_PASSWORD} (admin)")
    print(f"[debug]   also: Kharjo / {TESTDB_PASSWORD}, Ahkari / {TESTDB_PASSWORD}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Delete server/data before starting (reset to first-run state).",
    )
    parser.add_argument(
        "--testdb",
        action="store_true",
        help="Seed server/data with a sample test shop before starting (implies --wipe).",
    )
    args = parser.parse_args()

    if args.wipe or args.testdb:
        wipe_data()
    if args.testdb:
        generate_testdb()

    processes = []
    try:
        server_proc = subprocess.Popen(
            [sys.executable, "server.py", str(SERVER_PORT)],
            cwd=SERVER_DIR,
        )
        processes.append(server_proc)
        print(f"[debug] server:   ws://localhost:{SERVER_PORT}")

        time.sleep(0.5)

        frontend_proc = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(FRONTEND_PORT)],
            cwd=FRONTEND_DIR,
        )
        processes.append(frontend_proc)
        print(f"[debug] frontend: http://localhost:{FRONTEND_PORT}")

        print("[debug] Ctrl+C to stop both")
        while True:
            for proc in processes:
                code = proc.poll()
                if code is not None:
                    print(f"[debug] process {proc.args} exited with code {code}, shutting down")
                    return
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[debug] stopping...")
    finally:
        for proc in processes:
            if proc.poll() is None:
                proc.terminate()
        for proc in processes:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
