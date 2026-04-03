// web/app.js
// Price by Size: Quote Calculator (PWA + Capacitor-friendly)
// - Adds width/height size to each cart item
// - Generates PDF via html2canvas + jsPDF
// - Two buttons: Save PDF + Share PDF
//   - Web/Desktop: Save downloads; Share uses Web Share if available
//   - Android (Capacitor): Save writes to Documents; Share uses native share sheet (Filesystem+Share)

let prices = {};
let cart = [];
let _lastAddAt = 0;
let appSettings = {};

const PRICES_KEY = 'prices_data';
const ESTIMATES_KEY = 'estimates';
const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS = {
  taxRate: 0,
  taxEnabled: false,
  minCharge: 0,
  highQualitySurcharge: 1.0,
  otherLabel: 'other',
  unitSystem: 'imperial',   // 'imperial' = ft/in/sqft | 'metric' = m/cm/sqm
  currencySymbol: '$',
};

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const raw = stored ? JSON.parse(stored) : {};
    appSettings = {
      ...DEFAULT_SETTINGS,
      ...raw,
      taxEnabled: raw.taxEnabled === true || raw.taxEnabled === 'true',
      taxRate: parseFloat(raw.taxRate) || 0,
      minCharge: parseFloat(raw.minCharge) || 0,
      highQualitySurcharge: parseFloat(raw.highQualitySurcharge) || 1.0,
      otherLabel: raw.otherLabel || 'other',
      unitSystem: raw.unitSystem === 'metric' ? 'metric' : 'imperial',
      currencySymbol: raw.currencySymbol || '$',
    };
  } catch {
    appSettings = { ...DEFAULT_SETTINGS };
  }
}

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

async function initPrices() {
  const stored = localStorage.getItem(PRICES_KEY);
  if (stored) {
    try {
      prices = JSON.parse(stored);
    } catch (err) {
      console.error('Failed to parse stored prices:', err);
      prices = await loadDefaultPrices();
    }
  } else {
    prices = await loadDefaultPrices();
    savePricesToStorage();
  }
  populateCategories();
}

function savePricesToStorage() {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
}

function populateCategories() {
  const categorySelect = document.getElementById('categorySelect');
  if (!categorySelect) return;

  categorySelect.innerHTML = '';
  Object.keys(prices)
    .filter((cat) => cat !== 'Generic')
    .sort()
    .forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    });

  populateProducts();
}

function populateProducts() {
  const categoryEl = document.getElementById('categorySelect');
  const productSelect = document.getElementById('productSelect');
  if (!categoryEl || !productSelect) return;

  const category = categoryEl.value;
  productSelect.innerHTML = '';
  Object.keys(prices[category] || {})
    .sort()
    .forEach((prod) => {
      const opt = document.createElement('option');
      opt.value = prod;
      opt.textContent = prod;
      productSelect.appendChild(opt);
    });

  updatePriceDisplay();
}

function updatePriceDisplay() {
  const category = document.getElementById('categorySelect')?.value;
  const product = document.getElementById('productSelect')?.value;
  const customer = document.getElementById('customerType')?.value;

  const price = prices[category]?.[product]?.[customer];
  const el = document.getElementById('pricePerSqft');
  if (!el) return;

  el.textContent = price ? `${cur(price)} per ${areaUnit()}` : '';
}

function calculatePrice() {
  const item = computeCurrentItem();
  if (!item) return;

  const priceEl = document.getElementById('pricePerSqft');
  if (priceEl) priceEl.textContent = `${cur(item.pricePerSqft)} per ${areaUnit()}`;

  const resultEl = document.getElementById('result');
  if (!resultEl) return;

  resultEl.innerHTML = `
    <div style="font-size: 18px; margin-top: 15px; line-height: 1.6;">
      Size: ${formatItemSize(item)}<br>
      Area: ${item.area.toFixed(2)} ${areaUnit()}<br>
      Price per ${areaUnit()}: ${cur(item.pricePerSqft)}<br>
      Price per Unit: ${cur(item.unitPrice)}${item.minChargeApplied ? ' <span style="color:#f90;font-size:13px;">(min charge applied)</span>' : ''}<br>
      Quantity: ${item.quantity}<br>
      <strong style="font-size: 20px;">Total: ${cur(item.total)}</strong>
    </div>
  `;
}

