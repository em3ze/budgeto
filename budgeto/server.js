const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join('/data', 'budgeto.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  if (!d.defaultShare)      { d.defaultShare = d.share || [50,50]; }
  if (!d.monthShares)       { d.monthShares = {}; }
  if (!d.customCategories)  { d.customCategories = []; }
  return d;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/data', (req, res) => res.json(loadData()));

app.post('/api/expense', (req, res) => {
  const data = loadData();
  const expense = { ...req.body, id: Date.now().toString() };
  data.expenses.push(expense);
  saveData(data);
  res.json(expense);
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

app.post('/api/settings', (req, res) => {
  const data = loadData();
  if (req.body.users)        data.users = req.body.users;
  if (req.body.defaultShare) data.defaultShare = req.body.defaultShare;
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

app.listen(PORT, () => console.log(`Budgeto running on port ${PORT}`));
