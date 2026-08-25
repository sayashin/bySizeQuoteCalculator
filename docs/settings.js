// settings.js
let prices = {};
const PRICES_KEY = 'prices_data';
const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS = {
  taxRate: 0,
  taxEnabled: false,
  minCharge: 0,
  highQualitySurcharge: 1.0,
  otherLabel: 'other',
  unitSystem: 'imperial',
  currencySymbol: '$',
};

// ── Prices helpers ────────────────────────────────────────────────────────────

async function loadDefaultPrices() {
  try {
    const response = await fetch('prices.json');
    if (!response.ok) throw new Error('Failed to load prices.json');
    return await response.json();
  } catch (err) {
    console.warn('Failed to load prices.json:', err);
    return {};
  }
}

async function loadPrices() {
  const stored = localStorage.getItem(PRICES_KEY);
  if (stored) {
    try { prices = JSON.parse(stored); }
    catch (err) { prices = await loadDefaultPrices(); }
  } else {
    prices = await loadDefaultPrices();
  }
  populateCategories();
}

function savePrices() {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
}

function populateCategories() {
  const catSel = document.getElementById('categorySelect');
  const catSelAdd = document.getElementById('categorySelectForAdd');
  catSel.innerHTML = '';
  catSelAdd.innerHTML = '';
  Object.keys(prices).sort().forEach(cat => {
    [catSel, catSelAdd].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
  });
  populateProducts();
}

function populateProducts() {
  const cat = document.getElementById('categorySelect').value;
  const prodSel = document.getElementById('productSelect');
  prodSel.innerHTML = '';
  if (!cat || !prices[cat]) return;
  Object.keys(prices[cat]).sort().forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod;
    opt.textContent = prod;
    prodSel.appendChild(opt);
  });
  updatePriceFields();
}

function updatePriceFields() {
  const cat = document.getElementById('categorySelect').value;
  const prod = document.getElementById('productSelect').value;
  const data = cat && prod && prices[cat] && prices[cat][prod];
  document.getElementById('brokerPrice').value   = data ? (data.broker   ?? '') : '';
  document.getElementById('customerPrice').value = data ? (data.customer ?? '') : '';
  document.getElementById('churchPrice').value   = data ? (data.church   ?? '') : '';

  const modeEl = document.getElementById('pricingMode');
  if (modeEl) modeEl.value = data && data.mode === 'unit' ? 'unit' : 'area';
  refreshPriceLabels();
}

// ── Pricing mode (area vs unit) ───────────────────────────────────────────────

// Unit shown next to the three price inputs, e.g. "($/sqft)" or "($/unit)".
function priceUnitSuffix(mode) {
  return mode === 'unit' ? 'unit' : (isMetricUnits() ? 'sqm' : 'sqft');
}

function isMetricUnits() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return raw.unitSystem === 'metric';
  } catch { return false; }
}

function currencySym() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return raw.currencySymbol || '$';
  } catch { return '$'; }
}

// Keep the Edit-price and Add-product labels in step with the selected mode.
function refreshPriceLabels() {
  const sym = currencySym();

  const editMode = document.getElementById('pricingMode')?.value || 'area';
  const editSuffix = `(${sym}/${priceUnitSuffix(editMode)})`;
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('brokerPriceLabel',   `Broker ${editSuffix}`);
  setText('customerPriceLabel', `Customer ${editSuffix}`);

  const otherLabel = document.getElementById('churchPriceLabel');
  if (otherLabel) {
    const base = otherLabel.dataset.baseLabel || 'Other';
    otherLabel.textContent = `${base} ${editSuffix}`;
  }

  const addMode = document.getElementById('newPricingMode')?.value || 'area';
  const addSuffix = `(${sym}/${priceUnitSuffix(addMode)})`;
  setText('newBrokerPriceLabel',   `Broker ${addSuffix}`);
  setText('newCustomerPriceLabel', `Customer ${addSuffix}`);

  const newOtherLabel = document.getElementById('newChurchPriceLabel');
  if (newOtherLabel) {
    const base = newOtherLabel.dataset.baseLabel || 'Other';
    newOtherLabel.textContent = `${base} ${addSuffix}`;
  }
}

