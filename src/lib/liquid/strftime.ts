// Ruby Time#strftime (English names, like Shopify's date filter) evaluated in the shop's time zone.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Parts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  weekday: number; // 0 = Sunday
  offsetMinutes: number;
  epoch: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function zonedParts(date: Date, timeZone: string): Parts {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(timeZone, f);
  }
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(date)) parts[p.type] = p.value;
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const hour = Number(parts.hour) % 24, minute = Number(parts.minute), second = Number(parts.second);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { year, month, day, hour, minute, second, ms: date.getMilliseconds(), weekday, offsetMinutes, epoch: Math.floor(date.getTime() / 1000) };
}

function pad(n: number, width: number, flag: string, defPad = "0") {
  const s = String(Math.abs(n));
  const sign = n < 0 ? "-" : "";
  if (flag === "-") return sign + s;
  const padChar = flag === "_" ? " " : flag === "0" ? "0" : defPad;
  return sign + s.padStart(width, padChar);
}

function dayOfYear(p: Parts) {
  return Math.floor((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 86400000) + 1;
}

function weekNumber(p: Parts, startMonday: boolean) {
  const yday = dayOfYear(p) - 1;
  const wday = startMonday ? (p.weekday + 6) % 7 : p.weekday;
  return Math.floor((yday + 7 - wday) / 7);
}

export function strftime(date: Date, format: string, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return format.replace(/%([-_0^#]?)(\d*)([a-zA-Z%+])/g, (_m, flag: string, widthStr: string, conv: string) => {
    const w = widthStr ? Number(widthStr) : 0;
    const up = (s: string) => (flag === "^" ? s.toUpperCase() : flag === "#" ? swapCase(s) : s);
    const num = (n: number, width: number, def = "0") => pad(n, w || width, flag, def);
    switch (conv) {
      case "Y":
        return flag === "-" ? String(p.year) : String(p.year).padStart(w || 4, "0");
      case "C":
        return num(Math.floor(p.year / 100), 2);
      case "y":
        return num(p.year % 100, 2);
      case "m":
        return num(p.month, 2);
      case "B":
        return up(MONTHS[p.month - 1]);
      case "b":
      case "h":
        return up(MONTHS[p.month - 1].slice(0, 3));
      case "d":
        return num(p.day, 2);
      case "e":
        return num(p.day, 2, " ");
      case "j":
        return num(dayOfYear(p), 3);
      case "H":
        return num(p.hour, 2);
      case "k":
        return num(p.hour, 2, " ");
      case "I":
        return num(p.hour % 12 || 12, 2);
      case "l":
        return num(p.hour % 12 || 12, 2, " ");
      case "P":
        return p.hour < 12 ? "am" : "pm";
      case "p":
        return flag === "#" ? (p.hour < 12 ? "am" : "pm") : p.hour < 12 ? "AM" : "PM";
      case "M":
        return num(p.minute, 2);
      case "S":
        return num(p.second, 2);
      case "L":
        return String(p.ms).padStart(3, "0");
      case "N":
        return (String(p.ms).padStart(3, "0") + "000000").slice(0, w || 9);
      case "z": {
        const o = p.offsetMinutes;
        const sign = o < 0 ? "-" : "+";
        return `${sign}${String(Math.floor(Math.abs(o) / 60)).padStart(2, "0")}${String(Math.abs(o) % 60).padStart(2, "0")}`;
      }
      case "Z":
        return timeZoneAbbr(p.offsetMinutes);
      case "A":
        return up(DAYS[p.weekday]);
      case "a":
        return up(DAYS[p.weekday].slice(0, 3));
      case "u":
        return String(p.weekday === 0 ? 7 : p.weekday);
      case "w":
        return String(p.weekday);
      case "U":
        return num(weekNumber(p, false), 2);
      case "W":
        return num(weekNumber(p, true), 2);
      case "s":
        return String(p.epoch);
      case "D":
      case "x":
        return `${pad(p.month, 2, "")}/${pad(p.day, 2, "")}/${pad(p.year % 100, 2, "")}`;
      case "F":
        return `${p.year}-${pad(p.month, 2, "")}-${pad(p.day, 2, "")}`;
      case "T":
      case "X":
        return `${pad(p.hour, 2, "")}:${pad(p.minute, 2, "")}:${pad(p.second, 2, "")}`;
      case "R":
        return `${pad(p.hour, 2, "")}:${pad(p.minute, 2, "")}`;
      case "r":
        return `${pad(p.hour % 12 || 12, 2, "")}:${pad(p.minute, 2, "")}:${pad(p.second, 2, "")} ${p.hour < 12 ? "AM" : "PM"}`;
      case "c":
        return `${DAYS[p.weekday].slice(0, 3)} ${MONTHS[p.month - 1].slice(0, 3)} ${pad(p.day, 2, "", " ")} ${pad(p.hour, 2, "")}:${pad(p.minute, 2, "")}:${pad(p.second, 2, "")} ${p.year}`;
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "%":
        return "%";
      default:
        return _m;
    }
  });
}

function swapCase(s: string) {
  return s.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
}

function timeZoneAbbr(offset: number) {
  if (offset === 120) return "EET";
  if (offset === 180) return "EEST";
  if (offset === 0) return "UTC";
  const sign = offset < 0 ? "-" : "+";
  return `${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}`;
}

/** Liquid's date input: "now"/"today", Time-like strings, epoch numbers. */
export function toDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input * 1000);
  const s = String(input).trim();
  if (s === "now" || s === "today") return new Date();
  if (/^-?\d+$/.test(s)) return new Date(Number(s) * 1000);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}
