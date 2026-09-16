/* Income year 1 July 2026 to 30 June 2027.
   Source: MRA Employee Declaration Form, https://www.mra.mu/download/EDFForm.pdf
   These are annual income tax bands, not a simulation of any employer's PAYE payroll. */
window.TaxRules = Object.freeze({
  version: 'MRA-2026-27',
  annualTax(income) {
    const chargeable = Math.max(0, Number(income) || 0);
    const middle = Math.min(500000, Math.max(0, chargeable - 500000));
    const upper = Math.min(11000000, Math.max(0, chargeable - 1000000));
    const highest = Math.max(0, chargeable - 12000000);
    return Math.floor(middle * 0.10 + upper * 0.20 + highest * 0.35);
  },
  distributeMonthly(annualTax, incomes) {
    const total = incomes.reduce((sum, value) => sum + value, 0);
    if (!total || !annualTax) return incomes.map(() => 0);
    const raw = incomes.map(value => annualTax * value / total);
    const portions = raw.map(Math.floor);
    let remaining = annualTax - portions.reduce((sum, value) => sum + value, 0);
    const order = raw.map((value, index) => ({index, fraction: value - portions[index]}))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < remaining; i++) portions[order[i].index]++;
    return portions;
  }
});
