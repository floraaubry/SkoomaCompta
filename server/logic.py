"""Domain rules for KhajiitEconomy: validation, stock/balance/commission math.

Every function takes the shared Database instance and a payload dict, and
either returns the created/updated record (persisting the change) or raises
LogicError with a message safe to show directly to the user (in French — the
frontend is French-only and just displays these verbatim).

Money (balance, salary, prices, transaction amounts) is always a number of
septims rounded to at most 2 decimal places (fractional septims).

Every mutating function also takes the acting user and appends a line to the
audit log (db.logs) describing what happened — this is the data behind the
admin-only "Journal" dialog in the frontend.
"""

import uuid
from datetime import datetime, timezone

import db as dbmod


class LogicError(Exception):
    pass


def new_id():
    return uuid.uuid4().hex


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")


def public_user(user):
    return {k: v for k, v in user.items() if k != "password"}


def round2(value):
    return round(float(value), 2)


def to_money(value, field_error):
    try:
        return round2(value)
    except (TypeError, ValueError):
        raise LogicError(field_error)


def log_action(db, acting_user, action, message):
    db.logs.append({
        "id": new_id(),
        "timestamp": now_iso(),
        "userId": acting_user.get("id") if acting_user else None,
        "userName": acting_user.get("name") if acting_user else "Système",
        "action": action,
        "message": message,
    })
    db.save_one("logs")


# ---------------------------------------------------------------- lookups --

def find_user(db, user_id):
    for u in db.users:
        if u["id"] == user_id:
            return u
    raise LogicError("Utilisateur introuvable.")


def find_client(db, client_id):
    for c in db.clients:
        if c["id"] == client_id:
            return c
    raise LogicError("Client introuvable.")


def find_employee(db, employee_id):
    if employee_id is None:
        return None
    for e in db.employees:
        if e["id"] == employee_id:
            return e
    raise LogicError("Employé introuvable.")


def find_employee_or_none(db, employee_id):
    """Like find_employee, but returns None instead of raising when the id is
    set but no longer matches any employee (e.g. it was deleted since)."""
    if not employee_id:
        return None
    for e in db.employees:
        if e["id"] == employee_id:
            return e
    return None


def find_product(db, product_id):
    for p in db.products:
        if p["id"] == product_id:
            return p
    raise LogicError("Produit introuvable.")


def find_transaction(db, transaction_id):
    for t in db.transactions:
        if t["id"] == transaction_id:
            return t
    raise LogicError("Transaction introuvable.")


def find_contract(db, contract_id):
    for c in db.contracts:
        if c["id"] == contract_id:
            return c
    raise LogicError("Contrat introuvable.")


def find_recipe(db, recipe_id):
    for r in db.recipes:
        if r["id"] == recipe_id:
            return r
    raise LogicError("Recette introuvable.")


# --------------------------------------------------------- setup / login --

def setup_admin(db, payload):
    if db.users:
        raise LogicError("La configuration a déjà été effectuée.")
    name = (payload.get("name") or "").strip()
    password = payload.get("password") or ""
    shop_name = (payload.get("shopName") or "").strip()
    if not name or not password:
        raise LogicError("Le nom d'utilisateur et le mot de passe sont requis.")
    if not shop_name:
        raise LogicError("Le nom de la boutique est requis.")
    starting_balance = to_money(
        payload.get("startingBalance", 0), "Le solde de départ doit être un nombre."
    )
    if starting_balance < 0:
        raise LogicError("Le solde de départ ne peut pas être négatif.")

    user = {"id": new_id(), "name": name, "password": password, "isAdmin": True, "employeeId": None}
    db.users.append(user)
    db.shop["shopName"] = shop_name
    db.shop["balance"] = starting_balance
    db.shop["setupComplete"] = True
    log_action(db, user, "setup_admin", f"Configuration initiale de la boutique « {shop_name} ».")
    db.save_all()
    return public_user(user)


def login(db, payload):
    name = (payload.get("name") or "").strip()
    password = payload.get("password") or ""
    for u in db.users:
        if u["name"].lower() == name.lower() and u["password"] == password:
            return public_user(u)
    raise LogicError("Nom d'utilisateur ou mot de passe invalide.")


# ------------------------------------------------------------------ users --

def create_user(db, payload, acting_user):
    name = (payload.get("name") or "").strip()
    password = payload.get("password") or ""
    is_admin = bool(payload.get("isAdmin"))
    employee_id = payload.get("employeeId") or None
    if not name or not password:
        raise LogicError("Le nom d'utilisateur et le mot de passe sont requis.")
    if any(u["name"].lower() == name.lower() for u in db.users):
        raise LogicError("Un utilisateur portant ce nom existe déjà.")
    if not is_admin and not employee_id:
        raise LogicError("Les utilisateurs non-administrateurs doivent être associés à un employé.")
    if employee_id:
        find_employee(db, employee_id)
    user = {"id": new_id(), "name": name, "password": password, "isAdmin": is_admin, "employeeId": employee_id}
    db.users.append(user)
    log_action(
        db, acting_user, "create_user",
        f"Création de l'utilisateur « {name} »" + (" (administrateur)" if is_admin else "") + "."
    )
    db.save_one("users")
    return public_user(user)


