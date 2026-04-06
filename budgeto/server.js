const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join('/data', 'budgeto.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ──
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaults = {
      users: ['Moi', 'Conjoint(e)'],
      defaultShare: [50, 50],
      monthShares: {},
      expenses: [],
      fixed: [],
      customCategories: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!d.defaultShare)     { d.defaultShare = d.share || [50, 50]; }
  if (!d.monthShares)      { d.monthShares = {}; }
  if (!d.customCategories) { d.customCategories = []; }
  if (!d.paymentChecks)    { d.paymentChecks = {}; }
  return d;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getMonthShare(data, month) {
  return (data.monthShares && data.monthShares[month]) || data.defaultShare || [50, 50];
}

function fmtCAD(n) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n || 0);
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  const l = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const BUILT_IN_CATS = {
  epicerie: 'Épicerie', restaurant: 'Restaurant', transport: 'Transport',
  logement: 'Logement', sante: 'Santé', loisirs: 'Loisirs',
  vetements: 'Vêtements', abonnements: 'Abonnements', autre: 'Autre',
};

function getCatLabel(data, catId) {
  if (BUILT_IN_CATS[catId]) return BUILT_IN_CATS[catId];
  const custom = (data.customCategories || []).find(c => c.id === catId);
  return custom ? `${custom.emoji} ${custom.label}` : catId;
}

// ── CRUD Routes ──
app.get('/api/data', (req, res) => res.json(loadData()));

app.post('/api/expense', (req, res) => {
  const data = loadData();
  const expense = { ...req.body, id: Date.now().toString() };
  data.expenses.push(expense);
  saveData(data);
  res.json(expense);
});

// EDIT expense
app.put('/api/expense/:id', (req, res) => {
  const data = loadData();
  const idx = data.expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  data.expenses[idx] = { ...data.expenses[idx], ...req.body, id: req.params.id };
  saveData(data);
  res.json(data.expenses[idx]);
});

