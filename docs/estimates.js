// web/estimates.js
// Saved Estimates list + Delete + Clear All
// Adds: Save PDF + Share PDF (Capacitor-native + Web fallback)

const ESTIMATES_KEY = 'estimates';

function getEstimatesSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('app_settings') || '{}');
    return {
      currencySymbol: raw.currencySymbol || '$',
      unitSystem: raw.unitSystem || 'imperial',
    };
  } catch { return { currencySymbol: '$', unitSystem: 'imperial' }; }
}
function estCur(amount) {
  const sym = getEstimatesSettings().currencySymbol;
  return `${sym}${Number(amount).toFixed(2)}`;
}
function estAreaUnit() {
  return getEstimatesSettings().unitSystem === 'metric' ? 'sqm' : 'sqft';
}
function estFormatItemSize(item) {
  const metric = getEstimatesSettings().unitSystem === 'metric';
  const formatM = v => {
    const m = Math.floor(v); const cm = Math.round((v - m) * 100);
    return cm > 0 ? `${m}m ${cm}cm` : `${m}m`;
  };
  const formatFI = feetFloat => {
    if (!Number.isFinite(feetFloat)) return '—';
    const totalIn = Math.round(feetFloat * 12);
    const ft = Math.floor(totalIn / 12);
    const inch = Math.abs(totalIn % 12);
    return `${ft}' ${inch}"`;
  };
  if (typeof item.widthFt !== 'number' || typeof item.heightFt !== 'number') return '';
  return metric
    ? `${formatM(item.widthFt)} × ${formatM(item.heightFt)}`
    : `${formatFI(item.widthFt)} × ${formatFI(item.heightFt)}`;
}

function loadEstimates() {
  const estimates = JSON.parse(localStorage.getItem(ESTIMATES_KEY) || '[]');
  return estimates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function saveEstimates(estimates) {
  localStorage.setItem(ESTIMATES_KEY, JSON.stringify(estimates));
}

function displayEstimates() {
  const estimates = loadEstimates();
  const container = document.getElementById('estimatesContainer');
  const emptyMsg = document.getElementById('emptyMessage');

  if (!container || !emptyMsg) return;

  container.innerHTML = '';

  if (estimates.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';

  estimates.forEach((est, idx) => {
    const itemsHtml = (est.items || [])
      .map((it) => {
        const sizeLabel =
          typeof it.widthFt === 'number' && typeof it.heightFt === 'number'
            ? estFormatItemSize(it)
            : '—';
        return `<div class="estimate-item-row"><span>${escapeHtml(it.name)} · ${escapeHtml(sizeLabel)} × ${Number(it.qty || 0)}</span><span>${estCur(it.subtotal || 0)}</span></div>`;
      })
      .join('');

    const date = new Date(est.createdAt);
    const dateStr =
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const itemCount = (est.items || []).length;
    const card = document.createElement('div');
    card.className = 'estimate-card';
    card.innerHTML = `
      <div class="estimate-header">
        <div>
          <div class="estimate-title">${escapeHtml(est.clientName || 'Untitled')}</div>
          <div class="estimate-date">${dateStr} · ${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="estimate-total">${estCur(est.total || 0)}</div>
      </div>

      <div class="estimate-details">
        ${itemsHtml}
        <div class="estimate-subtotals">
          <div>Subtotal: ${estCur(est.subtotal || 0)}</div>
          ${Number(est.discountPercent || 0) > 0
            ? `<div>Discount (${Number(est.discountPercent).toFixed(2)}%): -${estCur(est.discountAmount || 0)}</div>`
            : ''}
          ${Number(est.taxRate || 0) > 0
            ? `<div>Tax (${Number(est.taxRate).toFixed(2)}%): ${estCur(est.taxAmount || 0)}</div>`
            : ''}
          <div class="estimate-grand">Total: ${estCur(est.total || 0)}</div>
        </div>
      </div>

      <div class="button-group">
        <button class="savepdf-btn btn-primary" data-idx="${idx}">💾 Save PDF</button>
        <button class="sharepdf-btn" data-idx="${idx}">📤 Share PDF</button>
        <button class="delete-btn btn-danger" data-idx="${idx}">🗑️ Delete</button>
      </div>
    `;

    container.appendChild(card);
  });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
      if (!Number.isNaN(idx)) deleteEstimate(idx);
    });
  });

  document.querySelectorAll('.savepdf-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
      if (Number.isNaN(idx)) return;

      const estimates = loadEstimates();
      const est = estimates[idx];
      if (!est) return;

      await generateEstimatePdf(est, { mode: 'save' });
    });
  });

  document.querySelectorAll('.sharepdf-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
      if (Number.isNaN(idx)) return;

      const estimates = loadEstimates();
      const est = estimates[idx];
      if (!est) return;

      await generateEstimatePdf(est, { mode: 'share' });
    });
  });

  configureShareButtonsVisibility();
}

function deleteEstimate(idx) {
  const estimates = loadEstimates();
  const est = estimates[idx];

  if (est && confirm(`🗑️ Delete estimate for "${est.clientName}"?`)) {
    estimates.splice(idx, 1);
    saveEstimates(estimates);
    displayEstimates();
  }
}

document.getElementById('clearAllBtn')?.addEventListener('click', () => {
  if (confirm('🗑️ Delete ALL estimates? This cannot be undone!')) {
    saveEstimates([]);
    displayEstimates();
  }
});

