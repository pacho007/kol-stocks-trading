import { createFileRoute } from '@tanstack/react-router'

function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number)
  return diff === 0
}

const clamp01 = (n: unknown) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return Math.min(1, Math.max(0, v))
}

const methodNotAllowed = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })

export const Route = createFileRoute('/api/public/oracle-sync')({
  server: {
    handlers: {
      GET: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      POST: async ({ request }) => {
        const expected = process.env['ORACLE_SYNC_SECRET']
        if (!expected) return new Response(null, { status: 401 })

        const provided = request.headers.get('x-cron-secret') ?? ''
        if (!timingSafeEqualStr(provided, expected)) {
          return new Response(null, { status: 401 })
        }

        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 })
        }

        const rows = (payload as { rows?: unknown } | null)?.rows
        if (!Array.isArray(rows)) {
          return Response.json({ ok: false, error: 'rows_required' }, { status: 400 })
        }
        if (rows.length > 500) {
          return Response.json({ ok: false, error: 'too_many_rows' }, { status: 400 })
        }
        if (rows.length === 0) return Response.json({ ok: true, written: 0 })

        const cleaned = []
        for (const raw of rows) {
          const r = raw as Record<string, unknown>
          const kolId = typeof r?.['kol_id'] === 'string' ? (r['kol_id'] as string).trim() : ''
          if (!kolId) {
            return Response.json({ ok: false, error: 'invalid_kol_id' }, { status: 400 })
          }
          const num = (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? v : 0
          cleaned.push({
            kol_id: kolId,
            realized_pnl_eth: num(r['realized_pnl_eth']),
            volume_eth: num(r['volume_eth']),
            win_rate: clamp01(r['win_rate']),
            trades: Math.max(0, Math.floor(num(r['trades']))),
            top_wins: Array.isArray(r['top_wins']) ? r['top_wins'] : [],
            top_losses: Array.isArray(r['top_losses']) ? r['top_losses'] : [],
            breakdown:
              r['breakdown'] && typeof r['breakdown'] === 'object' && !Array.isArray(r['breakdown'])
                ? r['breakdown']
                : {},
            confidence: clamp01(r['confidence']),
            updated_at: new Date().toISOString(),
          })
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { error } = await supabaseAdmin
          .from('listing_metrics')
          .upsert(cleaned as never, { onConflict: 'kol_id' })

        if (error) {
          return Response.json({ ok: false, error: 'write_failed' }, { status: 500 })
        }

        return Response.json({ ok: true, written: cleaned.length })
      },
    },
  },
})