def update_user(db, payload, acting_user):
    user = find_user(db, payload.get("id"))
    changes = []
    if payload.get("name") is not None:
        name = payload["name"].strip()
        if not name:
            raise LogicError("Le nom d'utilisateur ne peut pas être vide.")
        if any(u["name"].lower() == name.lower() and u["id"] != user["id"] for u in db.users):
            raise LogicError("Un utilisateur portant ce nom existe déjà.")
        if name != user["name"]:
            changes.append(f"nom « {user['name']} » → « {name} »")
        user["name"] = name
    if payload.get("password"):
        user["password"] = payload["password"]
        changes.append("mot de passe changé")
    if "isAdmin" in payload:
        new_is_admin = bool(payload["isAdmin"])
        if user["isAdmin"] and not new_is_admin and sum(1 for u in db.users if u["isAdmin"]) <= 1:
            raise LogicError("Impossible de retirer les droits administrateur du dernier compte administrateur.")
        if new_is_admin != user["isAdmin"]:
            changes.append("administrateur activé" if new_is_admin else "administrateur retiré")
        user["isAdmin"] = new_is_admin
    if "employeeId" in payload:
        employee_id = payload["employeeId"] or None
        if employee_id:
            find_employee(db, employee_id)
        if employee_id != user["employeeId"]:
            changes.append("employé associé changé")
        user["employeeId"] = employee_id
    if not user["isAdmin"] and not user["employeeId"]:
        raise LogicError("Les utilisateurs non-administrateurs doivent être associés à un employé.")
    log_action(
        db, acting_user, "update_user",
        f"Modification de l'utilisateur « {user['name']} »" + (f" : {', '.join(changes)}." if changes else ".")
    )
    db.save_one("users")
    return public_user(user)


def delete_user(db, payload, acting_user):
    user = find_user(db, payload.get("id"))
    if user["id"] == acting_user["id"]:
        raise LogicError("Vous ne pouvez pas supprimer votre propre compte.")
    if user["isAdmin"] and sum(1 for u in db.users if u["isAdmin"]) <= 1:
        raise LogicError("Impossible de supprimer le dernier compte administrateur.")
    db.users.remove(user)
    log_action(db, acting_user, "delete_user", f"Suppression de l'utilisateur « {user['name']} ».")
    db.save_one("users")
    return {"id": user["id"]}


# ---------------------------------------------------------------- clients --

def create_client(db, payload, acting_user):
    name = (payload.get("name") or "").strip()
    if not name:
        raise LogicError("Le nom du client est requis.")
    client = {"id": new_id(), "name": name, "totalEarned": 0, "note": payload.get("note") or ""}
    db.clients.append(client)
    log_action(db, acting_user, "create_client", f"Création du client « {name} ».")
    db.save_one("clients")
    return client


def update_client(db, payload, acting_user):
    client = find_client(db, payload.get("id"))
    changes = []
    if payload.get("name") is not None:
        name = payload["name"].strip()
        if not name:
            raise LogicError("Le nom du client est requis.")
        if name != client["name"]:
            changes.append(f"nom « {client['name']} » → « {name} »")
        client["name"] = name
    if "note" in payload:
        client["note"] = payload["note"] or ""
        changes.append("note modifiée")
    log_action(
        db, acting_user, "update_client",
        f"Modification du client « {client['name']} »" + (f" : {', '.join(changes)}." if changes else ".")
    )
    db.save_one("clients")
    return client


def delete_client(db, payload, acting_user):
    client = find_client(db, payload.get("id"))
    if any(t.get("clientId") == client["id"] for t in db.transactions):
        raise LogicError("Impossible de supprimer un client ayant des transactions existantes.")
    db.clients.remove(client)
    log_action(db, acting_user, "delete_client", f"Suppression du client « {client['name']} ».")
    db.save_one("clients")
    return {"id": client["id"]}


# -------------------------------------------------------------- employees --

def create_employee(db, payload, acting_user):
    name = (payload.get("name") or "").strip()
    if not name:
        raise LogicError("Le nom de l'employé est requis.")
    employee = {
        "id": new_id(),
        "name": name,
        "note": payload.get("note") or "",
        "balance": 0,
        "balanceSince": now_iso(),
        "payHistory": [],
    }
    db.employees.append(employee)
    log_action(db, acting_user, "create_employee", f"Création de l'employé « {name} ».")
    db.save_one("employees")
    return employee


