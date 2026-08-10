/* render.js — renders lists/header from the current state snapshot. */

function renderAll() {
  renderHeader();
  renderClients();
  renderEmployees();
  renderTransactions();
  renderStock();
}

function renderHeader() {
  document.getElementById('main-shop-name').textContent = state.snapshot.shop.shopName || 'Boutique';
  document.getElementById('balance-amount').textContent = fmtGold(state.snapshot.shop.balance);
  document.getElementById('current-user-name').textContent = state.user ? state.user.name : '';
  const isAdmin = !!(state.user && state.user.isAdmin);
  document.getElementById('btn-manage-users').classList.toggle('hidden', !isAdmin);
  document.getElementById('btn-backup').classList.toggle('hidden', !isAdmin);
  document.getElementById('tab-btn-log').classList.toggle('hidden', !isAdmin);
}

const FILTER_ALL = '__all__';

function fillSelect(select, items, currentValue) {
  select.innerHTML = items
    .map((it) => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.name)}</option>`)
    .join('');
  select.value = currentValue;
}

const LOG_ACTION_LABELS = {
  setup_admin: 'Configuration initiale',
  create_user: 'Création d’utilisateur',
  update_user: 'Modification d’utilisateur',
  delete_user: 'Suppression d’utilisateur',
  create_client: 'Création de client',
  update_client: 'Modification de client',
  delete_client: 'Suppression de client',
  create_employee: 'Création d’employé',
  update_employee: 'Modification d’employé',
  delete_employee: 'Suppression d’employé',
  pay_employee: 'Paiement d’employé',
  create_product: 'Création de produit',
  update_product: 'Modification de produit',
  delete_product: 'Suppression de produit',
  create_transaction: 'Création de transaction',
  delete_transaction: 'Suppression de transaction',
  create_backup: 'Sauvegarde créée',
  restore_backup: 'Restauration d’une sauvegarde',
  delete_backup: 'Suppression d’une sauvegarde',
  update_backup_settings: 'Modification des paramètres de sauvegarde',
};

function logActionLabel(action) {
  return LOG_ACTION_LABELS[action] || action;
}

let logEntriesCache = [];
let logFilterUserId = FILTER_ALL;
let logFilterAction = FILTER_ALL;

async function renderLog() {
  if (!(state.user && state.user.isAdmin)) return;
  let entries;
  try {
    entries = await ke.request('list_logs');
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  logEntriesCache = entries;
  mountLogFilters(entries);
  renderLogList();
}

function mountLogFilters(entries) {
  const users = [{ id: FILTER_ALL, name: 'Tous les utilisateurs' }];
  const seenUsers = new Set();
  entries.forEach((e) => {
    const id = e.userId || '';
    if (!seenUsers.has(id)) {
      seenUsers.add(id);
      users.push({ id, name: e.userName });
    }
  });

  const actions = [{ id: FILTER_ALL, name: 'Toutes les actions' }];
  const seenActions = new Set();
  entries.forEach((e) => {
    if (!seenActions.has(e.action)) {
      seenActions.add(e.action);
      actions.push({ id: e.action, name: logActionLabel(e.action) });
    }
  });

  const userSelect = document.getElementById('log-filter-user');
  fillSelect(userSelect, users, logFilterUserId);
  userSelect.onchange = () => {
    logFilterUserId = userSelect.value;
    renderLogList();
  };

  const actionSelect = document.getElementById('log-filter-action');
  fillSelect(actionSelect, actions, logFilterAction);
  actionSelect.onchange = () => {
    logFilterAction = actionSelect.value;
    renderLogList();
  };
}

function renderLogList() {
  const container = document.getElementById('log-list');
  const filtered = logEntriesCache.filter((e) => {
    if (logFilterUserId !== FILTER_ALL && e.userId !== logFilterUserId) return false;
    if (logFilterAction !== FILTER_ALL && e.action !== logFilterAction) return false;
    return true;
  });
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucune activité ne correspond à ces filtres.</p>';
    return;
  }
  filtered.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <span class="log-time">${escapeHtml(entry.timestamp)}</span>
      <span class="log-user">${escapeHtml(entry.userName)}</span>
      <span class="log-message">${escapeHtml(entry.message)}</span>`;
    container.appendChild(row);
  });
}

