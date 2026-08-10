/* state.js — client-side snapshot store + small helpers. */

const state = {
  snapshot: {
    shop: { shopName: '', balance: 0, setupComplete: false },
    users: [],
    employees: [],
    clients: [],
    products: [],
    transactions: [],
  },
  user: null, // currently logged in user (public fields only)
};

function setSnapshot(snapshot) {
  state.snapshot = snapshot;
}

function findById(list, id) {
  return list.find((item) => item.id === id) || null;
}

function fmtGold(n) {
  const num = Math.round(Number(n) || 0);
  return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
