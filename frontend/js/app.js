/* app.js — bootstrap: connect flow, login/setup gating, tabs, list actions. */

const REMEMBER_KEY = 'ke_remember'; // { server, name, password } — only present when "remember me" is on
const AUTOCONNECT_KEY = 'ke_autoconnect'; // '1' — only present alongside REMEMBER_KEY

let sessionCreds = null; // { name, password } — memory only, used to silently re-auth on reconnect
let pendingLogin = null; // { name, password } for a freshly-submitted connect form, consumed by onHello
let pendingPersist = null; // { server, name, password, remember, autoConnect } to save after a successful fresh login
let reconnecting = false; // true between a dropped connection and the auto-reconnect login resolving
let connectionBannerTimer = null;

function showConnectionBanner(message, type, autoHideMs) {
  const el = document.getElementById('connection-banner');
  clearTimeout(connectionBannerTimer);
  el.textContent = message;
  el.className = `connection-banner show ${type}`;
  if (autoHideMs) {
    connectionBannerTimer = setTimeout(() => el.classList.remove('show'), autoHideMs);
  }
}

function hideConnectionBanner() {
  clearTimeout(connectionBannerTimer);
  document.getElementById('connection-banner').classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  wireConnectForm();
  wireSetupForm();
  wireTabs();
  wireContractSubtabs();
  wireSearchInputs();
  wireNewButtons();
  wireListActions();
  wireLogout();
  wireManageUsers();
  initChat();

  ke.on('hello', onHello);
  ke.on('sync', onSync);
  ke.on('close', onDisconnected);

  document.getElementById('btn-setup-change-server').addEventListener('click', goToConnectScreen);

  applyRememberedCreds();
});

function goToConnectScreen() {
  sessionCreds = null;
  pendingLogin = null;
  pendingPersist = null;
  state.user = null;
  reconnecting = false;
  ke.disconnect();
  resetChatState();
  hideConnectionBanner();
  showScreen('screen-connect');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
}

function currentScreenId() {
  const el = document.querySelector('.screen:not(.hidden)');
  return el ? el.id : null;
}

/* ------------------------------------------------------- remember me / auto-connect */

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function persistRememberPrefs(server, name, password, remember, autoConnect) {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ server, name, password }));
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
  if (remember && autoConnect) {
    localStorage.setItem(AUTOCONNECT_KEY, '1');
  } else {
    localStorage.removeItem(AUTOCONNECT_KEY);
  }
}

function applyRememberedCreds() {
  const remembered = loadRemembered();
  const autoConnectFlag = localStorage.getItem(AUTOCONNECT_KEY) === '1';
  if (remembered) {
    document.getElementById('input-server').value = remembered.server || '';
    document.getElementById('login-name').value = remembered.name || '';
    document.getElementById('login-password').value = remembered.password || '';
    document.getElementById('remember-me').checked = true;
  }
  if (remembered && autoConnectFlag) {
    document.getElementById('auto-connect').checked = true;
    attemptConnect(remembered.server, remembered.name, remembered.password, true, true);
  }
}

/* ------------------------------------------------------------- connection */

function wireConnectForm() {
  const form = document.getElementById('form-connect');
  const rememberCheckbox = document.getElementById('remember-me');
  const autoConnectCheckbox = document.getElementById('auto-connect');

  autoConnectCheckbox.addEventListener('change', () => {
    if (autoConnectCheckbox.checked) rememberCheckbox.checked = true;
  });
  rememberCheckbox.addEventListener('change', () => {
    if (!rememberCheckbox.checked) autoConnectCheckbox.checked = false;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attemptConnect(
      document.getElementById('input-server').value,
      document.getElementById('login-name').value,
      document.getElementById('login-password').value,
      rememberCheckbox.checked,
      autoConnectCheckbox.checked
    );
  });
}

async function attemptConnect(serverRaw, name, password, remember, autoConnect) {
  const statusEl = document.getElementById('connect-status');
  statusEl.classList.remove('error-text');
  try {
    const url = resolveServerUrl(serverRaw);
    statusEl.textContent = 'Connexion en cours...';
    pendingLogin = { name, password };
    pendingPersist = { server: (serverRaw || '').trim(), name, password, remember, autoConnect };
    await ke.connect(url);
    // onHello takes over from here (setup vs. login)
  } catch (err) {
    pendingLogin = null;
    pendingPersist = null;
    statusEl.textContent = err.message || 'Connexion impossible.';
    statusEl.classList.add('error-text');
  }
}