def update_employee(db, payload, acting_user):
    employee = find_employee(db, payload.get("id"))
    changes = []
    if payload.get("name") is not None:
        name = payload["name"].strip()
        if not name:
            raise LogicError("Le nom de l'employé est requis.")
        if name != employee["name"]:
            changes.append(f"nom « {employee['name']} » → « {name} »")
        employee["name"] = name
    if "note" in payload:
        employee["note"] = payload["note"] or ""
        changes.append("note modifiée")
    log_action(
        db, acting_user, "update_employee",
        f"Modification de l'employé « {employee['name']} »" + (f" : {', '.join(changes)}." if changes else ".")
    )
    db.save_one("employees")
    return employee


def _transaction_references_employee(transaction, employee_id):
    if transaction.get("employeeId") == employee_id:
        return True
    payroll = transaction.get("payroll")
    if not payroll:
        return False
    if payroll.get("vendorEmployeeId") == employee_id:
        return True
    return any(share["employeeId"] == employee_id for share in payroll.get("potCommunShares", []))


def delete_employee(db, payload, acting_user):
    employee = find_employee(db, payload.get("id"))
    if any(u.get("employeeId") == employee["id"] for u in db.users):
        raise LogicError("Impossible de supprimer un employé associé à un compte utilisateur.")
    if any(_transaction_references_employee(t, employee["id"]) for t in db.transactions):
        raise LogicError("Impossible de supprimer un employé ayant des transactions existantes.")
    if employee.get("balance"):
        raise LogicError("Impossible de supprimer un employé ayant un solde à venir non nul.")
    db.employees.remove(employee)
    log_action(db, acting_user, "delete_employee", f"Suppression de l'employé « {employee['name']} ».")
    db.save_one("employees")
    return {"id": employee["id"]}


def pay_employee(db, payload, acting_user):
    employee = find_employee(db, payload.get("id"))
    total = round2(employee.get("balance", 0))
    if total <= 0:
        raise LogicError("Aucun solde à payer pour cet employé.")

    paid_at = now_iso()
    period_start = employee.get("balanceSince") or paid_at

    transaction = {
        "id": new_id(),
        "name": f"Salaire - {employee['name']}",
        "direction": "out",
        "amount": total,
        "date": paid_at,
        "employeeId": employee["id"],
        "clientId": None,
        "content": [{"label": "Solde payé", "amount": total}],
        "payroll": None,
    }
    db.transactions.append(transaction)
    db.shop["balance"] = round2(db.shop["balance"] - total)

    employee.setdefault("payHistory", []).append({
        "id": new_id(),
        "periodStart": period_start,
        "periodEnd": paid_at,
        "amount": total,
        "transactionId": transaction["id"],
    })
    employee["balance"] = 0
    employee["balanceSince"] = paid_at

    log_action(
        db, acting_user, "pay_employee",
        f"Paiement de l'employé « {employee['name']} » : {total} septims."
    )
    db.save_all()
    return transaction


# ---------------------------------------------------------------- products --

def create_product(db, payload, acting_user):
    name = (payload.get("name") or "").strip()
    if not name:
        raise LogicError("Le nom du produit est requis.")
    try:
        quantity = int(payload.get("quantity", 0))
    except (TypeError, ValueError):
        raise LogicError("La quantité et le prix doivent être des nombres.")
    sell_price = to_money(payload.get("sellPrice", 0), "La quantité et le prix doivent être des nombres.")
    if quantity < 0:
        raise LogicError("La quantité ne peut pas être négative.")
    if sell_price < 0:
        raise LogicError("Le prix ne peut pas être négatif.")
    product = {"id": new_id(), "name": name, "quantity": quantity, "sellPrice": sell_price}
    db.products.append(product)
    log_action(
        db, acting_user, "create_product",
        f"Création du produit « {name} » ({quantity} en stock, {sell_price} septims)."
    )
    db.save_one("products")
    return product


def update_product(db, payload, acting_user):
    product = find_product(db, payload.get("id"))
    changes = []
    if payload.get("name") is not None:
        name = payload["name"].strip()
        if not name:
            raise LogicError("Le nom du produit est requis.")
        if name != product["name"]:
            changes.append(f"nom « {product['name']} » → « {name} »")
        product["name"] = name
    if "quantity" in payload:
        try:
            quantity = int(payload["quantity"])
        except (TypeError, ValueError):
            raise LogicError("La quantité doit être un nombre.")
        if quantity < 0:
            raise LogicError("La quantité ne peut pas être négative.")
        if quantity != product["quantity"]:
            changes.append(f"quantité {product['quantity']} → {quantity}")
        product["quantity"] = quantity
    if "sellPrice" in payload:
        sell_price = to_money(payload["sellPrice"], "Le prix doit être un nombre.")
        if sell_price < 0:
            raise LogicError("Le prix ne peut pas être négatif.")
        if sell_price != product["sellPrice"]:
            changes.append(f"prix {product['sellPrice']} → {sell_price} septims")
        product["sellPrice"] = sell_price
    log_action(
        db, acting_user, "update_product",
        f"Modification du produit « {product['name']} »" + (f" : {', '.join(changes)}." if changes else ".")
    )
    db.save_one("products")
    return product


