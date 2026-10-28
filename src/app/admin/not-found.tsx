import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center">
        <p className="text-5xl font-black text-brand">404</p>
        <h1 className="mt-2 text-xl font-black">Тази страница не съществува</h1>
        <p className="mt-1 text-ink-soft">Може би е изтрита или адресът е сгрешен.</p>
        <Link href="/admin" className="btn btn-primary mt-5 h-11 px-6">
          Към таблото
        </Link>
      </div>
    </div>
  );
}
