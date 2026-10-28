// Server-side entry point for the courier integrations. Client components import from "./types" instead.
import "server-only";
import { boxnow } from "./boxnow";
import { CourierError } from "./common";
import { econt } from "./econt";
import { speedy } from "./speedy";
import type { CarrierAdapter, CarrierId, Office } from "./types";

export * from "./types";
export { CourierError, DEFAULT_CONTENTS } from "./common";

const ADAPTERS: Record<CarrierId, CarrierAdapter> = { speedy, econt, boxnow };

export function getCarrier(id: CarrierId): CarrierAdapter {
  return ADAPTERS[id];
}

/** Readable (Bulgarian) message for any error thrown by an adapter. */
export function courierErrorMessage(e: unknown): string {
  if (e instanceof CourierError) return e.message;
  if (e instanceof Error) return `Неочаквана грешка: ${e.message}`;
  return "Неочаквана грешка";
}

/**
 * The office or locker with this id, `null` when the courier does not list it, `undefined` when the list cannot be
 * loaded right now (the order is then taken with the office as the customer chose it).
 */
export async function findOffice(carrier: CarrierId, officeId: string): Promise<Office | null | undefined> {
  const adapter = getCarrier(carrier);
  if (!adapter.canListOffices()) return undefined;
  try {
    const all = await adapter.listOffices({});
    return all.find((o) => o.id === officeId) ?? null;
  } catch (e) {
    console.error(`[shipping] ${carrier} offices unavailable while checking an order:`, courierErrorMessage(e));
    return undefined;
  }
}
