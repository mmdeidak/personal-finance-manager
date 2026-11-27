/* UI layer: renders views, handles events. Depends on Jalali + Store. */
(() => {
  "use strict";

  const fa = Jalali.digits;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  // ---------- icons ----------
  const svg = (d, sw = 1.9) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    home: svg(
      '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/>',
    ),
    chart: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
    plans: svg(
      '<rect x="8" y="2.5" width="8" height="4" rx="1.2"/><path d="M16 4.5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h2"/><path d="m8.5 13 2.4 2.4 4.9-4.9"/>',
    ),
    gear: svg(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      1.7,
    ),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
    share: svg(
      '<path d="M12 15V4M8 8l4-4 4 4M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>',
    ),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    card: svg(
      '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h3"/>',
    ),
  };
  // In RTL the first (right) button goes to the past; the arrow points the way it moves.
  I.prev = svg('<path d="m9 6 6 6-6 6"/>');
  I.next = svg('<path d="m15 6-6 6 6 6"/>');
  const isoOf = (ts) => {
    const d = new Date(ts),
      p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // ---------- state ----------
  const today = () => Jalali.todayISO();
  const cur = Jalali.toJalali(today());
  const ui = {
    tab: "home",
    jy: cur.jy,
    jm: cur.jm,
    plansTab: "debts",
    plansView: { debts: "current", installments: "current", goals: "current" },
    accView: null,
    filter: { open: false, q: "", type: "all", cat: "all", all: false },
  };
  const monthIdx = () => ui.jy * 12 + ui.jm - 1;

  // ---------- formatting ----------
  function money(n, withSign = false) {
    const v = Math.round(Store.toDisplay(Math.abs(n)));
    const s = fa(v.toLocaleString("en-US"));
    const sign = n < 0 ? "−" : withSign && n > 0 ? "+" : "";
    return sign ? `\u2066${sign}${s}\u2069` : s; // LRI…PDI keeps "−123" in left-to-right order
  }
  const moneyInputValue = (n) =>
    n
      ? fa(
          Store.toDisplay(n).toLocaleString("en-US", {
            maximumFractionDigits: 1,
          }),
        )
      : "";
  const toLatin = (s) =>
    String(s)
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const parseMoney = (str) => {
    const n = Number(toLatin(str).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Store.fromDisplay(n) : 0;
  };
  const percent = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const DASH = "-"; // the Persian zero is a tiny dot, so zero amounts are shown as a plain hyphen
  const NOCAT = "بدون دسته‌بندی";
  const isZero = (n) => Math.round(Store.toDisplay(Math.abs(n))) === 0;
  const moneyZ = (n) => (isZero(n) ? DASH : money(n));
  /** Amount with its unit; a dash (no unit) when zero. */
  const moneyU = (n) => (isZero(n) ? DASH : `${money(n)} ${Store.unitLabel()}`);
  const curIdx = () => {
    const j = Jalali.toJalali(today());
    return j.jy * 12 + j.jm - 1;
  };
  const maxIdx = () => Math.max(curIdx(), Store.latestIdx());

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }
  function persist() {
    if (!Store.saveFailed) return;
    toast(
      "ذخیره‌سازی انجام نشد. حافظه‌ی مرورگر پر است یا دسترسی به آن ممکن نیست.",
    );
  }

  // ---------- sheet ----------
  function openSheet(title, bodyHTML, onMount) {
    ui.txBack = null; // catSheet() sets it again right after opening when it was launched from the transaction form
    closeSheet();
    $("#sheet-root").innerHTML = `
      <div class="backdrop" data-act="closeSheet"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header><h2>${esc(title)}</h2><button class="icon" data-act="closeSheet" aria-label="بستن">${I.close}</button></header>
        <div class="body">${bodyHTML}</div>
      </section>`;
    updateLock();
    if (onMount) onMount($("#sheet-root .sheet"));
  }
  function closeSheet() {
    $("#sheet-root").innerHTML = "";
    updateLock();
  }
  function updateLock() {
    const open =
      $("#sheet-root").children.length ||
      ($("#search-root") && $("#search-root").children.length);
    document.body.classList.toggle("lock", !!open);
  }
  function confirmSheet(message, yesLabel, onYes) {
    openSheet(
      "تأیید",
      `
      <p style="margin:4px 0 0">${esc(message)}</p>
      <div class="stack">
        <button class="btn danger" id="yes" style="background:var(--exp);color:#fff">${esc(yesLabel)}</button>
        <button class="btn ghost" data-act="closeSheet">انصراف</button>
      </div>`,
      (s) => {
        $("#yes", s).onclick = () => {
          closeSheet();
          onYes();
        };
      },
    );
  }

  // ---------- form helpers ----------
  function dateField(name, iso, noFuture = false) {
    const j = Jalali.toJalali(iso);
    const nowY = Jalali.toJalali(today()).jy;
    const y0 = Math.min(nowY, j.jy) - 8,
      y1 = Math.max(nowY, j.jy) + (noFuture ? 0 : 4);
    const years = [];
    for (let y = y1; y >= y0; y -= 1)
      years.push(
        `<option value="${y}"${y === j.jy ? " selected" : ""}>${fa(y)}</option>`,
      );
    const months = Jalali.MONTHS.map(
      (m, i) =>
        `<option value="${i + 1}"${i + 1 === j.jm ? " selected" : ""}>${m}</option>`,
    ).join("");
    const len = Jalali.monthLength(j.jy, j.jm);
    const days = [];
    for (let d = 1; d <= len; d += 1)
      days.push(
        `<option value="${d}"${d === j.jd ? " selected" : ""}>${fa(d)}</option>`,
      );
    return `<div class="date" data-date="${name}">
      <select data-part="d" aria-label="روز">${days.join("")}</select>
      <select data-part="m" aria-label="ماه">${months}</select>
      <select data-part="y" aria-label="سال">${years.join("")}</select></div>`;
  }
  function readDate(root, name) {
    const box = $(`[data-date="${name}"]`, root);
    const v = (p) => Number($(`[data-part="${p}"]`, box).value);
    const jy = v("y"),
      jm = v("m");
    return Jalali.toISO(jy, jm, Math.min(v("d"), Jalali.monthLength(jy, jm)));
  }
  function refreshDays(box) {
    const dSel = $('[data-part="d"]', box);
    const jy = Number($('[data-part="y"]', box).value),
      jm = Number($('[data-part="m"]', box).value);
    const keep = Number(dSel.value),
      len = Jalali.monthLength(jy, jm);
    let html = "";
    for (let d = 1; d <= len; d += 1)
      html += `<option value="${d}"${d === Math.min(keep, len) ? " selected" : ""}>${fa(d)}</option>`;
    dSel.innerHTML = html;
  }
  const moneyField = (id, value, label = "مبلغ") => `
    <div class="field"><label for="${id}">${label}</label>
      <div class="moneybox"><input class="money" id="${id}" name="${id}" type="text" inputmode="numeric" autocomplete="off" value="${moneyInputValue(value)}" data-money><span class="unit">${Store.unitLabel()}</span></div></div>`;
  const field = (label, html) =>
    `<div class="field"><div class="lbl">${label}</div>${html}</div>`;
  const textInput = (name, value = "", ph = "") =>
    `<input type="text" name="${name}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off" maxlength="80">`;
  const segmented = (name, options, selected) => `
    <div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === selected ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const segValue = (root, name) => {
    const b = $(`[data-seg="${name}"] .on`, root);
    return b ? b.dataset.v : null;
  };

  // ---------- views ----------
  const view = $("#view");

  /** Month switcher: one centered row, always mirror-symmetric around the month name.
   *  Home:    [spacer] [قبل] [تاریخ] [بعد/بعد غیرفعال] [جستجو]
   *  Reports: [spacer] [قبل] [تاریخ] [بعد/بعد غیرفعال] [spacer]  */
  function monthNav(withSearch = false) {
    const idx = monthIdx();
    const away = idx !== curIdx();
    const canNext = idx < maxIdx();
    const fl = (n) => (ui.flash === n ? " flash" : "");
    const gap = '<span class="slot"></span>';
    const btn = (act, label, icon, cls = "") =>
      `<button class="icon${cls}" data-act="${act}" aria-label="${label}" title="${label}">${icon}</button>`;
    const btnOff = (label, icon) =>
      `<button class="icon disabled" disabled aria-disabled="true" aria-label="${label}" title="${label}">${icon}</button>`;
    return `<div class="topbar nav">
    <div class="navzone">${gap}${btn("prevMonth", "ماه قبل", I.prev, fl("prevMonth"))}</div>
    ${
      away
        ? `<button class="monthlabel" data-act="thisMonth" aria-label="برگشت به ماه جاری">${Jalali.MONTHS[ui.jm - 1]} ${fa(ui.jy)}</button>`
        : `<span class="monthlabel">${Jalali.MONTHS[ui.jm - 1]} ${fa(ui.jy)}</span>`
    }
    <div class="navzone">${canNext ? btn("nextMonth", "ماه بعد", I.next, fl("nextMonth")) : btnOff("ماه بعد", I.next)}${withSearch ? btn("openSearch", "جستجو", I.search) : gap}</div>
  </div>`;
  }

  /** A dismissible notification: text on the right, × on the left. */
  function banner(cls, goAct, key, text) {
    return (
      `<div class="banner ${cls}"><button class="bn-main" data-act="${goAct}">${text}</button>` +
      `<button class="icon bn-x" data-act="dismissBanner" data-key="${key}" aria-label="حذف اعلان">${I.close}</button></div>`
    );
  }

  // ----- Home -----
  function matchesFilter(t) {
    const f = ui.filter;
    if (f.type !== "all" && t.type !== f.type) return false;
    if (f.cat !== "all" && (t.catId || "none") !== f.cat) return false;
    if (f.q) {
      const hay = (t.note || "").toLowerCase(); // notes only; categories have their own filter
      if (
        !hay.includes(toLatin(f.q).toLowerCase()) &&
        !hay.includes(f.q.toLowerCase())
      )
        return false;
    }
    return true;
  }

  const accName = (a) => Store.accountLabel(a);
  const accDot = (a) =>
    `<span class="dot" style="background:${a.color || "#8b95a1"}"></span>`;
  function txRow(t, hideAcc) {
    const c = Store.cat(t.catId);
    const a = !hideAcc && t.accountId ? Store.account(t.accountId) : null;
    const tag = a ? `<small class="atag">${esc(accName(a))}</small>` : "";
    if (t.settle) {
      // debt settlement: moves an account balance, is not an expense/income
      return `<div class="row"><span class="dot" style="background:#8b95a1"></span>
        <span class="grow"><b>${t.type === "income" ? "تسویه طلب" : "تسویه بدهی"}</b>${t.note ? `<small>${esc(t.note)}</small>` : ""}${tag}</span>
        <span class="amt ${t.type}">${t.type === "income" ? "+" : "−"}${money(t.amount)}</span></div>`;
    }
    return `<button class="row" data-act="editTx" data-id="${t.id}">
      <span class="dot" style="background:${c ? c.color : "#8b95a1"}"></span>
      <span class="grow"><b>${esc(c ? c.name : NOCAT)}</b>${t.note ? `<small>${esc(t.note)}</small>` : ""}${tag}</span>
      <span class="amt ${t.type}">${t.type === "income" ? "+" : "−"}${money(t.amount)}</span></button>`;
  }

  function listHTML(list, showYear, hideAcc) {
    const groups = [];
    list.forEach((t) => {
      const last = groups[groups.length - 1];
      if (last && last.date === t.date) last.items.push(t);
      else groups.push({ date: t.date, items: [t] });
    });
    return groups
      .map(
        (
          g,
        ) => `<div class="day">${Jalali.WEEKDAYS[Jalali.weekday(g.date)]}، ${Jalali.format(g.date, showYear)}</div>
      <div class="list">${g.items.map((t) => txRow(t, hideAcc)).join("")}</div>`,
      )
      .join("");
  }

  function renderHome() {
    const list = Store.monthTx(monthIdx());
    const sum = Store.summary(list);

    let html = monthNav(true);

    // notifications (each has a × on its left)
    const dues = Store.dueSoon()
      .filter((d) => !Store.isDismissed(`inst:${d.inst.id}:${d.inst.paid}`))
      .slice(0, 2);
    dues.forEach((d) => {
      const when =
        d.days < 0
          ? `${fa(-d.days)} روز از سررسید گذشته`
          : d.days === 0
            ? "امروز سررسید است"
            : `${fa(d.days)} روز دیگر سررسید می‌شود`;
      html += banner(
        "",
        "gotoInstallments",
        `inst:${d.inst.id}:${d.inst.paid}`,
        `قسط «${esc(d.inst.title)}»، ${when}`,
      );
    });
    const st = Store.state;
    const since =
      Math.max(
        st.settings.lastBackup || 0,
        st.settings.createdAt || 0,
        st.settings.backupSnooze || 0,
      ) || Date.now();
    if (
      !dues.length &&
      st.transactions.length >= 5 &&
      Date.now() - since > 30 * 864e5
    ) {
      html += banner(
        "info",
        "gotoBackup",
        "backup",
        `${st.settings.lastBackup ? "مدت زیادی از آخرین پشتیبان‌گیری گذشته است." : "تاکنون از اطلاعات شما پشتیبان‌گیری نشده است."} لطفاً یک نسخه‌ی پشتیبان (JSON) تهیه کنید.`,
      );
    }

    const zb = isZero(sum.balance);
    html += `<div class="card summary">
      <div class="label">تراز این ماه</div>
      <div class="big ${zb ? "zero" : sum.balance < 0 ? "neg" : ""}">${moneyZ(sum.balance)}${zb ? "" : `<small>${Store.unitLabel()}</small>`}</div>
      <div class="split">
        <div><small>درآمد</small><b class="${isZero(sum.income) ? "" : "pos"}">${moneyZ(sum.income)}</b></div>
        <div><small>هزینه</small><b class="${isZero(sum.expense) ? "" : "neg"}">${moneyZ(sum.expense)}</b></div>
      </div></div>`;

    html += list.length
      ? listHTML(list, false)
      : `<div class="empty"><b>هنوز تراکنشی ثبت نشده</b>برای ثبت اولین تراکنش، از دکمه‌ی «تراکنش» استفاده کنید.</div>`;
    view.innerHTML = html;
  }

  // ----- Search (floating window) -----
  const searchRoot = () => $("#search-root");
  /** Category choices for the search window; they follow the selected type. */
  function catOptionsHTML(type, selected) {
    const opt = (c) =>
      `<option value="${c.id}"${selected === c.id ? " selected" : ""}>${esc(c.name)}</option>`;
    let html = '<option value="all">همه‌ی دسته‌ها</option>';
    if (type === "all") {
      html +=
        `<optgroup label="هزینه">${Store.categories("expense").map(opt).join("")}</optgroup>` +
        `<optgroup label="درآمد">${Store.categories("income").map(opt).join("")}</optgroup>`;
    } else {
      html += Store.categories(type).map(opt).join("");
    }
    // Only offered if some transaction lost its category (e.g. the category was deleted).
    const orphan = Store.allTx().some((t) => !t.catId || !Store.cat(t.catId));
    return orphan
      ? `${html}<option value="none"${selected === "none" ? " selected" : ""}>${NOCAT}</option>`
      : html;
  }
  function openSearch() {
    ui.filter = { open: true, q: "", type: "all", cat: "all", all: false };
    ui.accView = null;
    searchRoot().innerHTML = `
      <div class="backdrop sb" data-act="closeSearch"></div>
      <section class="searchwin" role="dialog" aria-label="جستجو">
        <div class="shead">
          <input type="search" id="q" placeholder="جستجو در یادداشت‌ها…" autocomplete="off" enterkeyhint="search">
          <button class="icon" data-act="closeSearch" aria-label="بستن">${I.close}</button>
        </div>
        <div class="row2">
          <select id="ftype"><option value="all">همه</option><option value="expense">هزینه</option><option value="income">درآمد</option></select>
          <select id="fcat">${catOptionsHTML("all", "all")}</select>
        </div>
        <label class="check"><input type="checkbox" id="fall"> جستجو در همه‌ی ماه‌ها</label>
        <div id="sres" class="sres"></div>
      </section>`;
    updateLock();
    updateSearch();
    const q = $("#q");
    if (q) q.focus();
  }
  function closeSearch() {
    searchRoot().innerHTML = "";
    ui.filter = { open: false, q: "", type: "all", cat: "all", all: false };
    updateLock();
  }
  function updateSearch() {
    const el = $("#sres");
    if (!el) return;
    const f = ui.filter;
    const source = f.all ? Store.allTx() : Store.monthTx(monthIdx());
    const list = source.filter(matchesFilter);
    const scope = f.all
      ? "همه‌ی ماه‌ها"
      : `فقط ${Jalali.MONTHS[ui.jm - 1]} ${fa(ui.jy)}`;
    if (!list.length) {
      el.innerHTML = `<div class="empty"><b>موردی پیدا نشد</b>${scope}</div>`;
      return;
    }
    const shown = list.slice(0, 200);
    const s = Store.summary(list);
    el.innerHTML = `<p class="note scope">${scope}، ${fa(list.length)} مورد</p>${listHTML(shown, f.all)}
      <p class="note sum"><span>درآمد: ${moneyU(s.income)}</span><span>هزینه: ${moneyU(s.expense)}</span></p>${list.length > shown.length ? `<p class="note" style="text-align:center">${fa(shown.length)} مورد نخست نمایش داده شد</p>` : ""}`;
  }

  // ----- Reports -----
  function donutSVG(items, total) {
    const r = 52,
      C = 2 * Math.PI * r;
    let off = 0;
    const segs = items
      .map((it) => {
        const len = (it.value / total) * C;
        const s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${it.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
        off += len;
        return s;
      })
      .join("");
    const ring = segs;
    return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="سهم هر دسته از هزینه‌ها">
      <g transform="rotate(-90 70 70)">${ring}</g>
      <text x="70" y="66" text-anchor="middle" font-size="9" style="fill:var(--muted)">هزینه‌ی ماه</text>
      <text x="70" y="84" text-anchor="middle" font-size="13" font-weight="700" style="fill:var(--text)">${total ? money(total) : DASH}</text></svg>`;
  }

  function renderReports() {
    const idx = monthIdx();
    const spent = Store.spentByCat(idx);
    const total = spent.reduce((a, b) => a + b.value, 0);
    const items = spent.map((s) => {
      const c = Store.cat(s.catId);
      return {
        name: c ? c.name : NOCAT,
        color: c ? c.color : "#8b95a1",
        value: s.value,
        catId: s.catId,
      };
    });

    let html = monthNav(false);
    html += `<div class="section-title">سهم دسته‌ها از هزینه‌ها</div><div class="card">`;
    if (!total)
      html += `<div class="empty" style="padding:20px"><b>در این ماه هزینه‌ای ثبت نشده است</b></div>`;
    else {
      html += `<div class="donut-solo">${donutSVG(items, total)}</div>`;
      html += `<div class="list" style="margin-top:10px;border:0">${items
        .map(
          (it) =>
            `<div class="row" style="padding:9px 0"><span class="dot" style="background:${it.color}"></span><span class="grow">${esc(it.name)}</span><span class="pct">${fa(percent(it.value, total))}٪</span><span class="amt">${money(it.value)}</span></div>`,
        )
        .join("")}</div>`;
    }
    html += `</div>`;

    const st = Store.settleTotals(idx);
    if (st.paid || st.received) {
      html += `<div class="section-title">تسویه‌ی بدهی و طلب</div><div class="card"><div class="list" style="border:0">`;
      if (st.paid)
        html += `<div class="row" style="padding:9px 0"><span class="grow">بازپرداخت بدهی</span><span class="amt">${money(st.paid)}</span></div>`;
      if (st.received)
        html += `<div class="row" style="padding:9px 0"><span class="grow">دریافت طلب</span><span class="amt">${money(st.received)}</span></div>`;
      html += `</div><div style="margin-top:6px;font-size:13px;color:var(--muted)">این مبلغ‌ها در درآمد، هزینه و تراز ماه آمده‌اند، اما در سهم دسته‌ها نیستند.</div></div>`;
    }

    // budgets
    const budgeted = Store.categories("expense").filter((c) => c.budget);
    if (budgeted.length) {
      html += `<div class="section-title">بودجه‌ی این ماه</div><div class="list">`;
      budgeted.forEach((c) => {
        const used = (spent.find((s) => s.catId === c.id) || { value: 0 })
          .value;
        const p = percent(used, c.budget);
        const cls = p >= 100 ? "over" : p >= 80 ? "warn" : "";
        const left = c.budget - used;
        html += `<div class="item"><div class="head"><b>${esc(c.name)}</b><span class="chip ${cls || "ok"}">${p === 0 ? DASH : `${fa(p)}٪`}</span></div>
          <div class="bar ${cls}"><i style="width:${Math.min(100, p)}%"></i></div>
          <div class="meta"><span>${moneyZ(used)} از ${money(c.budget)}</span><span>${left >= 0 ? `${money(left)} مانده` : `${money(-left)} بیشتر از سقف`}</span></div></div>`;
      });
      html += `</div>`;
    } else {
      html += `<p class="note" style="text-align:center;margin-top:16px">برای هر دسته‌ی هزینه می‌توانید در «تنظیمات» بودجه‌ی ماهانه تعیین کنید.</p>`;
    }

    // bars: the 3 months ending at the viewed month
    const months = Store.lastMonths(idx, 3);
    const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
    html += `<div class="section-title">درآمد و هزینه‌ی ۳ ماه اخیر</div><div class="card"><div class="bars">${months
      .map(
        (m) =>
          `<div class="col ${m.idx === idx ? "cur" : ""}">
        <div class="pair"><i class="inc" style="height:${(m.income / max) * 100}%"></i><i class="exp" style="height:${(m.expense / max) * 100}%"></i></div>
        <label>${Jalali.MONTHS[m.jm - 1]}</label></div>`,
      )
      .join("")}</div>
      <div class="key"><span><i style="background:var(--inc)"></i>درآمد</span><span><i style="background:var(--exp)"></i>هزینه</span></div></div>`;
    view.innerHTML = html;
  }

  // ----- Accounts -----
  function accountCard(a) {
    const bal = Store.accountBalance(a.id);
    return `<button class="acc" data-act="openAcc" data-id="${a.id}">${accDot(a)}
    <span class="grow"><b>${esc(accName(a))}</b></span>
    <span class="bal ${bal < 0 ? "neg" : ""}"><span class="amt">${moneyZ(bal)}</span>${isZero(bal) ? "" : `<small>${Store.unitLabel()}</small>`}</span></button>`;
  }
  function renderAccounts() {
    const list = Store.accounts();
    let html = `<div class="topbar"><h1 style="font-size:20px;padding:6px 4px">حساب‌ها</h1></div>`;
    if (!list.length) {
      html += `<div class="empty"><b>هنوز حسابی ثبت نشده</b>برای ثبت حساب بانکی و پیگیری موجودی، از دکمه‌ی «حساب» استفاده کنید.</div>`;
    } else {
      const tot = Store.totalBalance();
      html += `<div class="card summary"><div class="label">مجموع موجودی</div>
        <div class="big ${isZero(tot) ? "zero" : tot < 0 ? "neg" : ""}">${moneyZ(tot)}${isZero(tot) ? "" : `<small>${Store.unitLabel()}</small>`}</div>
        <div class="note" style="margin:0">${fa(list.length)} حساب</div></div>
        <div class="list acclist">${list.map(accountCard).join("")}</div>
        <p class="note">با انتخاب هر حساب، تراکنش‌های آن نمایش داده می‌شود.</p>`;
    }
    view.innerHTML = html;
  }

  /** Floating window with one account's balance and transactions. */
  function accWinHTML(a) {
    const bal = Store.accountBalance(a.id),
      tot = Store.accountTotals(a.id),
      list = Store.accountTx(a.id);
    return `<div class="shead">${accDot(a)}<span class="grow"><b>${esc(accName(a))}</b></span>
    <button class="icon" data-act="closeAcc" aria-label="بستن">${I.close}</button></div>
      <div class="accsum"><div class="label">موجودی فعلی</div>
        <div class="big ${isZero(bal) ? "zero" : bal < 0 ? "neg" : ""}">${moneyZ(bal)}${isZero(bal) ? "" : `<small>${Store.unitLabel()}</small>`}</div>
        <div class="split"><div><small>واریز</small><b class="${isZero(tot.income) ? "" : "pos"}">${moneyZ(tot.income)}</b></div>
        <div><small>برداشت</small><b class="${isZero(tot.expense) ? "" : "neg"}">${moneyZ(tot.expense)}</b></div></div></div>
      <div class="actions"><button class="btn sm" data-act="addTxAcc" data-id="${a.id}">＋ تراکنش</button><button class="btn ghost sm" data-act="editAcc" data-id="${a.id}">ویرایش حساب</button></div>
      <div class="sres">${list.length ? listHTML(list.slice(0, 300), true, true) : '<div class="empty"><b>تراکنشی ثبت نشده</b>تراکنش‌هایی که این حساب را برایشان انتخاب کنید اینجا نمایش داده می‌شوند.</div>'}</div>`;
  }
  function openAccWin(id) {
    const a = Store.account(id);
    if (!a) return;
    closeSearch();
    ui.accView = id;
    searchRoot().innerHTML = `<div class="backdrop sb" data-act="closeAcc"></div>
      <section class="searchwin accwin" id="accwin" role="dialog" aria-label="${esc(accName(a))}">${accWinHTML(a)}</section>`;
    updateLock();
  }
  function closeAcc() {
    ui.accView = null;
    searchRoot().innerHTML = "";
    updateLock();
  }
  function updateAccWin() {
    if (!ui.accView) return;
    const el = $("#accwin"),
      a = Store.account(ui.accView);
    if (!el || !a) {
      closeAcc();
      return;
    }
    const old = $(".sres", el),
      top = old ? old.scrollTop : 0;
    el.innerHTML = accWinHTML(a);
    const nu = $(".sres", el);
    if (nu) nu.scrollTop = top;
  }

  // chips for choosing an (optional) account
  const accountChips = (name, selected) => `<div class="chips accchips">
  ${Store.accounts()
    .map(
      (a) =>
        `<label><input type="radio" name="${name}" value="${a.id}"${a.id === selected ? " checked" : ""}><span><i class="dot" style="background:${a.color}"></i>${esc(accName(a))}</span></label>`,
    )
    .join("")}</div>`;
  const pickedAccount = (root, name) => {
    const el = root.querySelector(`input[name="${name}"]:checked`);
    return el && el.value ? el.value : null;
  };

  /** True when spending `amount` from the account would take it below zero.
   *  `skipTxId`: a transaction being edited, whose old effect is ignored. */
  function overdraws(accId, amount, skipTxId) {
    if (!accId || !Store.account(accId)) return false;
    let bal = Store.accountBalance(accId);
    const old = skipTxId ? Store.tx(skipTxId) : null;
    if (old && old.accountId === accId)
      bal -= old.type === "income" ? old.amount : -old.amount;
    return bal - amount < 0;
  }
  const noFunds = (accId) =>
    toast(`موجودی حساب «${accName(Store.account(accId))}» کافی نیست`);

  /** Confirmation that also asks, when accounts exist, which account the money moves through. */
  function accountConfirmSheet(title, message, yesLabel, onYes) {
    const has = Store.accounts().length > 0;
    openSheet(
      title,
      `
      <p style="margin:4px 0 ${has ? 12 : 0}px">${esc(message)}</p>
      ${has ? field("حساب", accountChips("pay", null)) : ""}
      <div class="stack"><button class="btn" id="yes">${esc(yesLabel)}</button>
      <button class="btn ghost" data-act="closeSheet">انصراف</button></div>`,
      (s) => {
        $("#yes", s).onclick = () => {
          const id = pickedAccount(s, "pay");
          closeSheet();
          onYes(id);
        };
      },
    );
  }

  // ----- Plans: debts / installments / goals -----
  const PLAN_DONE = {
    debts: "پرداخت‌شده",
    installments: "تکمیل‌شده",
    goals: "پرداخت‌شده",
  };
  function renderPlans() {
    const t = ui.plansTab;
    const debts = Store.debts(),
      insts = Store.installments(),
      goals = Store.goals();
    const isDone = {
      debts: (d) => d.settled,
      installments: (i) => Store.instDone(i),
      goals: (g) => g.saved >= g.target,
    };
    const src = { debts, installments: insts, goals };
    const nDone = src[t].filter(isDone[t]).length,
      nCur = src[t].length - nDone;
    const pv = ui.plansView[t] === "done" ? "done" : "current";

    let html = `<div class="topbar"><h1 style="font-size:20px;padding:6px 4px">تعهدات</h1></div>
      <div class="seg subtabs" data-seg="plans">
        <button data-act="plansTab" data-v="debts" class="${t === "debts" ? "on" : ""}">طلب و بدهی</button>
        <button data-act="plansTab" data-v="installments" class="${t === "installments" ? "on" : ""}">قسط و وام</button>
        <button data-act="plansTab" data-v="goals" class="${t === "goals" ? "on" : ""}">اهداف</button></div>
      <div class="seg subtabs2" data-seg="pview">
        <button data-act="plansView" data-v="current" class="${pv === "current" ? "on" : ""}">جاری (${fa(nCur)})</button>
        <button data-act="plansView" data-v="done" class="${pv === "done" ? "on" : ""}">${PLAN_DONE[t]} (${fa(nDone)})</button></div>`;
    const showDone = pv === "done";
    const empty = (title, text) =>
      `<div class="empty"><b>${title}</b>${text}</div>`;

    if (t === "debts") {
      const tot = Store.debtTotals();
      if (!showDone && nCur)
        html += `<div class="card summary"><div class="split">
        <div><small>طلب من</small><b class="${isZero(tot.lent) ? "" : "pos"}">${moneyZ(tot.lent)}</b></div>
        <div><small>بدهی من</small><b class="${isZero(tot.borrowed) ? "" : "neg"}">${moneyZ(tot.borrowed)}</b></div></div></div>`;
      const row = (d) => {
        const a = d.settleTx
          ? Store.account((Store.tx(d.settleTx) || {}).accountId)
          : null;
        return `<div class="item">
        <div class="head"><b>${esc(d.person)}</b><span class="amt ${d.dir === "lent" ? "income" : ""}" style="${d.dir === "borrowed" ? "color:var(--exp)" : ""}">${money(d.amount)}</span></div>
        <div class="meta"><span>${d.dir === "lent" ? "به من بدهکار است" : "من بدهکارم"}، ${Jalali.format(d.date)}</span></div>
        ${d.note ? `<small>${esc(d.note)}</small>` : ""}
        ${d.settled && d.settledAt ? `<small>تسویه: ${Jalali.format(d.settledAt)}${a ? `، ${esc(accName(a))}` : ""}</small>` : ""}
        <div class="actions"><button class="btn ${d.settled ? "ghost " : ""}sm" data-act="${d.settled ? "reopenDebt" : "settleDebt"}" data-id="${d.id}">${d.settled ? "برگرداندن" : "تسویه شد ✓"}</button><button class="btn ghost sm" data-act="editDebt" data-id="${d.id}">ویرایش</button></div></div>`;
      };
      const list = debts
        .filter((d) => d.settled === showDone)
        .sort((x, y) =>
          showDone
            ? (y.settledAt || "").localeCompare(x.settledAt || "")
            : x.date.localeCompare(y.date),
        );
      html += list.length
        ? `<div class="list">${list.map(row).join("")}</div>`
        : showDone
          ? empty(
              "موردی تسویه نشده",
              "طلب‌ها و بدهی‌های تسویه‌شده در اینجا نمایش داده می‌شوند.",
            )
          : empty(
              "موردی ثبت نشده",
              "طلب‌ها و بدهی‌های خود را در اینجا ثبت کنید.",
            );
    }

    if (t === "installments") {
      const card = (i) => {
        const done = Store.instDone(i);
        const due = Store.instNextDue(i);
        const days = due ? Store.daysUntil(due) : 0;
        const chip = done
          ? '<span class="chip ok">تمام شد</span>'
          : days < 0
            ? `<span class="chip over">${fa(-days)} روز تأخیر</span>`
            : days <= 3
              ? `<span class="chip warn">${days === 0 ? "امروز" : `${fa(days)} روز دیگر`}</span>`
              : `<span class="chip">${fa(days)} روز دیگر</span>`;
        const remain = (i.count - i.paid) * i.amount;
        return `<div class="item"><div class="head"><b>${esc(i.title)}</b>${chip}</div>
          <div class="bar"><i style="width:${percent(i.paid, i.count)}%"></i></div>
          <div class="meta"><span>${fa(i.paid)} از ${fa(i.count)} قسط پرداخت شده</span><span>${money(i.amount)} ${Store.unitLabel()}</span></div>
          <div class="meta"><span>${done ? "" : `قسط بعدی: ${Jalali.format(due)}`}</span><span>${done ? "" : `مانده: ${money(remain)}`}</span></div>
          <div class="actions">${done ? "" : `<button class="btn sm" data-act="payInst" data-id="${i.id}">پرداخت شد ✓</button>`}<button class="btn ghost sm" data-act="editInst" data-id="${i.id}">ویرایش</button></div></div>`;
      };
      // current: nearest due date first
      const list = insts
        .filter((i) => Store.instDone(i) === showDone)
        .sort((x, y) =>
          showDone
            ? y.firstDue.localeCompare(x.firstDue)
            : Store.instNextDue(x).localeCompare(Store.instNextDue(y)),
        );
      html += list.length
        ? `<div class="list">${list.map(card).join("")}</div>`
        : showDone
          ? empty(
              "وام تکمیل‌شده‌ای نیست",
              "وام‌هایی که همه‌ی اقساطشان پرداخت شوند، اینجا نمایش داده می‌شوند.",
            )
          : empty(
              "قسط یا وامی ثبت نشده",
              "پس از ثبت قسط، یادآوری سررسید در صفحه‌ی خانه نمایش داده می‌شود.",
            );
      if (!showDone && list.length)
        html += `<p class="note">با «پرداخت شد»، یک هزینه در دسته‌ی «قسط و وام» با تاریخ امروز ثبت می‌شود.</p>`;
    }

    if (t === "goals") {
      const card = (g) => {
        const p = percent(g.saved, g.target);
        return `<div class="item"><div class="head"><b>${esc(g.title)}</b><span class="chip ${p >= 100 ? "ok" : ""}">${p === 0 ? DASH : `${fa(Math.min(p, 100))}٪`}</span></div>
          <div class="bar"><i style="width:${Math.min(100, p)}%"></i></div>
          <div class="meta"><span>${isZero(g.saved) ? `${DASH} از ${money(g.target)}` : `${money(g.saved)} از ${money(g.target)} ${Store.unitLabel()}`}</span><span>${g.target > g.saved ? `${money(g.target - g.saved)} مانده` : ""}</span></div>
          <div class="actions"><button class="btn sm" data-act="addToGoal" data-id="${g.id}">افزودن مبلغ</button><button class="btn ghost sm" data-act="editGoal" data-id="${g.id}">ویرایش</button></div></div>`;
      };
      const list = goals.filter((g) => g.saved >= g.target === showDone);
      html += list.length
        ? `<div class="list">${list.map(card).join("")}</div>`
        : showDone
          ? empty(
              "هدفی به پایان نرسیده",
              "هدف‌هایی که به مبلغ مورد نظر برسند در اینجا نمایش داده می‌شوند.",
            )
          : empty(
              "هدفی تعریف نشده",
              "برای نمونه «خرید لپ‌تاپ» را با مبلغ هدف و میزان پس‌انداز ثبت کنید.",
            );
    }
    view.innerHTML = html;
  }

  // ----- Settings -----
  function renderSettings() {
    const st = Store.state;
    const lb = st.settings.lastBackup;
    const catRow = (
      c,
    ) => `<button class="row" data-act="editCat" data-id="${c.id}"><span class="dot" style="background:${c.color}"></span>
      <span class="grow"><b>${esc(c.name)}</b>${c.budget ? `<small>بودجه: ${money(c.budget)} ${Store.unitLabel()}</small>` : ""}</span></button>`;
    const rec = st.recurring
      .map((r) => {
        const c = Store.cat(r.catId);
        return `<div class="row"><span class="grow"><b>${esc(c ? c.name : NOCAT)}${r.note ? "، " + esc(r.note) : ""}</b><small>هر ماه، روز ${fa(r.day)}، ${r.type === "income" ? "درآمد" : "هزینه"}</small></span>
        <span class="amt">${money(r.amount)}</span><button class="icon" data-act="delRec" data-id="${r.id}" aria-label="حذف">${I.close}</button></div>`;
      })
      .join("");

    view.innerHTML = `
      <div class="topbar"><h1 style="font-size:20px;padding:6px 4px">تنظیمات</h1></div>
      <div class="section-title">واحد پول</div>
      ${segmented(
        "unit",
        [
          ["rial", "ریال"],
          ["toman", "تومان"],
        ],
        Store.unit(),
      )}

      <div class="section-title">ظاهر</div>
      ${segmented(
        "theme",
        [
          ["system", "سیستم"],
          ["light", "روشن"],
          ["dark", "تاریک"],
        ],
        Store.theme(),
      )}

      <div class="section-title">دسته‌بندی‌ها و بودجه</div>
      <div class="list">${Store.categories("expense").map(catRow).join("")}</div>
      <div class="section-title" style="margin-top:14px">دسته‌های درآمد</div>
      <div class="list">${Store.categories("income").map(catRow).join("")}</div>
      <div class="stack"><button class="btn ghost" data-act="addCat">＋ دسته‌ی جدید</button></div>

      <div class="section-title">تراکنش‌های تکراری</div>
      ${rec ? `<div class="list">${rec}</div>` : `<p class="note" style="margin:0 4px">تراکنش‌هایی که هنگام ثبت، گزینه‌ی «تکرار هر ماه» برای آن‌ها فعال شود، در این فهرست نمایش داده می‌شوند.</p>`}

      <div class="section-title">پشتیبان‌گیری</div>
      <div class="card">
        <p class="note" style="margin:0 0 12px">داده‌ها فقط روی همین دستگاه ذخیره می‌شوند.${lb ? `<br>آخرین پشتیبان: ${Jalali.format(isoOf(lb))}` : "<br>تاکنون پشتیبان‌گیری انجام نشده است."}</p>
        <div class="stack" style="margin:0">
          <button class="btn" data-act="exportJSON">پشتیبان‌گیری (<bdi>JSON</bdi>)</button>
          <button class="btn ghost" data-act="exportCSV">خروجی اکسل (<bdi>Excel</bdi>)</button>
          <button class="btn ghost" data-act="importJSON">بازگردانی اطلاعات (<bdi>JSON</bdi>)</button>
          <input type="file" id="importFile" accept=".json,application/json" hidden>
        </div></div>

      <div class="stack" style="margin-top:28px">
        <button class="btn danger" data-act="resetAll">حذف همه‌ی داده‌ها</button>
      </div>
      <p class="note" style="text-align:center;margin-top:20px;line-height:1.9">مدیریت مالی شخصی - نسخه ${fa(1)}<br>متن‌باز با لایسنس MIT</p>`;
  }

  // ---------- render dispatcher ----------
  function render() {
    document
      .querySelectorAll(".tab")
      .forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
    document.querySelectorAll(".tab .ico").forEach((el) => {
      const key = el.parentElement.dataset.tab;
      el.innerHTML = {
        home: I.home,
        reports: I.chart,
        accounts: I.card,
        plans: I.plans,
        settings: I.gear,
      }[key];
    });
    $("#fab").classList.toggle("hidden", ui.tab !== "home");
    $("#fab2").classList.toggle(
      "hidden",
      ui.tab !== "plans" && ui.tab !== "accounts",
    );
    $("#fab2-label").textContent =
      ui.tab === "accounts"
        ? "حساب"
        : { debts: "طلب / بدهی", installments: "قسط / وام", goals: "هدف" }[
            ui.plansTab
          ] || "";
    $("#fab").classList.remove("away");
    $("#fab2").classList.remove("away");
    const badge = $('.tab[data-tab="plans"] .badge');
    badge.hidden = Store.dueSoon().length === 0;
    ({
      home: renderHome,
      reports: renderReports,
      accounts: renderAccounts,
      plans: renderPlans,
      settings: renderSettings,
    })[ui.tab]();
    ui.flash = null;
    updateSearch(); // keep an open search window in sync after edits
    updateAccWin();
  }

  // ---------- sheets: forms ----------
  const NOTE_HINT = {
    expense: "مثال: ناهار با همکاران",
    income: "مثال: واریز حقوق",
  };
  function txSheet(id, draft) {
    const existing = id ? Store.tx(id) : null;
    const t = Object.assign(
      {},
      existing || {
        type: "expense",
        amount: 0,
        catId: null,
        note: "",
        date: today(),
      },
      draft || {},
    );
    let type = t.type;
    const chipsHTML = (ty, sel) =>
      Store.categories(ty)
        .map(
          (c) =>
            `<label><input type="radio" name="cat" value="${c.id}"${c.id === sel ? " checked" : ""}><span><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span></label>`,
        )
        .join("") +
      '<button type="button" class="addcat" data-act="addCatFromTx" aria-label="دسته‌ی جدید">＋</button>';
    openSheet(
      existing ? "ویرایش تراکنش" : "تراکنش جدید",
      `
      <form data-form="tx" data-id="${id || ""}">
        ${segmented(
          "type",
          [
            ["expense", "هزینه"],
            ["income", "درآمد"],
          ],
          type,
        )}
        <div style="height:14px"></div>
        ${moneyField("amount", t.amount)}
        ${Store.accounts().length ? field("حساب (اختیاری)", accountChips("acc", t.accountId || null)) : ""}
        ${field("دسته (اختیاری)", `<div class="chips" id="catChips">${chipsHTML(type, t.catId)}</div>`)}
        ${field("یادداشت (اختیاری)", textInput("note", t.note, NOTE_HINT[type]))}
        ${field("تاریخ", dateField("date", t.date, true))}
        ${existing ? "" : `<label class="check" style="margin-bottom:14px"><input type="checkbox" name="repeat"> تکرار هر ماه (در همین روز از ماه)</label>`}
        <div class="stack"><button class="btn" type="submit">ذخیره</button>${existing ? `<button class="btn danger" type="button" data-act="delTx" data-id="${id}">حذف تراکنش</button>` : ""}</div>
      </form>`,
      (s) => {
        const chips = $("#catChips", s);
        $('[data-seg="type"]', s).addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-v]");
          if (!btn) return;
          const nt = btn.dataset.v;
          if (nt === type) return;
          type = nt;
          chips.innerHTML = chipsHTML(type, null);
          $('input[name="note"]', s).placeholder = NOTE_HINT[type];
        });
        setTimeout(() => {
          const a = $("#amount", s);
          if (!existing && a) a.focus();
        }, 280);
      },
    );
  }

  function saveTxForm(form) {
    const amount = parseMoney($("#amount", form).value);
    if (!(amount > 0)) {
      toast("مبلغ را وارد کنید");
      return;
    }
    const type = segValue(form, "type");
    const catEl = form.querySelector('input[name="cat"]:checked');
    const data = {
      type,
      amount,
      catId: catEl ? catEl.value : null,
      accountId: pickedAccount(form, "acc"),
      note: form.elements.note.value.trim(),
      date: readDate(form, "date"),
    };
    if (data.date > today()) {
      toast("تاریخ تراکنش نمی‌تواند در آینده باشد");
      return;
    }

    const commit = () => {
      const id = form.dataset.id;
      if (id) data.id = id;
      const repeat = form.elements.repeat && form.elements.repeat.checked;
      Store.saveTx(data);
      if (repeat) {
        const j = Jalali.toJalali(data.date);
        Store.addRecurring({
          type,
          amount,
          catId: data.catId,
          accountId: data.accountId,
          note: data.note,
          day: j.jd,
          lastIdx: j.jy * 12 + j.jm - 1,
        });
      }
      closeSheet();
      persist();
      render();
      toast(repeat ? "تراکنش ثبت شد و هر ماه تکرار می‌شود" : "تراکنش ثبت شد");
    };

    if (
      data.accountId &&
      type === "expense" &&
      overdraws(data.accountId, amount, form.dataset.id)
    ) {
      noFunds(data.accountId);
      return;
    }
    commit();
  }

  function catSheet(id, back) {
    const c = id ? Store.cat(id) : null;
    let type = c ? c.type : (back && back.type) || "expense";
    openSheet(
      c ? "ویرایش دسته" : "دسته‌ی جدید",
      `
      <form data-form="cat" data-id="${id || ""}">
        ${field("نام", textInput("name", c ? c.name : "", "مثال: ورزش"))}
        ${
          c
            ? ""
            : field(
                "نوع",
                segmented(
                  "ctype",
                  [
                    ["expense", "هزینه"],
                    ["income", "درآمد"],
                  ],
                  type,
                ),
              )
        }
        <div id="budgetBox" ${type === "income" ? "hidden" : ""}>${moneyField("budget", c ? c.budget : 0, "بودجه‌ی ماهانه (اختیاری)")}</div>
        <div class="stack"><button class="btn" type="submit">ذخیره</button>
        ${c ? `<button class="btn danger" type="button" data-act="delCat" data-id="${id}">حذف دسته</button>` : ""}</div>
      </form>`,
      (s) => {
        const seg = $('[data-seg="ctype"]', s);
        if (seg) {
          seg.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-v]");
            if (!btn) return;
            type = btn.dataset.v;
            $("#budgetBox", s).hidden = type === "income";
          });
        }
      },
    );
    ui.txBack = back || null; // set when launched from the transaction form: saving or cancelling returns there
  }

  const BANKS = [
    "ملی",
    "ملت",
    "صادرات",
    "تجارت",
    "سپه",
    "پاسارگاد",
    "پارسیان",
    "سامان",
    "رفاه",
    "کشاورزی",
    "مسکن",
    "آینده",
    "شهر",
    "دی",
    "اقتصاد نوین",
    "سینا",
    "ایران‌زمین",
  ];
  function accountSheet(id) {
    const a = id ? Store.account(id) : null;
    const bal = a ? a.balance : 0;
    openSheet(
      a ? "ویرایش حساب" : "حساب جدید",
      `
      <form data-form="acct" data-id="${id || ""}">
        ${field("نام بانک", `<input type="text" name="bank" value="${esc(a ? a.bank : "")}" placeholder="مثال: ملت" list="banks" autocomplete="off" maxlength="30"><datalist id="banks">${BANKS.map((b) => `<option value="${b}">`).join("")}</datalist>`)}
        ${field("عنوان کارت (اختیاری)", textInput("title", a ? a.title : "", "مثال: حقوق"))}
        ${moneyField("balance", bal, a ? "موجودی اولیه" : "موجودی فعلی")}
        <div class="stack"><button class="btn" type="submit">ذخیره</button>${a ? `<button class="btn danger" type="button" data-act="delAcc" data-id="${id}">حذف حساب</button>` : ""}</div>
      </form>`,
      (s) =>
        setTimeout(() => {
          if (!a) {
            const b = $('input[name="bank"]', s);
            if (b) b.focus();
          }
        }, 280),
    );
  }

  function debtSheet(id) {
    const d = id ? Store.debts().find((x) => x.id === id) : null;
    const ot = d && d.originTx ? Store.tx(d.originTx) : null;
    const hasTx = Store.accounts().length && (!d || ot);
    openSheet(
      d ? "ویرایش" : "طلب یا بدهی",
      `
      <form data-form="debt" data-id="${id || ""}">
        ${segmented(
          "dir",
          [
            ["lent", "طلب (بدهکار به من)"],
            ["borrowed", "بدهی (من بدهکارم)"],
          ],
          d ? d.dir : "lent",
        )}
        <div style="height:14px"></div>
        ${field("نام شخص", textInput("person", d ? d.person : "", "مثال: علی"))}
        ${moneyField("amount", d ? d.amount : 0)}
        ${field("یادداشت (اختیاری)", textInput("note", d ? d.note : ""))}
        ${field("تاریخ", dateField("date", d ? d.date : today(), true))}
        ${hasTx ? field("حساب (اختیاری)", accountChips("acc", ot ? ot.accountId || null : null)) : ""}
        ${d ? "" : `<label class="check" style="margin-bottom:14px"><input type="checkbox" name="record" checked> ثبت در تراکنش‌ها (بدهی به‌عنوان درآمد و طلب به‌عنوان هزینه)</label>`}
        <div class="stack"><button class="btn" type="submit">ذخیره</button>${d ? `<button class="btn danger" type="button" data-act="delDebt" data-id="${id}">حذف</button>` : ""}</div>
      </form>`,
    );
  }

  function instSheet(id) {
    const i = id ? Store.inst(id) : null;
    openSheet(
      i ? "ویرایش قسط" : "قسط یا وام جدید",
      `
      <form data-form="inst" data-id="${id || ""}">
        ${field("عنوان", textInput("title", i ? i.title : "", "مثال: وام خودرو"))}
        ${moneyField("amount", i ? i.amount : 0, "مبلغ هر قسط")}
        ${field("تعداد کل قسط‌ها", `<input type="text" inputmode="numeric" name="count" value="${i ? fa(i.count) : ""}" placeholder="۱۲" autocomplete="off">`)}
        ${field("تاریخ سررسید اولین قسط", dateField("first", i ? i.firstDue : today()))}
        ${field("تعداد قسط‌های پرداخت‌شده تاکنون (اختیاری)", `<input type="text" inputmode="numeric" name="paid" value="${i && i.paid ? fa(i.paid) : ""}" placeholder="مثال: ۳" autocomplete="off">`)}
        <div class="stack"><button class="btn" type="submit">ذخیره</button>${i ? `<button class="btn danger" type="button" data-act="delInst" data-id="${id}">حذف</button>` : ""}</div>
      </form>`,
    );
  }

  function goalSheet(id) {
    const g = id ? Store.goals().find((x) => x.id === id) : null;
    openSheet(
      g ? "ویرایش هدف" : "هدف جدید",
      `
      <form data-form="goal" data-id="${id || ""}">
        ${field("عنوان", textInput("title", g ? g.title : "", "مثال: خرید لپ‌تاپ"))}
        ${moneyField("target", g ? g.target : 0, "مبلغ هدف")}
        ${moneyField("saved", g ? g.saved : 0, "مبلغ پس‌انداز تاکنون")}
        <div class="stack"><button class="btn" type="submit">ذخیره</button>${g ? `<button class="btn danger" type="button" data-act="delGoal" data-id="${id}">حذف</button>` : ""}</div>
      </form>`,
    );
  }

  function addToGoalSheet(id) {
    const g = Store.goals().find((x) => x.id === id);
    if (!g) return;
    openSheet(
      `افزودن به «${g.title}»`,
      `
      <form data-form="addgoal" data-id="${id}">${moneyField("amount", 0, "مبلغ")}
      <div class="stack"><button class="btn" type="submit">افزودن</button></div></form>`,
      (s) => setTimeout(() => $("#amount", s).focus(), 280),
    );
  }

  // ---------- install guide ----------
  const isStandalone = () =>
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  const isAppleMobile = () =>
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  /** iPhone/iPad Safari tab (not installed): the app is blocked behind a full-screen install page.
   *  Safari and the installed app keep separate storage, so using it in the tab would split the data. */
  function showInstallGate() {
    const notSafari = /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
    document.body.classList.add("gated");
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <main class="gate" role="main">
        <div class="gate-in">
          <img src="icons/icon-192.png" alt="" width="84" height="84">
          <h1>مدیریت مالی شخصی</h1>
          <p>برای استفاده از برنامه، ابتدا آن را به صفحه‌ی اصلی گوشی اضافه کنید.</p>
          <ol class="steps">
            <li><span>در <b>Safari</b>، دکمه‌ی اشتراک‌گذاری ${I.share} را در پایین یا بالای صفحه لمس کنید.</span></li>
            <li><span>گزینه‌ی <b>Add to Home Screen</b> (افزودن به صفحه‌ی اصلی) را انتخاب کنید.</span></li>
            <li><span>گزینه‌ی <b>Add</b> (افزودن) را لمس کنید و برنامه را از روی آیکون آن در صفحه‌ی اصلی باز کنید.</span></li>
          </ol>
          ${notSafari ? '<p class="note">در صورت استفاده از مرورگری غیر از Safari، نشانی برنامه را در Safari باز کنید.</p>' : ""}
        </div>
      </main>`,
    );
  }

  // ---------- file export / import ----------
  async function saveFile(name, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  const stamp = () => Jalali.formatNumeric(today()).replace(/\//g, "-");

  // ---------- actions (click) ----------
  const actions = {
    tab(el) {
      ui.tab = el.dataset.tab;
      window.scrollTo(0, 0);
      render();
    },
    closeSheet() {
      const back = ui.txBack;
      if (back) {
        txSheet(back.id || null, back);
        return;
      } // cancelled the quick-add category: return to the transaction form
      closeSheet();
    },
    prevMonth() {
      const i = monthIdx() - 1;
      Object.assign(ui, Jalali.fromIdx(i));
      ui.flash = "prevMonth";
      render();
    },
    nextMonth() {
      const i = monthIdx() + 1;
      if (i > maxIdx()) return;
      Object.assign(ui, Jalali.fromIdx(i));
      ui.flash = "nextMonth";
      render();
    },
    thisMonth() {
      const j = Jalali.toJalali(today());
      ui.jy = j.jy;
      ui.jm = j.jm;
      render();
    },
    openSearch() {
      openSearch();
    },
    closeSearch() {
      closeSearch();
    },
    addTx() {
      txSheet();
    },
    editTx(el) {
      txSheet(el.dataset.id);
    },
    delTx(el) {
      confirmSheet("این تراکنش حذف شود؟", "حذف", () => {
        Store.deleteTx(el.dataset.id);
        persist();
        render();
        toast("حذف شد");
      });
    },
    dismissBanner(el) {
      Store.dismiss(el.dataset.key);
      persist();
      render();
    },
    gotoInstallments() {
      ui.tab = "plans";
      ui.plansTab = "installments";
      render();
    },
    gotoBackup() {
      ui.tab = "settings";
      render();
      window.scrollTo(0, document.body.scrollHeight);
    },
    plansTab(el) {
      ui.plansTab = el.dataset.v;
      render();
    },
    addCat() {
      catSheet();
    },
    addCatFromTx() {
      const f = $('#sheet-root form[data-form="tx"]');
      const catEl = f.querySelector('input[name="cat"]:checked');
      catSheet(null, {
        id: f.dataset.id,
        type: segValue(f, "type"),
        amount: parseMoney($("#amount", f).value),
        catId: catEl ? catEl.value : null,
        accountId: pickedAccount(f, "acc"),
        note: f.elements.note.value,
        date: readDate(f, "date"),
      });
    },
    editCat(el) {
      catSheet(el.dataset.id);
    },
    delCat(el) {
      const n = Store.allTx().filter((t) => t.catId === el.dataset.id).length;
      confirmSheet(
        n
          ? `${fa(n)} تراکنش با این دسته ثبت شده. با حذف دسته، این تراکنش‌ها «بدون دسته‌بندی» می‌شوند. ادامه می‌دهید؟`
          : "این دسته حذف شود؟",
        "حذف",
        () => {
          Store.deleteCategory(el.dataset.id);
          persist();
          render();
          toast("حذف شد");
        },
      );
    },
    delRec(el) {
      confirmSheet(
        "این تکرار ماهانه متوقف شود؟ تراکنش‌های قبلی می‌مانند.",
        "متوقف شود",
        () => {
          Store.deleteRecurring(el.dataset.id);
          persist();
          render();
        },
      );
    },
    addPlan() {
      if (ui.tab === "accounts") {
        accountSheet();
        return;
      }
      ({ debts: debtSheet, installments: instSheet, goals: goalSheet })[
        ui.plansTab
      ]();
    },
    openAcc(el) {
      openAccWin(el.dataset.id);
    },
    closeAcc() {
      closeAcc();
    },
    addTxAcc(el) {
      txSheet(null, { accountId: el.dataset.id });
    },
    editAcc(el) {
      accountSheet(el.dataset.id);
    },
    delAcc(el) {
      confirmSheet(
        "این حساب حذف شود؟ تراکنش‌های آن حذف نمی‌شوند و فقط از حساب جدا می‌شوند.",
        "حذف",
        () => {
          Store.deleteAccount(el.dataset.id);
          closeAcc();
          persist();
          render();
          closeSheet();
        },
      );
    },
    editDebt(el) {
      debtSheet(el.dataset.id);
    },
    plansView(el) {
      ui.plansView[ui.plansTab] = el.dataset.v;
      render();
    },
    settleDebt(el) {
      const d = Store.debts().find((x) => x.id === el.dataset.id);
      if (!d) return;
      if (!Store.accounts().length) {
        Store.settleDebt(d.id, null);
        persist();
        render();
        return;
      }
      accountConfirmSheet(
        "تسویه شد",
        d.dir === "lent"
          ? `مبلغ ${money(d.amount)} ${Store.unitLabel()} از «${d.person}» به کدام حساب واریز شده است؟`
          : `مبلغ ${money(d.amount)} ${Store.unitLabel()} به «${d.person}» از کدام حساب پرداخت شده است؟`,
        "ثبت تسویه",
        (accId) => {
          if (d.dir !== "lent" && overdraws(accId, d.amount)) {
            noFunds(accId);
            return;
          }
          Store.settleDebt(d.id, accId);
          persist();
          render();
        },
      );
    },
    reopenDebt(el) {
      const d = Store.debts().find((x) => x.id === el.dataset.id);
      if (!d) return;
      if (!d.settleTx) {
        Store.reopenDebt(d.id);
        persist();
        render();
        return;
      }
      confirmSheet(
        "این مورد به حالت جاری برگردانده شود؟ تراکنش ثبت‌شده‌ی تسویه از حساب حذف می‌شود.",
        "برگردان",
        () => {
          Store.reopenDebt(d.id);
          persist();
          render();
        },
      );
    },
    delDebt(el) {
      confirmSheet("این مورد حذف شود؟", "حذف", () => {
        Store.deleteDebt(el.dataset.id);
        persist();
        render();
      });
    },
    editInst(el) {
      instSheet(el.dataset.id);
    },
    payInst(el) {
      const i = Store.inst(el.dataset.id);
      if (!i) return;
      accountConfirmSheet(
        "پرداخت قسط",
        `قسط ${fa(i.paid + 1)} از «${i.title}» پرداخت شد؟ یک هزینه به مبلغ ${money(i.amount)} ${Store.unitLabel()} ثبت می‌شود.`,
        "بله، پرداخت شد",
        (accId) => {
          if (overdraws(accId, i.amount)) {
            noFunds(accId);
            return;
          }
          Store.payInstallment(i.id, accId);
          persist();
          render();
          toast("تراکنش ثبت شد");
        },
      );
    },
    delInst(el) {
      confirmSheet(
        "این قسط حذف شود؟ هزینه‌های ثبت‌شده‌ی قبلی می‌مانند.",
        "حذف",
        () => {
          Store.deleteInstallment(el.dataset.id);
          persist();
          render();
        },
      );
    },
    editGoal(el) {
      goalSheet(el.dataset.id);
    },
    addToGoal(el) {
      addToGoalSheet(el.dataset.id);
    },
    delGoal(el) {
      confirmSheet("این هدف حذف شود؟", "حذف", () => {
        Store.deleteGoal(el.dataset.id);
        persist();
        render();
      });
    },
    async exportJSON() {
      const ok = await saveFile(
        `pfm-backup-${stamp()}.json`,
        "application/json",
        Store.exportJSON(),
      );
      if (ok) {
        Store.markBackup();
        render();
        toast("فایل پشتیبان آماده شد");
      }
    },
    async exportCSV() {
      if (
        await saveFile(
          `transactions-${stamp()}.csv`,
          "text/csv;charset=utf-8",
          Store.exportCSV(),
        )
      )
        toast("فایل خروجی آماده شد");
    },
    importJSON() {
      $("#importFile").click();
    },
    resetAll() {
      confirmSheet(
        "همه‌ی اطلاعات (تراکنش‌ها، دسته‌ها، قسط‌ها و…) برای همیشه پاک می‌شود. پیش از این کار، از اطلاعات پشتیبان تهیه کرده‌اید؟",
        "حذف همه",
        () => {
          Store.resetAll();
          persist();
          applyTheme();
          render();
          toast("همه‌ی اطلاعات پاک شد");
        },
      );
    },
  };

  document.addEventListener("click", (e) => {
    const seg = e.target.closest(".seg button[data-v]");
    if (seg && !seg.dataset.act) {
      const box = seg.parentElement;
      box
        .querySelectorAll("button")
        .forEach((b) => b.classList.toggle("on", b === seg));
      if (box.dataset.seg === "unit") {
        Store.setUnit(seg.dataset.v);
        persist();
        render();
      }
      if (box.dataset.seg === "theme") {
        Store.setTheme(seg.dataset.v);
        persist();
        applyTheme();
      }
      return;
    }
    const el = e.target.closest("[data-act]");
    if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e);
  });

  // ---------- forms (submit) ----------
  const submitHandlers = {
    tx: saveTxForm,
    cat(f) {
      const name = f.elements.name.value.trim();
      if (!name) {
        toast("نام دسته را وارد کنید");
        return;
      }
      const id = f.dataset.id;
      const existing = id ? Store.cat(id) : null;
      const type = existing ? existing.type : segValue(f, "ctype");
      const newId = Store.saveCategory({
        id: id || null,
        name,
        type,
        budget: type === "expense" ? parseMoney($("#budget", f).value) : null,
      });
      const back = ui.txBack;
      ui.txBack = null;
      persist();
      render();
      if (back) {
        txSheet(
          back.id || null,
          Object.assign({}, back, { type, catId: newId }),
        );
        return;
      }
      closeSheet();
    },
    acct(f) {
      const bank = f.elements.bank.value.trim();
      if (!bank) {
        toast("نام بانک را وارد کنید");
        return;
      }
      const balance = parseMoney($("#balance", f).value);
      Store.saveAccount({
        id: f.dataset.id || null,
        bank,
        title: f.elements.title.value.trim(),
        balance,
      });
      closeSheet();
      persist();
      render();
    },
    debt(f) {
      const person = f.elements.person.value.trim(),
        amount = parseMoney($("#amount", f).value);
      if (!person) {
        toast("نام شخص را وارد کنید");
        return;
      }
      if (!(amount > 0)) {
        toast("مبلغ را وارد کنید");
        return;
      }
      if (readDate(f, "date") > today()) {
        toast("تاریخ نمی‌تواند در آینده باشد");
        return;
      }
      const data = {
        person,
        amount,
        dir: segValue(f, "dir"),
        note: f.elements.note.value.trim(),
        date: readDate(f, "date"),
      };
      if (f.dataset.id) data.id = f.dataset.id;
      const record = f.elements.record ? f.elements.record.checked : false;
      const accountId = f.querySelector("input[name=acc]")
        ? pickedAccount(f, "acc")
        : undefined;
      Store.saveDebt(data, { record, accountId });
      closeSheet();
      persist();
      render();
    },
    inst(f) {
      const title = f.elements.title.value.trim(),
        amount = parseMoney($("#amount", f).value);
      const count = parseInt(toLatin(f.elements.count.value), 10),
        paid = parseInt(toLatin(f.elements.paid.value), 10) || 0;
      if (!title) {
        toast("عنوان را وارد کنید");
        return;
      }
      if (!(amount > 0)) {
        toast("مبلغ هر قسط را وارد کنید");
        return;
      }
      if (!(count > 0)) {
        toast("تعداد قسط‌ها را وارد کنید");
        return;
      }
      const data = {
        title,
        amount,
        count,
        paid: Math.min(Math.max(paid, 0), count),
        firstDue: readDate(f, "first"),
      };
      if (f.dataset.id) data.id = f.dataset.id;
      Store.saveInstallment(data);
      closeSheet();
      persist();
      render();
    },
    goal(f) {
      const title = f.elements.title.value.trim(),
        target = parseMoney($("#target", f).value),
        saved = parseMoney($("#saved", f).value);
      if (!title) {
        toast("عنوان را وارد کنید");
        return;
      }
      if (!(target > 0)) {
        toast("مبلغ هدف را وارد کنید");
        return;
      }
      const data = { title, target, saved };
      if (f.dataset.id) data.id = f.dataset.id;
      Store.saveGoal(data);
      closeSheet();
      persist();
      render();
    },
    addgoal(f) {
      const amount = parseMoney($("#amount", f).value);
      if (!(amount > 0)) {
        toast("مبلغ را وارد کنید");
        return;
      }
      Store.addToGoal(f.dataset.id, amount);
      closeSheet();
      persist();
      render();
    },
  };
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    submitHandlers[f.dataset.form](f);
  });
  // ---------- inputs ----------
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.matches("[data-money]")) {
      const digits = toLatin(el.value).replace(/[^\d]/g, "");
      el.value = digits ? fa(Number(digits).toLocaleString("en-US")) : "";
    } else if (el.id === "q") {
      ui.filter.q = el.value.trim();
      updateSearch();
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches(".date select")) {
      if (el.dataset.part !== "d") refreshDays(el.parentElement);
      return;
    }
    if (el.id === "ftype") {
      ui.filter.type = el.value;
      const c = Store.cat(ui.filter.cat);
      if (c && el.value !== "all" && c.type !== el.value) ui.filter.cat = "all";
      $("#fcat").innerHTML = catOptionsHTML(ui.filter.type, ui.filter.cat);
      updateSearch();
    } else if (el.id === "fcat") {
      ui.filter.cat = el.value;
      updateSearch();
    } else if (el.id === "fall") {
      ui.filter.all = el.checked;
      updateSearch();
    } else if (el.id === "importFile") {
      const file = el.files && el.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        confirmSheet(
          "اطلاعات فعلی با محتوای این فایل جایگزین می‌شود. ادامه می‌دهید؟",
          "جایگزین شود",
          () => {
            const res = Store.importJSON(String(reader.result));
            if (!res.ok) {
              toast(res.error);
              return;
            }
            persist();
            applyTheme();
            render();
            toast(
              `${fa(res.count)} تراکنش و ${fa(res.accounts || 0)} حساب بازگردانی شد`,
            );
          },
        );
      };
      reader.readAsText(file);
      el.value = "";
    }
  });
  // ---------- touch behaviour ----------
  // Block pinch-zoom (iOS Safari ignores user-scalable=no) and let :active styles work on iOS.
  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault()),
  );
  document.addEventListener("touchstart", () => {}, { passive: true });

  // ---------- theme ----------
  const THEME_COLORS = { light: "#f5f6f5", dark: "#0e1210" };
  function applyTheme() {
    const t = Store.theme();
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    // Keep the browser/status bar color in sync with a manual choice.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.orig) m.dataset.orig = m.getAttribute("content");
      m.setAttribute(
        "content",
        t === "system" ? m.dataset.orig : THEME_COLORS[t],
      );
    });
  }

  // ---------- boot ----------
  if (isAppleMobile() && !isStandalone() && !window.PFM_PREVIEW) {
    showInstallGate();
    return;
  }
  Store.load();
  applyTheme();
  const added = Store.processRecurring();
  render();
  if (added) toast("تراکنش ثبت شد");

  // Ask the browser not to evict our data (best effort).
  if (navigator.storage && navigator.storage.persist)
    navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    let reloading = false,
      wantUpdate = false;
    const askUpdate = (worker) =>
      openSheet(
        "نسخه‌ی جدید",
        `
      <p style="margin:4px 0 0">نسخه‌ی جدید برنامه در دسترس است. آیا مایل به به‌روزرسانی هستید؟ اطلاعات شما حفظ می‌شود.</p>
      <div class="stack">
        <button class="btn" id="doUpdate">به‌روزرسانی</button>
        <button class="btn ghost" data-act="closeSheet">بعداً</button>
      </div>`,
        (s) => {
          $("#doUpdate", s).onclick = () => {
            wantUpdate = true;
            worker.postMessage("SKIP_WAITING");
          };
        },
      );
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!wantUpdate || reloading) return;
      reloading = true;
      location.reload(); // fresh start on Home; data stays in localStorage
    });
    navigator.serviceWorker
      .register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update().catch(() => {});
        // iOS keeps the installed app alive in the background, so boot-time
        // checks alone miss new deploys: re-check whenever the app returns
        // to the foreground (throttled to once a minute).
        let lastCheck = Date.now();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          if (Date.now() - lastCheck < 60000) return;
          lastCheck = Date.now();
          reg.update().catch(() => {});
        });
        if (reg.waiting && navigator.serviceWorker.controller)
          askUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller)
              askUpdate(w);
          });
        });
      })
      .catch(() => {});
  }
  // Floating add buttons fade away while scrolling down, return when scrolling up.
  let lastY = window.scrollY;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY,
        d = y - lastY;
      if (Math.abs(d) < 6) return;
      const away = d > 0 && y > 40;
      $("#fab").classList.toggle("away", away);
      $("#fab2").classList.toggle("away", away);
      lastY = y;
    },
    { passive: true },
  );
  // Refresh "today"-based reminders when the app returns to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      !$("#sheet-root").children.length
    ) {
      Store.processRecurring();
      render();
    }
  });
})();
