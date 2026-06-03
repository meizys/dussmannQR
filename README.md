# SnapMeter — Meter Reading Automation (MVP / Proof of Concept)

Photograph a QR-tagged meter → the value is extracted → validated against
history → stored with the photo as proof → confirmed readings auto-fill the
client's Excel. Humans only touch flagged exceptions.

This repo is the **proof-of-concept** for the PRD in
`meter-reading-automation-prd.md`. It is a **mobile-first, offline-first PWA**
that runs end-to-end with **zero backend and no API keys**, so the concept is
instantly demonstrable. It's structured with clean seams to drop in the
production services (Supabase + a real vision API + an openpyxl Excel service)
described in the PRD.

## What's implemented

The full loop from the PRD's "End-to-end flow" works today:

| PRD step | In this PoC |
|---|---|
| 1. Today's route | `Route` tab — sites/meters, per-period progress, last reading |
| 2. Scan QR → resolve meter | `Scan` tab — client-side QR decode (`@zxing/browser`), manual picker fallback |
| 3. Photograph the meter | Camera capture with guide frame (falls back to upload / generated sample) |
| 4. Extract value + consumption | Pluggable vision extractor (mock by default), consumption vs. baseline |
| 5. Confirm or re-shoot | Capture review screen with value, consumption, confidence, flags |
| 6. Offline queue + sync | IndexedDB (Dexie); readings captured offline are queued, synced on reconnect |
| 7. Validation engine | Pure rules engine — auto-confirm vs. flag (PRD 7.3) |
| 8. Review only flagged | `Review` tab + reading detail: confirm / correct / reject with photo proof |
| 9. Fill client Excel | `Export` tab — confirmed readings → mapped cells → `.xlsx` download |
| — QR sticker generation | `Meters` tab — printable QR sheet (PRD 7.5) |

### The three core design principles (PRD §3) are honoured

1. **QR is identity, not OCR.** The QR encodes `SM:<meter_id>`; scanning resolves
   site/client/type/units/format from the database. Vision never reads identity.
2. **Vision reads only the value, constrained.** The extractor is told the exact
   format (`integer_digits + decimals`, units) before reading.
3. **Exception-based automation.** A reading auto-confirms only if confidence ≥
   threshold *and* digit count matches *and* consumption is non-negative and
   within the expected band. Everything else is flagged (never silently rejected).

## Run it

```bash
npm install
npm run dev       # http://localhost:5173  (open on a phone via the LAN URL)
# or
npm run build && npm run preview
```

Open on a phone (or use browser device emulation) for the intended experience.
Camera + QR scanning need HTTPS or `localhost`; on a desktop without a camera,
the app automatically offers a manual meter picker, photo upload, and a
generated sample meter frame, so the whole flow is still demonstrable.

### Demo tips

- **Settings** has a manual **Offline** toggle and a **Sync queued readings**
  action to demonstrate offline-first capture.
- The mock extractor deliberately produces a mix of clean reads and edge cases
  (low confidence, spikes, a dropped digit) so the **Review queue** has
  something to do — that's the exception-based concept in action.
- **Reset demo data** in Settings restores the pilot seed (1 client, 2 sites,
  5 meters, baseline readings, 1 template + mappings).

## Architecture & where production code plugs in

```
PWA (this repo, Vite + React + TS, offline-first via IndexedDB)
 ├─ QR decode .............. client-side, offline (src/lib/qr.ts)
 ├─ Vision extraction ...... src/lib/vision.ts  ── seam ──► real multimodal API
 ├─ Validation engine ...... src/lib/validation.ts (pure; port to Edge Function)
 ├─ Data access ............ src/lib/repo.ts + src/db (Dexie) ── seam ──► Supabase
 └─ Excel fill ............. src/lib/excel.ts (SheetJS) ── seam ──► openpyxl service
```

Production scaffolding (stubs that match the PRD contracts) lives in:

- `docs/supabase-schema.sql` — Postgres DDL for the PRD §6 data model + RLS notes.
- `supabase/functions/extract/index.ts` — vision Edge Function implementing the
  §7.2 JSON contract. Point `VITE_VISION_API_URL` at it to replace the mock.
- `services/excel_fill.py` — openpyxl service that injects values into the
  client's real master template **without regenerating it** (PRD §7.4 hard
  requirement). The browser SheetJS path is the demo equivalent.

### Swapping the mock vision for the real Claude proxy

A working, host-agnostic vision proxy (Anthropic Claude) ships in `server/`. It
holds the API key server-side and speaks the exact JSON contract the PWA expects.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run vision-server                              # → http://localhost:8787/extract
echo 'VITE_VISION_API_URL=http://localhost:8787/extract' >> .env
npm run dev
```

Now captures call Claude instead of the mock (confirm in **Settings → Vision
mode**). The core `extractMeterReading()` is framework-free, so the same logic
drops onto Vercel / Cloudflare / a Supabase Edge Function later — see
`server/README.md`. The contract is documented in `src/lib/vision.ts`.

## Conscious scope cuts (it's an MVP)

- **No real backend.** Data is local to the browser (IndexedDB). Multi-device
  sync, auth, and RLS come with Supabase — schema is ready in `docs/`.
- **Excel formatting preservation** is done properly only in the Python service.
  The in-browser SheetJS export proves the mapping→cell logic but generates a
  fresh sheet rather than injecting into the client's branded master.
- **Vision is mocked** by default, but a real Claude proxy is wired and ready in
  `server/` — set `ANTHROPIC_API_KEY` + `VITE_VISION_API_URL` to switch it on.
  PRD Phase 0 (prove accuracy on real photos) is the real next step.
- Auth is a simple role switcher in Settings (technician/manager/admin).

## Tech

Vite · React · TypeScript · vite-plugin-pwa (offline service worker) ·
Dexie (IndexedDB) · @zxing/browser (QR) · qrcode (sticker generation) ·
SheetJS/xlsx (Excel export).
