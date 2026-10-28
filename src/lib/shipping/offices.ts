// Server-side access to courier offices / cities for the checkout.
import "server-only";
import { courierErrorMessage, findOffice, getCarrier } from "./couriers";
import { isCarrier, type City, type Office } from "./couriers/types";

export async function listOffices(carrier: string, params: { cityId?: string; query?: string; kind?: "office" | "locker" }): Promise<Office[]> {
  if (!isCarrier(carrier)) return [];
  return getCarrier(carrier).listOffices(params);
}

export async function searchCities(carrier: string, query: string): Promise<City[]> {
  if (!isCarrier(carrier)) return [];
  return getCarrier(carrier).searchCities(query);
}

/** The office as the courier lists it, null when it is not listed, undefined when the list is unavailable. */
export async function verifyOffice(carrier: string, officeId: string): Promise<Office | null | undefined> {
  if (!isCarrier(carrier)) return undefined;
  return findOffice(carrier, officeId);
}

export { courierErrorMessage };