function renderClients() {
  const q = (document.getElementById('clients-search').value || '').trim().toLowerCase();
  const container = document.getElementById('list-clients');
  const items = state.snapshot.clients.filter((c) => c.name.toLowerCase().includes(q));
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucun client pour le moment.</p>';
    return;
  }
  items.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="card-main">
        <div class="card-title">${escapeHtml(c.name)}</div>
        <div class="card-sub">Total gagné : ${fmtGold(c.totalEarned)} septims</div>
        ${c.note ? `<div class="card-note">${escapeHtml(c.note)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn btn-small" data-action="edit-client" data-id="${c.id}">Modifier</button>
        <button class="btn btn-small btn-danger" data-action="delete-client" data-id="${c.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
}

function renderEmployees() {
  const q = (document.getElementById('employees-search').value || '').trim().toLowerCase();
  const container = document.getElementById('list-employees');
  const items = state.snapshot.employees.filter((e) => e.name.toLowerCase().includes(q));
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucun employé pour le moment.</p>';
    return;
  }
  items.forEach((emp) => {
    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="card-main">
        <div class="card-title">${escapeHtml(emp.name)}</div>
        <div class="card-sub">Salaire : ${fmtGold(emp.salary)} septims &middot; Vendu cette période : ${fmtGold(emp.amountSold)} septims</div>
        ${emp.note ? `<div class="card-note">${escapeHtml(emp.note)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn btn-small btn-accent" data-action="pay-employee" data-id="${emp.id}">Payer</button>
        <button class="btn btn-small" data-action="edit-employee" data-id="${emp.id}">Modifier</button>
        <button class="btn btn-small btn-danger" data-action="delete-employee" data-id="${emp.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
}

let transactionFilterClient = FILTER_ALL;
let transactionFilterEmployee = FILTER_ALL;
let transactionFilterDirection = FILTER_ALL;

function mountTransactionFilters() {
  const clients = [{ id: FILTER_ALL, name: 'Tous les clients' }];
  const seenClients = new Set();
  state.snapshot.transactions.forEach((t) => {
    if (t.clientId && !seenClients.has(t.clientId)) {
      seenClients.add(t.clientId);
      const client = findById(state.snapshot.clients, t.clientId);
      clients.push({ id: t.clientId, name: client ? client.name : t.name });
    }
  });

  const employees = [{ id: FILTER_ALL, name: 'Tous les employés' }];
  const seenEmployees = new Set();
  state.snapshot.transactions.forEach((t) => {
    if (t.employeeId && !seenEmployees.has(t.employeeId)) {
      seenEmployees.add(t.employeeId);
      const employee = findById(state.snapshot.employees, t.employeeId);
      if (employee) employees.push({ id: t.employeeId, name: employee.name });
    }
  });

  const directions = [
    { id: FILTER_ALL, name: 'Tous les sens' },
    { id: 'in', name: 'Entrée' },
    { id: 'out', name: 'Sortie' },
  ];

  const clientSelect = document.getElementById('transactions-filter-client');
  fillSelect(clientSelect, clients, transactionFilterClient);
  clientSelect.onchange = () => {
    transactionFilterClient = clientSelect.value;
    renderTransactions();
  };

  const employeeSelect = document.getElementById('transactions-filter-employee');
  fillSelect(employeeSelect, employees, transactionFilterEmployee);
  employeeSelect.onchange = () => {
    transactionFilterEmployee = employeeSelect.value;
    renderTransactions();
  };

  const directionSelect = document.getElementById('transactions-filter-direction');
  fillSelect(directionSelect, directions, transactionFilterDirection);
  directionSelect.onchange = () => {
    transactionFilterDirection = directionSelect.value;
    renderTransactions();
  };
}

function renderTransactions() {
  const q = (document.getElementById('transactions-search').value || '').trim().toLowerCase();
  const container = document.getElementById('list-transactions');
  mountTransactionFilters();
  const items = state.snapshot.transactions
    .filter((t) => t.name.toLowerCase().includes(q))
    .filter((t) => transactionFilterClient === FILTER_ALL || t.clientId === transactionFilterClient)
    .filter((t) => transactionFilterEmployee === FILTER_ALL || t.employeeId === transactionFilterEmployee)
    .filter((t) => transactionFilterDirection === FILTER_ALL || t.direction === transactionFilterDirection)
    .slice()
    .reverse();
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucune transaction pour le moment.</p>';
    return;
  }
  items.forEach((t) => {
    const row = document.createElement('div');
    row.className = `card transaction-card transaction-${t.direction}`;
    row.dataset.id = t.id;
    row.innerHTML = `
      <div class="card-main">
        <div class="card-title">${t.direction === 'in' ? '&#8593;' : '&#8595;'} ${escapeHtml(t.name)}</div>
        <div class="card-sub">${escapeHtml(t.date)}</div>
      </div>
      <div class="transaction-amount ${t.direction}">${t.direction === 'in' ? '+' : '−'}${fmtGold(t.amount)} septims</div>
      <div class="card-actions">
        <button class="btn btn-small btn-danger" data-action="delete-transaction" data-id="${t.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
}

function renderStock() {
  const q = (document.getElementById('stock-search').value || '').trim().toLowerCase();
  const container = document.getElementById('list-stock');
  const items = state.snapshot.products.filter((p) => p.name.toLowerCase().includes(q));
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucun article pour le moment.</p>';
    return;
  }
  items.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'card';

    const main = document.createElement('div');
    main.className = 'card-main';
    main.innerHTML = `<div class="card-title">${escapeHtml(p.name)}</div><div class="card-sub">${fmtGold(p.sellPrice)} septims l'unité</div>`;

    const spinboxSlot = document.createElement('div');
    const spinbox = createSpinbox({
      min: 0,
      value: p.quantity,
      step: 1,
      onChange: (v) => {
        ke.request('update_product', { id: p.id, quantity: v }).catch((err) => toast(err.message, 'error'));
      },
    });
    spinboxSlot.appendChild(spinbox.root);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.innerHTML = `
      <button class="btn btn-small" data-action="edit-product" data-id="${p.id}">Modifier</button>
      <button class="btn btn-small btn-danger" data-action="delete-product" data-id="${p.id}">Supprimer</button>`;

    row.appendChild(main);
    row.appendChild(spinboxSlot);
    row.appendChild(actions);
    container.appendChild(row);
  });
}
