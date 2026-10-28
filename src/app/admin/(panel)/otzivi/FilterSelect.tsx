"use client";
// A filter dropdown that applies itself as soon as something is picked (the form still works without JavaScript
// through its "Филтрирай" button).
import { Select } from "@/components/admin/ui";

export function FilterSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
