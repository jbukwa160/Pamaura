import { notFound } from "next/navigation";

// Unknown /admin/… addresses: the admin's own 404 (not the shop's).
export default function AdminUnknown() {
  notFound();
}
