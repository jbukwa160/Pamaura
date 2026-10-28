# Courier environment variables

Put these in `.env.local` (all values empty here on purpose; fill in the shop's own logins). Without logins, Econt and
BOX NOW office/locker lists still load (public lists); Speedy needs its login for every list.
Office/city lists are cached in `DATA_DIR/courier-cache/` for 24 h.

```
# Sender (on every waybill)
SENDER_NAME=
SENDER_CONTACT=
SENDER_PHONE=
SENDER_EMAIL=
SENDER_CITY=
SENDER_POSTCODE=
SENDER_ADDRESS=

# Econt
ECONT_USERNAME=
ECONT_PASSWORD=
ECONT_ENV=
ECONT_SENDER_PAYMENT=
ECONT_DROPOFF_OFFICE_CODE=

# Speedy
SPEEDY_USERNAME=
SPEEDY_PASSWORD=
SPEEDY_SERVICE_ID=
SPEEDY_PAYER=
SPEEDY_DROPOFF_OFFICE_ID=

# BOX NOW
BOXNOW_API_URL=
BOXNOW_CLIENT_ID=
BOXNOW_CLIENT_SECRET=
BOXNOW_WAREHOUSE_ID=
BOXNOW_COMPARTMENT_SIZE=
```

| Variable | Meaning | Required for |
| --- | --- | --- |
| `SENDER_NAME` | Company name on the courier contracts (sender client) | Econt waybills (required); BOX NOW origin contact if `SENDER_CONTACT` is empty |
| `SENDER_CONTACT` | Contact person (Econt authorised person, Speedy contact, BOX NOW origin contact) | Optional |
| `SENDER_PHONE` | Sender phone, any Bulgarian format | Econt and BOX NOW waybills (required); Speedy (optional) |
| `SENDER_EMAIL` | Sender e-mail | BOX NOW waybills (required); Econt and Speedy (optional) |
| `SENDER_CITY` | Pickup city | Econt waybills when `ECONT_DROPOFF_OFFICE_CODE` is empty |
| `SENDER_POSTCODE` | Pickup postcode | Econt pickup address (optional) |
| `SENDER_ADDRESS` | Pickup street address | Econt waybills when `ECONT_DROPOFF_OFFICE_CODE` is empty |
| `ECONT_USERNAME` / `ECONT_PASSWORD` | Econt e-Econt login (HTTP Basic) | Econt create / label / cancel / test. Not needed for city and office lists |
| `ECONT_ENV` | `demo` = Econt demo server (demo.econt.com); anything else = live | Optional |
| `ECONT_SENDER_PAYMENT` | `credit` (invoiced under the contract) or `cash` (paid at pickup); empty = account default | Optional |
| `ECONT_DROPOFF_OFFICE_CODE` | Econt office where parcels are handed in; empty = pickup from `SENDER_CITY` / `SENDER_ADDRESS` | Econt waybills (this or the sender address) |
| `SPEEDY_USERNAME` / `SPEEDY_PASSWORD` | Speedy API login | Everything Speedy (places, offices, waybills) |
| `SPEEDY_SERVICE_ID` | Speedy service id; default `505` (СТАНДАРТ 24 ЧАСА) | Optional |
| `SPEEDY_PAYER` | `RECIPIENT` = recipient pays Speedy; anything else = `SENDER` | Optional |
| `SPEEDY_DROPOFF_OFFICE_ID` | Speedy office where parcels are handed in; empty = pickup from the contract address | Optional |
| `BOXNOW_API_URL` | BOX NOW partner API host (with or without `https://`) | Everything BOX NOW except the public locker list |
| `BOXNOW_CLIENT_ID` / `BOXNOW_CLIENT_SECRET` | BOX NOW partner API credentials | BOX NOW waybills / labels / cancel / test |
| `BOXNOW_WAREHOUSE_ID` | BOX NOW origin (warehouse) location id | BOX NOW waybills / test |
| `BOXNOW_COMPARTMENT_SIZE` | Default locker compartment: `1` small, `2` medium (default), `3` large | Optional (per shipment `boxSize` overrides it) |
| `DATA_DIR` | Runtime data directory (already used by `src/lib/db.ts`); the courier list cache goes in `DATA_DIR/courier-cache` | Optional (default `../pamaura-data`) |
