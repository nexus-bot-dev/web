#!/usr/bin/env node
import http from 'http'
import https from 'https'
import { URL } from 'url'

function request(method, urlStr, body) {
  const url = new URL(urlStr)
  const payload = body ? Buffer.from(body) : null
  const lib = url.protocol === 'https:' ? https : http
  const options = {
    method,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload ? payload.length : 0
    }
  }
  return new Promise((resolve, reject) => {
    const req = lib.request(options, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ statusCode: res.statusCode || 0, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function detectIp() {
  try {
    const url = new URL('https://api.ipify.org?format=json')
    const res = await request('GET', url.toString())
    if (res.statusCode === 200 && res.text) {
      const json = JSON.parse(res.text)
      if (json && json.ip) return json.ip
    }
  } catch {}
  return ''
}

async function main() {
  const key = (process.argv[2] || '').trim()
  if (!/^\d{11}$/.test(key)) {
    console.error('Gunakan: npm run license:activate -- <kunci_11_digit> [host] [ip]')
    process.exit(1)
  }
  const host = (process.argv[3] || process.env.LICENSE_HOST || 'http://127.0.0.1:3000').trim()
  let ip = (process.argv[4] || process.env.LICENSE_IP || '').trim()
  if (!ip) ip = await detectIp()
  const url = new URL('/api/license/activate', host)
  const body = JSON.stringify({ key, ip })
  try {
    const res = await request('POST', url.toString(), body)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Lisensi berhasil diaktifkan.')
      if (res.text) {
        try {
          const parsed = JSON.parse(res.text)
          console.log(JSON.stringify(parsed, null, 2))
        } catch {
          console.log(res.text)
        }
      }
    } else {
      console.error(`Aktivasi gagal dengan kode ${res.statusCode}.`)
      if (res.text) console.error(res.text)
      process.exit(1)
    }
  } catch (e) {
    console.error('Tidak dapat menghubungi server lisensi:', e.message)
    process.exit(1)
  }
}

main()