app.delete('/api/expense/:id', (req, res) => {
  const data = loadData();
  data.expenses = data.expenses.filter(e => e.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/fixed', (req, res) => {
  const data = loadData();
  const fixed = { ...req.body, id: Date.now().toString() };
  data.fixed.push(fixed);
  saveData(data);
  res.json(fixed);
});

app.delete('/api/fixed/:id', (req, res) => {
  const data = loadData();
  data.fixed = data.fixed.filter(f => f.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

app.put('/api/fixed/:id/payer', (req, res) => {
  const data = loadData();
  const idx = data.fixed.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  data.fixed[idx].payer = req.body.payer;
  saveData(data);
  res.json(data.fixed[idx]);
});

app.post('/api/settings', (req, res) => {
  const data = loadData();
  if (req.body.users)          data.users = req.body.users;
  if (req.body.defaultShare)   data.defaultShare = req.body.defaultShare;
  if (req.body.paymentChecks !== undefined) data.paymentChecks = req.body.paymentChecks;
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/month-share', (req, res) => {
  const data = loadData();
  const { month, share } = req.body;
  if (share === null) delete data.monthShares[month];
  else data.monthShares[month] = share;
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/category', (req, res) => {
  const data = loadData();
  const cat = { ...req.body, id: 'custom_' + Date.now() };
  data.customCategories.push(cat);
  saveData(data);
  res.json(cat);
});

app.delete('/api/category/:id', (req, res) => {
  const data = loadData();
  data.customCategories = data.customCategories.filter(c => c.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// ── EXPORT: XLSX ──
app.get('/api/export/:month/xlsx', async (req, res) => {
  const data = loadData();
  const month = req.params.month; // "2025-01"
  const monthLabel = fmtMonth(month);
  const share = getMonthShare(data, month);
  const expenses = data.expenses.filter(e => e.date.startsWith(month));
  const fixed = data.fixed;
  const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Budgeto';
  wb.created = new Date();

  // ── Sheet 1: Dépenses variables ──
  const ws1 = wb.addWorksheet('Dépenses variables');
  const purple = '7C6AF7', orange = 'F7A26A', lightGray = 'F5F5F8', darkBg = '13161F';

  // Title
  ws1.mergeCells('A1:G1');
  ws1.getCell('A1').value = `💸 Budgeto — ${monthLabel}`;
  ws1.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF' + purple } };
  ws1.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  ws1.getRow(1).height = 36;

  ws1.mergeCells('A2:G2');
  ws1.getCell('A2').value = `Partage: ${data.users[0]} ${share[0]}% / ${data.users[1]} ${share[1]}%`;
  ws1.getCell('A2').font = { size: 11, color: { argb: 'FF888888' } };
  ws1.getRow(2).height = 20;

  ws1.addRow([]); // spacer

  // Headers
  const headers = ['Date', 'Description', 'Catégorie', 'Payé par', 'Montant', `Part ${data.users[0]}`, `Part ${data.users[1]}`];
  const hRow = ws1.addRow(headers);
  hRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + purple } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
  });
  hRow.height = 28;

  // Data rows
  expenses.sort((a, b) => a.date.localeCompare(b.date)).forEach((e, i) => {
    const expShare = e.customShare || share;
    const part0 = e.amount * expShare[0] / 100;
    const part1 = e.amount * expShare[1] / 100;
    const row = ws1.addRow([
      new Date(e.date + 'T12:00:00').toLocaleDateString('fr-CA'),
      e.desc,
      getCatLabel(data, e.cat),
      data.users[e.payer],
      e.amount,
      part0,
      part1,
    ]);
    row.height = 22;
    const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFF8F7FF';
    row.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: col >= 5 ? 'right' : 'left' };
      cell.font = { size: 11 };
      if (col >= 5) {
        cell.numFmt = '#,##0.00 "$"';
      }
    });
    // Colour payer cell
    const payerCell = row.getCell(4);
    payerCell.font = { bold: true, color: { argb: 'FF' + (e.payer === 0 ? purple : orange) }, size: 11 };
    // Custom share badge
    if (e.customShare) {
      const descCell = row.getCell(2);
      descCell.value = `${e.desc} [${expShare[0]}/${expShare[1]}]`;
    }
  });

  // Totals row
  const varTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const totRow = ws1.addRow(['', 'TOTAL', '', '', varTotal,
    expenses.reduce((s, e) => s + e.amount * (e.customShare || share)[0] / 100, 0),
    expenses.reduce((s, e) => s + e.amount * (e.customShare || share)[1] / 100, 0),
  ]);
  totRow.height = 26;
  totRow.eachCell((cell, col) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E5FF' } };
    cell.font = { bold: true, size: 11, color: { argb: 'FF' + purple } };
    cell.alignment = { vertical: 'middle', horizontal: col >= 5 ? 'right' : 'left' };
    if (col >= 5) cell.numFmt = '#,##0.00 "$"';
  });

  ws1.columns = [
    { key: 'date', width: 14 }, { key: 'desc', width: 32 }, { key: 'cat', width: 16 },
    { key: 'payer', width: 14 }, { key: 'amount', width: 14 }, { key: 'p0', width: 16 }, { key: 'p1', width: 16 },
  ];

  // ── Sheet 2: Frais fixes ──
  const ws2 = wb.addWorksheet('Frais fixes');
  ws2.mergeCells('A1:E1');
  ws2.getCell('A1').value = `Frais fixes — ${monthLabel}`;
  ws2.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF' + purple } };
  ws2.getRow(1).height = 36;
  ws2.addRow([]);

  const fHeaders = ['Description', 'Catégorie', 'Montant total', `Part ${data.users[0]}`, `Part ${data.users[1]}`];
  const fhRow = ws2.addRow(fHeaders);
  fhRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + orange } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  fhRow.height = 28;

  fixed.forEach((f, i) => {
    const row = ws2.addRow([
      f.desc, getCatLabel(data, f.cat), f.amount,
      f.amount * share[0] / 100, f.amount * share[1] / 100,
    ]);
    row.height = 22;
    const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFFFF8F0';
    row.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'right' : 'left' };
      if (col >= 3) cell.numFmt = '#,##0.00 "$"';
    });
  });

  const ftRow = ws2.addRow(['TOTAL', '', fixedTotal, fixedTotal * share[0] / 100, fixedTotal * share[1] / 100]);
  ftRow.height = 26;
  ftRow.eachCell((cell, col) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEDD' } };
    cell.font = { bold: true, size: 11, color: { argb: 'FF' + orange } };
    cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'right' : 'left' };
    if (col >= 3) cell.numFmt = '#,##0.00 "$"';
  });
  ws2.columns = [{ width: 32 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

  // ── Sheet 3: Résumé ──
  const ws3 = wb.addWorksheet('Résumé');
  ws3.mergeCells('A1:C1');
  ws3.getCell('A1').value = `Résumé — ${monthLabel}`;
  ws3.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF' + purple } };
  ws3.getRow(1).height = 36;
  ws3.addRow([]);

  const grandTotal = varTotal + fixedTotal;
  const due = [grandTotal * share[0] / 100, grandTotal * share[1] / 100];
  const paid = [
    expenses.filter(e => e.payer === 0).reduce((s, e) => s + e.amount, 0) + fixedTotal * share[0] / 100,
    expenses.filter(e => e.payer === 1).reduce((s, e) => s + e.amount, 0) + fixedTotal * share[1] / 100,
  ];

  const summaryRows = [
    ['Dépenses variables', fmtCAD(varTotal)],
    ['Frais fixes', fmtCAD(fixedTotal)],
    ['Total général', fmtCAD(grandTotal)],
    ['', ''],
    [`Part de ${data.users[0]} (${share[0]}%)`, fmtCAD(due[0])],
    [`Part de ${data.users[1]} (${share[1]}%)`, fmtCAD(due[1])],
    ['', ''],
    [`${data.users[0]} a payé`, fmtCAD(paid[0])],
    [`${data.users[1]} a payé`, fmtCAD(paid[1])],
    ['', ''],
  ];

  const diff = paid[0] - due[0];
  if (Math.abs(diff) < 0.5) {
    summaryRows.push(['Solde', 'Égal 🎉']);
  } else if (diff > 0) {
    summaryRows.push([`${data.users[1]} doit à ${data.users[0]}`, fmtCAD(Math.abs(diff))]);
  } else {
    summaryRows.push([`${data.users[0]} doit à ${data.users[1]}`, fmtCAD(Math.abs(diff))]);
  }

  summaryRows.forEach((r, i) => {
    const row = ws3.addRow(r);
    row.height = 22;
    if (r[0] === '') return;
    row.getCell(1).font = { size: 11, color: { argb: 'FF555555' } };
    row.getCell(2).font = { bold: true, size: 11 };
    row.getCell(2).alignment = { horizontal: 'right' };
    if (i === 2 || i === summaryRows.length - 1) {
      row.eachCell(cell => { cell.font = { bold: true, size: 12, color: { argb: 'FF' + purple } }; });
    }
  });
  ws3.columns = [{ width: 36 }, { width: 20 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="budgeto-${month}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ── EXPORT: PDF ──
app.get('/api/export/:month/pdf', (req, res) => {
  const data = loadData();
  const month = req.params.month;
  const monthLabel = fmtMonth(month);
  const share = getMonthShare(data, month);
  const expenses = data.expenses.filter(e => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  const fixed = data.fixed;
  const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0);
  const varTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grandTotal = varTotal + fixedTotal;
  const due = [grandTotal * share[0] / 100, grandTotal * share[1] / 100];
  const paid0 = expenses.filter(e => e.payer === 0).reduce((s, e) => s + e.amount, 0) + fixedTotal * share[0] / 100;
  const paid1 = expenses.filter(e => e.payer === 1).reduce((s, e) => s + e.amount, 0) + fixedTotal * share[1] / 100;
  const diff = paid0 - due[0];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="budgeto-${month}.pdf"`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  const PURPLE = '#7C6AF7', ORANGE = '#F7A26A', GRAY = '#888888', BLACK = '#1a1a2e';
  const pageW = doc.page.width - 100;

  // ── Header ──
  doc.rect(0, 0, doc.page.width, 80).fill('#13161F');
  doc.fillColor(PURPLE).font('Helvetica-Bold').fontSize(22).text('💸 Budgeto', 50, 22);
  doc.fillColor('#ffffff').font('Helvetica').fontSize(13).text(monthLabel, 50, 50);
  doc.fillColor(ORANGE).fontSize(11).text(`Partage: ${data.users[0]} ${share[0]}% / ${data.users[1]} ${share[1]}%`, 0, 57, { align: 'right', width: doc.page.width - 50 });

  let y = 100;

  // ── Résumé box ──
  doc.roundedRect(50, y, pageW, 110, 8).fillAndStroke('#F5F4FF', '#E0DCFF');
  doc.fillColor(PURPLE).font('Helvetica-Bold').fontSize(11).text('RÉSUMÉ DU MOIS', 66, y + 12);
  y += 32;

  const col1 = 66, col2 = 250, col3 = 400;
  const summaryItems = [
    ['Dépenses variables', fmtCAD(varTotal)],
    ['Frais fixes', fmtCAD(fixedTotal)],
    ['Total général', fmtCAD(grandTotal)],
  ];
  summaryItems.forEach(([label, val], i) => {
    const isTotal = i === 2;
    doc.fillColor(isTotal ? PURPLE : BLACK).font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 12 : 11).text(label, col1, y);
    doc.fillColor(isTotal ? PURPLE : BLACK).font('Helvetica-Bold').fontSize(isTotal ? 12 : 11).text(val, 0, y, { align: 'right', width: doc.page.width - 50 });
    y += isTotal ? 0 : 18;
  });
  y += 20;

  // Balance
  const balMsg = Math.abs(diff) < 0.5
    ? 'Tout est égal 🎉'
    : diff > 0
      ? `${data.users[1]} doit ${fmtCAD(Math.abs(diff))} à ${data.users[0]}`
      : `${data.users[0]} doit ${fmtCAD(Math.abs(diff))} à ${data.users[1]}`;
  doc.roundedRect(50, y, pageW, 34, 6).fill(Math.abs(diff) < 0.5 ? '#E8FFF2' : '#FFF3E8');
  doc.fillColor(Math.abs(diff) < 0.5 ? '#2D9E5F' : ORANGE).font('Helvetica-Bold').fontSize(12).text(`Solde: ${balMsg}`, 66, y + 10);
  y += 50;

  // ── Per person ──
  [0, 1].forEach(i => {
    const paidAmt = i === 0 ? paid0 : paid1;
    const d = paidAmt - due[i];
    const color = i === 0 ? PURPLE : ORANGE;
    doc.circle(66, y + 10, 10).fill(color);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(data.users[i][0].toUpperCase(), 61, y + 5);
    doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(`${data.users[i]}  —  Payé: ${fmtCAD(paidAmt)}  /  Attendu: ${fmtCAD(due[i])}`, 85, y + 4);
    doc.fillColor(d >= 0 ? '#2D9E5F' : '#E55').font('Helvetica').fontSize(10)
       .text(`${d >= 0 ? '+' : ''}${fmtCAD(d)}`, 0, y + 4, { align: 'right', width: doc.page.width - 50 });
    y += 26;
  });
  y += 10;

  // ── Frais fixes ──
  if (fixed.length > 0) {
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(13).text('Frais fixes du mois', 50, y);
    y += 20;
    // Table header
    doc.rect(50, y, pageW, 22).fill(ORANGE);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
    doc.text('Description', 60, y + 6); doc.text('Catégorie', 260, y + 6);
    doc.text('Montant', 360, y + 6); doc.text(`Part ${data.users[0]}`, 430, y + 6); doc.text(`Part ${data.users[1]}`, 500, y + 6);
    y += 22;
    fixed.forEach((f, i) => {
      if (i % 2 === 0) doc.rect(50, y, pageW, 20).fill('#FFF8F0');
      doc.fillColor(BLACK).font('Helvetica').fontSize(9);
      doc.text(f.desc, 60, y + 5, { width: 190, ellipsis: true });
      doc.text(getCatLabel(data, f.cat), 260, y + 5);
      doc.text(fmtCAD(f.amount), 360, y + 5);
      doc.text(fmtCAD(f.amount * share[0] / 100), 430, y + 5);
      doc.text(fmtCAD(f.amount * share[1] / 100), 500, y + 5);
      y += 20;
    });
    doc.rect(50, y, pageW, 22).fill('#FFEEDD');
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', 60, y + 6); doc.text(fmtCAD(fixedTotal), 360, y + 6);
    doc.text(fmtCAD(fixedTotal * share[0] / 100), 430, y + 6);
    doc.text(fmtCAD(fixedTotal * share[1] / 100), 500, y + 6);
    y += 34;
  }

  // ── Dépenses variables ──
  if (y > 680) { doc.addPage(); y = 50; }
  doc.fillColor(PURPLE).font('Helvetica-Bold').fontSize(13).text('Dépenses variables', 50, y);
  y += 20;

  if (expenses.length === 0) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(11).text('Aucune dépense ce mois.', 50, y);
    y += 20;
  } else {
    // Table header
    doc.rect(50, y, pageW, 22).fill(PURPLE);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
    doc.text('Date', 60, y + 6); doc.text('Description', 110, y + 6); doc.text('Catégorie', 280, y + 6);
    doc.text('Payé par', 370, y + 6); doc.text('Montant', 440, y + 6); doc.text('Part autre', 500, y + 6);
    y += 22;

    expenses.forEach((e, i) => {
      if (y > 760) { doc.addPage(); y = 50; }
      if (i % 2 === 0) doc.rect(50, y, pageW, 20).fill('#F8F7FF');
      const expShare = e.customShare || share;
      const otherShare = expShare[e.payer ^ 1];
      const color = e.payer === 0 ? PURPLE : ORANGE;
      const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('fr-CA', { day: '2-digit', month: '2-digit' });
      doc.fillColor(BLACK).font('Helvetica').fontSize(9);
      doc.text(dateStr, 60, y + 5);
      const descLabel = e.customShare ? `${e.desc} [${expShare[0]}/${expShare[1]}]` : e.desc;
      doc.text(descLabel, 110, y + 5, { width: 160, ellipsis: true });
      doc.text(getCatLabel(data, e.cat), 280, y + 5, { width: 80, ellipsis: true });
      doc.fillColor(color).font('Helvetica-Bold').fontSize(9).text(data.users[e.payer], 370, y + 5);
      doc.fillColor(BLACK).font('Helvetica').fontSize(9).text(fmtCAD(e.amount), 440, y + 5);
      doc.text(fmtCAD(e.amount * otherShare / 100), 500, y + 5);
      y += 20;
    });

    doc.rect(50, y, pageW, 22).fill('#E8E5FF');
    doc.fillColor(PURPLE).font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', 60, y + 6); doc.text(fmtCAD(varTotal), 440, y + 6);
    y += 34;
  }

  // Footer
  const footerY = doc.page.height - 40;
  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
     .text(`Généré par Budgeto le ${new Date().toLocaleDateString('fr-CA')}`, 50, footerY, { align: 'center', width: pageW });

  doc.end();
});

app.listen(PORT, () => console.log(`Budgeto running on port ${PORT}`));
