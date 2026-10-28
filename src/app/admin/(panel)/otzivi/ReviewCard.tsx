"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails come resized from /cdn */
// One review in the moderation list, with its actions (publish / hide / reply / verified / delete).
import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, CircleAlert, Eye, EyeOff, LoaderCircle, MessageSquareReply, Pencil, Star, Trash } from "lucide-react";
import { deleteReviewAction, saveReviewReplyAction, setReviewStatusAction, setReviewVerifiedAction } from "@/app/admin/_actions/reviews";
import { Badge, ConfirmButton, Toggle, cx, type BadgeTone } from "@/components/admin/ui";
import type { ReviewView } from "@/lib/admin/reviews";

const STATUS: Record<ReviewView["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Чака одобрение", tone: "sun" },
  published: { label: "Публикуван", tone: "mint" },
  hidden: { label: "Скрит", tone: "muted" },
};

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cx("inline-flex gap-0.5 text-sun", className)} role="img" aria-label={`${rating} от 5 звезди`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cx("h-4 w-4", i <= rating ? "fill-current" : "fill-none text-line")} strokeWidth={i <= rating ? 0 : 2} />
      ))}
    </span>
  );
}

export function ReviewCard({ review: r }: { review: ReviewView }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.reply);
  const [expanded, setExpanded] = useState(false);
  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) after?.();
      else setError(res.error ?? "Възникна грешка.");
    });
  const long = r.body.length > 420;
  const st = STATUS[r.status];

  return (
    <article className={cx("rounded-3xl border bg-white p-5 transition", r.status === "pending" ? "border-sun" : "border-line", pending && "opacity-60")} aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={r.rating} />
        <span className="font-black">{r.author || "Без име"}</span>
        {r.verified ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-mint">
            <BadgeCheck className="h-4 w-4" /> Проверен купувач
          </span>
        ) : null}
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="ml-auto text-sm text-muted">{r.date}</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {r.product ? (
          <>
            за{" "}
            <Link href={`/admin/produkti/${r.product.id}`} className="font-bold text-ink hover:text-brand">
              {r.product.title}
            </Link>
            {r.product.handle ? (
              <a href={`/bg-bg/products/${encodeURIComponent(r.product.handle)}#judgeme_product_reviews`} target="_blank" rel="noopener" className="ml-2 text-sky hover:underline">
                в сайта ↗
              </a>
            ) : null}
          </>
        ) : (
          <span className="font-bold">Отзив за магазина</span>
        )}
        {r.email ? <span className="ml-2 text-muted">· {r.email}</span> : null}
        {r.source ? <span className="ml-2 text-muted">· от {r.source}</span> : null}
      </p>

      {r.title ? <h3 className="mt-3 font-black">{r.title}</h3> : null}
      <p className={cx("mt-1 whitespace-pre-line text-ink-soft", !expanded && long && "line-clamp-6")}>{r.body}</p>
      {long ? (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-sm font-bold text-sky hover:underline">
          {expanded ? "Скрий" : "Покажи целия текст"}
        </button>
      ) : null}

      {r.pictures.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.pictures.map((p, i) => (
            <a key={p.full} href={p.full} target="_blank" rel="noopener" className="block h-20 w-20 overflow-hidden rounded-xl border border-line bg-canvas hover:border-ink">
              <img src={p.thumb} alt={`Снимка ${i + 1} от отзива`} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}

      {replying ? (
        <div className="mt-4 rounded-2xl bg-canvas p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold">Отговор от PAMAURA (вижда се под отзива в сайта)</span>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={5000} className="field resize-y" autoFocus />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => saveReviewReplyAction(r.id, reply), () => setReplying(false))} className="btn btn-primary h-10 px-5 text-sm">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Запази отговора
            </button>
            <button
              type="button"
              onClick={() => {
                setReply(r.reply);
                setReplying(false);
              }}
              className="btn btn-ghost h-10 px-4 text-sm"
            >
              Отказ
            </button>
            {r.reply ? <span className="self-center text-xs text-muted">Изтрийте текста и запазете, за да махнете отговора.</span> : null}
          </div>
        </div>
      ) : r.reply ? (
        <div className="mt-4 rounded-2xl bg-shop-soft p-4 text-shop-ink">
          <p className="mb-1 text-sm font-black">Отговор от PAMAURA</p>
          <p className="whitespace-pre-line text-sm">{r.reply}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {r.status !== "published" ? (
          <button type="button" disabled={pending} onClick={() => run(() => setReviewStatusAction(r.id, "published"))} className="btn btn-primary h-10 px-4 text-sm !shadow-none">
            <Eye className="h-4 w-4" /> Публикувай
          </button>
        ) : null}
        {r.status !== "hidden" ? (
          <button type="button" disabled={pending} onClick={() => run(() => setReviewStatusAction(r.id, "hidden"))} className="btn btn-ghost h-10 px-4 text-sm">
            <EyeOff className="h-4 w-4" /> Скрий
          </button>
        ) : null}
        {!replying ? (
          <button type="button" disabled={pending} onClick={() => setReplying(true)} className="btn btn-ghost h-10 px-4 text-sm">
            {r.reply ? <Pencil className="h-4 w-4" /> : <MessageSquareReply className="h-4 w-4" />} {r.reply ? "Промени отговора" : "Отговори"}
          </button>
        ) : null}
        <Toggle className="ml-1 text-sm" checked={r.verified} onChange={(v) => run(() => setReviewVerifiedAction(r.id, v))} label="Проверен купувач" />
        <span className="ml-auto">
          <ConfirmButton disabled={pending} onConfirm={() => run(() => deleteReviewAction(r.id))} question={`Да изтрия ли отзива от ${r.author || "клиента"}? Това не може да се отмени. (Ако искате само да не се вижда, натиснете „Скрий“.)`}>
            <Trash className="h-4 w-4" /> Изтрий
          </ConfirmButton>
        </span>
      </div>
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-brand">
          <CircleAlert className="h-4 w-4" /> {error}
        </p>
      ) : null}
    </article>
  );
}