def delete_product(db, payload, acting_user):
    product = find_product(db, payload.get("id"))
    used = any(
        item.get("productId") == product["id"]
        for t in db.transactions
        for item in t.get("content", [])
    )
    if used:
        raise LogicError("Impossible de supprimer un produit référencé par des transactions existantes.")
    used_in_recipe = any(
        product["id"] == r["output"]["productId"] or any(i["productId"] == product["id"] for i in r["ingredients"])
        for r in db.recipes
    )
    if used_in_recipe:
        raise LogicError("Impossible de supprimer un produit référencé par une recette existante.")
    db.products.remove(product)
    log_action(db, acting_user, "delete_product", f"Suppression du produit « {product['name']} ».")
    db.save_one("products")
    return {"id": product["id"]}


# ----------------------------------------------------------- transactions --

def _content_summary(content):
    return ", ".join(
        f"{c['productName']} x{c['quantity']}" if "productName" in c else f"{c['label']} {c['amount']}"
        for c in content
    )


# ------------------------------------------------------------ payroll split --
#
# Every sale (direction "in") splits its total between four buckets, applied
# in sequence: Impôts (taxPercent of the total, simply discarded), Part
# Vendeur (vendorPercent of what's left after tax, credited to the employee
# linked to the acting user), then whatever remains splits between Entreprise
# and Pot Commun (potCommunPercent of it, split evenly across every employee
# that currently exists — Entreprise is the complement and isn't tracked
# separately, it's just what stays in the shop balance). If the acting user
# has no linked employee, their vendor share folds into the Pot Commun pool
# instead of being lost. The breakdown is stored on the transaction itself
# (see create_transaction / checkout_contract) so delete_transaction can
# reverse it exactly, employee by employee, even if the employee roster has
# changed since.

def _split_evenly(total, employees):
    """Splits `total` septims evenly across `employees`, in integer centimes,
    handing any leftover centime to the first few employees so the shares add
    back up to `total` exactly (no silent rounding drift over time)."""
    if not employees or total <= 0:
        return []
    cents_total = round(total * 100)
    n = len(employees)
    base = cents_total // n
    leftover = cents_total - base * n
    shares = []
    for i, employee in enumerate(employees):
        cents = base + (1 if i < leftover else 0)
        if cents:
            shares.append({"employeeId": employee["id"], "amount": round2(cents / 100)})
    return shares


def _compute_payroll_split(db, total, acting_user):
    tax_percent = db.shop.get("taxPercent", 0)
    vendor_percent = db.shop.get("vendorPercent", 0)
    pot_commun_percent = db.shop.get("potCommunPercent", 0)

    tax_amount = round2(total * tax_percent / 100)
    after_tax = round2(total - tax_amount)
    vendor_amount = round2(after_tax * vendor_percent / 100)
    remainder = round2(after_tax - vendor_amount)
    pot_commun_amount = round2(remainder * pot_commun_percent / 100)
    entreprise_amount = round2(remainder - pot_commun_amount)

    vendor_employee = find_employee_or_none(db, acting_user.get("employeeId"))
    pot_commun_pool = pot_commun_amount if vendor_employee else round2(pot_commun_amount + vendor_amount)
    pot_commun_shares = _split_evenly(pot_commun_pool, db.employees)

    if vendor_employee:
        vendor_employee["balance"] = round2(vendor_employee.get("balance", 0) + vendor_amount)
    for share in pot_commun_shares:
        employee = find_employee(db, share["employeeId"])
        employee["balance"] = round2(employee.get("balance", 0) + share["amount"])

    db.shop["balance"] = round2(db.shop["balance"] + after_tax)

    return {
        "taxAmount": tax_amount,
        "afterTaxAmount": after_tax,
        "vendorEmployeeId": vendor_employee["id"] if vendor_employee else None,
        "vendorAmount": vendor_amount,
        "potCommunTotal": pot_commun_pool,
        "potCommunShares": pot_commun_shares,
        "entrepriseAmount": entreprise_amount,
    }


def _reverse_payroll_split(db, payroll):
    db.shop["balance"] = round2(db.shop["balance"] - payroll["afterTaxAmount"])
    if payroll.get("vendorEmployeeId"):
        employee = find_employee_or_none(db, payroll["vendorEmployeeId"])
        if employee:
            employee["balance"] = max(0, round2(employee.get("balance", 0) - payroll["vendorAmount"]))
    for share in payroll.get("potCommunShares", []):
        employee = find_employee_or_none(db, share["employeeId"])
        if employee:
            employee["balance"] = max(0, round2(employee.get("balance", 0) - share["amount"]))