async function onHello(msg) {
  const statusEl = document.getElementById('connect-status');

  if (msg.setupRequired) {
    sessionCreds = null;
    pendingLogin = null;
    pendingPersist = null;
    statusEl.textContent = '';
    document.getElementById('setup-error').textContent = '';
    showScreen('screen-setup');
    return;
  }

  const creds = pendingLogin || sessionCreds;
  if (creds) {
    try {
      const data = await ke.request('login', creds);
      state.user = data.user;
      setSnapshot(data.snapshot);
      sessionCreds = creds;
      if (pendingPersist) {
        persistRememberPrefs(
          pendingPersist.server,
          pendingPersist.name,
          pendingPersist.password,
          pendingPersist.remember,
          pendingPersist.autoConnect
        );
      }
      pendingLogin = null;
      pendingPersist = null;
      statusEl.textContent = '';
      showScreen('screen-main');
      renderAll();
      restoreLastTab();
      if (reconnecting) {
        reconnecting = false;
        showConnectionBanner('Reconnecté.', 'success', 2000);
      }
      return;
    } catch (err) {
      pendingLogin = null;
      pendingPersist = null;
      sessionCreds = null;
      statusEl.textContent = err.message;
      statusEl.classList.add('error-text');
      if (reconnecting) {
        reconnecting = false;
        hideConnectionBanner();
      }
      return;
    }
  }

  statusEl.textContent = '';
}

function onSync(msg) {
  setSnapshot(msg.snapshot);
  if (currentScreenId() === 'screen-main') {
    renderAll();
    const activePane = document.querySelector('.tab-pane.active');
    if (activePane && activePane.id === 'tab-log') renderLog({ rebuildFilters: false });
  }
}

function onDisconnected() {
  if (currentScreenId() === 'screen-main') {
    reconnecting = true;
    showConnectionBanner('Connexion perdue. Reconnexion en cours...', 'error');
  }
}

/* ------------------------------------------------------------------ setup */

function wireSetupForm() {
  document.getElementById('form-setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('setup-error');
    errorEl.textContent = '';
    const payload = {
      shopName: document.getElementById('setup-shop-name').value,
      startingBalance: document.getElementById('setup-balance').value,
      name: document.getElementById('setup-admin-name').value,
      password: document.getElementById('setup-admin-password').value,
    };
    try {
      const data = await ke.request('setup_admin', payload);
      sessionCreds = { name: payload.name, password: payload.password };
      state.user = data.user;
      setSnapshot(data.snapshot);
      showScreen('screen-main');
      renderAll();
      restoreLastTab();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function wireLogout() {
  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionCreds = null;
    pendingLogin = null;
    pendingPersist = null;
    state.user = null;
    reconnecting = false;
    ke.disconnect();
    resetChatState();
    hideConnectionBanner();
    document.getElementById('connect-status').textContent = '';
    showScreen('screen-connect');
  });
}

/* -------------------------------------------------------------------- ui */

const LAST_TAB_KEY_PREFIX = 'ke_last_tab_';

function lastTabKey() {
  return LAST_TAB_KEY_PREFIX + (state.user ? state.user.name : '');
}

function activateTab(tabName) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const pane = document.getElementById('tab-' + tabName);
  if (!btn || !pane || btn.classList.contains('hidden')) return false;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  pane.classList.add('active');
  if (tabName === 'log') renderLog();
  localStorage.setItem(lastTabKey(), tabName);
  return true;
}

function restoreLastTab() {
  const last = localStorage.getItem(lastTabKey());
  if (last) activateTab(last);
}

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function wireContractSubtabs() {
  document.querySelectorAll('#contracts-subtabs .subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#contracts-subtabs .subtab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      contractSubTab = btn.dataset.subtab;
      renderContracts();
    });
  });
}

function wireSearchInputs() {
  document.getElementById('clients-search').addEventListener('input', renderClients);
  document.getElementById('employees-search').addEventListener('input', renderEmployees);
  document.getElementById('transactions-search').addEventListener('input', renderTransactions);
  document.getElementById('contracts-search').addEventListener('input', renderContracts);
  document.getElementById('stock-search').addEventListener('input', renderStock);
  document.getElementById('recettes-search').addEventListener('input', renderRecettes);
}

