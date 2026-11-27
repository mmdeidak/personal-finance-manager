/* Data layer: persistence + all business logic. No DOM access here. */
const Store = (() => {
  const KEY = "pfm.v1";
  const COLORS = [
    "#0f9d8a",
    "#e0a43a",
    "#5b8def",
    "#d9627d",
    "#8a6fdf",
    "#e07b3c",
    "#4fb477",
    "#2fa3c7",
    "#a3a847",
    "#8b95a1",
  ];

  const DEFAULT_CATS = [
    ["exp_food", "خوراک", "expense"],
    ["exp_transport", "حمل‌ونقل", "expense"],
    ["exp_bills", "قبوض", "expense"],
    ["exp_home", "مسکن", "expense"],
    ["exp_health", "سلامت", "expense"],
    ["exp_shopping", "خرید", "expense"],
    ["exp_fun", "سرگرمی", "expense"],
    ["exp_install", "قسط و وام", "expense"],
    ["exp_other", "سایر", "expense"],
    ["inc_salary", "حقوق", "income"],
    ["inc_other", "سایر", "income"],
    ["inc_loan", "قرض", "income"],
    ["exp_loan", "قرض", "expense"],
  ].map(([id, name, type], i) => ({
    id,
    name,
    type,
    color: COLORS[i % COLORS.length],
    budget: null,
  }));

  let state = null;
  let saveFailed = false;

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fresh = () => ({
    v: 1,
    settings: {
      unit: "rial",
      theme: "system",
      createdAt: Date.now(),
      lastBackup: null,
      backupSnooze: null,
      dismissed: {},
    },
    categories: DEFAULT_CATS.map((c) => ({ ...c })),
    accounts: [],
    transactions: [],
    debts: [],
    installments: [],
    recurring: [],
    goals: [],
  });

  /** Make sure a loaded/imported object has every expected field. */
  function normalize(raw) {
    const base = fresh();
    const s = { ...base, ...raw };
    s.settings = { ...base.settings, ...(raw.settings || {}) };
    [
      "categories",
      "accounts",
      "transactions",
      "debts",
      "installments",
      "recurring",
      "goals",
    ].forEach((k) => {
      if (!Array.isArray(s[k])) s[k] = base[k];
    });
    if (!s.categories.length) s.categories = base.categories;
    // Older versions named the default income category 'سایر درآمدها'.
    s.categories.forEach((c) => {
      if (c.id === "inc_other" && c.name === "سایر درآمدها") c.name = "سایر";
    });
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      state = parsed ? normalize(parsed) : fresh();
      // First run only: persist so createdAt is recorded once.
      if (!parsed || !(parsed.settings || {}).createdAt) save();
    } catch (e) {
      state = fresh();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveFailed = false;
    } catch (e) {
      saveFailed = true;
    }
    return !saveFailed;
  }

  // ---------- money / units ----------
  const unit = () => state.settings.unit;
  const unitLabel = () => (unit() === "rial" ? "ریال" : "تومان");
  /** Amounts are stored in rial (the smallest unit). Convert to / from the display unit. */
  const toDisplay = (n) => (unit() === "rial" ? n : n / 10);
  const fromDisplay = (n) => (unit() === "rial" ? n : n * 10);
  const setUnit = (u) => {
    state.settings.unit = u === "rial" ? "rial" : "toman";
    save();
  };
  const theme = () =>
    ["light", "dark"].includes(state.settings.theme)
      ? state.settings.theme
      : "system";
  const setTheme = (t) => {
    state.settings.theme = ["light", "dark"].includes(t) ? t : "system";
    save();
  };

  // ---------- categories ----------
  // "سایر" (the catch-all category) is always listed last.
  const isOtherCat = (c) => c.id === "exp_other" || c.id === "inc_other";
  const categories = (type) => {
    const list = state.categories.filter((c) => !type || c.type === type);
    return list.filter((c) => !isOtherCat(c)).concat(list.filter(isOtherCat));
  };
  const cat = (id) => state.categories.find((c) => c.id === id) || null;
  function saveCategory(data) {
    if (data.id) {
      const c = cat(data.id);
      if (c) Object.assign(c, { name: data.name, budget: data.budget || null });
    } else {
      state.categories.push({
        id: uid(),
        name: data.name,
        type: data.type,
        color: COLORS[state.categories.length % COLORS.length],
        budget: data.type === "expense" ? data.budget || null : null,
      });
    }
    save();
    return data.id || state.categories[state.categories.length - 1].id;
  }
  function deleteCategory(id) {
    state.categories = state.categories.filter((c) => c.id !== id);
    state.transactions.forEach((t) => {
      if (t.catId === id) t.catId = null;
    });
    state.recurring.forEach((r) => {
      if (r.catId === id) r.catId = null;
    });
    save();
  }

  // ---------- bank accounts ----------
  const accounts = () => state.accounts;
  const account = (id) => state.accounts.find((a) => a.id === id) || null;
  const effect = (t) => (t.type === "income" ? t.amount : -t.amount);
  const accountTx = (id) =>
    state.transactions.filter((t) => t.accountId === id).sort(byNewest);
  const flowSum = (id) =>
    state.transactions.reduce(
      (s, t) => (t.accountId === id ? s + effect(t) : s),
      0,
    );
  /** Current balance = opening balance + every transaction linked to the account. */
  const accountBalance = (id) => {
    const a = account(id);
    return a ? (a.opening || 0) + flowSum(id) : 0;
  };
  const totalBalance = () =>
    state.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
  function accountTotals(id) {
    let income = 0,
      expense = 0;
    accountTx(id).forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    return { income, expense };
  }
  /** `balance` is the balance the user wants to see now; the opening balance is derived from it. */
  function saveAccount(data) {
    const { id, bank, title, balance } = data;
    if (id) {
      const a = account(id);
      if (a) Object.assign(a, { bank, title, opening: balance - flowSum(id) });
      save();
      return id;
    }
    const a = {
      id: uid(),
      bank,
      title,
      opening: balance,
      createdAt: Date.now(),
      color: COLORS[state.accounts.length % COLORS.length],
    };
    state.accounts.push(a);
    save();
    return a.id;
  }
  function deleteAccount(id) {
    state.accounts = state.accounts.filter((a) => a.id !== id);
    state.transactions.forEach((t) => {
      if (t.accountId === id) t.accountId = null;
    });
    state.recurring.forEach((r) => {
      if (r.accountId === id) r.accountId = null;
    });
    save();
  }

  // ---------- transactions ----------
  const monthIdxCache = new Map();
  function idxOf(iso) {
    let v = monthIdxCache.get(iso);
    if (v === undefined) {
      v = Jalali.monthIdx(iso);
      monthIdxCache.set(iso, v);
    }
    return v;
  }
  const byNewest = (a, b) =>
    a.date === b.date ? (b.t || 0) - (a.t || 0) : a.date < b.date ? 1 : -1;
  const tx = (id) => state.transactions.find((t) => t.id === id) || null;
  const allTx = () => [...state.transactions].sort(byNewest);
  /** Month index of the newest transaction (so imported future data stays reachable). */
  const latestIdx = () =>
    state.transactions.reduce((m, t) => Math.max(m, idxOf(t.date)), -Infinity);
  const monthTx = (idx) =>
    state.transactions.filter((t) => idxOf(t.date) === idx).sort(byNewest);

  function saveTx(data) {
    if (data.id) {
      const t = tx(data.id);
      if (t) Object.assign(t, data);
    } else {
      state.transactions.push({ ...data, id: uid(), t: Date.now() });
    }
    save();
  }
  const deleteTx = (id) => {
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
  };

  function summary(list) {
    let income = 0,
      expense = 0;
    list.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    return { income, expense, balance: income - expense };
  }

  /** Expense totals per category for a month, biggest first. */
  function spentByCat(idx) {
    const map = new Map();
    monthTx(idx).forEach((t) => {
      if (t.type !== "expense" || t.settle) return;
      map.set(t.catId, (map.get(t.catId) || 0) + t.amount);
    });
    return [...map.entries()]
      .map(([catId, value]) => ({ catId, value }))
      .sort((a, b) => b.value - a.value);
  }

  /** Debt settlements of a month: money paid back (my debts) and money received (my receivables). */
  function settleTotals(idx) {
    let paid = 0,
      received = 0;
    monthTx(idx).forEach((t) => {
      if (t.settle) {
        if (t.type === "expense") paid += t.amount;
        else received += t.amount;
      }
    });
    return { paid, received };
  }

  /** Income/expense for the n months ending at idx (oldest first). */
  function lastMonths(idx, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const m = idx - i;
      const s = summary(monthTx(m));
      out.push({
        idx: m,
        ...Jalali.fromIdx(m),
        income: s.income,
        expense: s.expense,
      });
    }
    return out;
  }

  // ---------- recurring ----------
  function addRecurring(data) {
    state.recurring.push({ ...data, id: uid() });
    save();
  }
  const deleteRecurring = (id) => {
    state.recurring = state.recurring.filter((r) => r.id !== id);
    save();
  };

  /** Create the transactions of recurring rules whose date has arrived. Returns how many were added. */
  function processRecurring() {
    const today = Jalali.todayISO();
    const cur = Jalali.monthIdx(today);
    let added = 0;
    state.recurring.forEach((r) => {
      for (
        let idx = r.lastIdx + 1, guard = 0;
        idx <= cur && guard < 240;
        idx += 1, guard += 1
      ) {
        const { jy, jm } = Jalali.fromIdx(idx);
        const iso = Jalali.toISO(
          jy,
          jm,
          Math.min(r.day, Jalali.monthLength(jy, jm)),
        );
        if (iso > today) break;
        state.transactions.push({
          id: uid(),
          t: Date.now() + added,
          type: r.type,
          amount: r.amount,
          catId: r.catId,
          note: r.note || "",
          date: iso,
          recId: r.id,
          accountId: r.accountId || null,
        });
        r.lastIdx = idx;
        added += 1;
      }
    });
    if (added) save();
    return added;
  }

  // ---------- debts ----------
  const debts = () => state.debts;
  /** Money movement recorded when a debt or receivable is created: borrowing is income, lending is an expense. */
  function loanCatId(dir) {
    const id = dir === "lent" ? "exp_loan" : "inc_loan";
    if (!cat(id)) {
      const base = DEFAULT_CATS.find((c) => c.id === id);
      state.categories.push({ ...base });
    }
    return id;
  }
  /** opts: { record: bool (new debts only), accountId } */
  function saveDebt(data, opts = {}) {
    let d;
    if (data.id) {
      d = state.debts.find((x) => x.id === data.id);
      if (d) Object.assign(d, data);
    } else {
      d = { ...data, id: uid(), settled: false };
      state.debts.push(d);
      if (opts.record) {
        const t = {
          id: uid(),
          t: Date.now(),
          type: "income",
          amount: 0,
          catId: null,
          note: "",
          date: d.date,
          accountId: null,
        };
        state.transactions.push(t);
        d.originTx = t.id;
      }
    }
    const t =
      d && d.originTx
        ? state.transactions.find((x) => x.id === d.originTx)
        : null;
    if (t) {
      t.type = d.dir === "lent" ? "expense" : "income";
      t.catId = loanCatId(d.dir);
      t.amount = d.amount;
      t.date = d.date;
      t.note = d.person;
      if (opts.accountId !== undefined)
        t.accountId =
          opts.accountId && account(opts.accountId) ? opts.accountId : null;
    }
    save();
    return d ? d.id : null;
  }
  /** Mark a debt as settled; with an account, the money movement is recorded there (counted as income/expense). */
  function settleDebt(id, accountId) {
    const d = state.debts.find((x) => x.id === id);
    if (!d || d.settled) return;
    d.settled = true;
    d.settledAt = Jalali.todayISO();
    const t = {
      id: uid(),
      t: Date.now(),
      type: d.dir === "lent" ? "income" : "expense",
      amount: d.amount,
      catId: null,
      note: d.person,
      date: Jalali.todayISO(),
      accountId: accountId && account(accountId) ? accountId : null,
      settle: "debt",
    };
    state.transactions.push(t);
    d.settleTx = t.id;
    save();
  }
  function reopenDebt(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d || !d.settled) return;
    d.settled = false;
    if (d.settleTx) {
      state.transactions = state.transactions.filter(
        (t) => t.id !== d.settleTx,
      );
      d.settleTx = null;
    }
    save();
  }
  const deleteDebt = (id) => {
    const d = state.debts.find((x) => x.id === id);
    if (d) {
      const drop = [d.originTx, d.settleTx].filter(Boolean);
      state.transactions = state.transactions.filter(
        (t) => !drop.includes(t.id),
      );
    }
    state.debts = state.debts.filter((x) => x.id !== id);
    save();
  };
  function debtTotals() {
    let lent = 0,
      borrowed = 0;
    state.debts.forEach((d) => {
      if (d.settled) return;
      if (d.dir === "lent") lent += d.amount;
      else borrowed += d.amount;
    });
    return { lent, borrowed };
  }

  // ---------- installments / loans ----------
  const installments = () => state.installments;
  const inst = (id) => state.installments.find((i) => i.id === id) || null;
  const instDone = (i) => i.paid >= i.count;
  const instNextDue = (i) =>
    instDone(i) ? null : Jalali.addMonths(i.firstDue, i.paid);
  const daysUntil = (iso) =>
    Jalali.dayNumber(iso) - Jalali.dayNumber(Jalali.todayISO());

  function saveInstallment(data) {
    if (data.id) {
      const i = inst(data.id);
      if (i) Object.assign(i, data);
    } else {
      state.installments.push({ ...data, id: uid() });
    }
    save();
  }
  const deleteInstallment = (id) => {
    state.installments = state.installments.filter((i) => i.id !== id);
    save();
  };

  /** Mark the next installment as paid and record it as an expense. */
  function payInstallment(id, accountId) {
    const i = inst(id);
    if (!i || instDone(i)) return false;
    const catId = cat("exp_install") ? "exp_install" : null;
    state.transactions.push({
      id: uid(),
      t: Date.now(),
      type: "expense",
      amount: i.amount,
      catId,
      note: `قسط ${i.paid + 1} از ${i.count}، ${i.title}`,
      date: Jalali.todayISO(),
      accountId: accountId && account(accountId) ? accountId : null,
    });
    i.paid += 1;
    save();
    return true;
  }

  /** Installments that are overdue or due within `withinDays` days. */
  function dueSoon(withinDays = 3) {
    return state.installments
      .filter((i) => !instDone(i))
      .map((i) => {
        const due = instNextDue(i);
        return { inst: i, due, days: daysUntil(due) };
      })
      .filter((x) => x.days <= withinDays)
      .sort((a, b) => a.days - b.days);
  }

  // ---------- goals ----------
  const goals = () => state.goals;
  function saveGoal(data) {
    if (data.id) {
      const g = state.goals.find((x) => x.id === data.id);
      if (g) Object.assign(g, data);
    } else {
      state.goals.push({ ...data, id: uid() });
    }
    save();
  }
  const addToGoal = (id, amount) => {
    const g = state.goals.find((x) => x.id === id);
    if (g) {
      g.saved = Math.max(0, g.saved + amount);
      save();
    }
  };
  const deleteGoal = (id) => {
    state.goals = state.goals.filter((g) => g.id !== id);
    save();
  };

  // ---------- dismissed notifications ----------
  const isDismissed = (key) =>
    !!(state.settings.dismissed && state.settings.dismissed[key]);
  function dismiss(key) {
    if (key === "backup")
      state.settings.backupSnooze = Date.now(); // the backup reminder comes back after a month
    else {
      state.settings.dismissed = { ...state.settings.dismissed, [key]: 1 };
    }
    save();
  }

  // ---------- backup ----------
  function markBackup() {
    state.settings.lastBackup = Date.now();
    save();
  }

  function exportJSON() {
    return JSON.stringify(
      {
        app: "personal-finance-manager",
        version: 2,
        exportedAt: new Date().toISOString(),
        data: state,
      },
      null,
      2,
    );
  }

  function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "فایل انتخاب‌شده معتبر نیست." };
    }
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.transactions)
    ) {
      return { ok: false, error: "این فایل، پشتیبان این برنامه نیست." };
    }
    const bad = data.transactions.some(
      (t) =>
        typeof t.amount !== "number" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(t.date || ""),
    );
    if (bad) return { ok: false, error: "اطلاعات تراکنش‌ها در فایل ناقص است." };
    state = normalize(data);
    monthIdxCache.clear();
    save();
    return {
      ok: true,
      count: state.transactions.length,
      accounts: state.accounts.length,
    };
  }

  /** CSV with a BOM so Excel reads Persian text correctly. Amounts are in the current display unit. */
  function exportCSV() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "تاریخ شمسی",
        "تاریخ میلادی",
        "نوع",
        "دسته",
        `مبلغ (${unitLabel()})`,
        "حساب",
        "یادداشت",
      ]
        .map(q)
        .join(","),
    ];
    allTx().forEach((t) => {
      const c = cat(t.catId);
      rows.push(
        [
          q(Jalali.formatNumeric(t.date)),
          q(t.date),
          q(t.type === "income" ? "درآمد" : "هزینه"),
          q(c ? c.name : "بدون دسته‌بندی"),
          Math.round(toDisplay(t.amount) * 100) / 100,
          q(
            t.accountId && account(t.accountId)
              ? accountLabel(account(t.accountId))
              : "",
          ),
          q(t.note),
        ].join(","),
      );
    });
    return "﻿" + rows.join("\r\n");
  }

  const accountLabel = (a) => [a.bank, a.title].filter(Boolean).join(" - ");

  function resetAll() {
    state = fresh();
    monthIdxCache.clear();
    save();
  }

  return {
    load,
    save,
    get state() {
      return state;
    },
    get saveFailed() {
      return saveFailed;
    },
    unit,
    unitLabel,
    toDisplay,
    fromDisplay,
    setUnit,
    theme,
    setTheme,
    categories,
    cat,
    saveCategory,
    deleteCategory,
    accounts,
    account,
    accountTx,
    accountBalance,
    totalBalance,
    accountTotals,
    saveAccount,
    deleteAccount,
    accountLabel,
    tx,
    allTx,
    latestIdx,
    monthTx,
    saveTx,
    deleteTx,
    summary,
    spentByCat,
    settleTotals,
    lastMonths,
    addRecurring,
    deleteRecurring,
    processRecurring,
    debts,
    saveDebt,
    settleDebt,
    reopenDebt,
    deleteDebt,
    debtTotals,
    installments,
    inst,
    instDone,
    instNextDue,
    daysUntil,
    saveInstallment,
    deleteInstallment,
    payInstallment,
    dueSoon,
    goals,
    saveGoal,
    addToGoal,
    deleteGoal,
    isDismissed,
    dismiss,
    markBackup,
    exportJSON,
    importJSON,
    exportCSV,
    resetAll,
  };
})();

if (typeof module !== "undefined") module.exports = Store;
