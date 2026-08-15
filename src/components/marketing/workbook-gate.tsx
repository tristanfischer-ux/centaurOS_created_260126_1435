'use client'

/**
 * WorkbookGate — "email to unlock" form for the example Dossier workbook (P1-c).
 *
 * @description Inline client component: one email field; on success swaps to a
 * direct download link. Used on the homepage examples section and /sample-package.
 */

import { useState, type FormEvent } from 'react'
import { unlockWorkbook } from '@/actions/workbook-lead'

export function WorkbookGate({ source = 'example-workbook' }: { source?: string }) {
  const [email, setEmail] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const fd = new FormData()
      fd.set('email', email)
      fd.set('source', source)
      const res = await unlockWorkbook(fd)
      if (res.error) setError(res.error)
      else if (res.url) setUrl(res.url)
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setSending(false)
    }
  }

  if (url) {
    return (
      <div style={{ textAlign: 'center' }}>
        <a
          href={url}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 999,
            padding: '14px 26px',
            fontWeight: 700,
            fontSize: 16,
            background: '#e2562a',
            color: '#fff',
            textDecoration: 'none',
            boxShadow: '0 6px 18px rgba(226,86,42,.28)',
          }}
        >
          Download the example workbook (Excel) ↓
        </a>
        <p style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>
          Open it and change an assumption — every number recomputes.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ textAlign: 'center' }}>
      <div
        style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcompany.com"
          aria-label="Email address to unlock the example workbook"
          style={{
            fontSize: 16,
            padding: '13px 16px',
            borderRadius: 999,
            border: '1px solid #e6eaf0',
            background: '#f8fafc',
            minWidth: 260,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: 999,
            padding: '13px 24px',
            fontWeight: 700,
            fontSize: 16,
            background: '#e2562a',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? 'One moment…' : 'Email me the workbook link →'}
        </button>
      </div>
      {error && (
        <p style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: '#b91c1c' }}>{error}</p>
      )}
      <p style={{ marginTop: 10, fontSize: 12.5, color: '#64748b' }}>
        A real, sanitised Design Dossier (a water-treatment plant). We store your email to send the
        link and may follow up once about your project — no spam, unsubscribe any time. See our{' '}
        <a href="/privacy" style={{ color: '#1d4ed8' }}>
          privacy policy
        </a>
        .
      </p>
    </form>
  )
}
