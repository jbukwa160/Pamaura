// Econt JSON API (docs: https://ee.econt.com/services/). Requests are JSON POSTs to <Service>.<method>.json with
// HTTP Basic auth. Errors come back with HTTP 4xx/5xx as { type, message, innerErrors: [...] }.
// The city and office lists are public, so the checkout can list Econt offices even without a working login.
import "server-only";
import {
  CourierError,
  DAY_MS,
  addressOf,
  cached,
  contentsOf,
  courierFetch,
  eur,
  filterOffices,
  isRecord,
  phoneBG,
  rankCities,
  readJson,
  sender,
  str,
} from "./common";
import type { CarrierAdapter, City, Office } from "./types";

const SOFIA_CITY_ID = 41;

function baseUrl() {
  return process.env.ECONT_ENV === "demo" ? "https://demo.econt.com/ee/services/" : "https://ee.econt.com/services/";
}

function isConfigured() {
  return Boolean(process.env.ECONT_USERNAME && process.env.ECONT_PASSWORD);
}

function authHeader() {
  return "Basic " + Buffer.from(`${process.env.ECONT_USERNAME ?? ""}:${process.env.ECONT_PASSWORD ?? ""}`).toString("base64");
}

/** Econt's nested { message, innerErrors } flattened into one line. */
function collectMessages(err: unknown, out: string[] = []): string[] {
  if (!isRecord(err)) return out;
  const msg = str(err.message);
  if (msg && !out.includes(msg)) out.push(msg);
  if (Array.isArray(err.innerErrors)) for (const inner of err.innerErrors) collectMessages(inner, out);
  return out;
}

function econtError(body: unknown, status: number): CourierError {
  const messages = collectMessages(body);
  if (!messages.length) messages.push(status === 401 ? "невалидно потребителско име или парола" : `грешка ${status}`);
  return new CourierError("econt", `Еконт: ${messages.join("; ")}`, status, isRecord(body) ? str(body.type) || undefined : undefined);
}