// New products inherit the mode already used in the chosen category.
function inheritModeForCategory(category) {
  const products = category && prices[category] ? Object.values(prices[category]) : [];
  if (!products.length) return 'area';
  const unitCount = products.filter(p => p && p.mode === 'unit').length;
  return unitCount > products.length / 2 ? 'unit' : 'area';
}

// Briefly highlight and focus a field the user needs to fill in, so a rejected
// action is obvious even if the status toast is missed.
function flagField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const original = el.style.borderColor;
  el.style.borderColor = '#c94';
  try { el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); } catch {}
  try { el.focus?.({ preventScroll: true }); } catch { try { el.focus?.(); } catch {} }
  setTimeout(() => { el.style.borderColor = original; }, 2000);
}

function showStatus(msg, delay = 2500) {
  const el = document.getElementById('status');
  if (el) {
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, delay);
  }
}

// ── Quote Settings helpers ────────────────────────────────────────────────────

function loadQuoteSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const s = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
    document.getElementById('minChargeInput').value    = s.minCharge ?? 0;
    document.getElementById('hqSurchargeInput').value  = s.highQualitySurcharge ?? 1.0;
    document.getElementById('taxRateInput').value      = s.taxRate ?? 0;
    document.getElementById('taxEnabledInput').checked = !!s.taxEnabled;
    document.getElementById('otherLabelInput').value   = s.otherLabel || 'other';
    document.getElementById('unitSystemInput').value   = s.unitSystem || 'imperial';
    document.getElementById('currencySymbolInput').value = s.currencySymbol || '$';
    applyOtherLabelToSettings(s.otherLabel || 'other');
  } catch(e) {
    console.warn('loadQuoteSettings failed:', e);
  }
}

function applyOtherLabelToSettings(label) {
  const el1 = document.getElementById('churchPriceLabel');
  const el2 = document.getElementById('newChurchPriceLabel');
  // Store the base name; refreshPriceLabels appends the right unit for the mode.
  if (el1) el1.dataset.baseLabel = label;
  if (el2) el2.dataset.baseLabel = label;
  refreshPriceLabels();
}

function saveQuoteSettings() {
  const label = (document.getElementById('otherLabelInput').value.trim() || 'other').toLowerCase();
  const s = {
    minCharge:            parseFloat(document.getElementById('minChargeInput').value)      || 0,
    highQualitySurcharge: parseFloat(document.getElementById('hqSurchargeInput').value)    || 1.0,
    taxRate:              parseFloat(document.getElementById('taxRateInput').value)         || 0,
    taxEnabled:           document.getElementById('taxEnabledInput').checked,
    otherLabel:           label,
    unitSystem:           document.getElementById('unitSystemInput').value || 'imperial',
    currencySymbol:       document.getElementById('currencySymbolInput').value.trim() || '$',
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  applyOtherLabelToSettings(label);
  showStatus('✅ Quote settings saved!');
}


// Binds a listener only if the element exists, and reports it instead of
// throwing — a single missing element used to abort the whole boot, which
// left every button on the page dead with no visible error.
function on(id, evt, fn) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`[settings] element #${id} not found — "${evt}" not bound`);
    return null;
  }
  el.addEventListener(evt, fn);
  return el;
}


// ─────────────────────────────────────────────────────────────────────────────
// CSV price import
//
// Expected columns (matched by header NAME, so order doesn't matter):
//   Category | Product | Broker | Customer | Other | Mode
// Empty cells mean "leave as is", which is why this merges rather than replaces.
// ─────────────────────────────────────────────────────────────────────────────

