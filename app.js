(() => {
  'use strict';
  const KEY = 'buddy-v1';
  const LEGACY_KEY = 'paye-planner-v1';
  const MONTHS = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];
  const now = new Date();
  const currentYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const yearStart = currentYearStart;
  const yearKey = `${yearStart}-${yearStart + 1}`;
  const currentMonth = now.getFullYear() === yearStart ? now.getMonth() - 6 : now.getMonth() + 6;
  const supported = yearStart === 2026;
  const $ = id => document.getElementById(id);
  const fmt = amount => 'Rs ' + new Intl.NumberFormat('en-MU', {maximumFractionDigits: 0}).format(Math.round(amount || 0));
  const fmtCurrency = (amount, currency) => (currency === 'EUR' ? '€' : 'Rs ') + new Intl.NumberFormat('en-MU', {maximumFractionDigits: 2}).format(amount || 0);
  const cleanNumber = value => value === '' || value == null ? null : Number(value);
  let state = readState();
  let editedSourceId = null;
  let editingMonth = null;
  let toastTimeout;

  function readState() {
    const blank = {schemaVersion: 2, theme: 'dark', eurRate: null, sources: [], years: {}};
    for (const key of [KEY, LEGACY_KEY]) {
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (validBackup(saved)) return normalizeState(saved);
      } catch { /* Continue to older data if this entry is unreadable. */ }
    }
    return blank;
  }
  function validBackup(data) {
    if (!data || ![1, 2].includes(data.schemaVersion) || !['dark', 'light'].includes(data.theme) || !Array.isArray(data.sources) || !data.years || typeof data.years !== 'object' || Array.isArray(data.years)) return false;
    if (data.sources.length > 250 || Object.keys(data.years).length > 30) return false;
    if (data.schemaVersion === 2 && data.eurRate != null && (!Number.isFinite(data.eurRate) || data.eurRate <= 0 || data.eurRate > 10000)) return false;
    if (!data.sources.every(s => s && typeof s.id === 'string' && s.id.length < 100 && typeof s.name === 'string' && s.name.length <= 64 && ['salary','freelance'].includes(s.type) && ['MUR','EUR'].includes(s.currency) && typeof s.active === 'boolean' && (data.schemaVersion === 1 ? (s.currency === 'MUR' || Number(s.defaultRate) > 0) : ((s.basicSalary == null || (Number.isFinite(s.basicSalary) && s.basicSalary >= 0 && s.basicSalary < 1e12)) && (s.rateOverride == null || (Number.isFinite(s.rateOverride) && s.rateOverride > 0 && s.rateOverride <= 10000)))))) return false;
    return Object.values(data.years).every(y => y && typeof y === 'object' && y.entries && typeof y.entries === 'object' && !Array.isArray(y.entries) && Object.entries(y.entries).every(([key, entry]) => /^\d{1,2}:[\w-]{1,100}$/.test(key) && entry && typeof entry === 'object' && ['actual','forecast'].includes(entry.kind) && ['amount','rate','paye'].every(field => entry[field] == null || (Number.isFinite(entry[field]) && entry[field] >= 0 && entry[field] < 1e12))));
  }
  function normalizeState(data) {
    if (data.schemaVersion === 2) return {...data, eurRate: data.eurRate ?? null};
    return {
      schemaVersion: 2, theme: data.theme, eurRate: null, years: data.years,
      sources: data.sources.map(({defaultRate, ...source}) => ({...source, basicSalary: null, rateOverride: defaultRate ?? null}))
    };
  }
  function entries() {
    state.years[yearKey] ||= {entries: {}};
    return state.years[yearKey].entries;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function entryKey(month, sourceId) { return `${month}:${sourceId}`; }
  function recorded(month, sourceId) { return entries()[entryKey(month, sourceId)] || null; }
  function pastValue(month, sourceId, field) {
    for (let prior = month - 1; prior >= 0; prior--) {
      const value = recorded(prior, sourceId)?.[field];
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return null;
  }
  function defaultAmount(month, source) {
    const future = month > currentMonth;
    const allowCopy = future && source.active;
    const previousAmount = allowCopy ? pastValue(month, source.id, 'amount') : null;
    if (source.type === 'salary' && source.basicSalary != null && (!future || source.active)) {
      return future && previousAmount === 0 ? 0 : source.basicSalary;
    }
    return previousAmount;
  }
  function projection(month, source) {
    const record = recorded(month, source.id);
    const future = month > currentMonth;
    const isActual = !future && record?.kind === 'actual';
    const allowCopy = future && source.active;
    const amount = record?.amount ?? defaultAmount(month, source);
    const rate = source.currency === 'EUR' ? (record?.rate ?? source.rateOverride ?? state.eurRate ?? null) : 1;
    const paye = source.type === 'salary' ? (record?.paye ?? (amount === 0 ? 0 : allowCopy ? pastValue(month, source.id, 'paye') : null)) : null;
    const missingRate = (amount || 0) > 0 && source.currency === 'EUR' && !(rate > 0);
    const mur = missingRate ? 0 : Math.round((amount || 0) * (rate || 1) * 100) / 100;
    return {amount, rate, paye, mur, isActual, future, missingRate, record};
  }
  function totals() {
    const monthData = MONTHS.map((_, month) => {
      const projected = state.sources.map(source => ({source, ...projection(month, source)}));
      const income = Math.round(projected.reduce((sum, item) => sum + item.mur, 0) * 100) / 100;
      const actualPaye = projected.reduce((sum, item) => sum + (item.isActual ? item.record?.paye || 0 : 0), 0);
      const futurePaye = projected.reduce((sum, item) => sum + (item.future || item.record?.kind === 'forecast' ? item.paye || 0 : 0), 0);
      const actualIncome = projected.reduce((sum, item) => sum + (item.isActual ? item.mur : 0), 0);
      return {projected, income, actualPaye, futurePaye, actualIncome, missingRate: projected.some(item => item.missingRate)};
    });
    const income = Math.round(monthData.reduce((sum, item) => sum + item.income, 0) * 100) / 100;
    const actualIncome = Math.round(monthData.reduce((sum, item) => sum + item.actualIncome, 0) * 100) / 100;
    const paid = monthData.reduce((sum, item) => sum + item.actualPaye, 0);
    const futurePaye = monthData.reduce((sum, item) => sum + item.futurePaye, 0);
    const tax = supported ? window.TaxRules.annualTax(income) : null;
    const monthlyTax = supported ? window.TaxRules.distributeMonthly(tax, monthData.map(m => m.income)) : MONTHS.map(() => null);
    return {monthData, income, actualIncome, paid, futurePaye, tax, monthlyTax, missingRate: monthData.some(m => m.missingRate)};
  }
  function setText(id, value) { $(id).textContent = value; }
  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function monthStatus(month, monthData) {
    if (month > currentMonth) return 'Forecast';
    if (monthData.projected.some(p => p.isActual)) return 'Recorded';
    if (monthData.projected.some(p => p.record?.kind === 'forecast' || (p.source.type === 'salary' && p.amount != null))) return 'Needs confirmation';
    return 'No entry';
  }
  function render() {
    document.documentElement.dataset.theme = state.theme;
    $('theme-button').textContent = state.theme === 'dark' ? '☼' : '☾';
    $('theme-button').setAttribute('aria-label', state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    setText('year-label', `July ${yearStart} – June ${yearStart + 1}`);
    const t = totals();
    setText('income-total', fmt(t.income));
    setText('income-detail', `${fmt(t.actualIncome)} recorded · ${fmt(t.income - t.actualIncome)} forecast`);
    setText('paye-paid', fmt(t.paid));
    setText('tax-total', t.tax === null || t.missingRate ? '—' : fmt(t.tax));
    setText('projection-badge', t.missingRate ? 'EUR rate needed' : supported ? 'Forecast' : 'Rules needed');
    if (t.tax === null || t.missingRate) {
      setText('tax-balance', '—');
      setText('balance-detail', t.missingRate ? 'Enter the EUR conversion rate' : 'Tax rules must be checked for this year');
    } else {
      const balance = Math.round(t.tax - t.paid - t.futurePaye);
      setText('balance-label', balance < 0 ? 'Projected tax credit' : 'Projected year-end balance');
      setText('tax-balance', fmt(Math.abs(balance)));
      setText('balance-detail', `${fmt(t.futurePaye)} future PAYE forecast included`);
    }
    $('calculation-note').textContent = supported
      ? 'Monthly tax forecast allocates annual tax in proportion to income. The estimate assumes all entered amounts are taxable and includes no deductions or other tax payments.'
      : 'Income tracking remains available. Tax calculations are paused until the rules for this financial year are verified.';
    const body = $('month-rows');
    const cards = $('month-cards');
    body.replaceChildren(); cards.replaceChildren();
    t.monthData.forEach((monthData, month) => {
      const status = monthStatus(month, monthData);
      const payeAmount = monthData.actualPaye + monthData.futurePaye;
      const forecastTax = t.missingRate || t.monthlyTax[month] === null ? '—' : fmt(t.monthlyTax[month]);
      const tr = create('tr'); tr.tabIndex = 0; tr.setAttribute('aria-label', `${MONTHS[month]}, ${status}. Open month`);
      tr.addEventListener('click', () => openMonth(month));
      tr.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMonth(month); } });
      const first = create('td'); first.append(create('div', 'month-name', MONTHS[month]), create('div', 'month-sub', status));
      tr.append(first, create('td', month > currentMonth ? 'forecast-value' : '', fmt(monthData.income)), create('td', monthData.futurePaye && !monthData.actualPaye ? 'forecast-value' : '', fmt(payeAmount)), create('td', 'forecast-value', forecastTax), create('td', 'edit-chevron', '›'));
      body.append(tr);
      const card = create('button', 'month-card'); card.type = 'button'; card.addEventListener('click', () => openMonth(month));
      const left = create('div'); left.append(create('div', 'card-name', MONTHS[month]), create('div', 'card-status', status));
      const right = create('div'); right.append(create('span', 'card-income', fmt(monthData.income)), create('span', 'card-chevron', '›'));
      const details = create('div', 'card-details');
      const paidPart = create('span'); paidPart.append(create('span', '', 'PAYE '), create('strong', '', fmt(payeAmount)));
      const taxPart = create('span'); taxPart.append(create('span', '', 'Tax forecast '), create('strong', '', forecastTax));
      details.append(paidPart, taxPart); card.append(left, right, details); cards.append(card);
    });
    renderSources();
  }
  function showToast(message) {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 3300);
  }
  function openDialog(id) { $(id).showModal(); }
  function openSettings() {
    $('general-rate').value = state.eurRate ?? '';
    renderSources(); openDialog('settings-dialog');
  }
  function saveGeneralRate() {
    const rate = cleanNumber($('general-rate').value);
    if (rate != null && (!Number.isFinite(rate) || rate <= 0 || rate > 10000)) {
      showToast('Enter a valid EUR to MUR rate'); $('general-rate').focus(); return;
    }
    state.eurRate = rate;
    save(); render(); showToast(rate == null ? 'Default rate cleared' : 'Default rate saved');
  }
  function renderSources() {
    const list = $('source-list'); list.replaceChildren();
    if (!state.sources.length) list.append(create('p', 'empty-copy', 'Add a salary or freelance source to begin.'));
    for (const source of state.sources) {
      const row = create('div', 'source-item'); const info = create('div');
      const details = `${source.type === 'salary' ? 'Salary' : 'Freelance'} · ${source.currency}${source.type === 'salary' && source.basicSalary != null ? ` · ${fmtCurrency(source.basicSalary, source.currency)} basic` : ''}${source.currency === 'EUR' && source.rateOverride != null ? ' · Custom rate' : ''}${source.active ? '' : ' · Paused'}`;
      info.append(create('div', '', source.name), create('div', 'source-meta', details));
      const actions = create('div', 'source-actions');
      const edit = create('button', 'text-button', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => openSource(source.id));
      const pause = create('button', 'text-button', source.active ? 'Pause' : 'Resume'); pause.type = 'button';
      pause.addEventListener('click', () => { source.active = !source.active; save(); render(); showToast(source.active ? 'Source resumed' : 'Future forecasts paused'); });
      const remove = create('button', 'text-button', 'Delete'); remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!confirm(`Delete ${source.name} and all its monthly entries?`)) return;
        state.sources = state.sources.filter(s => s.id !== source.id);
        for (const data of Object.values(state.years)) for (const key of Object.keys(data.entries || {})) if (key.endsWith(`:${source.id}`)) delete data.entries[key];
        save(); render(); showToast('Source deleted');
      });
      actions.append(edit, pause, remove); row.append(info, actions); list.append(row);
    }
  }
  function openSource(id = null) {
    editedSourceId = id;
    const source = state.sources.find(s => s.id === id);
    $('source-form').reset(); $('source-error').hidden = true;
    $('source-title').textContent = source ? 'Edit source' : 'Add source';
    $('source-name').value = source?.name || '';
    $('source-type').value = source?.type || 'salary';
    $('source-currency').value = source?.currency || 'MUR';
    $('source-basic-salary').value = source?.basicSalary ?? '';
    $('source-rate').value = source?.rateOverride ?? state.eurRate ?? '';
    syncSourceFields();
    openDialog('source-dialog'); $('source-name').focus();
  }
  function syncSourceFields() {
    const currency = $('source-currency').value;
    $('basic-salary-wrap').hidden = $('source-type').value !== 'salary';
    $('basic-salary-currency').textContent = currency;
    $('default-rate-wrap').hidden = currency !== 'EUR';
    if (currency === 'EUR' && $('source-rate').value === '' && state.eurRate != null) $('source-rate').value = state.eurRate;
  }
  function saveSource(event) {
    event.preventDefault();
    const name = $('source-name').value.trim();
    const type = $('source-type').value;
    const currency = $('source-currency').value;
    const basicSalary = type === 'salary' ? cleanNumber($('source-basic-salary').value) : null;
    const inputRate = currency === 'EUR' ? cleanNumber($('source-rate').value) : null;
    const previous = state.sources.find(s => s.id === editedSourceId);
    const rateOverride = currency !== 'EUR' || inputRate == null || (inputRate === state.eurRate && inputRate !== previous?.rateOverride) ? null : inputRate;
    const error = $('source-error');
    if (!name || (basicSalary != null && (!Number.isFinite(basicSalary) || basicSalary < 0 || basicSalary >= 1e12)) || (inputRate != null && (!Number.isFinite(inputRate) || inputRate <= 0 || inputRate > 10000))) {
      error.textContent = !name ? 'Enter a source name.' : 'Enter a valid salary or EUR to MUR rate.'; error.hidden = false; return;
    }
    if (editedSourceId) {
      const source = previous;
      if (source && source.currency !== currency && Object.keys(entries()).some(key => key.endsWith(`:${source.id}`)) && !confirm('Changing currency will reinterpret saved amounts. Continue?')) return;
      if (source) Object.assign(source, {name, type, currency, basicSalary, rateOverride});
    } else state.sources.push({id: crypto.randomUUID(), name, type, currency, basicSalary, rateOverride, active: true});
    save(); $('source-dialog').close(); render(); showToast(editedSourceId ? 'Source updated' : 'Source added');
  }
  function numericField(labelText, value, currency, field, sourceId, step = '0.01') {
    const label = create('label', '', labelText);
    const input = create('input'); input.type = 'number'; input.min = '0'; input.step = step; input.inputMode = 'decimal';
    input.placeholder = currency === 'EUR' ? '€ 0.00' : 'Rs 0.00';
    if (value != null) input.value = String(value);
    input.dataset.field = field; input.dataset.sourceId = sourceId;
    input.addEventListener('input', () => { input.dataset.edited = 'true'; updateMonthSummary(); });
    label.append(input);
    if (field === 'amount' && editingMonth > currentMonth) label.append(create('span', 'field-help', '0 carries forward; clear to use the usual forecast.'));
    if (field === 'rate') label.append(create('span', 'field-help', 'Clear to use the source or general rate.'));
    return label;
  }
  function openMonth(month) {
    editingMonth = month;
    const future = month > currentMonth;
    setText('month-title', `${MONTHS[month]} ${month < 6 ? yearStart : yearStart + 1}`);
    setText('dialog-status', future ? 'FORECAST · EDITABLE' : 'MONTHLY ENTRIES');
    const editor = $('month-editor'); editor.replaceChildren();
    for (const source of state.sources) {
      const item = projection(month, source);
      const entry = create('section', 'entry'); entry.dataset.sourceId = source.id;
      const header = create('div', 'entry-header'); header.append(create('div', 'entry-title', source.name), create('div', 'entry-type', `${source.type === 'salary' ? 'Salary' : 'Freelance'} · ${source.currency}`));
      const grid = create('div', source.currency === 'EUR' || source.type === 'salary' ? 'entry-grid' : 'entry-grid single');
      grid.append(numericField(`${source.type === 'salary' ? 'Taxable pay before PAYE' : 'Income'} · ${source.currency}`, item.amount, source.currency, 'amount', source.id));
      if (source.currency === 'EUR') grid.append(numericField('EUR to MUR · rate', item.rate, 'MUR', 'rate', source.id, '0.0001'));
      if (source.type === 'salary') grid.append(numericField('PAYE withheld · MUR', item.paye, 'MUR', 'paye', source.id));
      entry.append(header, grid);
      if (source.currency === 'EUR') entry.append(create('div', 'entry-note', `MUR equivalent: ${fmt(item.mur)}`));
      if (future && !source.active) entry.append(create('div', 'entry-note', 'This source is paused; it will not be copied into future months.'));
      editor.append(entry);
    }
    if (!state.sources.length) editor.append(create('div', 'entry-empty', 'Add an income source in Settings to enter this month.'));
    if (!future && state.sources.length) {
      const label = create('label', 'confirmation');
      const checkbox = create('input'); checkbox.type = 'checkbox'; checkbox.id = 'actual-check'; checkbox.style.width = 'auto'; checkbox.style.marginRight = '9px';
      checkbox.checked = !state.sources.some(s => recorded(month, s.id)?.kind === 'forecast');
      label.append(checkbox, document.createTextNode('These amounts are actual')); editor.append(label);
    }
    const summary = create('div', 'month-summary'); summary.append(create('span', '', 'Month total'), create('strong', '', fmt(totals().monthData[month].income)));
    editor.append(summary); openDialog('month-dialog');
  }
  function updateMonthSummary() {
    if (editingMonth === null) return;
    let sum = 0;
    for (const source of state.sources) {
      const section = [...document.querySelectorAll('#month-editor .entry')].find(node => node.dataset.sourceId === source.id);
      if (!section) continue;
      const amountInput = section.querySelector('[data-field="amount"]');
      const amount = amountInput.value === '' ? defaultAmount(editingMonth, source) ?? 0 : Number(amountInput.value);
      const rateInput = section.querySelector('[data-field="rate"]');
      const rate = source.currency === 'EUR' ? (rateInput.value === '' ? source.rateOverride ?? state.eurRate ?? 0 : Number(rateInput.value)) : 1;
      const mur = amount * rate;
      if (source.currency === 'EUR') section.querySelector('.entry-note').textContent = rate > 0 ? `MUR equivalent: ${fmt(mur)}` : 'Enter a EUR to MUR rate';
      sum += mur;
    }
    $('month-editor').querySelector('.month-summary strong').textContent = fmt(sum);
  }
  function saveMonth() {
    if (editingMonth === null) return;
    const future = editingMonth > currentMonth;
    const confirmed = !future && ($('actual-check')?.checked ?? true);
    const changes = [];
    for (const source of state.sources) {
      const section = [...document.querySelectorAll('#month-editor .entry')].find(node => node.dataset.sourceId === source.id);
      const fields = [...section.querySelectorAll('input[data-field]')];
      const edited = fields.filter(input => input.dataset.edited === 'true');
      const prior = recorded(editingMonth, source.id);
      if (!edited.length && !prior && (future || source.type !== 'salary' || source.basicSalary == null)) continue;
      const next = {...prior, kind: confirmed ? 'actual' : 'forecast'};
      for (const input of edited) {
        const value = cleanNumber(input.value);
        if (value != null && (!Number.isFinite(value) || value < 0 || value >= 1e12)) {showToast('Enter a valid positive amount'); input.focus(); return;}
        if (input.dataset.field === 'rate' && value != null && (value === 0 || value > 10000)) {showToast('Enter a valid EUR to MUR rate'); input.focus(); return;}
        if (value == null || (input.dataset.field === 'rate' && value === (source.rateOverride ?? state.eurRate))) delete next[input.dataset.field];
        else next[input.dataset.field] = value;
      }
      if (confirmed && source.type === 'salary' && next.amount == null && source.basicSalary != null) next.amount = source.basicSalary;
      if (source.currency === 'EUR' && (next.amount ?? (source.type === 'salary' ? source.basicSalary : null) ?? 0) > 0) {
        const rate = next.rate ?? source.rateOverride ?? state.eurRate;
        if (!(rate > 0)) {showToast('Enter a EUR to MUR rate'); return;}
      }
      changes.push([entryKey(editingMonth, source.id), next]);
    }
    for (const [key, value] of changes) entries()[key] = value;
    try {save();} catch {showToast('Storage is full; export a backup'); return;}
    $('month-dialog').close(); editingMonth = null; render(); showToast('Month saved');
  }
  function exportBackup() {
    const payload = {...state, exportedAt: new Date().toISOString()};
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = create('a'); link.href = url; link.download = `buddy-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('Backup exported');
  }
  async function importBackup(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {showToast('Backup exceeds 2 MB'); return;}
    let imported;
    try {imported = JSON.parse(await file.text());} catch {showToast('Could not read JSON backup'); return;}
    if (!validBackup(imported)) {showToast('Not a compatible Buddy backup'); return;}
    if (!confirm('Replace all data on this device with this backup?')) return;
    state = normalizeState(imported);
    try {save();} catch {showToast('Storage is full; import not saved'); return;}
    render(); $('settings-dialog').close(); showToast('Backup imported');
  }
  function registerWebMCP() {
    if (!document.modelContext?.registerTool) return;
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'read_buddy_summary', title: 'Read Buddy summary',
        description: 'Read the current financial year income, PAYE and tax forecast from this device.',
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
        annotations: {readOnlyHint: true, untrustedContentHint: false},
        execute() {
          const t = totals();
          return {year: yearKey, sources: state.sources.map(({id,name,type,currency}) => ({id,name,type,currency})), income_mur: t.income, paye_paid_mur: t.paid, projected_future_paye_mur: t.futurePaye, annual_tax_mur: t.missingRate ? null : t.tax, projected_balance_mur: t.missingRate || t.tax === null ? null : Math.round(t.tax - t.paid - t.futurePaye)};
        }
      })).catch(() => {});
      Promise.resolve(document.modelContext.registerTool({
        name: 'set_buddy_monthly_entry', title: 'Set Buddy monthly income entry',
        description: 'Update one existing income source in one month of the current financial year. Future months stay forecasts.',
        inputSchema: {type: 'object', properties: {
          month_index: {type:'integer',minimum:0,maximum:11,description:'July is 0; June is 11'},
          source_id: {type:'string'}, amount: {type:'number',minimum:0},
          eur_to_mur_rate: {type:'number',exclusiveMinimum:0}, paye_mur: {type:'number',minimum:0}
        },required:['month_index','source_id','amount'],additionalProperties:false},
        annotations: {readOnlyHint:false,untrustedContentHint:false},
        execute(input) {
          if (!input || !Number.isInteger(input.month_index) || input.month_index < 0 || input.month_index > 11 || !Number.isFinite(input.amount) || input.amount < 0 || input.amount >= 1e12) throw Error('Invalid month or amount');
          const source = state.sources.find(s => s.id === input.source_id);
          if (!source) throw Error('Source not found');
          if (input.paye_mur != null && (source.type !== 'salary' || !Number.isFinite(input.paye_mur) || input.paye_mur < 0 || input.paye_mur >= 1e12)) throw Error('PAYE is valid only for a salary source');
          if (input.eur_to_mur_rate != null && (source.currency !== 'EUR' || !Number.isFinite(input.eur_to_mur_rate) || input.eur_to_mur_rate <= 0 || input.eur_to_mur_rate > 10000)) throw Error('Invalid EUR conversion rate');
          const key = entryKey(input.month_index, source.id);
          const existing = entries()[key] || {};
          const rate = input.eur_to_mur_rate ?? existing.rate ?? source.rateOverride ?? state.eurRate;
          if (source.currency === 'EUR' && input.amount > 0 && !(rate > 0)) throw Error('EUR conversion rate required');
          const kind = input.month_index > currentMonth ? 'forecast' : 'actual';
          entries()[key] = {...existing, amount:input.amount, kind,
            ...(input.eur_to_mur_rate != null ? {rate:input.eur_to_mur_rate} : {}),
            ...(input.paye_mur != null ? {paye:input.paye_mur} : {})};
          save(); render(); const t = totals();
          return {month:MONTHS[input.month_index], source:source.name, status:kind, income_mur:t.monthData[input.month_index].income, annual_tax_mur:t.tax};
        }
      })).catch(() => {});
    } catch { /* Browser support is optional. */ }
  }
  $('theme-button').addEventListener('click', () => {state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); render();});
  $('settings-button').addEventListener('click', openSettings);
  $('add-source-main').addEventListener('click', () => openSource());
  $('add-source').addEventListener('click', () => openSource());
  $('save-general-rate').addEventListener('click', saveGeneralRate);
  $('source-currency').addEventListener('change', syncSourceFields);
  $('source-type').addEventListener('change', syncSourceFields);
  $('source-form').addEventListener('submit', saveSource);
  $('save-month').addEventListener('click', saveMonth);
  $('export-button').addEventListener('click', exportBackup);
  $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', importBackup);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  render(); registerWebMCP();
})();
