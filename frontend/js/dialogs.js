/* dialogs.js — open/populate/submit logic for every dialog. */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('dialog [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  });
});

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4500);
}

function confirmDelete(message, onConfirm, confirmLabel = 'Supprimer') {
  const dialog = document.getElementById('dialog-confirm');
  document.getElementById('confirm-message').textContent = message;
  const yesBtn = document.getElementById('confirm-yes');
  const noBtn = document.getElementById('confirm-no');
  yesBtn.textContent = confirmLabel;

  function cleanup() {
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
    dialog.close();
  }
  function onYes() {
    cleanup();
    onConfirm();
  }
  function onNo() {
    cleanup();
  }
  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);
  dialog.showModal();
}

/* --------------------------------------------------------- client dialog */

function openClientDialog(client) {
  document.getElementById('client-dialog-title').textContent = client ? 'Modifier le client' : 'Nouveau client';
  document.getElementById('client-id').value = client ? client.id : '';
  document.getElementById('client-name').value = client ? client.name : '';
  document.getElementById('client-note').value = client ? client.note || '' : '';
  document.getElementById('client-error').textContent = '';
  document.getElementById('dialog-client').showModal();
}

document.getElementById('form-client').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = {
    name: document.getElementById('client-name').value,
    note: document.getElementById('client-note').value,
  };
  const errorEl = document.getElementById('client-error');
  try {
    if (id) {
      payload.id = id;
      await ke.request('update_client', payload);
    } else {
      await ke.request('create_client', payload);
    }
    document.getElementById('dialog-client').close();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* ------------------------------------------------------- employee dialog */

function openEmployeeDialog(employee) {
  document.getElementById('employee-dialog-title').textContent = employee ? 'Modifier l’employé' : 'Nouvel employé';
  document.getElementById('employee-id').value = employee ? employee.id : '';
  document.getElementById('employee-name').value = employee ? employee.name : '';
  document.getElementById('employee-salary').value = employee ? employee.salary : 0;
  document.getElementById('employee-note').value = employee ? employee.note || '' : '';
  document.getElementById('employee-error').textContent = '';
  document.getElementById('dialog-employee').showModal();
}

document.getElementById('form-employee').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('employee-id').value;
  const payload = {
    name: document.getElementById('employee-name').value,
    salary: document.getElementById('employee-salary').value,
    note: document.getElementById('employee-note').value,
  };
  const errorEl = document.getElementById('employee-error');
  try {
    if (id) {
      payload.id = id;
      await ke.request('update_employee', payload);
    } else {
      await ke.request('create_employee', payload);
    }
    document.getElementById('dialog-employee').close();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------------------------------------------- product dialog */

let productQuantitySpinbox = null;
let productSellPriceSpinbox = null;

function openProductDialog(product) {
  document.getElementById('product-dialog-title').textContent = product ? 'Modifier le produit' : 'Nouveau produit';
  document.getElementById('product-id').value = product ? product.id : '';
  document.getElementById('product-name').value = product ? product.name : '';

  const qtySlot = document.getElementById('product-quantity-slot');
  qtySlot.innerHTML = '';
  productQuantitySpinbox = createSpinbox({ min: 0, step: 1, value: product ? product.quantity : 0 });
  qtySlot.appendChild(productQuantitySpinbox.root);

  const priceSlot = document.getElementById('product-sell-price-slot');
  priceSlot.innerHTML = '';
  productSellPriceSpinbox = createSpinbox({ min: 0, step: 1, value: product ? product.sellPrice : 0 });
  priceSlot.appendChild(productSellPriceSpinbox.root);

  document.getElementById('product-error').textContent = '';
  document.getElementById('dialog-product').showModal();
}

document.getElementById('form-product').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const payload = {
    name: document.getElementById('product-name').value,
    quantity: productQuantitySpinbox.getValue(),
    sellPrice: productSellPriceSpinbox.getValue(),
  };
  const errorEl = document.getElementById('product-error');
  try {
    if (id) {
      payload.id = id;
      await ke.request('update_product', payload);
    } else {
      await ke.request('create_product', payload);
    }
    document.getElementById('dialog-product').close();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* ---------------------------------------------------- transaction dialog */

let transactionClientCombobox = null;
let transactionItemRows = [];

function openTransactionDialog() {
  document.getElementById('form-transaction').reset();
  document.getElementById('transaction-error').textContent = '';
  document.getElementById('transaction-items').innerHTML = '';
  transactionItemRows = [];

  const slot = document.getElementById('transaction-client-slot');
  slot.innerHTML = '';
  transactionClientCombobox = createCombobox({
    items: state.snapshot.clients,
    getId: (c) => c.id,
    getLabel: (c) => c.name,
    placeholder: 'Rechercher un client...',
  });
  slot.appendChild(transactionClientCombobox.root);

  addTransactionItemRow();
  updateTransactionTotal();
  document.getElementById('dialog-transaction').showModal();
}

function transactionDirection() {
  return document.querySelector('input[name="direction"]:checked').value;
}

function addTransactionItemRow() {
  const row = document.createElement('div');
  row.className = 'transaction-item-row';

  const comboSlot = document.createElement('div');
  comboSlot.className = 'transaction-item-product';

  const spinbox = createSpinbox({ min: 1, value: 1, step: 1, onChange: updateTransactionTotal });

  const combobox = createCombobox({
    items: state.snapshot.products,
    getId: (p) => p.id,
    getLabel: (p) => `${p.name} (${p.quantity} en stock, ${fmtGold(p.sellPrice)} septims)`,
    placeholder: 'Rechercher un produit...',
    onSelect: (id) => {
      const product = id ? findById(state.snapshot.products, id) : null;
      spinbox.setMax(transactionDirection() === 'in' && product ? product.quantity : Infinity);
      updateTransactionTotal();
    },
  });
  comboSlot.appendChild(combobox.root);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-small btn-danger';
  removeBtn.textContent = 'Retirer';
  removeBtn.addEventListener('click', () => {
    row.remove();
    transactionItemRows = transactionItemRows.filter((r) => r.rowEl !== row);
    updateTransactionTotal();
  });

  row.appendChild(comboSlot);
  row.appendChild(spinbox.root);
  row.appendChild(removeBtn);
  document.getElementById('transaction-items').appendChild(row);

  transactionItemRows.push({ rowEl: row, combobox, spinbox });
}

document.getElementById('btn-add-transaction-item').addEventListener('click', addTransactionItemRow);

document.querySelectorAll('input[name="direction"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    transactionItemRows.forEach((r) => {
      const id = r.combobox.getValue();
      const product = id ? findById(state.snapshot.products, id) : null;
      r.spinbox.setMax(transactionDirection() === 'in' && product ? product.quantity : Infinity);
    });
    updateTransactionTotal();
  });
});