// ---------- PDF generation (Save + Share) ----------

async function generateEstimatePdf(est, { mode = 'save' } = {}) {
  const html2canvas = window.html2canvas;
  const jsPDF = window.jsPDF || window.jspdf?.jsPDF || window.jspdf?.default;

  if (typeof html2canvas !== 'function' || typeof jsPDF !== 'function') {
    alert('PDF libraries not loaded. Ensure vendor/html2canvas.min.js and vendor/jspdf.umd.min.js are included.');
    return;
  }

  const clientName = String(est.clientName || 'Untitled');
  const createdAt = est.createdAt ? new Date(est.createdAt) : new Date();
  const items = Array.isArray(est.items) ? est.items : [];
  const subtotal = Number(est.subtotal || 0);
  const discount = Number(est.discountPercent || 0);
  const discountAmount = Number(est.discountAmount || 0);
  const taxRate = Number(est.taxRate || 0);
  const taxAmount = Number(est.taxAmount || 0);
  const total = Number(est.total || 0);

  const safeName = clientName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  const filename = `estimate-${safeName || 'client'}-${createdAt.toISOString().slice(0, 10)}.pdf`;
  const shareText = `Estimate for ${clientName} — Total ${estCur(total)}`;

  const node = buildEstimateNode({
    clientName,
    items,
    subtotal,
    discount,
    discountAmount,
    taxRate,
    taxAmount,
    total,
    createdAt,
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

    if (mode === 'share') {
  const ok = await sharePdf({ pdf, filename, title: filename, text: shareText });
  if (!ok) pdf.save(filename);
} else {
  if (isCapacitorNative()) {
    // Android app: "Save" = open share sheet so user can choose Files/Drive/etc.
    const ok = await sharePdf({ pdf, filename, title: filename, text: shareText });
    if (!ok) pdf.save(filename);
  } else {
    // Desktop/web: download normally
    pdf.save(filename);
  }
}
  } catch (err) {
    console.error('Estimate PDF failed:', err);
    alert('PDF failed. Please try again.');
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
        ? estFormatItemSize(it)
        : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:8px; border-bottom:1px solid #eee;">${escapeHtml(it.name || '')}</td>
      <td style="padding:8px; border-bottom:1px solid #eee;">${escapeHtml(sizeLabel)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${Number(it.qty || 0)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${estCur(it.unitPrice || 0)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${estCur(it.subtotal || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  const totals = document.createElement('div');
  totals.style.marginTop = '12px';
  totals.style.fontSize = '14px';
  totals.innerHTML = `
    <div>Subtotal: ${estCur(subtotal)}</div>
    ${discount > 0 ? `<div>Discount: ${discount.toFixed(2)}% (-${estCur(discountAmount)})</div>` : ''}
    ${taxRate > 0 ? `<div>Tax (${taxRate.toFixed(2)}%): ${estCur(taxAmount)}</div>` : ''}
    <div style="font-weight:bold; font-size:16px; margin-top:6px;">Grand Total: ${estCur(total)}</div>
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

// ---------- Capacitor helpers ----------

function isCapacitorNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function configureShareButtonsVisibility() {
  const show = isCapacitorNative() || !!navigator.share;
  document.querySelectorAll('.sharepdf-btn').forEach((btn) => {
    btn.style.display = show ? 'inline-block' : 'none';
  });
}

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

async function savePdfNativeToDocuments(pdf, filename) {
  try {
    const cap = window.Capacitor;
    const Filesystem = cap?.Plugins?.Filesystem;
    const Directory = cap?.Directory;

    if (!Filesystem || !Directory?.Documents) return false;

    const blob = pdf.output('blob');
    const data = await blobToBase64Data(blob);

    await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Documents,
    });

    return true;
  } catch (e) {
    console.warn('savePdfNativeToDocuments failed:', e);
    return false;
  }
}

async function sharePdf({ pdf, filename, title, text }) {
  // Native share (Capacitor Android)
  if (isCapacitorNative()) {
    try {
      const cap = window.Capacitor;
      const Plugins = cap?.Plugins || {};
      const Filesystem = Plugins.Filesystem;
      const Share = Plugins.Share;

      if (!Filesystem || !Share) {
        console.log('sharePdf missing plugins', { Filesystem, Share, Plugins });
        return false;
      }

      const blob = pdf.output('blob');
      const data = await blobToBase64Data(blob); // base64 only, no prefix

      // IMPORTANT: use "CACHE" string (not Directory.Cache)
      const writeRes = await Filesystem.writeFile({
        path: filename,
        data,
        directory: "CACHE",
      });

      console.log('sharePdf wrote file:', writeRes);

      await Share.share({
        title: title || filename,
        text: text || '',
        url: writeRes.uri,
        dialogTitle: 'Share Estimate PDF',
      });

      console.log('sharePdf share sheet opened');
      return true;
    } catch (e) {
      console.log('Native share failed:', e);
      return false;
    }
  }

  // Web Share API (mobile browsers)
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

// ---------- Utils ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function formatFeetInches(feetFloat) {
  if (!Number.isFinite(feetFloat)) return '—';
  const totalIn = Math.round(feetFloat * 12);
  const ft = Math.floor(totalIn / 12);
  const inch = Math.abs(totalIn % 12);
  return `${ft}' ${inch}"`;
}

// Init
displayEstimates();