/**
 * Runtime reverse proxy for all /api/v1/* calls.
 *
 * Replaces the next.config.js rewrite, which was evaluated at BUILD time and
 * therefore had AGENTWATCH_API_URL baked in as "http://localhost:8000" (the
 * env var is not present during `docker build`).  This route runs on every
 * request and reads the env var from the live container environment.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { IncomingMessage } from 'http'

// Reads from the container env at request time — never baked in at build time.
const API_BASE =
  (process.env.AGENTWATCH_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export const config = {
  api: {
    bodyParser: false,  // We stream the raw body through unchanged
    externalResolver: true,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const segments = Array.isArray(req.query.path)
    ? req.query.path
    : [req.query.path ?? '']
  const path = segments.join('/')

  // Forward query params (except the internal Next.js `path` param)
  const { path: _drop, ...rest } = req.query
  const qs = new URLSearchParams(
    Object.entries(rest).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((val) => [k, val]) : [[k, String(v)]]
    ),
  ).toString()

  const upstream = `${API_BASE}/api/v1/${path}${qs ? `?${qs}` : ''}`

  try {
    const forwardHeaders: Record<string, string> = {}
    if (req.headers['content-type']) {
      forwardHeaders['content-type'] = req.headers['content-type']
    }
    if (req.headers['authorization']) {
      forwardHeaders['authorization'] = req.headers['authorization'] as string
    }

    const isReadMethod = req.method === 'GET' || req.method === 'HEAD'
    const body = isReadMethod ? undefined : await readRawBody(req)

    const upstreamRes = await fetch(upstream, {
      method: req.method ?? 'GET',
      headers: forwardHeaders,
      body,
    })

    res.status(upstreamRes.status)

    const ct = upstreamRes.headers.get('content-type')
    if (ct) res.setHeader('content-type', ct)

    const payload = await upstreamRes.text()
    res.send(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[proxy] ${req.method} ${upstream} →`, message)
    res.status(502).json({
      error: 'upstream_unavailable',
      upstream,
      detail: message,
    })
  }
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    )
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