function updateTransactionTotal() {
  let total = 0;
  transactionItemRows.forEach((r) => {
    const id = r.combobox.getValue();
    const product = id ? findById(state.snapshot.products, id) : null;
    if (product) total += product.sellPrice * r.spinbox.getValue();
  });
  document.getElementById('transaction-total').textContent = fmtGold(total);
}

document.getElementById('form-transaction').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('transaction-error');
  errorEl.textContent = '';
  const clientId = transactionClientCombobox.getValue();
  if (!clientId) {
    errorEl.textContent = 'Sélectionnez un client.';
    return;
  }
  const items = transactionItemRows
    .map((r) => ({ productId: r.combobox.getValue(), quantity: r.spinbox.getValue() }))
    .filter((i) => i.productId);
  if (items.length === 0) {
    errorEl.textContent = 'Ajoutez au moins un produit.';
    return;
  }
  try {
    await ke.request('create_transaction', {
      clientId,
      direction: transactionDirection(),
      items,
    });
    document.getElementById('dialog-transaction').close();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* ------------------------------------------------------- transaction detail */

function openTransactionDetailDialog(transaction) {
  document.getElementById('transaction-detail-title').textContent = transaction.name;
  document.getElementById('transaction-detail-date').textContent = transaction.date;
  const employee = transaction.employeeId ? findById(state.snapshot.employees, transaction.employeeId) : null;
  document.getElementById('transaction-detail-employee').textContent = employee ? employee.name : '—';
  const sign = transaction.direction === 'in' ? '+' : '−';
  document.getElementById('transaction-detail-amount').textContent = `${sign}${fmtGold(transaction.amount)} septims`;

  const itemsEl = document.getElementById('transaction-detail-items');
  itemsEl.innerHTML = '';
  (transaction.content || []).forEach((c) => {
    const line = document.createElement('div');
    line.className = 'transaction-detail-item';
    if (c.productName) {
      line.innerHTML = `<span>${escapeHtml(c.productName)} x${c.quantity}</span><span>${fmtGold(c.lineTotal)} septims</span>`;
    } else {
      line.innerHTML = `<span>${escapeHtml(c.label)}</span><span>${fmtGold(c.amount)} septims</span>`;
    }
    itemsEl.appendChild(line);
  });

  document.getElementById('dialog-transaction-detail').showModal();
}

/* ------------------------------------------------------------- pay dialog */

let payCommissionSpinbox = null;
let payingEmployee = null;

function openPayDialog(employee) {
  payingEmployee = employee;
  document.getElementById('pay-employee-id').value = employee.id;
  document.getElementById('pay-employee-name').textContent = employee.name;
  document.getElementById('pay-salary').textContent = fmtGold(employee.salary);
  document.getElementById('pay-amount-sold').textContent = fmtGold(employee.amountSold);
  document.getElementById('pay-error').textContent = '';

  const slot = document.getElementById('pay-commission-slot');
  slot.innerHTML = '';
  payCommissionSpinbox = createSpinbox({ min: 0, max: 100, step: 1, value: 0, onChange: updatePayTotal });
  slot.appendChild(payCommissionSpinbox.root);
  updatePayTotal();
  document.getElementById('dialog-pay').showModal();
}

function updatePayTotal() {
  if (!payingEmployee) return;
  const pct = payCommissionSpinbox.getValue();
  const total = Number(payingEmployee.salary || 0) + (Number(payingEmployee.amountSold || 0) * pct) / 100;
  document.getElementById('pay-total').textContent = fmtGold(total);
}

document.getElementById('form-pay').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('pay-employee-id').value;
  const percent = payCommissionSpinbox.getValue();
  try {
    await ke.request('pay_employee', { id, commissionPercent: percent });
    document.getElementById('dialog-pay').close();
  } catch (err) {
    document.getElementById('pay-error').textContent = err.message;
  }
});

