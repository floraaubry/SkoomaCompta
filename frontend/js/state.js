/* state.js — client-side snapshot store + small helpers. */

const state = {
  snapshot: {
    shop: { shopName: '', balance: 0, setupComplete: false },
    users: [],
    employees: [],
    clients: [],
    products: [],
    transactions: [],
    contracts: [],
    recipes: [],
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
  const num = Math.round((Number(n) || 0) * 100) / 100;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Server sends naive "YYYY-MM-DD HH:MM" strings that are actually UTC (see
// logic.now_iso()). Appending 'Z' before parsing tells JS to treat them as
// UTC instants instead of local time, so display/comparisons convert correctly.
function parseServerDate(str) {
  if (!str) return null;
  const d = new Date(String(str).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatServerDateTime(str) {
  const d = parseServerDate(str);
  if (!d) return str || '';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
