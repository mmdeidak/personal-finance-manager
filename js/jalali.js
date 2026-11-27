/* Jalali (Shamsi) calendar utilities.
 * Conversion algorithm adapted from jalaali-js (MIT). */
const Jalali = (() => {
  const div = (a, b) => Math.trunc(a / b);
  const mod = (a, b) => a - Math.trunc(a / b) * b;
  const pad = (n) => String(n).padStart(2, '0');

  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635,
    2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function cal(jy) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14, jp = BREAKS[0], jm, jump = 0, leap, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = cal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = cal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let jd, jm, k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy, jm, jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }

  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  // index = JS getDay() (0 = Sunday)
  const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

  const isLeap = (jy) => cal(jy).leap === 0;
  const monthLength = (jy, jm) => (jm <= 6 ? 31 : jm <= 11 ? 30 : (isLeap(jy) ? 30 : 29));

  const parseISO = (iso) => iso.split('-').map(Number);
  const dayNumber = (iso) => { const [y, m, d] = parseISO(iso); return g2d(y, m, d); };
  const toJalali = (iso) => d2j(dayNumber(iso));
  const toISO = (jy, jm, jd) => {
    const g = d2g(j2d(jy, jm, jd));
    return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
  };
  const todayISO = () => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  };
  const weekday = (iso) => { const [y, m, d] = parseISO(iso); return new Date(y, m - 1, d).getDay(); };

  const monthIdx = (iso) => { const j = toJalali(iso); return j.jy * 12 + j.jm - 1; };
  const fromIdx = (idx) => ({ jy: Math.floor(idx / 12), jm: (((idx % 12) + 12) % 12) + 1 });

  /** Add n Jalali months to an ISO date, clamping the day to the target month length. */
  function addMonths(iso, n) {
    const j = toJalali(iso);
    const { jy, jm } = fromIdx(j.jy * 12 + j.jm - 1 + n);
    return toISO(jy, jm, Math.min(j.jd, monthLength(jy, jm)));
  }

  const PD = '۰۱۲۳۴۵۶۷۸۹';
  const digits = (s) => String(s).replace(/\d/g, (d) => PD[d]);
  const format = (iso, withYear = true) => {
    const j = toJalali(iso);
    return `${digits(j.jd)} ${MONTHS[j.jm - 1]}${withYear ? ' ' + digits(j.jy) : ''}`;
  };
  const formatNumeric = (iso) => { const j = toJalali(iso); return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`; };

  return {
    MONTHS, WEEKDAYS, isLeap, monthLength, dayNumber, toJalali, toISO, todayISO,
    weekday, monthIdx, fromIdx, addMonths, digits, format, formatNumeric,
  };
})();

if (typeof module !== 'undefined') module.exports = Jalali;
