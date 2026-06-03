# SnapMeter vision proxy

Reads the meter photo with **Anthropic Claude** and returns the JSON contract the
PWA expects (`src/lib/vision.ts` → `RawExtraction`). The proxy exists so the API
key stays server-side and never ships to the browser.

The QR has already resolved the meter's identity and register format on the
client; this asks Claude to read **only** the numeric value, constrained to that
format (PRD §7.2).

## Run it locally (pilot / dev)

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...        # or put it in .env and source it
npm run vision-server                       # → http://localhost:8787/extract
```

Then point the PWA at the proxy and start it:

```bash
echo 'VITE_VISION_API_URL=http://localhost:8787/extract' >> .env
npm run dev
```

Now capturing/uploading a meter photo calls Claude instead of the mock extractor.
(Verify in **Settings → Vision mode**, which reads `VITE_VISION_API_URL`.)

### Request / response

`POST /extract`

```jsonc
// request (sent by the PWA)
{ "image": "data:image/jpeg;base64,...", "meter_id": "mtr-rs-w1",
  "meter_type": "water", "register_config": { "integer_digits": 5, "decimals": 2 } }

// response (RawExtraction)
{ "value": 1852.31, "raw_digits": "185231", "register": null,
  "secondary_registers": [], "confidence": 0.97, "anomalies": [], "notes": "" }
```

The example photos in `../examples/` are good end-to-end test inputs.

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. |
| `VISION_MODEL` | `claude-opus-4-8` | This is a small, constrained read — `claude-haiku-4-5` or `claude-sonnet-4-6` are much cheaper per image and likely sufficient. |
| `VISION_PORT` | `8787` | Local server port. |
| `VISION_ALLOW_ORIGIN` | `*` | CORS origin; set to your PWA origin in production. |

## Deploy it later (host-agnostic)

`extractMeterReading()` is exported and framework-free, so the same logic drops
onto any host. Examples:

**Vercel** — `api/extract.ts`:

```ts
import { extractMeterReading } from '../server/vision-extract.mjs';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try { res.json(await extractMeterReading(req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
```

**Cloudflare Worker / Supabase Edge Function** — call `extractMeterReading(await req.json())`
and return `Response.json(result)`. Set `ANTHROPIC_API_KEY` as a secret in the
platform's dashboard. (A Supabase Edge Function stub also lives at
`../supabase/functions/extract/index.ts`.)

Whatever you deploy, set `VITE_VISION_API_URL` to its URL and rebuild the PWA.

## Cost & accuracy

- Per-image cost is small (a constrained single-image read). Start on a cheaper
  model and only move up if accuracy on your real meters needs it.
- This is the right moment to run **PRD Phase 0**: feed real photos from 1–2
  sites through `/extract`, measure accuracy per meter type, and tune the
  validation thresholds in `src/lib/validation.ts` accordingly.