async function call<T extends Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>,
  { auth = true, timeoutMs }: { auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  if (auth && !isConfigured()) throw new CourierError("econt", "Еконт не е свързан: липсват ECONT_USERNAME / ECONT_PASSWORD в .env.local.");
  const res = await courierFetch(
    "econt",
    baseUrl() + method,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json", ...(auth ? { Authorization: authHeader() } : {}) },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  const json = await readJson(res);
  if (!res.ok) throw econtError(json, res.status);
  return (isRecord(json) ? json : {}) as T;
}

type EcontCity = { id: number; name: string; nameEn?: string; postCode?: string; regionName?: string };
type EcontOffice = {
  code: string;
  name: string;
  isAPS?: boolean;
  isMachine?: boolean;
  address?: { city?: { id?: number; name?: string; postCode?: string }; fullAddress?: string };
};
type SlimCity = City & { nameEn?: string };

/** All ~1000 Econt cities in Bulgaria (the raw list is 3.5 MB), cached for 24 h. */
function allCities(): Promise<SlimCity[]> {
  return cached("econt-cities-v1", DAY_MS, async () => {
    const res = await call<{ cities?: EcontCity[] }>("Nomenclatures/NomenclaturesService.getCities.json", { countryCode: "BGR" }, { auth: false, timeoutMs: 60000 });
    const cities = (res.cities ?? []).map(
      (c): SlimCity => ({ id: String(c.id), name: c.name, nameEn: c.nameEn || undefined, postcode: c.postCode || undefined, region: c.regionName ? `обл. ${c.regionName}` : undefined }),
    );
    if (!cities.length) throw new CourierError("econt", "Еконт върна празен списък с населени места.");
    return cities;
  });
}

function mapOffice(o: EcontOffice): Office {
  const a = o.address ?? {};
  const city = a.city?.name ?? "";
  // fullAddress starts with the city name ("София жк Дружба-1 …"), which is shown separately.
  let address = (a.fullAddress ?? "").trim();
  if (city && address.startsWith(city)) address = address.slice(city.length).replace(/^[\s,]+/, "");
  return {
    id: String(o.code),
    name: o.name,
    address,
    city,
    cityId: a.city?.id != null ? String(a.city.id) : undefined,
    postcode: a.city?.postCode || undefined,
    // APS = "Еконтомат" parcel locker
    kind: o.isAPS || o.isMachine ? "locker" : "office",
  };
}

/** All ~640 Econt offices and lockers in Bulgaria, cached for 24 h. */
function allOffices(): Promise<Office[]> {
  return cached("econt-offices-v2", DAY_MS, async () => {
    const res = await call<{ offices?: EcontOffice[] }>("Nomenclatures/NomenclaturesService.getOffices.json", { countryCode: "BGR" }, { auth: false, timeoutMs: 60000 });
    const offices = (res.offices ?? []).map(mapOffice);
    if (!offices.length) throw new CourierError("econt", "Еконт върна празен списък с офиси.");
    return offices;
  });
}

/** Sender part of a label: client, authorised person and drop-off office or pickup address (SENDER_* in .env.local). */
function senderPart(): Record<string, unknown> {
  const s = sender();
  if (!s.name || !s.phone) throw new CourierError("econt", "Попълнете SENDER_NAME и SENDER_PHONE в .env.local.");
  const phones = [phoneBG(s.phone)];
  const part: Record<string, unknown> = {
    senderClient: { name: s.name, phones, ...(s.email ? { email: s.email } : {}) },
    ...(s.contactName ? { senderAgent: { name: s.contactName, phones } } : {}),
  };
  if (s.econtOfficeCode) part.senderOfficeCode = s.econtOfficeCode;
  else if (s.city && s.address) part.senderAddress = { city: { country: { code3: "BGR" }, name: s.city, postCode: s.postcode }, fullAddress: s.address };
  else throw new CourierError("econt", "Попълнете SENDER_CITY и SENDER_ADDRESS или ECONT_DROPOFF_OFFICE_CODE в .env.local.");
  return part;
}

async function fetchPdf(url: string): Promise<Buffer> {
  let res = await courierFetch("econt", url, { headers: { Accept: "application/pdf" } }, 30000);
  // Label links are normally public; retry with the login if Econt asks for it.
  if ((res.status === 401 || res.status === 403) && new URL(url).hostname.endsWith("econt.com") && isConfigured()) {
    res = await courierFetch("econt", url, { headers: { Accept: "application/pdf", Authorization: authHeader() } }, 30000);
  }
  if (!res.ok) throw econtError(await readJson(res), res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new CourierError("econt", "Еконт не върна PDF с етикета.");
  return buf;
}

export const econt: CarrierAdapter = {
  id: "econt",
  isConfigured,

  /** The city and office lists are public: they load without ECONT_USERNAME / ECONT_PASSWORD. */
  canListOffices: () => true,

  async searchCities(query) {
    if (query.trim().length < 2) return [];
    return rankCities(await allCities(), query).map(({ id, name, postcode, region }) => ({ id, name, postcode, region }));
  },

  async listOffices(params) {
    return filterOffices(await allOffices(), params);
  },

  async createShipment(input) {
    const d = input.delivery;
    const services: Record<string, unknown> = {};
    if (input.codAmount > 0) Object.assign(services, { cdAmount: eur(input.codAmount), cdType: "get", cdCurrency: "EUR" });
    if (input.declaredValue > 0) Object.assign(services, { declaredValueAmount: eur(input.declaredValue), declaredValueCurrency: "EUR" });
    const label: Record<string, unknown> = {
      ...senderPart(),
      receiverClient: { name: input.recipient.name, phones: [phoneBG(input.recipient.phone)], email: input.recipient.email },
      packCount: input.parcels,
      shipmentType: "PACK",
      weight: Math.max(0.1, eur(input.weightKg)),
      shipmentDescription: contentsOf(input),
      orderNumber: String(input.orderNumber),
      ...(Object.keys(services).length ? { services } : {}),
    };
    // "credit" = invoiced by Econt under the contract, "cash" = paid at pickup; empty = the account's own setting.
    const pay = process.env.ECONT_SENDER_PAYMENT;
    if (pay === "cash" || pay === "credit") label.paymentSenderMethod = pay;

    if (d.kind === "address") {
      const fullAddress = addressOf(d);
      if (!fullAddress) throw new CourierError("econt", "В поръчката няма адрес за доставка.");
      const id = Number.parseInt(d.cityId ?? "", 10);
      const city = id > 0 ? { id } : { country: { code3: "BGR" }, name: d.city, postCode: d.postcode };
      // Econt takes the whole address in fullAddress and splits it into street, number and the rest itself.
      label.receiverAddress = { city, fullAddress };
    } else {
      if (!d.officeId) throw new CourierError("econt", "В поръчката няма избран офис или Еконтомат.");
      label.receiverOfficeCode = d.officeId;
    }

    const res = await call<{ label?: Record<string, unknown> }>("Shipments/LabelService.createLabel.json", { label, mode: "create" }, { timeoutMs: 30000 });
    const created = res.label ?? {};
    const number = str(created.shipmentNumber);
    if (!number) throw new CourierError("econt", "Еконт не върна номер на товарителница.");
    return {
      shipmentId: number,
      trackingNumber: number,
      data: {
        pdfURL: str(created.pdfURL) || null,
        price: created.totalPrice ?? null,
        currency: created.currency ?? null,
        expectedDeliveryDate: created.expectedDeliveryDate ?? null,
        orderNumber: String(input.orderNumber),
      },
    };
  },

  async getLabelPdf(shipment) {
    let url = str(shipment.data?.pdfURL);
    if (!url) {
      const res = await call<{ shipmentStatuses?: { status?: { pdfURL?: string }; error?: unknown }[] }>(
        "Shipments/ShipmentService.getShipmentStatuses.json",
        { shipmentNumbers: [shipment.shipmentId] },
      );
      const first = res.shipmentStatuses?.[0];
      if (first?.error) throw econtError(first.error, 200);
      url = str(first?.status?.pdfURL);
    }
    if (!url) throw new CourierError("econt", "Еконт не даде линк към етикета на тази товарителница.");
    return fetchPdf(url);
  },

  async cancelShipment(shipment) {
    const number = shipment.shipmentId;
    const res = await call<{ results?: { shipmentNum?: string; error?: unknown }[] }>("Shipments/LabelService.deleteLabels.json", { shipmentNumbers: [number] });
    const result = res.results?.find((r) => str(r.shipmentNum) === number) ?? res.results?.[0];
    if (result?.error && collectMessages(result.error).length) throw econtError(result.error, 200);
  },

  /** The offices of Sofia (public) and the account's client profiles: the cheapest call that proves the login. */
  async test() {
    const offices = await call<{ offices?: unknown[] }>("Nomenclatures/NomenclaturesService.getOffices.json", { countryCode: "BGR", cityID: SOFIA_CITY_ID }, { auth: false });
    await call("Profile/ProfileService.getClientProfiles.json", {});
    return offices.offices?.length ?? 0;
  },
};