def _reverse_pay_employee(db, transaction):
    """Deleting a pay_employee transaction should act like the payment never
    happened: give the paid-out amount back to the employee's balance, drop
    the payHistory entry it created, and un-close the accrual period it
    closed (only when it's still the most recent payment — an older payment
    being deleted out of order leaves later period boundaries alone)."""
    employee = find_employee_or_none(db, transaction.get("employeeId"))
    if not employee:
        return
    pay_history = employee.get("payHistory", [])
    pay_record = next((p for p in pay_history if p.get("transactionId") == transaction["id"]), None)
    if not pay_record:
        return
    was_most_recent = pay_history[-1] is pay_record
    pay_history.remove(pay_record)
    employee["balance"] = round2(employee.get("balance", 0) + pay_record["amount"])
    if was_most_recent:
        employee["balanceSince"] = pay_record["periodStart"]


def update_payroll_settings(db, payload, acting_user):
    def pct(name, label):
        try:
            value = float(payload[name])
        except (TypeError, ValueError, KeyError):
            raise LogicError(f"{label} doit être un nombre.")
        if not (0 <= value <= 100):
            raise LogicError(f"{label} doit être compris entre 0 et 100.")
        return round2(value)

    tax_percent = pct("taxPercent", "Le pourcentage d'impôts")
    vendor_percent = pct("vendorPercent", "Le pourcentage de part vendeur")
    pot_commun_percent = pct("potCommunPercent", "Le pourcentage du pot commun")
    apply_to_contracts = bool(payload.get("applySplitToContracts"))

    db.shop["taxPercent"] = tax_percent
    db.shop["vendorPercent"] = vendor_percent
    db.shop["potCommunPercent"] = pot_commun_percent
    db.shop["applySplitToContracts"] = apply_to_contracts
    log_action(
        db, acting_user, "update_payroll_settings",
        f"Répartition des ventes : impôts {tax_percent:g}%, part vendeur {vendor_percent:g}%, "
        f"pot commun {pot_commun_percent:g}% (entreprise {100 - pot_commun_percent:g}%)"
        + (", appliquée aussi aux encaissements de contrats" if apply_to_contracts else "") + "."
    )
    db.save_one("shop")
    return db.shop


def create_transaction(db, payload, acting_user):
    direction = payload.get("direction")
    client_id = payload.get("clientId")
    items = payload.get("items") or []
    try:
        adjustment_percent = float(payload.get("adjustmentPercent", 0) or 0)
    except (TypeError, ValueError):
        raise LogicError("Le pourcentage d'ajustement doit être un nombre.")
    if adjustment_percent < -100:
        raise LogicError("Le pourcentage d'ajustement ne peut pas être inférieur à -100%.")

    if direction not in ("in", "out"):
        raise LogicError("Le sens doit être « entrée » ou « sortie ».")
    if not client_id:
        raise LogicError("Un client est requis.")
    client = find_client(db, client_id)
    if not items:
        raise LogicError("Au moins une ligne de produit est requise.")

    resolved = []
    requested_by_product = {}
    for item in items:
        product = find_product(db, item.get("productId"))
        try:
            quantity = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            raise LogicError(f"Quantité invalide pour {product['name']}.")
        if quantity <= 0:
            raise LogicError(f"La quantité pour {product['name']} doit être supérieure à zéro.")
        requested_by_product[product["id"]] = requested_by_product.get(product["id"], 0) + quantity
        if direction == "in" and requested_by_product[product["id"]] > product["quantity"]:
            raise LogicError(
                f"Stock insuffisant pour {product['name']} : {product['quantity']} en stock, "
                f"{requested_by_product[product['id']]} demandés."
            )
        resolved.append({
            "productId": product["id"],
            "productName": product["name"],
            "quantity": quantity,
            "unitPrice": product["sellPrice"],
            "lineTotal": round2(product["sellPrice"] * quantity),
        })

    subtotal = round2(sum(line["lineTotal"] for line in resolved))
    adjustment_amount = round2(subtotal * adjustment_percent / 100)
    total = round2(subtotal + adjustment_amount)

    for line in resolved:
        product = find_product(db, line["productId"])
        if direction == "in":
            product["quantity"] -= line["quantity"]
        else:
            product["quantity"] += line["quantity"]

    payroll = None
    if direction == "in":
        client["totalEarned"] = round2(client.get("totalEarned", 0) + total)
        payroll = _compute_payroll_split(db, total, acting_user)
    else:
        db.shop["balance"] = round2(db.shop["balance"] - total)

    content = list(resolved)
    if adjustment_amount:
        content.append({"label": f"Ajustement ({adjustment_percent:+g}%)", "amount": adjustment_amount})

    transaction = {
        "id": new_id(),
        "name": client["name"],
        "direction": direction,
        "amount": total,
        "date": now_iso(),
        "employeeId": acting_user.get("employeeId"),
        "clientId": client["id"],
        "content": content,
        "payroll": payroll,
    }
    db.transactions.append(transaction)
    direction_label = "entrée" if direction == "in" else "sortie"
    log_action(
        db, acting_user, "create_transaction",
        f"Transaction ({direction_label}) avec « {client['name']} » : {total} septims "
        f"({_content_summary(content)})."
    )
    db.save_all()
    return transaction


