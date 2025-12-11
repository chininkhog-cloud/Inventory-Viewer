(() => {
  'use strict';

  /* -------------------------
     DOM references
     ------------------------- */
  const dom = {
    themeToggle: document.getElementById('themeToggle'),
    resetSampleBtn: document.getElementById('resetSampleBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importFile: document.getElementById('importFile'),

    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    sortBy: document.getElementById('sortBy'),
    sortDir: document.getElementById('sortDir'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),

    nameInput: document.getElementById('nameInput'),
    categoryInput: document.getElementById('categoryInput'),
    priceInput: document.getElementById('priceInput'),
    qtyInput: document.getElementById('qtyInput'),

    nameError: document.getElementById('nameError'),
    categoryError: document.getElementById('categoryError'),
    priceError: document.getElementById('priceError'),
    qtyError: document.getElementById('qtyError'),

    productForm: document.getElementById('productForm'),

    productsTable: document.getElementById('productsTable'),
    productsTbody: document.getElementById('productsTbody'),
    thName: document.getElementById('th-name'),
    thPrice: document.getElementById('th-price'),

    totalItems: document.getElementById('totalItems'),
    totalValue: document.getElementById('totalValue'),
    lowStockCount: document.getElementById('lowStockCount'),

    noResults: document.getElementById('noResults')
  };

  /* -------------------------
     Utilities & constants
     ------------------------- */
  const formatCurrency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
  const STORAGE_KEYS = { PRODUCTS: 'inventoryViewer.products', THEME: 'inventoryViewer.theme', STATE: 'inventoryViewer.state' };
  const seedCategories = ['Electronics', 'Stationery', 'Accessories', 'Home'];

  /* -------------------------
     Sample data & state
     ------------------------- */
  function createProductObject(name, category, price, quantity) {
    return {
      id: generateId(),
      name: String(name).trim(),
      category: String(category).trim(),
      price: Number(price),
      quantity: Number.isInteger(quantity) ? quantity : parseInt(quantity, 10)
    };
  }

  const sampleProducts = [
    createProductObject('Wireless Mouse', 'Electronics', 24.99, 12),
    createProductObject('Mechanical Keyboard', 'Electronics', 79.9, 4),
    createProductObject('Notebook A5', 'Stationery', 3.5, 50),
    createProductObject('Ballpoint Pens (10 pack)', 'Stationery', 5.25, 8),
    createProductObject('USB-C Cable 1m', 'Accessories', 7.99, 2),
    createProductObject('LED Desk Lamp', 'Home', 29.0, 6)
  ];

  // UI state persisted (search/filter/sort)
  const state = loadState() || { search: '', filterCategory: 'all', sortBy: 'name', sortDir: 'asc' };

  // Products array (data model)
  let products = loadProducts() || [...sampleProducts];

  /* -------------------------
     Initialization
     ------------------------- */
  initTheme();
  populateCategories();
  initControlsFromState();
  renderProducts();
  renderStats();
  attachEventListeners();

  /* -------------------------
     Event listeners
     ------------------------- */
  function attachEventListeners() {
    dom.themeToggle.addEventListener('click', toggleTheme);
    dom.resetSampleBtn.addEventListener('click', onResetToSample);
    dom.exportBtn.addEventListener('click', onExportJSON);
    dom.importFile.addEventListener('change', onImportJSON);

    dom.searchInput.addEventListener('input', onSearchInput);
    dom.categoryFilter.addEventListener('change', onCategoryFilter);
    dom.sortBy.addEventListener('change', onSortChange);
    dom.sortDir.addEventListener('change', onSortChange);
    dom.clearFiltersBtn.addEventListener('click', onClearFilters);

    dom.productForm.addEventListener('submit', onAddProductSubmit);
    dom.productForm.addEventListener('reset', onFormReset);

    dom.thName.addEventListener('click', () => onHeaderSort('name'));
    dom.thPrice.addEventListener('click', () => onHeaderSort('price'));

    // Keyboard accessibility for sortable headers
    [dom.thName, dom.thPrice].forEach(th => {
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const key = th.dataset.key;
          onHeaderSort(key);
        }
      });
    });
  }

  /* -------------------------
     Core functions
     ------------------------- */

  // Validate product fields
  function validateProduct({ name, category, price, quantity }) {
    const errors = {};
    if (!name || !String(name).trim()) errors.name = 'Product name is required.';
    if (!category || !String(category).trim()) errors.category = 'Category is required.';
    const np = Number(price);
    if (Number.isNaN(np) || np <= 0) errors.price = 'Price must be a number greater than 0.';
    const nq = Number(quantity);
    if (!Number.isInteger(nq) || nq < 0) errors.quantity = 'Quantity must be an integer greater than or equal to 0.';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  // Add product to array and persist
  function addProduct(prod) {
    products.push(prod);
    saveProducts(products);
    populateCategories();
    renderProducts(true);
    renderStats();
  }

  // Edit product (inline). Validates and persists.
  function editProduct(id, field, value, cellErrorEl) {
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return;

    const candidate = { ...products[idx] };
    switch (field) {
      case 'name': candidate.name = String(value).trim(); break;
      case 'category': candidate.category = String(value).trim(); break;
      case 'price': candidate.price = Number(value); break;
      case 'quantity': candidate.quantity = parseInt(value, 10); break;
      default: return;
    }

    const { valid, errors } = validateProduct(candidate);
    if (!valid) {
      const msg = errors[field] || 'Invalid value.';
      if (cellErrorEl) cellErrorEl.textContent = msg;
      return;
    }

    products[idx] = candidate;
    saveProducts(products);
    if (cellErrorEl) cellErrorEl.textContent = '';
    renderProducts();
    renderStats();
  }

  // Delete product with confirmation and animation
  function deleteProduct(id, btnEl) {
    const p = products.find(pr => pr.id === id);
    if (!p) return;
    const ok = window.confirm(`Delete "${p.name}" from inventory?`);
    if (!ok) return;

    const tr = btnEl.closest('tr');
    if (tr) {
      tr.classList.add('tr-exit');
      setTimeout(() => {
        products = products.filter(pr => pr.id !== id);
        saveProducts(products);
        renderProducts();
        renderStats();
      }, 180);
    } else {
      products = products.filter(pr => pr.id !== id);
      saveProducts(products);
      renderProducts();
      renderStats();
    }
  }

  /* -------------------------
     Rendering
     ------------------------- */

  // Render products table according to state (filter/search/sort)
  function renderProducts(animateLast = false) {
    const filtered = filterProducts(products, state.search, state.filterCategory);
    const sorted = sortProducts(filtered, state.sortBy, state.sortDir);

    dom.productsTbody.innerHTML = '';
    setAriaSort();

    if (sorted.length === 0) {
      dom.noResults.hidden = false;
      return;
    } else {
      dom.noResults.hidden = true;
    }

    const fragment = document.createDocumentFragment();
    sorted.forEach((p, idx) => {
      const tr = document.createElement('tr');
      if (p.quantity < 5) tr.classList.add('low-stock');
      if (animateLast && idx === sorted.length - 1) tr.classList.add('tr-enter');

      // Name cell
      const tdName = document.createElement('td');
      tdName.appendChild(renderEditableCell(p, 'name', p.name));
      tr.appendChild(tdName);

      // Category cell
      const tdCat = document.createElement('td');
      tdCat.appendChild(renderEditableCell(p, 'category', p.category, 'select'));
      tr.appendChild(tdCat);

      // Price cell
      const tdPrice = document.createElement('td');
      tdPrice.appendChild(renderEditableCell(p, 'price', p.price, 'number'));
      tr.appendChild(tdPrice);

      // Quantity cell
      const tdQty = document.createElement('td');
      tdQty.appendChild(renderEditableCell(p, 'quantity', p.quantity, 'integer'));
      tr.appendChild(tdQty);

      // Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'actions';
      tdActions.appendChild(renderActionButtons(p.id));
      tr.appendChild(tdActions);

      fragment.appendChild(tr);
    });

    dom.productsTbody.appendChild(fragment);
  }

  // Render stats
  function renderStats() {
    const totalItems = products.reduce((acc, p) => acc + p.quantity, 0);
    const totalValue = products.reduce((acc, p) => acc + (p.price * p.quantity), 0);
    const lowStockCount = products.filter(p => p.quantity < 5).length;

    dom.totalItems.textContent = totalItems.toLocaleString();
    dom.totalValue.textContent = formatCurrency.format(totalValue);
    dom.lowStockCount.textContent = lowStockCount.toLocaleString();
  }

  /* -------------------------
     Helpers: filtering & sorting
     ------------------------- */
  function filterProducts(list, searchTerm, category) {
    const s = String(searchTerm || '').trim().toLowerCase();
    return list.filter(p => {
      const matchesCategory = category === 'all' ? true : p.category === category;
      const matchesSearch = s ? p.name.toLowerCase().includes(s) : true;
      return matchesCategory && matchesSearch;
    });
  }

  function sortProducts(list, by, dir) {
    const asc = dir === 'asc' ? 1 : -1;
    const arr = [...list];
    arr.sort((a, b) => {
      let va, vb;
      if (by === 'price') { va = a.price; vb = b.price; }
      else { va = String(a.name).toLowerCase(); vb = String(b.name).toLowerCase(); }
      if (va < vb) return -1 * asc;
      if (va > vb) return 1 * asc;
      return 0;
    });
    return arr;
  }

  /* -------------------------
     Editable cell & actions
     ------------------------- */
  function renderEditableCell(product, field, value, type = 'text') {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid';
    wrapper.style.gap = '0.25rem';

    let inputEl;
    if (type === 'select') {
      inputEl = document.createElement('select');
      const cats = new Set([...seedCategories, ...products.map(p => p.category)]);
      [...cats].sort((a, b) => a.localeCompare(b)).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        inputEl.appendChild(opt);
      });
      inputEl.value = value;
    } else {
      inputEl = document.createElement('input');
      inputEl.className = 'inline-input';
      switch (type) {
        case 'number':
          inputEl.type = 'number'; inputEl.step = '0.01'; inputEl.min = '0.01'; break;
        case 'integer':
          inputEl.type = 'number'; inputEl.step = '1'; inputEl.min = '0'; break;
        default:
          inputEl.type = 'text';
      }
      inputEl.value = type === 'number' ? String(Number(value)) : String(value);
    }

    inputEl.setAttribute('aria-label', `Edit ${field} for ${product.name}`);
    const errorEl = document.createElement('div');
    errorEl.className = 'inline-error';
    errorEl.setAttribute('aria-live', 'polite');

    inputEl.addEventListener('change', () => editProduct(product.id, field, inputEl.value, errorEl));
    inputEl.addEventListener('blur', () => editProduct(product.id, field, inputEl.value, errorEl));
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); editProduct(product.id, field, inputEl.value, errorEl); }
      else if (e.key === 'Escape') { e.preventDefault(); inputEl.value = value; errorEl.textContent = ''; }
    });

    wrapper.appendChild(inputEl);
    wrapper.appendChild(errorEl);
    return wrapper;
  }

  function renderActionButtons(id) {
    const container = document.createElement('div');
    container.className = 'actions';

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'action-button';
    delBtn.type = 'button';
    delBtn.title = 'Delete product';
    delBtn.setAttribute('aria-label', 'Delete product');
    delBtn.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 6h18M9 6V4h6v2M8 6l1 14h6l1-14"></path>
      </svg>
    `;
    delBtn.addEventListener('click', () => deleteProduct(id, delBtn));

    container.appendChild(delBtn);
    return container;
  }

  /* -------------------------
     Controls handlers
     ------------------------- */
  function onSearchInput(e) {
    state.search = e.target.value;
    saveState();
    renderProducts();
  }
  function onCategoryFilter(e) {
    state.filterCategory = e.target.value;
    saveState();
    renderProducts();
  }
  function onSortChange() {
    state.sortBy = dom.sortBy.value;
    state.sortDir = dom.sortDir.value;
    saveState();
    renderProducts();
  }
  function onHeaderSort(key) {
    if (state.sortBy === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortBy = key; state.sortDir = 'asc'; }
    saveState();
    renderProducts();
  }
  function onClearFilters() {
    state.search = ''; state.filterCategory = 'all'; state.sortBy = 'name'; state.sortDir = 'asc';
    saveState();
    initControlsFromState();
    renderProducts();
  }

  /* -------------------------
     Form handlers
     ------------------------- */
  function onAddProductSubmit(e) {
    e.preventDefault();
    const values = {
      name: dom.nameInput.value,
      category: dom.categoryInput.value,
      price: dom.priceInput.value,
      quantity: dom.qtyInput.value
    };

    const { valid, errors } = validateProduct(values);
    clearFormErrors();

    if (!valid) {
      if (errors.name) setFieldError(dom.nameInput, dom.nameError, errors.name);
      if (errors.category) setFieldError(dom.categoryInput, dom.categoryError, errors.category);
      if (errors.price) setFieldError(dom.priceInput, dom.priceError, errors.price);
      if (errors.quantity) setFieldError(dom.qtyInput, dom.qtyError, errors.quantity);
      return;
    }

    const product = createProductObject(values.name, values.category, Number(values.price), parseInt(values.quantity, 10));
    addProduct(product);
    e.target.reset();
    dom.nameInput.focus();
  }

  function onFormReset() { clearFormErrors(); }

  /* -------------------------
     Export / Import / Reset
     ------------------------- */
  function onExportJSON() {
    try {
      const dataStr = JSON.stringify(products, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'inventory.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Failed to export JSON.');
    }
  }

  function onImportJSON(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('Invalid JSON format: expected an array.');
        const imported = parsed.map(p => createProductObject(p.name, p.category, p.price, p.quantity));
        products = imported;
        saveProducts(products);
        populateCategories();
        renderProducts();
        renderStats();
        dom.importFile.value = '';
      } catch (err) {
        console.error(err);
        alert('Import failed. Ensure the JSON contains an array of {name, category, price, quantity}.');
      }
    };
    reader.onerror = () => alert('Failed to read file.');
    reader.readAsText(file);
  }

  function onResetToSample() {
    const ok = window.confirm('Reset inventory to the sample dataset? This will overwrite current data.');
    if (!ok) return;
    products = [...sampleProducts];
    saveProducts(products);
    populateCategories();
    renderProducts();
    renderStats();
  }

  /* -------------------------
     Persistence: localStorage
     ------------------------- */
  function saveProducts(list) {
    try { localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(list)); }
    catch (err) { console.error('Failed to save products:', err); alert('Unable to save data.'); }
  }

  function loadProducts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch (err) { console.error('Failed to load products:', err); return null; }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state)); } catch {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STATE);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /* -------------------------
     Theme handling
     ------------------------- */
  function initTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      const isDark = saved ? saved === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
      dom.themeToggle.setAttribute('aria-pressed', String(isDark));
    } catch {}
  }
  function toggleTheme() {
    const isDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', isDark);
    dom.themeToggle.setAttribute('aria-pressed', String(isDark));
    try { localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light'); } catch {}
  }

  /* -------------------------
     UI helpers
     ------------------------- */
  function populateCategories() {
    const categories = new Set([...seedCategories, ...products.map(p => p.category)]);
    const currentFilter = dom.categoryFilter.value || 'all';
    dom.categoryFilter.innerHTML = '<option value="all">All</option>' + [...categories].sort((a,b)=>a.localeCompare(b)).map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    dom.categoryFilter.value = currentFilter;

    const currentFormCat = dom.categoryInput.value;
    dom.categoryInput.innerHTML = [...categories].sort((a,b)=>a.localeCompare(b)).map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    if (currentFormCat) dom.categoryInput.value = currentFormCat;
  }

  function setFieldError(inputEl, errorEl, message) {
    inputEl.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
  }
  function clearFormErrors() {
    [dom.nameInput, dom.categoryInput, dom.priceInput, dom.qtyInput].forEach(el => el.removeAttribute('aria-invalid'));
    [dom.nameError, dom.categoryError, dom.priceError, dom.qtyError].forEach(el => el.textContent = '');
  }

  function setAriaSort() {
    dom.thName.setAttribute('aria-sort', 'none');
    dom.thPrice.setAttribute('aria-sort', 'none');
    if (state.sortBy === 'name') dom.thName.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
    if (state.sortBy === 'price') dom.thPrice.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
  }

  function initControlsFromState() {
    dom.searchInput.value = state.search || '';
    dom.categoryFilter.value = state.filterCategory || 'all';
    dom.sortBy.value = state.sortBy || 'name';
    dom.sortDir.value = state.sortDir || 'asc';
  }

  function escapeHtml(str) {
    return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function generateId() {
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      return [...buf].map(b => b.toString(16).padStart(2,'0')).join('');
    }
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }

})();
