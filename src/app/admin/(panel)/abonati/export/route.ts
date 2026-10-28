// CSV of the newsletter subscribers (same status / search filter as the list). UTF-8 with BOM and ";" between
// columns, so a double click opens it in Excel with Cyrillic intact (Bulgarian Excel splits on ";").
import { getAdmin } from "@/lib/admin/auth";
import { sofiaDay } from "@/lib/admin/common";
import { allSubscribers, localeLabel, sourceLabel } from "@/lib/admin/subscribers";

export const dynamic = "force-dynamic";

const DT = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function cell(v: string): string {
  // values starting with = + - @ would run as formulas in Excel
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DT.format(d).replace(",", "").replace(" г.", "");
};

export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("Нужен е вход в админ панела.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") || "subscribed";
  const status = statusParam === "all" || statusParam === "unsubscribed" ? statusParam : "subscribed";
  const q = (url.searchParams.get("q") || "").slice(0, 100);
  const rows = allSubscribers({ status, q });
  const lines = [
    ["Имейл", "Статус", "Откъде", "Език", "Записан на", "Последна промяна"].map(cell).join(";"),
    ...rows.map((s) =>
      [s.email, s.status === "subscribed" ? "абониран" : "отписан", sourceLabel(s.source), localeLabel(s.locale), when(s.created_at), when(s.updated_at)].map(cell).join(";"),
    ),
  ];
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const name = `abonati-${status === "subscribed" ? "" : status + "-"}${sofiaDay(new Date())}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