function wireNewButtons() {
  document.getElementById('btn-new-client').addEventListener('click', () => openClientDialog());
  document.getElementById('btn-new-employee').addEventListener('click', () => openEmployeeDialog());
  document.getElementById('btn-new-transaction').addEventListener('click', () => openTransactionDialog());
  document.getElementById('btn-new-contract').addEventListener('click', () => openContractDialog());
  document.getElementById('btn-new-product').addEventListener('click', () => openProductDialog());
  document.getElementById('btn-new-recipe').addEventListener('click', () => openRecipeDialog());
}

function wireManageUsers() {
  document.getElementById('btn-manage-users').addEventListener('click', () => openUsersDialog());
  document.getElementById('btn-backup').addEventListener('click', () => openBackupDialog());
}

function wireListActions() {
  document.getElementById('list-clients').addEventListener('click', handleClientAction);
  document.getElementById('list-employees').addEventListener('click', handleEmployeeAction);
  document.getElementById('list-stock').addEventListener('click', handleStockAction);
  document.getElementById('list-transactions').addEventListener('click', handleTransactionAction);
  document.getElementById('list-contracts').addEventListener('click', handleContractAction);
  document.getElementById('list-recettes').addEventListener('click', handleRecipeAction);
}

function handleClientAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const client = findById(state.snapshot.clients, id);
  if (!client) return;
  if (btn.dataset.action === 'edit-client') openClientDialog(client);
  if (btn.dataset.action === 'delete-client') {
    confirmDelete(`Supprimer le client « ${client.name} » ?`, () => {
      ke.request('delete_client', { id }).catch((err) => toast(err.message, 'error'));
    });
  }
}

function handleEmployeeAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const employee = findById(state.snapshot.employees, id);
  if (!employee) return;
  if (btn.dataset.action === 'edit-employee') openEmployeeDialog(employee);
  if (btn.dataset.action === 'pay-employee') openPayDialog(employee);
  if (btn.dataset.action === 'delete-employee') {
    confirmDelete(`Supprimer l’employé « ${employee.name} » ?`, () => {
      ke.request('delete_employee', { id }).catch((err) => toast(err.message, 'error'));
    });
  }
}

function handleTransactionAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (btn) {
    const id = btn.dataset.id;
    const transaction = findById(state.snapshot.transactions, id);
    if (!transaction) return;
    if (btn.dataset.action === 'delete-transaction') {
      confirmDelete(`Supprimer la transaction « ${transaction.name} » (${fmtGold(transaction.amount)} septims) ?`, () => {
        ke.request('delete_transaction', { id }).catch((err) => toast(err.message, 'error'));
      });
    }
    return;
  }
  const row = e.target.closest('.transaction-card');
  if (!row) return;
  const transaction = findById(state.snapshot.transactions, row.dataset.id);
  if (!transaction) return;
  openTransactionDetailDialog(transaction);
}

function handleContractAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const contract = findById(state.snapshot.contracts, id);
  if (!contract) return;
  if (btn.dataset.action === 'edit-contract') openContractDialog(contract);
  if (btn.dataset.action === 'checkout-contract') openContractCheckoutDialog(contract);
  if (btn.dataset.action === 'delete-contract') {
    const client = findById(state.snapshot.clients, contract.clientId);
    confirmDelete(`Supprimer le contrat avec « ${client ? client.name : 'ce client'} » ?`, () => {
      ke.request('delete_contract', { id }).catch((err) => toast(err.message, 'error'));
    });
  }
}

function handleStockAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const product = findById(state.snapshot.products, id);
  if (!product) return;
  if (btn.dataset.action === 'edit-product') openProductDialog(product);
  if (btn.dataset.action === 'delete-product') {
    confirmDelete(`Supprimer le produit « ${product.name} » ?`, () => {
      ke.request('delete_product', { id }).catch((err) => toast(err.message, 'error'));
    });
  }
}

function handleRecipeAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const recipe = findById(state.snapshot.recipes, id);
  if (!recipe) return;
  const outputProduct = findById(state.snapshot.products, recipe.output.productId);
  const label = outputProduct ? outputProduct.name : 'ce produit';
  if (btn.dataset.action === 'edit-recipe') openRecipeDialog(recipe);
  if (btn.dataset.action === 'craft-recipe') {
    ke.request('craft_recipe', { id })
      .then(() => toast(`Recette « ${label} » fabriquée.`, 'info'))
      .catch((err) => toast(err.message, 'error'));
  }
  if (btn.dataset.action === 'delete-recipe') {
    confirmDelete(`Supprimer la recette « ${label} » ?`, () => {
      ke.request('delete_recipe', { id }).catch((err) => toast(err.message, 'error'));
    });
  }
}
