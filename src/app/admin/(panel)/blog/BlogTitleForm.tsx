"use client";
// The blog's own name, Bulgarian and Romanian (the heading of /blogs/<handle>).
import { CircleAlert, LoaderCircle, Save } from "lucide-react";
import { saveBlogTitleAction } from "@/app/admin/_actions/blog";
import { BgRoInput, useEditor, type BgRo } from "@/components/admin/ui";

export function BlogTitleForm({ blogId, initial }: { blogId: number; initial: BgRo }) {
  const ed = useEditor(initial, (v) => saveBlogTitleAction(blogId, v));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <BgRoInput label="Име на блога" value={ed.value} onChange={ed.setValue} maxLength={255} />
      </div>
      <button type="button" onClick={ed.submit} disabled={!ed.dirty || ed.pending} className="btn btn-primary h-12 px-6 sm:mb-0">
        {ed.pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Запази
      </button>
      {ed.status.kind === "error" ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand">
          <CircleAlert className="h-4 w-4" /> {ed.status.message}
        </p>
      ) : ed.status.kind === "saved" && !ed.dirty ? (
        <p className="text-sm font-bold text-mint">Запазено!</p>
      ) : null}
    </div>
  );
}
