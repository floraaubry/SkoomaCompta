/* components.js — reusable searchable combobox + spinbox widgets. */

function createCombobox({ items, getId, getLabel, placeholder, onSelect, initialId }) {
  const root = document.createElement('div');
  root.className = 'combobox';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'combobox-input';
  input.autocomplete = 'off';
  input.placeholder = placeholder || 'Search...';

  const dropdown = document.createElement('div');
  dropdown.className = 'combobox-dropdown hidden';

  root.appendChild(input);
  root.appendChild(dropdown);

  let currentItems = items || [];
  let selectedId = null;

  function render(filter) {
    const q = (filter || '').trim().toLowerCase();
    const matches = currentItems.filter((it) => getLabel(it).toLowerCase().includes(q)).slice(0, 30);
    dropdown.innerHTML = '';
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'combobox-empty';
      empty.textContent = 'Aucun résultat';
      dropdown.appendChild(empty);
    } else {
      matches.forEach((it) => {
        const opt = document.createElement('div');
        opt.className = 'combobox-option';
        opt.textContent = getLabel(it);
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          select(it);
        });
        dropdown.appendChild(opt);
      });
    }
    dropdown.classList.remove('hidden');
  }

  function select(item) {
    selectedId = item ? getId(item) : null;
    input.value = item ? getLabel(item) : '';
    dropdown.classList.add('hidden');
    if (onSelect) onSelect(selectedId, item);
  }

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => {
    selectedId = null;
    render(input.value);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 150);
  });

  if (initialId) {
    const found = currentItems.find((it) => getId(it) === initialId);
    if (found) select(found);
  }

  return {
    root,
    getValue: () => selectedId,
    setItems: (newItems) => {
      currentItems = newItems || [];
    },
    reset: () => {
      selectedId = null;
      input.value = '';
    },
  };
}

function createSpinbox({ min = 0, max = Infinity, step = 1, value = 0, onChange }) {
  const root = document.createElement('div');
  root.className = 'spinbox';

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button';
  btnMinus.className = 'spinbox-btn';
  btnMinus.textContent = '−';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'spinbox-input';
  input.min = String(min);
  if (isFinite(max)) input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.className = 'spinbox-btn';
  btnPlus.textContent = '+';

  root.appendChild(btnMinus);
  root.appendChild(input);
  root.appendChild(btnPlus);

  const stepDecimals = (String(step).split('.')[1] || '').length;

  function clamp(v) {
    if (isNaN(v)) v = min;
    if (stepDecimals) {
      const factor = 10 ** stepDecimals;
      v = Math.round(v * factor) / factor;
    }
    v = Math.max(min, v);
    if (isFinite(max)) v = Math.min(max, v);
    return v;
  }

  function set(v, fire = true) {
    v = clamp(v);
    input.value = String(v);
    if (fire && onChange) onChange(v);
  }

  btnMinus.addEventListener('click', () => set(parseFloat(input.value || '0') - step));
  btnPlus.addEventListener('click', () => set(parseFloat(input.value || '0') + step));
  input.addEventListener('change', () => set(parseFloat(input.value || '0')));

  return {
    root,
    getValue: () => clamp(parseFloat(input.value || '0')),
    setValue: (v) => set(v, false),
    setMax: (m) => {
      max = m;
      input.max = isFinite(m) ? String(m) : '';
      set(clamp(parseFloat(input.value || '0')), false);
    },
  };
}