def delete_transaction(db, payload, acting_user):
    transaction = find_transaction(db, payload.get("id"))
    direction = transaction["direction"]
    amount = transaction["amount"]
    content = transaction.get("content", [])
    product_lines = [c for c in content if "productId" in c]

    if direction == "out":
        for line in product_lines:
            product = find_product(db, line["productId"])
            if line["quantity"] > product["quantity"]:
                raise LogicError(
                    f"Impossible de supprimer cette transaction : stock insuffisant pour "
                    f"annuler l'achat de {product['name']}."
                )

    for line in product_lines:
        product = find_product(db, line["productId"])
        if direction == "in":
            product["quantity"] += line["quantity"]
        else:
            product["quantity"] -= line["quantity"]

    client_id = transaction.get("clientId")
    payroll = transaction.get("payroll")
    if direction == "in":
        if client_id:
            client = find_client(db, client_id)
            client["totalEarned"] = round2(client.get("totalEarned", 0) - amount)
        if payroll:
            _reverse_payroll_split(db, payroll)
        else:
            db.shop["balance"] = round2(db.shop["balance"] - amount)
    else:
        db.shop["balance"] = round2(db.shop["balance"] + amount)
        _reverse_pay_employee(db, transaction)

    db.transactions.remove(transaction)
    direction_label = "entrée" if direction == "in" else "sortie"
    log_action(
        db, acting_user, "delete_transaction",
        f"Suppression de la transaction ({direction_label}) « {transaction['name']} » : "
        f"{amount} septims ({_content_summary(content)})."
    )
    db.save_all()
    return {"id": transaction["id"]}


# ----------------------------------------------------------------- contracts --
#
# A contract is a recurring agreement with a client: a fixed list of products
# (with quantities) and a discount, replayed each time it's checked out.
#
# contract["type"] is from the shop's perspective as the payer/payee, per the
# product owner's spec: "in" = a contract where WE pay (a recurring purchase —
# stock goes up, balance goes down), "out" = a contract where the CLIENT pays
# US (a recurring sale — stock goes down, balance goes up). That is the
# opposite of transaction["direction"], where "in" means money coming in. The
# mapping below (direction = "in" if contract type == "out" else "out")
# translates one convention to the other so checkout can reuse the same
# stock/balance math as create_transaction.

def _resolve_contract_items(db, items):
    if not items:
        raise LogicError("Au moins une ligne de produit est requise.")
    resolved = []
    for item in items:
        product = find_product(db, item.get("productId"))
        try:
            quantity = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            raise LogicError(f"Quantité invalide pour {product['name']}.")
        if quantity <= 0:
            raise LogicError(f"La quantité pour {product['name']} doit être supérieure à zéro.")
        resolved.append({"productId": product["id"], "quantity": quantity})
    return resolved


def _contract_type_label(contract_type):
    return "achat récurrent" if contract_type == "in" else "vente récurrente"


def create_contract(db, payload, acting_user):
    contract_type = payload.get("type")
    if contract_type not in ("in", "out"):
        raise LogicError("Le type de contrat doit être « achat » ou « vente ».")
    client = find_client(db, payload.get("clientId"))

    try:
        discount_percent = int(payload.get("discountPercent", 0))
    except (TypeError, ValueError):
        raise LogicError("La remise doit être un nombre entier.")
    if not (0 <= discount_percent <= 100):
        raise LogicError("La remise doit être comprise entre 0 et 100.")

    items = _resolve_contract_items(db, payload.get("items") or [])

    contract = {
        "id": new_id(),
        "clientId": client["id"],
        "type": contract_type,
        "items": items,
        "discountPercent": discount_percent,
    }
    db.contracts.append(contract)
    log_action(
        db, acting_user, "create_contract",
        f"Création d'un contrat ({_contract_type_label(contract_type)}) avec « {client['name']} »."
    )
    db.save_one("contracts")
    return contract


def update_contract(db, payload, acting_user):
    contract = find_contract(db, payload.get("id"))

    if payload.get("clientId") is not None:
        client = find_client(db, payload["clientId"])
        contract["clientId"] = client["id"]

    if payload.get("type") is not None:
        if payload["type"] not in ("in", "out"):
            raise LogicError("Le type de contrat doit être « achat » ou « vente ».")
        contract["type"] = payload["type"]

    if payload.get("items") is not None:
        contract["items"] = _resolve_contract_items(db, payload["items"])

    if payload.get("discountPercent") is not None:
        try:
            discount_percent = int(payload["discountPercent"])
        except (TypeError, ValueError):
            raise LogicError("La remise doit être un nombre entier.")
        if not (0 <= discount_percent <= 100):
            raise LogicError("La remise doit être comprise entre 0 et 100.")
        contract["discountPercent"] = discount_percent

    client = find_client(db, contract["clientId"])
    log_action(db, acting_user, "update_contract", f"Modification du contrat avec « {client['name']} ».")
    db.save_one("contracts")
    return contract


