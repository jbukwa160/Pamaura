// Courier integrations (Econt, Speedy, BOX NOW): shared types. Safe to import from client components.

export const CARRIERS = {
  econt: "Еконт",
  speedy: "Speedy",
  boxnow: "BOX NOW",
} as const;

export type CarrierId = keyof typeof CARRIERS;

export function isCarrier(v: unknown): v is CarrierId {
  return typeof v === "string" && v in CARRIERS;
}

export interface City {
  /** Courier specific id (Speedy site id, Econt city id, BOX NOW: the city name). */
  id: string;
  name: string;
  postcode?: string;
  /** "общ. Х, обл. Y", to tell places with the same name apart. */
  region?: string;
}

export interface Office {
  /** Courier specific id (Speedy office id, Econt office code, BOX NOW locker id). */
  id: string;
  name: string;
  address: string;
  city: string;
  cityId?: string;
  postcode?: string;
  kind: "office" | "locker";
  /** Extra info for the picker, e.g. "24/7". */
  note?: string;
}

/** Everything a courier needs to create a waybill for an order. Amounts in euro. */
export interface ShipmentInput {
  orderNumber: number;
  recipient: { name: string; phone: string; email: string };
  delivery: {
    kind: "office" | "locker" | "address";
    officeId?: string;
    city: string;
    cityId?: string;
    postcode?: string;
    address1?: string;
    address2?: string;
  };
  codAmount: number; // 0 = no cash on delivery
  declaredValue: number; // 0 = not declared
  weightKg: number;
  parcels: number;
  contents: string;
  /** BOX NOW compartment: 1 small, 2 medium, 3 large. */
  boxSize?: 1 | 2 | 3;
}

export interface ShipmentResult {
  shipmentId: string;
  trackingNumber: string;
  data?: Record<string, unknown>;
}

/** A created waybill as stored on the order (orders.waybill JSON). */
export interface Shipment extends ShipmentResult {
  carrier: CarrierId;
  createdAt: string;
  weightKg: number;
  parcels: number;
  codAmount: number;
  declaredValue: number;
}

export interface CarrierAdapter {
  id: CarrierId;
  /** Logins are configured (some lists work without them). */
  isConfigured(): boolean;
  /** Office / locker lists can be loaded right now (with or without logins). */
  canListOffices(): boolean;
  searchCities(query: string): Promise<City[]>;
  listOffices(params: { cityId?: string; query?: string; kind?: "office" | "locker" }): Promise<Office[]>;
  createShipment(input: ShipmentInput): Promise<ShipmentResult>;
  getLabelPdf(shipment: Shipment): Promise<Buffer>;
  cancelShipment(shipment: Shipment): Promise<void>;
  /** Read-only check of the logins: how many offices / lockers the courier lists. */
  test(): Promise<number>;
}

export function officeLabel(o: Pick<Office, "name" | "address" | "city">): string {
  const parts = [o.name];
  if (o.address && !o.name.includes(o.address)) parts.push(o.address);
  if (o.city && !parts.some((p) => p.includes(o.city))) parts.push(o.city);
  return parts.join(", ");
}

export function trackingUrl(carrier: CarrierId, trackingNumber: string): string {
  const n = encodeURIComponent(trackingNumber);
  switch (carrier) {
    case "speedy":
      return `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${n}`;
    case "econt":
      return `https://www.econt.com/services/track-shipment/${n}`;
    case "boxnow":
      return `https://boxnow.bg/?track=${n}`;
  }
}