/* --------------------------------------------------------- users dialog */

let userEmployeeCombobox = null;
let editingUserId = null;

function openUsersDialog() {
  renderUsersList();
  document.getElementById('dialog-users').showModal();
}

async function renderUsersList() {
  const container = document.getElementById('users-list');
  let users;
  try {
    users = await ke.request('list_users');
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  container.innerHTML = '';
  users.forEach((u) => {
    const employee = u.employeeId ? findById(state.snapshot.employees, u.employeeId) : null;
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(u.name)}</strong>${u.isAdmin ? '<span class="badge">Admin</span>' : ''}
        ${employee ? `<div class="card-sub">Associé : ${escapeHtml(employee.name)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-small" data-action="edit-user" data-id="${u.id}">Modifier</button>
        <button type="button" class="btn btn-small btn-danger" data-action="delete-user" data-id="${u.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
  container.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit-user') {
        const target = users.find((x) => x.id === id);
        const isLastAdmin = target.isAdmin && users.filter((x) => x.isAdmin).length <= 1;
        openUserFormDialog(target, isLastAdmin);
      } else if (btn.dataset.action === 'delete-user') {
        const target = users.find((x) => x.id === id);
        confirmDelete(`Supprimer l’utilisateur « ${target.name} » ?`, async () => {
          try {
            await ke.request('delete_user', { id });
            renderUsersList();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      }
    });
  });
}

document.getElementById('btn-new-user').addEventListener('click', () => openUserFormDialog());

function openUserFormDialog(u, isLastAdmin) {
  editingUserId = u ? u.id : null;
  document.getElementById('user-form-title').textContent = u ? 'Modifier l’utilisateur' : 'Nouvel utilisateur';
  document.getElementById('user-id').value = u ? u.id : '';
  document.getElementById('user-name').value = u ? u.name : '';
  const pwInput = document.getElementById('user-password');
  pwInput.value = '';
  pwInput.placeholder = u ? '(laisser vide pour ne pas changer)' : 'Mot de passe';
  const adminCheckbox = document.getElementById('user-is-admin');
  adminCheckbox.checked = !!(u && u.isAdmin);
  adminCheckbox.disabled = !!isLastAdmin;
  adminCheckbox.title = isLastAdmin ? 'Impossible de retirer les droits du dernier administrateur.' : '';
  document.getElementById('user-error').textContent = '';
  mountEmployeeCombobox(u ? u.employeeId : null);
  document.getElementById('dialog-user-form').showModal();
}

function mountEmployeeCombobox(selectedId) {
  const slot = document.getElementById('user-employee-combobox-slot');
  slot.innerHTML = '';
  userEmployeeCombobox = createCombobox({
    items: state.snapshot.employees,
    getId: (e) => e.id,
    getLabel: (e) => e.name,
    placeholder: 'Rechercher un employé...',
    initialId: selectedId,
  });
  slot.appendChild(userEmployeeCombobox.root);
}

document.getElementById('form-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('user-error');
  errorEl.textContent = '';
  const password = document.getElementById('user-password').value;
  const payload = {
    name: document.getElementById('user-name').value,
    isAdmin: document.getElementById('user-is-admin').checked,
    employeeId: userEmployeeCombobox ? userEmployeeCombobox.getValue() : null,
  };
  if (password) payload.password = password;
  try {
    if (editingUserId) {
      payload.id = editingUserId;
      await ke.request('update_user', payload);
    } else {
      if (!password) {
        errorEl.textContent = 'Le mot de passe est requis.';
        return;
      }
      await ke.request('create_user', payload);
    }
    document.getElementById('dialog-user-form').close();
    renderUsersList();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* --------------------------------------------------------- backup dialog */

const BACKUP_KIND_LABELS = { manual: 'Manuelle', auto: 'Automatique' };

function fmtBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} o`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} Ko`;
  return `${(num / (1024 * 1024)).toFixed(1)} Mo`;
}

function openBackupDialog() {
  document.getElementById('backup-settings-error').textContent = '';
  document.getElementById('backup-error').textContent = '';
  document.getElementById('dialog-backup').showModal();
  loadBackupSettings();
  renderBackupList();
}

async function loadBackupSettings() {
  try {
    const settings = await ke.request('get_backup_settings');
    document.getElementById('backup-auto-hours').value = settings.autoBackupHours || 0;
  } catch (err) {
    document.getElementById('backup-settings-error').textContent = err.message;
  }
}

async function renderBackupList() {
  const container = document.getElementById('backup-list');
  let backups;
  try {
    backups = await ke.request('list_backups');
  } catch (err) {
    document.getElementById('backup-error').textContent = err.message;
    return;
  }
  container.innerHTML = '';
  if (backups.length === 0) {
    container.innerHTML = '<p class="empty-hint">Aucune sauvegarde pour le moment.</p>';
    return;
  }
  backups.forEach((b) => {
    const row = document.createElement('div');
    row.className = 'backup-row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(b.createdAt)}</strong>
        <span class="badge">${escapeHtml(BACKUP_KIND_LABELS[b.kind] || b.kind)}</span>
        <div class="card-sub">${fmtBytes(b.sizeBytes)}</div>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-small" data-action="restore-backup" data-id="${b.id}">Restaurer</button>
        <button type="button" class="btn btn-small btn-danger" data-action="delete-backup" data-id="${b.id}">Supprimer</button>
      </div>`;
    container.appendChild(row);
  });
  container.querySelectorAll('button[data-action="restore-backup"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const backup = backups.find((x) => x.id === btn.dataset.id);
      confirmDelete(
        `Restaurer la sauvegarde du ${backup.createdAt} ? Toutes les données actuelles (clients, employés, produits, transactions, solde) seront remplacées.`,
        async () => {
          try {
            await ke.request('restore_backup', { id: backup.id });
            document.getElementById('dialog-backup').close();
            toast('Sauvegarde restaurée.', 'info');
          } catch (err) {
            toast(err.message, 'error');
          }
        },
        'Restaurer'
      );
    });
  });
  container.querySelectorAll('button[data-action="delete-backup"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const backup = backups.find((x) => x.id === btn.dataset.id);
      confirmDelete(`Supprimer la sauvegarde du ${backup.createdAt} ?`, async () => {
        try {
          await ke.request('delete_backup', { id: backup.id });
          renderBackupList();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  });
}

document.getElementById('backup-auto-hours').addEventListener('change', async (e) => {
  const errorEl = document.getElementById('backup-settings-error');
  errorEl.textContent = '';
  try {
    await ke.request('update_backup_settings', { autoBackupHours: e.target.value });
    toast('Paramètres de sauvegarde enregistrés.', 'info');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('btn-create-backup').addEventListener('click', async () => {
  const errorEl = document.getElementById('backup-error');
  errorEl.textContent = '';
  try {
    await ke.request('create_backup');
    renderBackupList();
    toast('Sauvegarde créée.', 'info');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
