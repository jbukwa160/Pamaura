// Delivery settings in the admin.
import "server-only";
import { DEFAULT_SHIPPING, shippingSettings, type ShippingMethod } from "../shipping/rates";

/** The saved methods, plus any built-in method added to the code after the settings were saved (a new courier). */
export function knownShippingMethods(): ShippingMethod[] {
  const saved = shippingSettings().methods;
  return [...saved, ...DEFAULT_SHIPPING.methods.filter((d) => !saved.some((m) => m.code === d.code))];
}