function computeCurrentItem() {
  const { widthFt, heightFt, area } = getDimensions();

  if (widthFt <= 0 || heightFt <= 0) {
    const resultEl = document.getElementById('result');
    if (resultEl) resultEl.textContent = '⚠️ Enter valid dimensions.';
    return null;
  }

  const category = document.getElementById('categorySelect')?.value;
  const product = document.getElementById('productSelect')?.value;
  const customerType = document.getElementById('customerType')?.value;
  const highQuality = Boolean(document.getElementById('highQuality')?.checked);

  const priceData = prices?.[category]?.[product];
  if (!priceData || priceData[customerType] == null) {
    const resultEl = document.getElementById('result');
    if (resultEl) resultEl.textContent = '⚠️ Price not found.';
    return null;
  }

  let pricePerSqft = parseFloat(document.getElementById('customPrice')?.value);
  if (Number.isNaN(pricePerSqft)) {
    pricePerSqft = priceData[customerType];
    if (highQuality) pricePerSqft += (appSettings.highQualitySurcharge ?? 1.0);
  }

  const quantity = parseInt(document.getElementById('quantity')?.value, 10) || 1;
  let unitPrice = area * pricePerSqft;

  // Apply minimum charge per item
  const minCharge = appSettings.minCharge ?? 0;
  if (minCharge > 0 && unitPrice < minCharge) {
    unitPrice = minCharge;
  }

  const total = unitPrice * quantity;

  return {
    category,
    product,
    customerType,
    pricePerSqft,
    quantity,
    area: area,
    unitPrice,
    total,
    widthFt,
    heightFt,
    minChargeApplied: (appSettings.minCharge > 0 && (area * pricePerSqft) < appSettings.minCharge),
  };
}

function addToCart() {
  const now = Date.now();
  if (now - _lastAddAt < 500) return;
  _lastAddAt = now;

  const item = computeCurrentItem();
  if (!item) return;

  cart.push({
    id: Date.now() + Math.random(),
    name: `${item.product} (${item.category})`,
    qty: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.total,
    widthFt: item.widthFt,
    heightFt: item.heightFt,
  });

  updateCartDisplay();
}

