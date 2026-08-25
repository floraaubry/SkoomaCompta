/* render.js — renders lists/header from the current state snapshot. */

function renderAll() {
  renderHeader();
  renderHome();
  renderClients();
  renderEmployees();
  renderTransactions();
  renderContracts();
  renderStock();
  renderRecettes();
}

function renderHeader() {
  document.getElementById('main-shop-name').textContent = state.snapshot.shop.shopName || 'Boutique';
  document.getElementById('balance-amount').textContent = fmtGold(state.snapshot.shop.balance);
  document.getElementById('current-user-name').textContent = state.user ? state.user.name : '';
  const isAdmin = !!(state.user && state.user.isAdmin);
  document.getElementById('btn-manage-users').classList.toggle('hidden', !isAdmin);
  document.getElementById('btn-backup').classList.toggle('hidden', !isAdmin);
  document.getElementById('btn-payroll-settings').classList.toggle('hidden', !isAdmin);
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
  pay_taxes: 'Paiement des impôts',
  create_product: 'Création de produit',
  update_product: 'Modification de produit',
  delete_product: 'Suppression de produit',
  create_transaction: 'Création de transaction',
  delete_transaction: 'Suppression de transaction',
  create_contract: 'Création de contrat',
  update_contract: 'Modification de contrat',
  delete_contract: 'Suppression de contrat',
  checkout_contract: 'Encaissement de contrat',
  create_recipe: 'Création de recette',
  update_recipe: 'Modification de recette',
  delete_recipe: 'Suppression de recette',
  craft_recipe: 'Fabrication de recette',
  create_backup: 'Sauvegarde créée',
  restore_backup: 'Restauration d’une sauvegarde',
  delete_backup: 'Suppression d’une sauvegarde',
  update_backup_settings: 'Modification des paramètres de sauvegarde',
  update_payroll_settings: 'Modification de la répartition des ventes',
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
      <span class="log-time">${escapeHtml(formatServerDateTime(entry.timestamp))}</span>
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
  const isAdmin = !!(state.user && state.user.isAdmin);
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucun employé pour le moment.</p>';
    return;
  }
  const shopBalance = state.snapshot.shop.balance;
  items.forEach((emp) => {
    const row = document.createElement('div');
    row.className = 'card';
    const canPay = emp.balance > 0 && emp.balance <= shopBalance;
    const payTitle = emp.balance > 0 && emp.balance > shopBalance ? ' title="Fonds insuffisants dans la caisse"' : '';
    row.innerHTML = `
      <div class="card-main">
        <div class="card-title">${escapeHtml(emp.name)}</div>
        <div class="card-sub">Solde à venir : ${fmtGold(emp.balance)} septims</div>
        ${emp.note ? `<div class="card-note">${escapeHtml(emp.note)}</div>` : ''}
      </div>
      <div class="card-actions">
        ${isAdmin ? `<button class="btn btn-small btn-accent" data-action="pay-employee" data-id="${emp.id}"${canPay ? '' : ' disabled'}${payTitle}>Payer</button>` : ''}
        <button class="btn btn-small" data-action="edit-employee" data-id="${emp.id}">Modifier</button>
        <button class="btn btn-small btn-danger" data-action="delete-employee" data-id="${emp.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
}

/* ----------------------------------------------------------------- home --*/
//
// Accueil's personal section shows whoever is logged in — admin or not —
// only their OWN linked employee's recap, never anyone else's. It's built
// on the fly from transactions' stored payroll breakdown (vendor share +
// pot commun shares credited to that employee) — never a stored counter,
// since nothing would reset it when a month rolls over. "Balance to come" is
// the actual employee.balance running total, separate from the chart.
//
// For a non-admin, the month-over-month ranking is computed from the full
// employee/transaction list already present in state.snapshot (every
// connected client receives the full synced snapshot regardless of role) —
// only the numeric rank is ever shown, never other employees' names or
// amounts.
//
// Admins additionally get a recap of every employee (name, last week,
// current month, balance to come) so the general view doubles as an
// at-a-glance dashboard — see renderEmployeesRecap below.

const MONTH_HISTORY_COUNT = 6;
const MONTH_LABELS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function parseTxDate(str) {
  return parseServerDate(str) || new Date(NaN);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function monthLabel(d) {
  return MONTH_LABELS[d.getMonth()];
}

function recentMonthBuckets(count) {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(currentStart.getFullYear(), currentStart.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    buckets.push({ start, end });
  }
  return buckets;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

function lastWeekRange() {
  const currentWeekStart = startOfWeek(new Date());
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() - 7);
  return { start, end: currentWeekStart };
}

function currentWeekRange() {
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function employeeEarningsBetween(employeeId, start, end) {
  let total = 0;
  state.snapshot.transactions.forEach((t) => {
    const payroll = t.payroll;
    if (!payroll) return;
    const d = parseTxDate(t.date);
    if (d < start || d >= end) return;
    if (payroll.vendorEmployeeId === employeeId) total += payroll.vendorAmount;
    (payroll.potCommunShares || []).forEach((s) => {
      if (s.employeeId === employeeId) total += s.amount;
    });
  });
  return round2(total);
}

function employeeMonthlySeries(employeeId, buckets) {
  return buckets.map(({ start, end }) => employeeEarningsBetween(employeeId, start, end));
}

function frenchOrdinal(n) {
  return n === 1 ? '1er' : `${n}e`;
}

// Ranks every employee by earnings over [start, end) and returns only the
// current employee's position — the other employees' totals never leave
// this function, so nothing about them is rendered.
function rankForPeriod(employeeId, start, end) {
  const totals = state.snapshot.employees.map((e) => employeeEarningsBetween(e.id, start, end));
  const mine = employeeEarningsBetween(employeeId, start, end);
  const ahead = totals.filter((t) => t > mine).length;
  return { rank: ahead + 1, of: totals.length };
}

// 4px rounded top corners, square baseline (per the bar mark spec) — SVG has
// no per-corner border-radius, so the shape is drawn as an explicit path.
function roundedBarPath(x, width, yTop, yBottom) {
  const r = Math.max(0, Math.min(4, width / 2, yBottom - yTop));
  if (r < 0.5) {
    return `M${x},${yBottom} L${x},${yTop} L${x + width},${yTop} L${x + width},${yBottom} Z`;
  }
  return (
    `M${x},${yBottom} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} ` +
    `L${x + width - r},${yTop} Q${x + width},${yTop} ${x + width},${yTop + r} ` +
    `L${x + width},${yBottom} Z`
  );
}

const HOME_CHART_BAND = 84;
const HOME_CHART_BAR_WIDTH = 24;
const HOME_CHART_H = 110;

function monthlyBarChartSvg(values, buckets) {
  const barCount = values.length;
  const chartW = barCount * HOME_CHART_BAND;
  const totalH = HOME_CHART_H + 40;
  const maxValue = Math.max(1, ...values);

  let bars = '';
  let valueLabel = '';
  values.forEach((v, i) => {
    const isCurrent = i === barCount - 1;
    const x = i * HOME_CHART_BAND + (HOME_CHART_BAND - HOME_CHART_BAR_WIDTH) / 2;
    const h = v > 0 ? Math.max(3, (v / maxValue) * (HOME_CHART_H - 24)) : 0;
    const yTop = HOME_CHART_H - h;
    const fill = isCurrent ? 'var(--color-gold-bright)' : 'rgba(201, 162, 39, 0.32)';
    const path = h > 0 ? `<path d="${roundedBarPath(x, HOME_CHART_BAR_WIDTH, yTop, HOME_CHART_H)}" fill="${fill}"></path>` : '';
    const label = escapeHtml(monthLabel(buckets[i].start));
    bars += `
      <g class="home-chart-bar" tabindex="0" data-month="${label}" data-value="${v}">
        <title>${label} : ${fmtGold(v)} septims</title>
        <rect x="${x}" y="0" width="${HOME_CHART_BAR_WIDTH}" height="${HOME_CHART_H}" fill="transparent"></rect>
        ${path}
      </g>`;
    if (isCurrent && v > 0) {
      valueLabel = `<text x="${x + HOME_CHART_BAR_WIDTH / 2}" y="${Math.max(14, yTop - 8)}" text-anchor="middle" class="home-chart-value">${fmtGold(v)}</text>`;
    }
  });

  const monthLabels = buckets
    .map((b, i) => {
      const x = i * HOME_CHART_BAND + HOME_CHART_BAND / 2;
      return `<text x="${x}" y="${HOME_CHART_H + 20}" text-anchor="middle" class="home-chart-week">${escapeHtml(monthLabel(b.start))}</text>`;
    })
    .join('');

  return `
    <svg class="home-chart" width="${chartW}" height="${totalH}" viewBox="0 0 ${chartW} ${totalH}" role="img" aria-label="Gains des ${barCount} derniers mois">
      <line x1="0" y1="${HOME_CHART_H}" x2="${chartW}" y2="${HOME_CHART_H}" class="home-chart-baseline"></line>
      ${bars}
      ${valueLabel}
      ${monthLabels}
    </svg>`;
}

let homeChartTooltipEl = null;

function homeChartTooltip() {
  if (!homeChartTooltipEl) {
    homeChartTooltipEl = document.createElement('div');
    homeChartTooltipEl.className = 'home-chart-tooltip hidden';
    document.body.appendChild(homeChartTooltipEl);
  }
  return homeChartTooltipEl;
}

function showHomeChartTooltip(clientX, clientY, month, value) {
  const tip = homeChartTooltip();
  tip.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = `${fmtGold(value)} septims`;
  const span = document.createElement('span');
  span.textContent = month;
  tip.appendChild(strong);
  tip.appendChild(span);
  tip.style.left = `${clientX + 14}px`;
  tip.style.top = `${clientY + 14}px`;
  tip.classList.remove('hidden');
}

function hideHomeChartTooltip() {
  if (homeChartTooltipEl) homeChartTooltipEl.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('list-home');
  if (!container) return;
  container.addEventListener('mouseover', (e) => {
    const bar = e.target.closest('.home-chart-bar');
    if (bar) showHomeChartTooltip(e.clientX, e.clientY, bar.dataset.month, Number(bar.dataset.value));
  });
  container.addEventListener('mousemove', (e) => {
    const bar = e.target.closest('.home-chart-bar');
    if (bar) showHomeChartTooltip(e.clientX, e.clientY, bar.dataset.month, Number(bar.dataset.value));
  });
  container.addEventListener('mouseout', (e) => {
    if (e.target.closest('.home-chart-bar')) hideHomeChartTooltip();
  });
  container.addEventListener('focusin', (e) => {
    const bar = e.target.closest('.home-chart-bar');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    showHomeChartTooltip(rect.left, rect.bottom, bar.dataset.month, Number(bar.dataset.value));
  });
  container.addEventListener('focusout', (e) => {
    if (e.target.closest('.home-chart-bar')) hideHomeChartTooltip();
  });
});

function renderTaxesSection() {
  const shop = state.snapshot.shop;
  const owed = shop.taxesOwed || 0;
  const since = shop.taxesSince;
  const history = (shop.taxHistory || []).slice().reverse();

  const section = document.createElement('div');
  section.className = 'home-admin-recap';

  const historyRows = history.length
    ? history
        .map(
          (h) => `
        <div class="card">
          <div class="card-main">
            <div class="card-title">Semaine du ${escapeHtml(h.periodStart)} au ${escapeHtml(h.periodEnd)}</div>
          </div>
          <div class="card-actions">
            <div class="stat-value">${fmtGold(h.amount)} septims</div>
          </div>
        </div>`
        )
        .join('')
    : '<p class="empty-hint">Aucun paiement d’impôts enregistré pour le moment.</p>';

  section.innerHTML = `
    <h3>Impôts</h3>
    <div class="card">
      <div class="card-main">
        <div class="card-title">Montant dû</div>
        ${since ? `<div class="card-sub">Depuis le ${escapeHtml(since)}</div>` : ''}
      </div>
      <div class="card-actions">
        <div class="stat-value accent">${fmtGold(owed)} septims</div>
        <button class="btn btn-small btn-accent" data-action="pay-taxes"${owed > 0 ? '' : ' disabled'}>Payer</button>
      </div>
    </div>
    <h3 class="home-taxes-history-title">Historique des semaines</h3>
    <div class="list">${historyRows}</div>`;
  return section;
}

function renderEmployeesRecap() {
  const section = document.createElement('div');
  section.className = 'home-admin-recap';

  const employees = state.snapshot.employees;
  const lastWeek = lastWeekRange();

  const rows = employees
    .map((e) => {
      const lastWeekTotal = employeeEarningsBetween(e.id, lastWeek.start, lastWeek.end);
      return `
        <div class="card">
          <div class="card-main">
            <div class="card-title">${escapeHtml(e.name)}</div>
            <div class="card-sub">Semaine dernière : ${fmtGold(lastWeekTotal)} septims</div>
          </div>
          <div class="card-actions">
            <div class="stat-value accent">${fmtGold(e.balance)} septims</div>
          </div>
        </div>`;
    })
    .join('');

  section.innerHTML = `
    <h3>Récapitulatif des employés de la semaine</h3>
    ${employees.length ? `<div class="list">${rows}</div>` : '<p class="empty-hint">Aucun employé pour le moment.</p>'}`;
  return section;
}

function renderHome() {
  const container = document.getElementById('list-home');
  if (!container) return;
  container.innerHTML = '';

  const isAdmin = !!(state.user && state.user.isAdmin);
  const myEmployeeId = state.user && state.user.employeeId;
  const emp = myEmployeeId ? findById(state.snapshot.employees, myEmployeeId) : null;
  if (!emp && !isAdmin) {
    container.innerHTML = '<p class="empty-hint">Aucun employé associé à votre compte.</p>';
    return;
  }
  if (!emp) {
    container.appendChild(renderTaxesSection());
    container.appendChild(renderEmployeesRecap());
    return;
  }

  const buckets = recentMonthBuckets(MONTH_HISTORY_COUNT);
  const series = employeeMonthlySeries(emp.id, buckets);
  const currentWeek = currentWeekRange();
  const ranking = rankForPeriod(emp.id, currentWeek.start, currentWeek.end);
  const lastWeek = lastWeekRange();
  const lastWeekTotal = employeeEarningsBetween(emp.id, lastWeek.start, lastWeek.end);
  const lastPay = (emp.payHistory || [])[emp.payHistory.length - 1];

  const profile = document.createElement('div');
  profile.className = 'home-profile';
  profile.innerHTML = `
    <div class="home-profile-header">
      <div>
        <h2 class="home-profile-name">${escapeHtml(emp.name)}</h2>
        ${emp.note ? `<div class="home-profile-sub">${escapeHtml(emp.note)}</div>` : ''}
      </div>
    </div>

    <div class="home-stats-row">
      <div class="stat-tile">
        <div class="stat-label">Semaine dernière</div>
        <div class="stat-value">${fmtGold(lastWeekTotal)} septims</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Solde à venir</div>
        <div class="stat-value accent">${fmtGold(emp.balance)} septims</div>
      </div>
      ${ranking.of > 1 ? `
      <div class="stat-tile">
        <div class="stat-label">Classement cette semaine</div>
        <div class="stat-value">${frenchOrdinal(ranking.rank)} <span class="stat-value-of">/ ${ranking.of}</span></div>
      </div>` : ''}
    </div>

    <div class="home-chart-section">
      <h3>Historique mensuel</h3>
      <div class="home-panel-chart">${monthlyBarChartSvg(series, buckets)}</div>
    </div>

    ${lastPay ? `<p class="home-last-pay">Dernier paiement : ${fmtGold(lastPay.amount)} septims le ${escapeHtml(lastPay.periodEnd)}</p>` : ''}`;
  container.appendChild(profile);

  if (isAdmin) {
    container.appendChild(renderTaxesSection());
    container.appendChild(renderEmployeesRecap());
  }
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

function filteredTransactions() {
  const q = (document.getElementById('transactions-search').value || '').trim().toLowerCase();
  return state.snapshot.transactions
    .filter((t) => t.name.toLowerCase().includes(q))
    .filter((t) => transactionFilterClient === FILTER_ALL || t.clientId === transactionFilterClient)
    .filter((t) => transactionFilterEmployee === FILTER_ALL || t.employeeId === transactionFilterEmployee)
    .filter((t) => transactionFilterDirection === FILTER_ALL || t.direction === transactionFilterDirection)
    .slice()
    .reverse();
}

function renderTransactions() {
  const container = document.getElementById('list-transactions');
  mountTransactionFilters();
  const items = filteredTransactions();
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
        <div class="card-sub">${escapeHtml(formatServerDateTime(t.date))}</div>
      </div>
      <div class="transaction-amount ${t.direction}">${t.direction === 'in' ? '+' : '−'}${fmtGold(t.amount)} septims</div>
      <div class="card-actions">
        <button class="btn btn-small btn-danger" data-action="delete-transaction" data-id="${t.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
}

// -------------------------------------------------------- CSV export --
//
// Exports whatever the transaction list currently shows (search + client/
// employee/direction filters all apply) as a semicolon-separated CSV —
// semicolons, not commas, because French Excel/Sheets locales treat comma
// as the decimal separator and would otherwise misread the columns.
// Numbers use a comma decimal point for the same reason. The impôt columns
// come straight from each transaction's stored payroll breakdown (see
// _compute_payroll_split in logic.py) so the exported figures always match
// what was actually booked, not a value recomputed after settings changed.

function csvField(value) {
  const str = value == null ? '' : String(value);
  if (/[";\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvNum(n) {
  return round2(n).toFixed(2).replace('.', ',');
}

function transactionContentSummary(content) {
  return (content || [])
    .map((c) => ('productName' in c ? `${c.productName} x${c.quantity}` : `${c.label} ${c.amount}`))
    .join(', ');
}

function taxBaseLabel() {
  return state.snapshot.shop.taxBase === 'margin' ? 'Marge' : "Chiffre d'affaires";
}

function exportTransactionsCSV() {
  const items = filteredTransactions();
  const header = [
    'Date', 'Sens', 'Client', 'Détail', 'Montant', 'Impôt', 'Base impôt',
    'Montant après impôt', 'Employé (vendeur)', 'Part vendeur', 'Pot commun', 'Entreprise',
  ];
  const rows = [header];
  items.forEach((t) => {
    const payroll = t.payroll;
    const vendorEmployee = payroll && payroll.vendorEmployeeId
      ? findById(state.snapshot.employees, payroll.vendorEmployeeId)
      : null;
    rows.push([
      formatServerDateTime(t.date),
      t.direction === 'in' ? 'Entrée' : 'Sortie',
      t.name,
      transactionContentSummary(t.content),
      csvNum(t.amount),
      payroll ? csvNum(payroll.taxAmount) : '',
      payroll ? taxBaseLabel() : '',
      payroll ? csvNum(payroll.afterTaxAmount) : '',
      vendorEmployee ? vendorEmployee.name : '',
      payroll ? csvNum(payroll.vendorAmount) : '',
      payroll ? csvNum(payroll.potCommunTotal) : '',
      payroll ? csvNum(payroll.entrepriseAmount) : '',
    ]);
  });

  const csv = rows.map((row) => row.map(csvField).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `transactions-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

let contractSubTab = 'in';

function renderContracts() {
  const q = (document.getElementById('contracts-search').value || '').trim().toLowerCase();
  const container = document.getElementById('list-contracts');
  const items = state.snapshot.contracts.filter((c) => {
    if (c.type !== contractSubTab) return false;
    if (!q) return true;
    const client = findById(state.snapshot.clients, c.clientId);
    return !!client && client.name.toLowerCase().includes(q);
  });
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucun contrat pour le moment.</p>';
    return;
  }
  items.forEach((c) => {
    const client = findById(state.snapshot.clients, c.clientId);
    const itemsSummary = c.items
      .map((it) => {
        const product = findById(state.snapshot.products, it.productId);
        return `${product ? product.name : '?'} x${it.quantity}`;
      })
      .join(', ');
    const discountInfo = c.discountPercent ? ` &middot; Remise ${c.discountPercent}%` : '';
    const row = document.createElement('div');
    row.className = 'card contract-card';
    row.innerHTML = `
      <div class="card-main">
        <div class="card-title">${escapeHtml(client ? client.name : 'Client inconnu')}</div>
        <div class="card-sub">${escapeHtml(itemsSummary)}${discountInfo}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-small btn-primary" data-action="checkout-contract" data-id="${c.id}">${c.type === 'in' ? 'Payer' : 'Encaisser'}</button>
        <button class="btn btn-small" data-action="edit-contract" data-id="${c.id}">Modifier</button>
        <button class="btn btn-small btn-danger" data-action="delete-contract" data-id="${c.id}">Supprimer</button>
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
    main.innerHTML = `<div class="card-title">${escapeHtml(p.name)}</div><div class="card-sub">${fmtGold(p.sellPrice)} septims l'unité · Achat : ${fmtGold(p.purchasePrice)} septims</div>`;

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

function recipeItemsSummary(items) {
  return items
    .map((it) => {
      const product = findById(state.snapshot.products, it.productId);
      return `${product ? product.name : '?'} x${it.quantity}`;
    })
    .join(', ');
}

function renderRecettes() {
  const q = (document.getElementById('recettes-search').value || '').trim().toLowerCase();
  const container = document.getElementById('list-recettes');
  const items = state.snapshot.recipes.filter((r) => {
    const outputProduct = findById(state.snapshot.products, r.output.productId);
    return !!outputProduct && outputProduct.name.toLowerCase().includes(q);
  });
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucune recette pour le moment.</p>';
    return;
  }
  items.forEach((r) => {
    const outputProduct = findById(state.snapshot.products, r.output.productId);
    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="card-main">
        <div class="card-title">${escapeHtml(outputProduct ? outputProduct.name : '?')} <span class="card-sub">x${r.output.quantity}</span></div>
        <div class="card-sub">Ingrédients : ${escapeHtml(recipeItemsSummary(r.ingredients))}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-small btn-accent" data-action="craft-recipe" data-id="${r.id}">Fabriquer</button>
        <button class="btn btn-small" data-action="edit-recipe" data-id="${r.id}">Modifier</button>
        <button class="btn btn-small btn-danger" data-action="delete-recipe" data-id="${r.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
}
