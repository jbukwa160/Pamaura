// Which .env.local settings are filled in, for the admin pages. Only variable NAMES and set / missing leave this
// file — never a value.
import "server-only";
import fs from "node:fs";
import { getCarrier, type CarrierId } from "../shipping/couriers";
import { carrierListsAvailable } from "../shipping/rates";
import { OUTBOX, failedMailCount, mailFrom, shopNotifyEmail } from "../mail";

export interface EnvVar {
  name: string;
  set: boolean;
}

const isSet = (name: string) => Boolean((process.env[name] ?? "").trim());
const vars = (names: string[]): EnvVar[] => names.map((name) => ({ name, set: isSet(name) }));

export interface CourierStatus {
  id: CarrierId;
  name: string;
  connected: boolean;
  /** offices / lockers can be shown at the checkout right now */
  listsAvailable: boolean;
  /** needed for the connection (logins) */
  login: EnvVar[];
  /** needed for creating waybills (sender data) */
  waybill: EnvVar[];
  /** an alternative the courier accepts instead of some sender fields, in words */
  waybillNote?: string;
  optional: EnvVar[];
}

export function courierStatuses(): CourierStatus[] {
  const econtDropoff = isSet("ECONT_DROPOFF_OFFICE_CODE");
  return [
    {
      id: "econt",
      name: "Еконт",
      connected: getCarrier("econt").isConfigured(),
      listsAvailable: carrierListsAvailable("econt"),
      login: vars(["ECONT_USERNAME", "ECONT_PASSWORD"]),
      waybill: vars(["SENDER_NAME", "SENDER_PHONE", ...(econtDropoff ? ["ECONT_DROPOFF_OFFICE_CODE"] : ["SENDER_CITY", "SENDER_ADDRESS"])]),
      waybillNote: econtDropoff ? undefined : "Вместо град и адрес за взимане може да попълните ECONT_DROPOFF_OFFICE_CODE (офисът, в който предавате пратките).",
      optional: vars(["ECONT_ENV", "ECONT_SENDER_PAYMENT", "SENDER_CONTACT", "SENDER_EMAIL", "SENDER_POSTCODE"]),
    },
    {
      id: "speedy",
      name: "Speedy",
      connected: getCarrier("speedy").isConfigured(),
      listsAvailable: carrierListsAvailable("speedy"),
      login: vars(["SPEEDY_USERNAME", "SPEEDY_PASSWORD"]),
      waybill: [],
      optional: vars(["SPEEDY_SERVICE_ID", "SPEEDY_PAYER", "SPEEDY_DROPOFF_OFFICE_ID", "SENDER_CONTACT", "SENDER_PHONE", "SENDER_EMAIL"]),
    },
    {
      id: "boxnow",
      name: "BOX NOW",
      connected: getCarrier("boxnow").isConfigured(),
      listsAvailable: carrierListsAvailable("boxnow"),
      login: vars(["BOXNOW_API_URL", "BOXNOW_CLIENT_ID", "BOXNOW_CLIENT_SECRET", "BOXNOW_WAREHOUSE_ID"]),
      waybill: vars(["SENDER_PHONE", "SENDER_EMAIL"]),
      optional: vars(["BOXNOW_COMPARTMENT_SIZE", "SENDER_NAME", "SENDER_CONTACT"]),
    },
  ];
}

export interface MailStatus {
  configured: boolean;
  smtp: EnvVar[];
  from: string;
  notifyTo: string;
  notifyFromEnv: boolean;
  /** e-mails written to the outbox folder because there is no SMTP server */
  outbox: number;
  /** e-mails the SMTP server refused, waiting for a retry */
  failed: number;
}

export function mailStatus(): MailStatus {
  let outbox = 0;
  try {
    outbox = fs.readdirSync(OUTBOX).filter((f) => f.endsWith(".eml")).length;
  } catch {
    outbox = 0;
  }
  return {
    configured: isSet("SMTP_HOST"),
    smtp: vars(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SHOP_NOTIFY_EMAIL"]),
    from: mailFrom(),
    notifyTo: shopNotifyEmail(),
    notifyFromEnv: isSet("SHOP_NOTIFY_EMAIL"),
    outbox,
    failed: failedMailCount(),
  };
}