function updateCartDisplay() {
  const body = document.getElementById('cartBody');
  if (!body) return;

  body.innerHTML = '';
  cart.forEach((it, idx) => {
    const sizeLabel =
      typeof it.widthFt === 'number' && typeof it.heightFt === 'number'
        ? formatItemSize(it)
        : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:8px 4px; border-bottom: 1px solid #333;">
        ${escapeHtml(it.name)}
        <div style="font-size:12px;color:#aaa;margin-top:2px;">${escapeHtml(sizeLabel)}</div>
      </td>
      <td style="text-align:center; padding:8px 4px; border-bottom: 1px solid #333;">${it.qty}</td>
      <td style="text-align:right; padding:8px 4px; border-bottom: 1px solid #333;">${cur(it.unitPrice)}</td>
      <td style="text-align:right; padding:8px 4px; border-bottom: 1px solid #333;">${cur(it.subtotal)}</td>
      <td style="text-align:center; padding:8px 4px; border-bottom: 1px solid #333;">
        <button data-idx="${idx}" class="removeBtn" style="padding: 5px 10px; font-size: 12px;">✕</button>
      </td>
    `;
    body.appendChild(tr);
  });

  Array.from(document.getElementsByClassName('removeBtn')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      if (!Number.isNaN(idx)) {
        cart.splice(idx, 1);
        updateCartDisplay();
      }
    });
  });

  updateCartTotals();
}

function updateCartTotals() {
  const totalsEl = document.getElementById('cartTotals');
  if (!totalsEl) return;

  let discount = parseFloat(document.getElementById('discountPercent')?.value) || 0;
  discount = Math.min(Math.max(discount, 0), 100);

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const discountAmount = subtotal * (discount / 100);
  const afterDiscount = subtotal - discountAmount;

  const taxEnabled = appSettings.taxEnabled && appSettings.taxRate > 0;
  const taxAmount = taxEnabled ? afterDiscount * (appSettings.taxRate / 100) : 0;
  const total = afterDiscount + taxAmount;

  totalsEl.innerHTML = `
    Subtotal: ${cur(subtotal)}<br>
    ${discount > 0 ? `Discount: ${discount.toFixed(2)}% (-${cur(discountAmount)})<br>` : ''}
    ${taxEnabled ? `Tax (${appSettings.taxRate.toFixed(2)}%): ${cur(taxAmount)}<br>` : ''}
    <strong>Grand Total: ${cur(total)}</strong>
  `;
}

function clearCart() {
  cart = [];
  updateCartDisplay();
}

function clearForm() {
  ['widthFeet', 'widthInches', 'heightFeet', 'heightInches', 'customPrice', 'quantity'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const resultEl = document.getElementById('result');
  if (resultEl) resultEl.textContent = '';

  const priceEl = document.getElementById('pricePerSqft');
  if (priceEl) priceEl.textContent = '';

  const hq = document.getElementById('highQuality');
  if (hq) hq.checked = false;
}

function bindUI() {
  document.getElementById('categorySelect')?.addEventListener('change', populateProducts);
  document.getElementById('productSelect')?.addEventListener('change', updatePriceDisplay);
  document.getElementById('customerType')?.addEventListener('change', updatePriceDisplay);
  document.getElementById('calculateBtn')?.addEventListener('click', calculatePrice);

  document.getElementById('addToCartBtn')?.addEventListener('click', () => {
    calculatePrice();
    addToCart();
  });

  document.getElementById('clearCartBtn')?.addEventListener('click', clearCart);
  document.getElementById('discountPercent')?.addEventListener('input', updateCartTotals);

  document.getElementById('savePdfBtn')?.addEventListener('click', () => exportCart({ mode: 'save' }));
  document.getElementById('sharePdfBtn')?.addEventListener('click', () => exportCart({ mode: 'share' }));

  configureShareButtonVisibility();
}

function applyOtherLabel() {
  const label = appSettings.otherLabel || 'other';
  const opt = document.querySelector('#customerType option[value="church"]');
  if (opt) opt.textContent = label;
}

function applyUnitLabels() {
  const metric = isMetric();
  const sym = appSettings.currencySymbol || '$';

  // Width/Height placeholders
  const wFeet   = document.getElementById('widthFeet');
  const wInches = document.getElementById('widthInches');
  const hFeet   = document.getElementById('heightFeet');
  const hInches = document.getElementById('heightInches');
  if (wFeet)   wFeet.placeholder   = metric ? 'meters' : 'feet';
  if (wInches) wInches.placeholder = metric ? 'cm' : 'inches';
  if (hFeet)   hFeet.placeholder   = metric ? 'meters' : 'feet';
  if (hInches) hInches.placeholder = metric ? 'cm' : 'inches';

  // Width/Height labels
  const wLabel = document.getElementById('widthLabel');
  const hLabel = document.getElementById('heightLabel');
  if (wLabel) wLabel.textContent = metric ? 'Width (m + cm):' : 'Width:';
  if (hLabel) hLabel.textContent = metric ? 'Height (m + cm):' : 'Height:';

  // HQ surcharge label
  const hqLabel = document.getElementById('hqSurchargeLabel');
  if (hqLabel) hqLabel.textContent = `+${sym}${(appSettings.highQualitySurcharge ?? 1).toFixed(2)}`;

  // HQ surcharge unit
  const hqUnit = document.getElementById('hqSurchargeUnit');
  if (hqUnit) hqUnit.textContent = `/${areaUnit()}`;

  // Custom price label
  const cpLabel = document.getElementById('customPriceLabel');
  if (cpLabel) cpLabel.textContent = `Custom Price per ${areaUnit()} (optional):`;
}

window.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  await initPrices();
  bindUI();
  applyOtherLabel();
  applyUnitLabels();
});

async function exportCart({ mode = 'save' } = {}) {
  if (!cart.length) {
    const item = computeCurrentItem();
    if (!item) return;
    addToCart();
  }

  const clientName = document.getElementById('clientName')?.value.trim() || 'Untitled';
  let discount = parseFloat(document.getElementById('discountPercent')?.value) || 0;
  discount = Math.min(Math.max(discount, 0), 100);

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const discountAmount = subtotal * (discount / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxEnabled = appSettings.taxEnabled && appSettings.taxRate > 0;
  const taxAmount = taxEnabled ? afterDiscount * (appSettings.taxRate / 100) : 0;
  const total = afterDiscount + taxAmount;

  const estimateData = {
    id: Date.now(),
    clientName,
    createdAt: new Date().toISOString(),
    items: cart,
    subtotal,
    discountPercent: discount,
    discountAmount,
    taxRate: appSettings.taxEnabled ? (appSettings.taxRate ?? 0) : 0,
    taxAmount,
    total,
  };

  const estimates = JSON.parse(localStorage.getItem(ESTIMATES_KEY) || '[]');
  estimates.push(estimateData);
  localStorage.setItem(ESTIMATES_KEY, JSON.stringify(estimates));

  const resultEl = document.getElementById('result');

  const html2canvas = window.html2canvas;
  const jsPDF = window.jsPDF || window.jspdf?.jsPDF || window.jspdf?.default;

  if (typeof html2canvas !== 'function' || typeof jsPDF !== 'function') {
    if (resultEl) resultEl.textContent = '⚠️ PDF libs not loaded. Add vendor/html2canvas + vendor/jspdf scripts.';
    return;
  }

  const node = buildEstimateNode({
    clientName,
    items: cart,
    subtotal,
    discount,
    discountAmount,
    taxRate: taxEnabled ? appSettings.taxRate : 0,
    taxAmount,
    total,
    createdAt: new Date(),
  });

  const mount = mountHidden(node);

  try {
    await waitForFontsAndImages(mount);

    const canvas = await html2canvas(mount, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      allowTaint: false,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const pxToMm = (px) => (px * 25.4) / 96;
    const canvasWidthMm = pxToMm(canvas.width);
    const canvasHeightMm = pxToMm(canvas.height);

    const scale = pageWidth / canvasWidthMm;
    const scaledHeight = canvasHeightMm * scale;

    let y = 0;
    let pageIndex = 0;

    while (y < scaledHeight - 0.01) {
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -y, pageWidth, scaledHeight, undefined, 'FAST');
      y += pageHeight;
      pageIndex += 1;
    }

    const safeName = clientName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    const filename = `estimate-${safeName || 'client'}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const shareText = `Estimate for ${clientName} — Total ${cur(total)}`;

    if (mode === 'share') {
      // Share button: always open the share sheet
      const ok = await sharePdf({ pdf, filename, title: filename, text: shareText });
      if (!ok) pdf.save(filename); // fallback to download if share fails
    } else {
      // Save button
      if (isCapacitorNative()) {
        // Android: save directly to Documents folder
        const ok = await savePdfNativeToDocuments(pdf, filename);
        if (!ok) {
          // If Documents write fails, fall back to share sheet
          await sharePdf({ pdf, filename, title: filename, text: shareText });
        }
      } else {
        // Desktop/web: browser download
        pdf.save(filename);
      }
    }

    if (resultEl) {
      resultEl.textContent =
        mode === 'share'
          ? `✅ Share opened for "${clientName}"`
          : `✅ Saved "${filename}"`;
    }
  } catch (err) {
    console.error('PDF generation error:', err);
    if (resultEl) resultEl.textContent = `✅ Estimate saved for "${clientName}" (PDF failed — retry)`;
  } finally {
    mount.remove();
  }
}

function buildEstimateNode({ clientName, items, subtotal, discount, discountAmount, taxRate, taxAmount, total, createdAt }) {
  const wrap = document.createElement('div');
  wrap.style.width = '210mm';
  wrap.style.padding = '16px';
  wrap.style.background = '#fff';
  wrap.style.color = '#111';
  wrap.style.fontFamily = 'Arial, sans-serif';

  const title = document.createElement('h2');
  title.textContent = `Estimate for ${clientName}`;
  title.style.margin = '0 0 8px 0';
  title.style.paddingBottom = '8px';
  title.style.borderBottom = '2px solid #111';
  wrap.appendChild(title);

  const meta = document.createElement('div');
  meta.textContent = `Date: ${createdAt.toLocaleDateString()} ${createdAt.toLocaleTimeString()}`;
  meta.style.fontSize = '12px';
  meta.style.marginTop = '6px';
  wrap.appendChild(meta);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.marginTop = '12px';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th style="text-align:left; padding:8px; border-bottom:1px solid #ddd; background:#f5f5f5;">Item</th>
      <th style="text-align:left; padding:8px; border-bottom:1px solid #ddd; background:#f5f5f5;">Size (W×H)</th>
      <th style="text-align:center; padding:8px; border-bottom:1px solid #ddd; background:#f5f5f5;">Qty</th>
      <th style="text-align:right; padding:8px; border-bottom:1px solid #ddd; background:#f5f5f5;">Unit Price</th>
      <th style="text-align:right; padding:8px; border-bottom:1px solid #ddd; background:#f5f5f5;">Subtotal</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  items.forEach((it) => {
    const sizeLabel =
      typeof it.widthFt === 'number' && typeof it.heightFt === 'number'
        ? formatItemSize(it)
        : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:8px; border-bottom:1px solid #eee;">${escapeHtml(it.name)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee;">${escapeHtml(sizeLabel)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${it.qty}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${cur(it.unitPrice)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${cur(it.subtotal)}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  const totals = document.createElement('div');
  totals.style.marginTop = '12px';
  totals.style.fontSize = '14px';
  totals.innerHTML = `
    <div>Subtotal: ${cur(subtotal)}</div>
    ${discount > 0 ? `<div>Discount: ${discount.toFixed(2)}% (-${cur(discountAmount)})</div>` : ''}
    ${taxRate > 0 ? `<div>Tax (${taxRate.toFixed(2)}%): ${cur(taxAmount)}</div>` : ''}
    <div style="font-weight:bold; font-size:16px; margin-top:6px;">Grand Total: ${cur(total)}</div>
  `;
  wrap.appendChild(totals);

  const footer = document.createElement('div');
  footer.textContent = 'Generated by Price Calculator';
  footer.style.fontSize = '12px';
  footer.style.color = '#666';
  footer.style.marginTop = '12px';
  wrap.appendChild(footer);

  return wrap;
}

function mountHidden(node) {
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-100000px';
  holder.style.top = '0';
  holder.style.width = '210mm';
  holder.style.background = '#fff';
  holder.appendChild(node);
  document.body.appendChild(holder);
  return holder;
}

async function waitForFontsAndImages(root) {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {}

  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.race([
    Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.onload = r;
              img.onerror = r;
            })
      )
    ),
    new Promise((r) => setTimeout(r, 2000)),
  ]);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function isMetric() { return appSettings.unitSystem === 'metric'; }
