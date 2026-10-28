"use client";
/* eslint-disable @next/next/no-img-element -- previews of uploaded pictures */
// "Добави отзив": a review received by phone, e-mail or in person, entered by hand.
import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Plus, Star, X } from "lucide-react";
import { createReviewAction } from "@/app/admin/_actions/reviews";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Card, Field, Select, TextArea, TextInput, Toggle, cx } from "@/components/admin/ui";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const labels = ["", "Много лошо", "Лошо", "Средно", "Добро", "Отлично"];
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Оценка" className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} от 5 звезди`}
            tabIndex={value === i || (!value && i === 1) ? 0 : -1}
            onClick={() => onChange(i)}
            onMouseEnter={() => setHover(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(5, (value || 0) + 1));
              else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(1, (value || 2) - 1));
              else return;
              e.preventDefault();
            }}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-sun-soft"
          >
            <Star className={cx("h-7 w-7", i <= shown ? "fill-sun text-sun" : "fill-none text-line")} strokeWidth={i <= shown ? 0 : 2} />
          </button>
        ))}
      </div>
      <span className="text-sm font-bold text-ink-soft">{labels[shown]}</span>
    </div>
  );
}

export function AddReviewForm({ products, today }: { products: { id: number; title: string; status: string }[]; today: string }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const [rating, setRating] = useState(5);
  const [author, setAuthor] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(today);
  const [verified, setVerified] = useState(true);
  const [publish, setPublish] = useState(true);
  const [pictures, setPictures] = useState<{ key: string; url: string }[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!product) return setError("Изберете продукта (или „Отзив за магазина“).");
    if (!author.trim()) return setError("Попълнете името на клиента.");
    if (!body.trim()) return setError("Попълнете текста на отзива.");
    start(async () => {
      const r = await createReviewAction({
        productId: product === "shop" ? null : Number(product),
        rating,
        author,
        email,
        title,
        body,
        date,
        verified,
        publish,
        pictures: pictures.map((p) => p.key),
      });
      if (r.ok) router.push(publish ? "/admin/otzivi?added=1" : "/admin/otzivi?status=pending&added=1");
      else setError(r.error ?? "Отзивът не беше добавен.");
    });
  };

  return (
    <Card title="Добави отзив" description="За отзив, получен по телефона, по имейл или на живо. Текстът се показва точно както е написан.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Продукт">
            <Select value={product} onChange={(e) => setProduct(e.target.value)} required>
              <option value="">— изберете —</option>
              <option value="shop">Отзив за магазина (без продукт)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.status !== "active" ? " (скрит)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <span id={`${id}-rating`} className="mb-1.5 block text-sm font-extrabold">
              Оценка
            </span>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <Field label="Име на клиента" hint="Както да се вижда в сайта, напр. „Мария П.“">
            <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={100} required />
          </Field>
          <Field label="Имейл (по желание)" hint="Не се показва в сайта.">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <Field label="Заглавие (по желание)">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Текст на отзива">
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} required />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Дата">
            <TextInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="space-y-3 md:pt-7">
            <Toggle checked={verified} onChange={setVerified} label="Проверен купувач" description="Клиентът е купил продукта (значка „Проверено“)." />
            <Toggle checked={publish} onChange={setPublish} label="Покажи веднага в сайта" description={publish ? "Отзивът ще е публикуван." : "Отзивът ще чака одобрение."} />
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-extrabold">Снимки от клиента (по желание, до 6)</span>
          <div className="flex flex-wrap items-center gap-3">
            {pictures.map((p) => (
              <span key={p.key} className="relative block h-20 w-20 overflow-hidden rounded-2xl border border-line">
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPictures(pictures.filter((x) => x.key !== p.key))}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 shadow hover:bg-white"
                  aria-label="Премахни снимката"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {pictures.length < 6 ? <ImageUpload compact value="" previewUrl="" onChange={(key, url) => key && setPictures((cur) => [...cur, { key, url }])} /> : null}
          </div>
        </div>
        {error ? (
          <p className="flex items-center gap-1.5 font-bold text-brand" role="alert">
            <CircleAlert className="h-4 w-4" /> {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="btn btn-primary h-12 px-7">
            {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} {pending ? "Добавяне…" : "Добави отзива"}
          </button>
          <Link href="/admin/otzivi" className="btn btn-ghost h-12 px-5">
            Отказ
          </Link>
        </div>
      </form>
    </Card>
  );
}