// Excel writes ; in many locales and \t when saving as "Unicode text", so the
// delimiter is detected from the header line instead of assumed to be a comma.
function detectDelimiter(headerLine) {
  const counts = [
    [',',  (headerLine.match(/,/g)  || []).length],
    [';',  (headerLine.match(/;/g)  || []).length],
    ['\t', (headerLine.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

// Minimal RFC-4180 parser: handles quoted fields, delimiters and newlines
// inside quotes, and "" as an escaped quote.
function parseCSV(text, delimiter) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  row.push(field);
  rows.push(row);

  // Drop trailing blank lines
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// Accepts "2.42", "$2.42", "1,234.56" and "2,42" (comma decimal).
// Returns null for blank or unparseable input so the caller can tell
// "leave unchanged" apart from "the value is zero".
function parsePriceCell(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;

  s = s.replace(/[^\d.,\-]/g, '');           // strip currency symbols and spaces
  if (s === '' || s === '-') return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // Whichever separator comes last is the decimal one
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    // "1,234" is thousands; "2,42" is a decimal
    s = (parts.length === 2 && parts[1].length !== 3)
      ? s.replace(',', '.')
      : s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// Maps many reasonable header spellings onto our internal keys.
function matchHeaders(headerRow) {
  const norm = h => String(h).replace(/^\uFEFF/, '').trim().toLowerCase();
  const alias = {
    category: 'category', categoria: 'category', 'categoría': 'category',
    product: 'product', producto: 'product', item: 'product', name: 'product', nombre: 'product',
    broker: 'broker', mayorista: 'broker',
    customer: 'customer', client: 'customer', cliente: 'customer', retail: 'customer',
    other: 'church', otro: 'church', church: 'church', nonprofit: 'church',
    mode: 'mode', modo: 'mode', type: 'mode', tipo: 'mode',
  };

  const map = {};
  headerRow.forEach((h, i) => {
    const key = alias[norm(h)];
    if (key && map[key] === undefined) map[key] = i;
  });
  return map;
}

// Merges CSV rows into `prices`. Returns a report instead of throwing so the
// caller can show what happened without losing the good rows.
function importPricesFromCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');

  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const rows = parseCSV(text, detectDelimiter(firstLine));

  if (rows.length < 2) {
    return { ok: false, error: 'The file has no data rows.' };
  }

  const cols = matchHeaders(rows[0]);
  const missing = ['category', 'product'].filter(k => cols[k] === undefined);
  if (missing.length) {
    return { ok: false, error: `Missing required column(s): ${missing.join(', ')}. Expected headers: Category, Product, Broker, Customer, Other, Mode.` };
  }

  const cell = (row, key) => cols[key] === undefined ? '' : String(row[cols[key]] ?? '').trim();

  let added = 0, updated = 0;
  const skipped = [];      // spreadsheet line numbers
  const zeroed = [];       // new products left at 0 by blank prices
  let lastCategory = '';

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;    // header is line 1
    const row = rows[r];

    const category = cell(row, 'category') || lastCategory;
    const product  = cell(row, 'product');

    if (!category || !product) { skipped.push(line); continue; }
    lastCategory = category;

    if (!prices[category]) prices[category] = {};
    const existing = prices[category][product];
    const entry = existing ? { ...existing } : { broker: 0, customer: 0, church: 0 };

    for (const key of ['broker', 'customer', 'church']) {
      const val = parsePriceCell(cell(row, key));
      if (val !== null) entry[key] = val;
      else if (!existing) entry[key] = 0;
    }

    const modeCell = cell(row, 'mode').toLowerCase();
    if (modeCell === 'unit' || modeCell === 'unidad' || modeCell === 'cantidad') entry.mode = 'unit';
    else if (modeCell !== '') delete entry.mode;   // an explicit non-unit value means per-area

    prices[category][product] = entry;

    if (existing) updated++; else {
      added++;
      if (!entry.broker && !entry.customer && !entry.church) zeroed.push(product);
    }
  }

  if (!added && !updated) {
    return { ok: false, error: 'No valid rows found. Check that Category and Product are filled in.' };
  }

  savePrices();
  return { ok: true, added, updated, skipped, zeroed };
}

// A starter file matching the expected format, filled with current prices.
function buildPricesCSV() {
  const esc = v => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = ['Category,Product,Broker,Customer,Other,Mode'];
  Object.keys(prices).sort().forEach(cat => {
    Object.keys(prices[cat]).sort().forEach(prod => {
      const p = prices[cat][prod] || {};
      lines.push([
        esc(cat), esc(prod),
        p.broker ?? 0, p.customer ?? 0, p.church ?? 0,
        p.mode === 'unit' ? 'unit' : 'area',
      ].join(','));
    });
  });
  return lines.join('\r\n');
}

// ── Boot: wire everything up after DOM is ready ───────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Existing price editor
  on('categorySelect', 'change', populateProducts);
  on('productSelect', 'change', updatePriceFields);

  // Pricing mode selects
  on('pricingMode', 'change', refreshPriceLabels);
  on('newPricingMode', 'change', refreshPriceLabels);

  // A new product starts in whatever mode the chosen category already uses
  on('categorySelectForAdd', 'change', (e) => {
    const modeEl = document.getElementById('newPricingMode');
    if (modeEl) modeEl.value = inheritModeForCategory(e.target.value);
    refreshPriceLabels();
  });

  on('saveBtn', 'click', () => {
    const cat  = document.getElementById('categorySelect').value;
    const prod = document.getElementById('productSelect').value;
    if (!cat || !prod) return;
    const entry = {
      broker:   parseFloat(document.getElementById('brokerPrice').value)   || 0,
      customer: parseFloat(document.getElementById('customerPrice').value) || 0,
      church:   parseFloat(document.getElementById('churchPrice').value)   || 0,
    };
    // Only written when priced per unit, so area products keep their original shape.
    if (document.getElementById('pricingMode')?.value === 'unit') entry.mode = 'unit';
    prices[cat][prod] = entry;
    savePrices();
    showStatus('✅ Prices saved!');
  });

  on('deleteProductBtn', 'click', () => {
    const cat  = document.getElementById('categorySelect').value;
    const prod = document.getElementById('productSelect').value;
    if (cat && prod && prices[cat]?.[prod]) {
      if (confirm(`🗑️ Are you sure you want to delete "${prod}"?`)) {
        delete prices[cat][prod];
        if (Object.keys(prices[cat]).length === 0) delete prices[cat];
        savePrices();
        showStatus(`🗑️ Deleted "${prod}"`);
        loadPrices();
      }
    }
  });

  on('confirmAddProductBtn', 'click', async () => {
    const newCat  = document.getElementById('newCategoryInput').value.trim();
    const newProd = document.getElementById('newProductInput').value.trim();
    if (!newProd) {
      showStatus('⚠️ Please enter a Product name');
      flagField('newProductInput');
      return;
    }
    const category = newCat || document.getElementById('categorySelectForAdd').value;
    if (!category) {
      showStatus('⚠️ Please select or enter a Category');
      flagField('newCategoryInput');
      return;
    }

    if (!prices[category]) prices[category] = {};
    const newEntry = {
      broker:   parseFloat(document.getElementById('newBrokerPrice').value)   || 1,
      customer: parseFloat(document.getElementById('newCustomerPrice').value) || 5,
      church:   parseFloat(document.getElementById('newChurchPrice').value)   || 3,
    };
    if (document.getElementById('newPricingMode')?.value === 'unit') newEntry.mode = 'unit';
    prices[category][newProd] = newEntry;
    savePrices();
    showStatus(`✅ Added "${newProd}" under "${category}"`);

    document.getElementById('newCategoryInput').value  = '';
    document.getElementById('newProductInput').value   = '';
    document.getElementById('newBrokerPrice').value    = '1';
    document.getElementById('newCustomerPrice').value  = '5';
    document.getElementById('newChurchPrice').value    = '3';

    await loadPrices();
    document.getElementById('categorySelect').value = category;
    populateProducts();
    document.getElementById('productSelect').value = newProd;
    updatePriceFields();
  });

  on('resetBtn', 'click', async () => {
    if (confirm('⚠️ This will reset all prices to defaults. Are you sure?')) {
      prices = await loadDefaultPrices();
      savePrices();
      showStatus('🔄 Prices reset to defaults');
      loadPrices();
    }
  });

  // Quote settings
  on('saveSettingsBtn', 'click', saveQuoteSettings);

  // Export prices
  on('exportPricesBtn', 'click', async () => {
    const json     = JSON.stringify(prices, null, 2);
    const filename = `prices-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const cap        = window.Capacitor;
    const isNative   = !!(cap && typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : cap?.getPlatform?.() !== 'web');
    const Filesystem = cap?.Plugins?.Filesystem;
    const Share      = cap?.Plugins?.Share;

    if (isNative && Filesystem && Share) {
      // Android: write to CACHE then share so user can save wherever they want
      try {
        const writeRes = await Filesystem.writeFile({
          path: filename,
          data: btoa(unescape(encodeURIComponent(json))), // utf-8 safe base64
          directory: 'CACHE',
          recursive: true,
        });
        let uri = writeRes?.uri || '';
        if (uri && !uri.startsWith('file://')) uri = 'file://' + uri;
        await Share.share({
          title: filename,
          text: 'Price Calculator — prices backup',
          url: uri,
          dialogTitle: 'Save prices backup',
        });
        showStatus('📤 Share sheet opened — save the file wherever you like');
      } catch (err) {
        showStatus(`⚠️ Export failed: ${err.message}`);
      }
    } else {
      // Desktop/web: normal browser download
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('⬇️ Prices exported!');
    }
  });

  // Import prices
  on('importPricesBtn', 'click', () => {
    document.getElementById('importPricesFile').click();
  });

  on('importCsvBtn', 'click', () => {
    document.getElementById('importCsvFile')?.click();
  });

  on('downloadCsvTemplateBtn', 'click', () => {
    try {
      const blob = new Blob([buildPricesCSV()], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prices-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus('\u2705 Template downloaded');
    } catch (err) {
      showStatus(`\u26a0\ufe0f Could not create the template: ${err.message}`);
    }
  });

  on('importCsvFile', 'change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      let report;
      try {
        report = importPricesFromCSV(evt.target.result);
      } catch (err) {
        showStatus(`\u26a0\ufe0f Import failed: ${err.message}`);
        return;
      }

      if (!report.ok) { showStatus(`\u26a0\ufe0f ${report.error}`, 6000); return; }

      const bits = [];
      if (report.added)   bits.push(`${report.added} added`);
      if (report.updated) bits.push(`${report.updated} updated`);
      if (report.skipped.length) {
        const shown = report.skipped.slice(0, 5).join(', ');
        const more = report.skipped.length > 5 ? `\u2026 +${report.skipped.length - 5}` : '';
        bits.push(`${report.skipped.length} row(s) skipped (line ${shown}${more})`);
      }
      if (report.zeroed.length) {
        bits.push(`${report.zeroed.length} new product(s) left at 0: ${report.zeroed.slice(0, 3).join(', ')}`);
      }

      showStatus(`\u2705 ${bits.join(' \u00b7 ')}`, 7000);
      setTimeout(() => { loadPrices(); }, 100);
    };
    reader.onerror = () => showStatus('\u26a0\ufe0f Could not read the file. Please try again.');
    reader.readAsText(file);
    e.target.value = '';
  });

  on('importPricesFile', 'change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use FileReader instead of file.text() — supported on all Android versions
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const imported = JSON.parse(text);
        if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid format');
        if (confirm('⬆️ This will replace all current prices with the imported file. Continue?')) {
          prices = imported;
          // Save first, then wait a tick before reloading UI to ensure write is flushed
          localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
          showStatus('✅ Prices imported successfully!', 3000);
          // Small delay to let localStorage flush before re-reading
          setTimeout(() => { loadPrices(); }, 100);
        }
      } catch (err) {
        showStatus(`⚠️ Import failed: ${err.message}`);
      }
    };
    reader.onerror = () => {
      showStatus('⚠️ Could not read file. Please try again.');
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Initialize data
  loadPrices();
  loadQuoteSettings();
});