function cur(amount) { return `${appSettings.currencySymbol || '$'}${amount.toFixed(2)}`; }
function areaUnit() { return isMetric() ? 'sqm' : 'sqft'; }
function formatSize(primaryVal, secondaryVal) {
  // imperial: primaryVal=feet, secondaryVal=inches
  // metric: primaryVal=meters, secondaryVal=cm
  if (isMetric()) {
    const totalCm = primaryVal * 100 + secondaryVal;
    const m = Math.floor(totalCm / 100);
    const cm = Math.round(totalCm % 100);
    return cm > 0 ? `${m}m ${cm}cm` : `${m}m`;
  }
  return formatFeetInches(primaryVal + secondaryVal / 12);
}
function getDimensions() {
  if (isMetric()) {
    const wMeters  = parseFloat(document.getElementById('widthFeet')?.value)   || 0;
    const wCm      = parseFloat(document.getElementById('widthInches')?.value)  || 0;
    const hMeters  = parseFloat(document.getElementById('heightFeet')?.value)   || 0;
    const hCm      = parseFloat(document.getElementById('heightInches')?.value) || 0;
    const widthM   = wMeters + wCm / 100;
    const heightM  = hMeters + hCm / 100;
    return { widthFt: widthM, heightFt: heightM, area: widthM * heightM };
  }
  const wFt  = parseFloat(document.getElementById('widthFeet')?.value)   || 0;
  const wIn  = parseFloat(document.getElementById('widthInches')?.value)  || 0;
  const hFt  = parseFloat(document.getElementById('heightFeet')?.value)   || 0;
  const hIn  = parseFloat(document.getElementById('heightInches')?.value) || 0;
  const widthFt  = wFt + wIn / 12;
  const heightFt = hFt + hIn / 12;
  return { widthFt, heightFt, area: widthFt * heightFt };
}
function formatItemSize(item) {
  if (isMetric()) {
    // widthFt/heightFt stored as meters when metric
    const wm = item.widthFt, hm = item.heightFt;
    const formatM = v => {
      const m = Math.floor(v); const cm = Math.round((v - m) * 100);
      return cm > 0 ? `${m}m ${cm}cm` : `${m}m`;
    };
    return `${formatM(wm)} × ${formatM(hm)}`;
  }
  return `${formatFeetInches(item.widthFt)} × ${formatFeetInches(item.heightFt)}`;
}

