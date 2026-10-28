// Speedy REST API v1 (https://api.speedy.bg/v1, docs: https://api.speedy.bg/web-api.html).
// Every request is a JSON POST with userName/password in the body. Errors come back as { error: { message } },
// often with HTTP 200, so every response is checked for it.
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

const BASE = "https://api.speedy.bg/v1";
const BULGARIA = 100;
/** "СТАНДАРТ 24 ЧАСА", the domestic parcel service on the contract. */
const DEFAULT_SERVICE_ID = 505;
const SOFIA_SITE_ID = 68134;

type SpeedyOffice = {
  id: number;
  name: string;
  siteId: number;
  type?: string;
  address?: { siteName?: string; postCode?: string; fullAddressString?: string; localAddressString?: string };
};
type Site = City & { nameEn?: string; town: boolean };

function credentials() {
  return { userName: process.env.SPEEDY_USERNAME ?? "", password: process.env.SPEEDY_PASSWORD ?? "" };
}

function isConfigured() {
  const c = credentials();
  return Boolean(c.userName && c.password);
}

function speedyError(body: unknown, status: number): CourierError | null {
  if (isRecord(body) && isRecord(body.error)) {
    const msg = str(body.error.message) || "Неизвестна грешка";
    // Drop Speedy's internal request id "(EE2026...)" from the end of the message.
    return new CourierError("speedy", `Speedy: ${msg.replace(/\s*\(EE[0-9A-Z]+\)\s*$/, "")}`, status, str(body.error.code) || undefined);
  }
  if (status >= 400) {
    if (status === 401 || status === 403) return new CourierError("speedy", "Speedy: невалидно потребителско име или парола.", status);
    const msg = isRecord(body) ? str(body.message) : "";
    return new CourierError("speedy", `Speedy: грешка ${status}${msg ? ` – ${msg}` : ""}`, status);
  }
  return null;
}

async function request(path: string, body: Record<string, unknown>, timeoutMs?: number): Promise<Response> {
  if (!isConfigured()) throw new CourierError("speedy", "Speedy не е свързан: липсват SPEEDY_USERNAME / SPEEDY_PASSWORD в .env.local.");
  return courierFetch(
    "speedy",
    BASE + path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json, application/pdf" },
      body: JSON.stringify({ ...credentials(), language: "BG", ...body }),
    },
    timeoutMs,
  );
}

async function call<T extends Record<string, unknown>>(path: string, body: Record<string, unknown>, timeoutMs?: number): Promise<T> {
  const res = await request(path, body, timeoutMs);
  const json = await readJson(res);
  const err = speedyError(json, res.status);
  if (err) throw err;
  return (isRecord(json) ? json : {}) as T;
}

/**
 * CSV with a header row → one object per row (RFC 4180: quoted fields, "" inside quotes, CRLF or LF, BOM dropped,
 * empty lines skipped). Enough for Speedy's place list; keeps the project free of a CSV dependency.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (field || row.length) endRow();
  const [header = [], ...records] = rows;
  return records.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])));
}

function mapOffice(o: SpeedyOffice): Office {
  const a = o.address ?? {};
  return {
    id: String(o.id),
    name: o.name,
    address: a.localAddressString || a.fullAddressString || "",
    city: a.siteName ?? "",
    cityId: String(o.siteId),
    postcode: a.postCode || undefined,
    kind: o.type === "APT" ? "locker" : "office",
  };
}

/** All ~5300 Speedy places (towns and villages) in Bulgaria from the CSV list, cached for 24 h. */
function allSites(): Promise<Site[]> {
  return cached("speedy-sites-v1", DAY_MS, async () => {
    const res = await request(`/location/site/csv/${BULGARIA}`, {}, 60000);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("csv")) {
      throw speedyError(await readJson(res), res.status) ?? new CourierError("speedy", "Speedy не върна списъка с населени места.");
    }
    const rows = parseCsv(await res.text());
    const sites = rows.map((r): Site => {
      const region = [
        r.type === "с." ? "село" : "",
        r.municipality && r.municipality !== r.name ? `общ. ${r.municipality}` : "",
        r.region ? `обл. ${r.region}` : "",
      ].filter(Boolean);
      return { id: r.id, name: r.name, nameEn: r.nameEn || undefined, postcode: r.postCode || undefined, region: region.join(", ") || undefined, town: r.type !== "с." };
    });
    if (!sites.length) throw new CourierError("speedy", "Speedy върна празен списък с населени места.");
    return sites;
  });
}

/** All Speedy offices and lockers in Bulgaria (~1300), cached for 24 h. */
function allOffices(): Promise<Office[]> {
  return cached("speedy-offices-v1", DAY_MS, async () => {
    const res = await call<{ offices?: SpeedyOffice[] }>("/location/office", { countryId: BULGARIA }, 60000);
    const offices = (res.offices ?? []).map(mapOffice);
    if (!offices.length) throw new CourierError("speedy", "Speedy върна празен списък с офиси.");
    return offices;
  });
}

