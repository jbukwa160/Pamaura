"use client";
// Like useEditor (ui.tsx), but after a successful save the editor takes the state the server sends back, so rows
// created by the save (new variants, pictures) get their ids and a second save does not add them again.
import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useUnsavedWarning, type SaveStatus } from "../ui";

export function useSyncedEditor<T>(initial: T, save: (value: T) => Promise<{ ok?: boolean; error?: string; value?: T }>) {
  const [value, setValue] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  const submit = () =>
    start(async () => {
      let r: { ok?: boolean; error?: string; value?: T };
      try {
        r = await save(value);
      } catch (e) {
        unstable_rethrow(e); // sign-in redirects
        r = { error: "Няма връзка със сървъра. Опитайте отново." };
      }
      if (r.ok) {
        const next = r.value ?? value;
        setValue(next);
        setSaved(next);
        setStatus({ kind: "saved" });
      } else setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
    });
  const update = (next: T | ((v: T) => T)) => {
    setStatus({ kind: "idle" });
    setValue(next);
  };
  return { value, saved, setValue: update, dirty, pending, status, submit, reset: () => update(saved) };
}
