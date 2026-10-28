// E-mail: SMTP when SMTP_HOST is set, otherwise written to DATA_DIR/outbox/*.eml.
// Failed sends are kept in outbox/failed and retried by the scheduler.
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { DATA_DIR } from "./db";

export const OUTBOX = path.join(DATA_DIR, "outbox");
const FAILED = path.join(OUTBOX, "failed");

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

function transport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export function mailFrom() {
  return process.env.SMTP_FROM || "PAMAURA <hello@pamaura.com>";
}

export function shopNotifyEmail() {
  return process.env.SHOP_NOTIFY_EMAIL || "hello@pamaura.com";
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeEml(dir: string, mail: Mail, extra?: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await t.sendMail({ from: mailFrom(), to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo });
  const base = path.join(dir, `${stamp()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.writeFileSync(`${base}.eml`, info.message as Buffer);
  if (extra) fs.writeFileSync(`${base}.json`, JSON.stringify(extra));
  return base;
}

/** Never throws: a failed send is queued for retry. */
export async function sendMail(mail: Mail): Promise<"sent" | "outbox" | "queued"> {
  const t = transport();
  if (!t) {
    await writeEml(OUTBOX, mail);
    return "outbox";
  }
  try {
    await t.sendMail({ from: mailFrom(), to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo });
    return "sent";
  } catch (e) {
    console.error("[mail] send failed, queued for retry:", (e as Error).message);
    await writeEml(FAILED, mail, { mail, attempts: 1, next: Date.now() + 5 * 60_000, error: (e as Error).message });
    return "queued";
  }
}

/** Retries queued e-mails (5 min → 24 h backoff, 8 attempts, dropped after 30 days). */
export async function retryFailedMail() {
  const t = transport();
  if (!t || !fs.existsSync(FAILED)) return;
  for (const f of fs.readdirSync(FAILED).filter((x) => x.endsWith(".json"))) {
    const file = path.join(FAILED, f);
    let job: { mail: Mail; attempts: number; next: number; first?: number };
    try {
      job = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (job.next > Date.now()) continue;
    const eml = file.replace(/\.json$/, ".eml");
    try {
      await t.sendMail({ from: mailFrom(), ...job.mail });
      fs.rmSync(file, { force: true });
      fs.rmSync(eml, { force: true });
    } catch (e) {
      job.attempts++;
      job.first = job.first || Date.now();
      if (job.attempts >= 8 || Date.now() - job.first > 30 * 86400_000) {
        console.error("[mail] giving up on", f, (e as Error).message);
        fs.renameSync(file, file + ".dead");
        continue;
      }
      job.next = Date.now() + Math.min(24 * 3600_000, 5 * 60_000 * Math.pow(3, job.attempts - 1));
      fs.writeFileSync(file, JSON.stringify(job));
    }
  }
}

export function failedMailCount(): number {
  if (!fs.existsSync(FAILED)) return 0;
  return fs.readdirSync(FAILED).filter((x) => x.endsWith(".json")).length;
}

export function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