/** The recipient's Speedy site: the id chosen at checkout, else the only place with that name (and postcode). */
async function siteId(place: { cityId: string; city: string; postcode: string }): Promise<number> {
  const fromId = Number.parseInt(place.cityId, 10);
  if (Number.isFinite(fromId) && fromId > 0) return fromId;
  const city = place.city.replace(/^(гр|с)\.\s*/i, "").trim().toLocaleLowerCase("bg-BG");
  const exact = (await allSites()).filter((s) => s.name.toLocaleLowerCase("bg-BG") === city);
  const pick = exact.find((s) => place.postcode && s.postcode === place.postcode) ?? (exact.length === 1 ? exact[0] : undefined);
  if (!pick) throw new CourierError("speedy", `Speedy не разпозна еднозначно населеното място „${place.city}“${place.postcode ? ` (${place.postcode})` : ""}.`);
  return Number(pick.id);
}

const serviceId = () => Number.parseInt(process.env.SPEEDY_SERVICE_ID ?? "", 10) || DEFAULT_SERVICE_ID;

export const speedy: CarrierAdapter = {
  id: "speedy",
  isConfigured,

  /** Every Speedy list (places, offices) needs SPEEDY_USERNAME / SPEEDY_PASSWORD. */
  canListOffices: isConfigured,

  async searchCities(query) {
    if (query.trim().length < 2) return [];
    return rankCities(await allSites(), query).map(({ id, name, postcode, region }) => ({ id, name, postcode, region }));
  },

  async listOffices(params) {
    return filterOffices(await allOffices(), params);
  },

  async createShipment(input) {
    const s = sender();
    const d = input.delivery;
    const orderNumber = String(input.orderNumber);
    // Without an address the courier collects from the contract's own address; a drop-off office overrides it.
    const from: Record<string, unknown> = {};
    if (s.phone) from.phone1 = { number: phoneBG(s.phone) };
    if (s.contactName) from.contactName = s.contactName.slice(0, 60);
    if (s.email) from.email = s.email;
    const dropoff = Number.parseInt(s.speedyOfficeId, 10);
    if (dropoff > 0) from.dropoffOfficeId = dropoff;

    const recipient: Record<string, unknown> = {
      privatePerson: true,
      clientName: input.recipient.name.slice(0, 60),
      phone1: { number: phoneBG(input.recipient.phone) },
      email: input.recipient.email,
    };
    if (d.kind === "address") {
      const address = addressOf(d);
      if (!address) throw new CourierError("speedy", "В поръчката няма адрес за доставка.");
      recipient.address = {
        countryId: BULGARIA,
        siteId: await siteId({ cityId: d.cityId ?? "", city: d.city, postcode: d.postcode ?? "" }),
        ...(d.postcode ? { postCode: d.postcode } : {}),
        addressNote: address.slice(0, 200),
      };
    } else {
      const office = Number.parseInt(d.officeId ?? "", 10);
      if (!(office > 0)) throw new CourierError("speedy", "В поръчката няма избран офис или автомат на Speedy.");
      recipient.pickupOfficeId = office;
    }

    const services: Record<string, unknown> = {};
    if (input.codAmount > 0) services.cod = { amount: eur(input.codAmount), currencyCode: "EUR", processingType: "CASH" };
    if (input.declaredValue > 0) services.declaredValue = { amount: eur(input.declaredValue), fragile: false };

    const res = await call<{ id?: string; parcels?: { id: string }[]; price?: Record<string, unknown>; deliveryDeadline?: string }>(
      "/shipment",
      {
        ...(Object.keys(from).length ? { sender: from } : {}),
        recipient,
        service: { serviceId: serviceId(), autoAdjustPickupDate: true, ...(Object.keys(services).length ? { additionalServices: services } : {}) },
        content: { parcelsCount: input.parcels, totalWeight: Math.max(0.1, eur(input.weightKg)), contents: contentsOf(input).slice(0, 100), package: "BOX" },
        // The customer paid for delivery at checkout, so the shop pays Speedy.
        payment: { courierServicePayer: process.env.SPEEDY_PAYER === "RECIPIENT" ? "RECIPIENT" : "SENDER" },
        ref1: orderNumber,
      },
      30000,
    );
    if (!res.id) throw new CourierError("speedy", "Speedy не върна номер на товарителница.");
    return {
      shipmentId: String(res.id),
      trackingNumber: String(res.id),
      data: {
        parcels: (res.parcels ?? []).map((p) => String(p.id)),
        price: res.price?.total ?? null,
        currency: res.price?.currency ?? null,
        deliveryDeadline: res.deliveryDeadline ?? null,
        // For the cancel comment (cancelShipment gets only the stored shipment).
        orderNumber,
      },
    };
  },

  async getLabelPdf(shipment) {
    const listed = Array.isArray(shipment.data?.parcels) ? shipment.data.parcels.map(str).filter(Boolean) : [];
    const ids = listed.length ? listed : [shipment.shipmentId];
    const res = await request("/print", { format: "pdf", paperSize: "A6", parcels: ids.map((id) => ({ parcel: { id } })) }, 30000);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("pdf")) return Buffer.from(await res.arrayBuffer());
    throw speedyError(await readJson(res), res.status) ?? new CourierError("speedy", "Speedy не върна PDF с етикета.");
  },

  async cancelShipment(shipment) {
    const orderNumber = str(shipment.data?.orderNumber);
    const comment = orderNumber ? `Анулирана от магазина (поръчка ${orderNumber})` : "Анулирана от магазина";
    await call("/shipment/cancel", { shipmentId: shipment.shipmentId, comment });
  },

  async test() {
    const res = await call<{ offices?: unknown[] }>("/location/office", { countryId: BULGARIA, siteId: SOFIA_SITE_ID });
    return res.offices?.length ?? 0;
  },
};