def delete_contract(db, payload, acting_user):
    contract = find_contract(db, payload.get("id"))
    client = find_client(db, contract["clientId"])
    db.contracts.remove(contract)
    log_action(db, acting_user, "delete_contract", f"Suppression du contrat avec « {client['name']} ».")
    db.save_one("contracts")
    return {"id": contract["id"]}


def checkout_contract(db, payload, acting_user):
    contract = find_contract(db, payload.get("id"))
    client = find_client(db, contract["clientId"])

    resolved = []
    for item in contract["items"]:
        product = find_product(db, item["productId"])
        resolved.append({
            "productId": product["id"],
            "productName": product["name"],
            "quantity": item["quantity"],
            "unitPrice": product["sellPrice"],
            "lineTotal": round2(product["sellPrice"] * item["quantity"]),
        })
    subtotal = round2(sum(line["lineTotal"] for line in resolved))
    discount_percent = contract.get("discountPercent", 0)
    discount_amount = round2(subtotal * discount_percent / 100)
    total = round2(subtotal - discount_amount)

    content = list(resolved)
    if discount_amount:
        content.append({"label": f"Remise ({discount_percent}%)", "amount": -discount_amount})

    # See module-level note above: contract type is inverted vs. transaction direction.
    direction = "in" if contract["type"] == "out" else "out"

    payroll = None
    if direction == "in":
        for line in resolved:
            product = find_product(db, line["productId"])
            if line["quantity"] > product["quantity"]:
                raise LogicError(
                    f"Stock insuffisant pour {product['name']} : {product['quantity']} en stock, "
                    f"{line['quantity']} requis pour ce contrat."
                )
        for line in resolved:
            find_product(db, line["productId"])["quantity"] -= line["quantity"]
        client["totalEarned"] = round2(client.get("totalEarned", 0) + total)
        if db.shop.get("applySplitToContracts"):
            payroll = _compute_payroll_split(db, total, acting_user)
        else:
            db.shop["balance"] = round2(db.shop["balance"] + total)
    else:
        for line in resolved:
            find_product(db, line["productId"])["quantity"] += line["quantity"]
        db.shop["balance"] = round2(db.shop["balance"] - total)

    transaction = {
        "id": new_id(),
        "name": f"Contrat — {client['name']}",
        "direction": direction,
        "amount": total,
        "date": now_iso(),
        "employeeId": acting_user.get("employeeId"),
        "clientId": client["id"],
        "content": content,
        "contractId": contract["id"],
        "payroll": payroll,
    }
    db.transactions.append(transaction)
    log_action(
        db, acting_user, "checkout_contract",
        f"Encaissement du contrat ({_contract_type_label(contract['type'])}) avec « {client['name']} » : {total} septims."
    )
    db.save_all()
    return transaction


# ------------------------------------------------------------------ recipes --
#
# A recipe is a crafting definition: a list of ingredients (products + amount
# consumed) and a single output (product + amount produced). Crafting it
# (craft_recipe) draws the ingredients from stock and adds the output to
# stock in one atomic step — it does not touch balance or transactions,
# since crafting isn't a sale.

def _resolve_recipe_items(db, items, field_error):
    if not items:
        raise LogicError(field_error)
    resolved = []
    for item in items:
        product = find_product(db, item.get("productId"))
        try:
            quantity = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            raise LogicError(f"Quantité invalide pour {product['name']}.")
        if quantity <= 0:
            raise LogicError(f"La quantité pour {product['name']} doit être supérieure à zéro.")
        resolved.append({"productId": product["id"], "quantity": quantity})
    return resolved


def _resolve_recipe_output(db, output):
    if not output or not output.get("productId"):
        raise LogicError("Un produit fabriqué est requis.")
    return _resolve_recipe_items(db, [output], "Un produit fabriqué est requis.")[0]


def create_recipe(db, payload, acting_user):
    ingredients = _resolve_recipe_items(db, payload.get("ingredients") or [], "Au moins un ingrédient est requis.")
    output = _resolve_recipe_output(db, payload.get("output"))

    recipe = {"id": new_id(), "ingredients": ingredients, "output": output}
    db.recipes.append(recipe)
    output_product = find_product(db, output["productId"])
    log_action(db, acting_user, "create_recipe", f"Création de la recette « {output_product['name']} ».")
    db.save_one("recipes")
    return recipe


