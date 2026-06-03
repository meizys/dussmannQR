// SnapMeter vision-extraction proxy (PRD §7.2) — Anthropic Claude.
//
// WHY A PROXY: the meter photo must be read by a multimodal model, but the API
// key must never ship to the browser. This small server holds the key and
// exposes the exact JSON contract that src/lib/vision.ts already speaks, so the
// PWA just needs VITE_VISION_API_URL pointed here.
//
// HOST-AGNOSTIC: `extractMeterReading()` is a plain async function with no
// server framework baked in. Run the bundled Node server below for local/pilot
// use, or import the function into a Vercel function / Cloudflare Worker / etc.
// (see server/README.md).
//
// QR already resolved identity on the client — this asks Claude to read ONLY the
// numeric value, constrained to the meter's known register format.

import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';

const MODEL = process.env.VISION_MODEL || 'claude-opus-4-8';
// NOTE on cost: this is a small, constrained "read N digits → JSON" task. Claude
// Haiku 4.5 or Sonnet 4.6 will be much cheaper per image and are very likely
// sufficient — set VISION_MODEL to switch. Defaulting to the most capable model.

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

/** The structured-output schema = the RawExtraction contract (src/types.ts). */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'raw_digits', 'register', 'secondary_registers', 'confidence', 'anomalies', 'notes'],
  properties: {
    value: { type: 'number' },
    raw_digits: { type: 'string' },
    register: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    secondary_registers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['register', 'value'],
        properties: { register: { type: 'string' }, value: { type: 'number' } },
      },
    },
    confidence: { type: 'number' },
    anomalies: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};

function buildPrompt({ meter_type, register_config }) {
  const { integer_digits, decimals, registers } = register_config;
  const total = integer_digits + decimals;
  return [
    `You are reading the numeric register on a ${meter_type} meter from a photo.`,
    `Read ONLY the register value — never a serial number, model number, or any other identifier.`,
    `This meter's register has exactly ${integer_digits} integer digits and ${decimals} decimal digits (${total} digits total).`,
    registers && registers.length
      ? `It has multiple registers: ${registers.join(', ')}. Report the primary in "value"/"register" and the rest in "secondary_registers".`
      : `It is a single register. Use "secondary_registers": [] and "register": null.`,
    `Return:`,
    `- "raw_digits": all ${total} digits as a string with no decimal point (zero-pad if needed).`,
    `- "value": the reading as a number with the decimal point placed after the first ${integer_digits} digits.`,
    `- "confidence": 0..1, your certainty the digits are correct.`,
    `- "anomalies": short tags for anything that hurt the read (e.g. "glare", "partial_digit", "dial_between_marks", "fogged_glass"); [] if clean.`,
    `- "notes": one short sentence, or "".`,
    `If a digit is unreadable, give your best estimate, lower the confidence, and note it.`,
  ].join(' ');
}

function parseDataUrl(image) {
  // Accepts a data URL ("data:image/jpeg;base64,...") or a bare base64 string.
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(image);
  if (m) return { media_type: m[1], data: m[2] };
  return { media_type: 'image/jpeg', data: image };
}

/**
 * Core extraction. Input mirrors what the PWA POSTs:
 *   { image, meter_id, meter_type, register_config }
 * Returns a RawExtraction object.
 */
export async function extractMeterReading(input) {
  const { image, meter_type, register_config } = input;
  if (!image || !meter_type || !register_config) {
    throw Object.assign(new Error('Missing image, meter_type, or register_config'), { status: 400 });
  }
  const { media_type, data } = parseDataUrl(image);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // Low effort + no thinking: this is a fast, narrow perception task.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data } },
          { type: 'text', text: buildPrompt({ meter_type, register_config }) },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text block in model response');
  // Structured outputs guarantee valid JSON; strip fences defensively anyway.
  const cleaned = textBlock.text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Local server (run: npm run vision-server) ─────────────────────────────────
// Skipped when this file is imported (e.g. into a serverless handler).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const PORT = Number(process.env.VISION_PORT || 8787);
  const ORIGIN = process.env.VISION_ALLOW_ORIGIN || '*';

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('⚠️  ANTHROPIC_API_KEY is not set — requests will fail. See .env.example.');
  }

  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, model: MODEL }));
    }
    if (req.method !== 'POST') return res.writeHead(405).end();

    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = await extractMeterReading(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err?.status || 500;
      console.error('extract error:', err?.message || err);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err?.message || 'extraction failed' }));
    }
  }).listen(PORT, () => {
    console.log(`SnapMeter vision proxy → http://localhost:${PORT}/extract  (model: ${MODEL})`);
    console.log(`Point the PWA at it:  VITE_VISION_API_URL=http://localhost:${PORT}/extract`);
  });
}
