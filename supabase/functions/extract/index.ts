// SnapMeter vision-extraction Edge Function (PRD §7.2).
//
// Identity is already resolved by the QR on the client; this function receives
// the meter-face image + known register format and asks a multimodal model to
// read ONLY the numeric value, constrained to that format. It returns the strict
// JSON contract below. Point the PWA at it via VITE_VISION_API_URL.
//
// Deploy: supabase functions deploy extract --no-verify-jwt
// This is a reference stub; wire in your chosen vision provider's SDK/HTTP call.

interface RegisterConfig {
  integer_digits: number;
  decimals: number;
  multiplier?: number;
  registers?: string[];
}

interface ExtractRequest {
  image: string; // data URL or https URL
  meter_id: string;
  meter_type: 'water' | 'electricity' | 'gas' | 'heat';
  register_config: RegisterConfig;
}

function buildPrompt(req: ExtractRequest): string {
  const { integer_digits, decimals, registers } = req.register_config;
  const total = integer_digits + decimals;
  return [
    `You are reading a ${req.meter_type} meter display.`,
    `Read ONLY the numeric register value. Do not read serial numbers or identifiers.`,
    `The register has exactly ${integer_digits} integer digits and ${decimals} decimal digits (${total} digits total).`,
    registers?.length ? `Registers present: ${registers.join(', ')}.` : `Single register.`,
    `If a digit is unreadable, lower confidence and note it in anomalies.`,
    `Respond with ONLY valid JSON, no markdown, matching:`,
    `{"value":number,"raw_digits":string,"register":string|null,`,
    `"secondary_registers":[{"register":string,"value":number}],`,
    `"confidence":number(0..1),"anomalies":string[],"notes":string}`,
  ].join(' ');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = (await req.json()) as ExtractRequest;
  const prompt = buildPrompt(body);

  // ── Wire your vision provider here ─────────────────────────────────────────
  // const result = await callVisionModel({ prompt, image: body.image });
  // const cleaned = result.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // return Response.json(JSON.parse(cleaned));
  // ───────────────────────────────────────────────────────────────────────────

  return Response.json(
    { error: 'not_implemented', message: 'Connect a vision provider in extract/index.ts', prompt },
    { status: 501 }
  );
});
