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
  if (el1) el1.textContent = `${label} Price ($/sqft):`;
  if (el2) el2.textContent = `${label} Price ($/sqft):`;
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

// ── Boot: wire everything up after DOM is ready ───────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Existing price editor
  document.getElementById('categorySelect').addEventListener('change', populateProducts);
  document.getElementById('productSelect').addEventListener('change', updatePriceFields);

  document.getElementById('saveBtn').addEventListener('click', () => {
    const cat  = document.getElementById('categorySelect').value;
    const prod = document.getElementById('productSelect').value;
    if (!cat || !prod) return;
    prices[cat][prod] = {
      broker:   parseFloat(document.getElementById('brokerPrice').value)   || 0,
      customer: parseFloat(document.getElementById('customerPrice').value) || 0,
      church:   parseFloat(document.getElementById('churchPrice').value)   || 0,
    };
    savePrices();
    showStatus('✅ Prices saved!');
  });

  document.getElementById('deleteProductBtn').addEventListener('click', () => {
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

  document.getElementById('confirmAddProductBtn').addEventListener('click', async () => {
    const newCat  = document.getElementById('newCategoryInput').value.trim();
    const newProd = document.getElementById('newProductInput').value.trim();
    if (!newProd) { showStatus('⚠️ Please enter a Product name'); return; }
    const category = newCat || document.getElementById('categorySelectForAdd').value;
    if (!category) { showStatus('⚠️ Please select or enter a Category'); return; }

    if (!prices[category]) prices[category] = {};
    prices[category][newProd] = {
      broker:   parseFloat(document.getElementById('newBrokerPrice').value)   || 1,
      customer: parseFloat(document.getElementById('newCustomerPrice').value) || 5,
      church:   parseFloat(document.getElementById('newChurchPrice').value)   || 3,
    };
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

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('⚠️ This will reset all prices to defaults. Are you sure?')) {
      prices = await loadDefaultPrices();
      savePrices();
      showStatus('🔄 Prices reset to defaults');
      loadPrices();
    }
  });

  // Quote settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveQuoteSettings);

  // Export prices
  document.getElementById('exportPricesBtn').addEventListener('click', async () => {
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
  document.getElementById('importPricesBtn').addEventListener('click', () => {
    document.getElementById('importPricesFile').click();
  });

  document.getElementById('importPricesFile').addEventListener('change', (e) => {
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