function formatFeetInches(feetFloat) {
  if (!Number.isFinite(feetFloat)) return '—';
  const totalIn = Math.round(feetFloat * 12);
  const ft = Math.floor(totalIn / 12);
  const inch = Math.abs(totalIn % 12);
  return `${ft}' ${inch}"`;
}

// ---------- Capacitor + Share helpers ----------

function isCapacitorNative() {
  const cap = window.Capacitor;
  if (!cap) return false;

  if (typeof cap.isNativePlatform === 'function') {
    return cap.isNativePlatform();
  }

  if (typeof cap.getPlatform === 'function') {
    return cap.getPlatform() !== 'web';
  }

  // last resort: assume not native
  return false;
}

function configureShareButtonVisibility() {
  const btn = document.getElementById('sharePdfBtn');
  if (!btn) return;

  // Only show on actual native Capacitor app (Android/iOS)
  // Desktop browsers may have navigator.share but we don't want it there
  const show = isCapacitorNative();
  btn.style.display = show ? 'inline-block' : 'none';
}


async function savePdfNativeToDocuments(pdf, filename) {
  try {
    const cap = window.Capacitor;
    const Filesystem = cap?.Plugins?.Filesystem;
    if (!Filesystem) {
      console.log('savePdfNativeToDocuments: Filesystem plugin missing');
      return false;
    }

    const blob = pdf.output('blob');
    const data = await blobToBase64Data(blob);

    await Filesystem.writeFile({
      path: filename,
      data,
      directory: "DOCUMENTS", // ✅ use string
      recursive: true,
    });

    console.log('savePdfNativeToDocuments: saved', filename);
    return true;
  } catch (e) {
    console.warn('savePdfNativeToDocuments failed:', e);
    return false;
  }
}

async function sharePdf({ pdf, filename, title, text }) {
  // Native share (Capacitor)
  if (isCapacitorNative()) {
    try {
      const cap = window.Capacitor;
      const Filesystem = cap?.Plugins?.Filesystem;
      const Share = cap?.Plugins?.Share;

      if (!Filesystem || !Share) {
        console.log('sharePdf missing plugins', { Filesystem: !!Filesystem, Share: !!Share });
        return false;
      }

      const blob = pdf.output('blob');
      const data = await blobToBase64Data(blob);

      const writeRes = await Filesystem.writeFile({
        path: filename,
        data,
        directory: "CACHE", // ✅ use string
        recursive: true,
      });

      // Some Android versions need file://
      let uri = writeRes?.uri || '';
      if (uri && !uri.startsWith('file://')) uri = 'file://' + uri;

      await Share.share({
        title,
        text,
        url: uri,
        dialogTitle: 'Share Estimate PDF',
      });

      console.log('sharePdf: shared', uri);
      return true;
    } catch (e) {
      console.warn('Native share failed:', e);
      return false;
    }
  }

  // Web Share API (browser fallback)
  try {
    const blob = pdf.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ title, text, files: [file] });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// helper you already have (keep it)
function blobToBase64Data(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}