def update_recipe(db, payload, acting_user):
    recipe = find_recipe(db, payload.get("id"))
    if payload.get("ingredients") is not None:
        recipe["ingredients"] = _resolve_recipe_items(db, payload["ingredients"], "Au moins un ingrédient est requis.")
    if payload.get("output") is not None:
        recipe["output"] = _resolve_recipe_output(db, payload["output"])
    output_product = find_product(db, recipe["output"]["productId"])
    log_action(db, acting_user, "update_recipe", f"Modification de la recette « {output_product['name']} ».")
    db.save_one("recipes")
    return recipe


def delete_recipe(db, payload, acting_user):
    recipe = find_recipe(db, payload.get("id"))
    output_product = find_product(db, recipe["output"]["productId"])
    db.recipes.remove(recipe)
    log_action(db, acting_user, "delete_recipe", f"Suppression de la recette « {output_product['name']} ».")
    db.save_one("recipes")
    return {"id": recipe["id"]}


def craft_recipe(db, payload, acting_user):
    recipe = find_recipe(db, payload.get("id"))

    for ingredient in recipe["ingredients"]:
        product = find_product(db, ingredient["productId"])
        if ingredient["quantity"] > product["quantity"]:
            raise LogicError(
                f"Stock insuffisant pour {product['name']} : {product['quantity']} en stock, "
                f"{ingredient['quantity']} requis pour cette recette."
            )

    for ingredient in recipe["ingredients"]:
        find_product(db, ingredient["productId"])["quantity"] -= ingredient["quantity"]

    output_product = find_product(db, recipe["output"]["productId"])
    output_product["quantity"] += recipe["output"]["quantity"]

    log_action(
        db, acting_user, "craft_recipe",
        f"Fabrication de la recette « {output_product['name']} » : +{recipe['output']['quantity']} en stock."
    )
    db.save_one("products")
    return {"recipeId": recipe["id"], "products": db.products}


# --------------------------------------------------------------------- chat --
#
# A single shop-wide chat room, shared by everyone logged in. Not audit-logged
# (log_action is for business actions, not casual chatter) and not part of
# db.snapshot() or BACKUP_COLLECTIONS — like db.logs, it's delivered on demand
# (list_chat_messages) and pushed live (server.py broadcasts a "chat_message"
# event on send instead of a full snapshot resync).

CHAT_MESSAGE_MAX_LENGTH = 2000
CHAT_HISTORY_LIMIT = 200


def list_chat_messages(db):
    return db.chatMessages[-CHAT_HISTORY_LIMIT:]


def send_chat_message(db, payload, acting_user):
    text = (payload.get("text") or "").strip()
    if not text:
        raise LogicError("Le message ne peut pas être vide.")
    if len(text) > CHAT_MESSAGE_MAX_LENGTH:
        raise LogicError("Le message est trop long.")

    message = {
        "id": new_id(),
        "userId": acting_user["id"],
        "userName": acting_user["name"],
        "text": text,
        "timestamp": now_iso(),
    }
    db.chatMessages.append(message)
    db.save_one("chatMessages")
    return message


# ------------------------------------------------------------------ backups --

def list_backups(db):
    return dbmod.list_backups()


def create_backup(db, kind, acting_user):
    collections = {name: getattr(db, name) for name in dbmod.BACKUP_COLLECTIONS}
    meta = dbmod.create_backup(collections, kind)
    kind_label = "manuelle" if kind == "manual" else "automatique"
    log_action(db, acting_user, "create_backup", f"Sauvegarde {kind_label} créée ({meta['id']}).")
    return meta


def restore_backup(db, payload, acting_user):
    backup_id = payload.get("id")
    data = dbmod.read_backup(backup_id)
    if data is None:
        raise LogicError("Sauvegarde introuvable.")
    for name in dbmod.BACKUP_COLLECTIONS:
        setattr(db, name, data.get(name, dbmod.default_collection(name)))
    db.shop = dbmod.normalize_shop(db.shop)
    db.employees = dbmod.normalize_employees(db.employees)
    db.save_all()
    log_action(db, acting_user, "restore_backup", f"Restauration depuis la sauvegarde {backup_id}.")
    return {"snapshot": db.snapshot()}


def delete_backup(db, payload, acting_user):
    backup_id = payload.get("id")
    if not dbmod.delete_backup(backup_id):
        raise LogicError("Sauvegarde introuvable.")
    log_action(db, acting_user, "delete_backup", f"Suppression de la sauvegarde {backup_id}.")
    return {"id": backup_id}


def get_backup_settings(db):
    return db.settings


def update_backup_settings(db, payload, acting_user):
    try:
        hours = int(payload.get("autoBackupHours", 0))
    except (TypeError, ValueError):
        raise LogicError("L'intervalle doit être un nombre entier d'heures.")
    if hours < 0:
        raise LogicError("L'intervalle ne peut pas être négatif.")
    db.settings["autoBackupHours"] = hours
    db.save_one("settings")
    log_action(
        db, acting_user, "update_backup_settings",
        f"Sauvegarde automatique : {hours} heure(s)." if hours else "Sauvegarde automatique désactivée."
    )
    return db.settings
