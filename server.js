import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'

const dataDir = path.join(process.cwd(), 'data')
const publicDir = path.join(process.cwd(), 'public')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

ensureDir(dataDir)
ensureDir(publicDir)

const files = {
  users: path.join(dataDir, 'users.json'),
  servers: path.join(dataDir, 'servers.json'),
  accounts: path.join(dataDir, 'accounts.json'),
  transactions: path.join(dataDir, 'transactions.json'),
  notifications: path.join(dataDir, 'notifications.json'),
  settings: path.join(dataDir, 'settings.json'),
  licenseKeys: path.join(dataDir, 'license-keys.json'),
  licenseInstance: path.join(dataDir, 'license-instance.json')
}

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2))
    return
  }
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (!raw.trim()) fs.writeFileSync(file, JSON.stringify(fallback, null, 2))
  } catch {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2))
  }
}

ensureFile(files.users, [])
ensureFile(files.servers, [])
ensureFile(files.accounts, [])
ensureFile(files.transactions, [])
ensureFile(files.notifications, [])
ensureFile(files.settings, [])
ensureFile(files.licenseKeys, [])
ensureFile(files.licenseInstance, {})

function getSettings() {
  const settings = readJSON(files.settings)
  return settings[0] || {}
}

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf8')
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

function readLicenseInstance() {
  try {
    const raw = fs.readFileSync(files.licenseInstance, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLicenseInstance(data) {
  writeJSON(files.licenseInstance, data)
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function nowISO() {
  return new Date().toISOString()
}

function generateLicenseKey() {
  let key = ''
  while (key.length < 11) {
    key += Math.floor(Math.random() * 10).toString()
  }
  return key
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return req.socket?.remoteAddress?.replace('::ffff:', '') || ''
}

function normalizeIps(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim()).filter(Boolean)
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

function evaluateLicenseState() {
  const state = readLicenseInstance()
  if (!state || !state.key) {
    return { valid: false, reason: 'missing_key' }
  }
  const keys = readJSON(files.licenseKeys)
  const keyEntry = keys.find(k => k.key === state.key)
  if (!keyEntry) {
    return { valid: false, reason: 'key_not_found' }
  }
  if (keyEntry.status && keyEntry.status !== 'active') {
    return { valid: false, reason: keyEntry.status }
  }
  const expiresAt = keyEntry.expires_at || state.expires_at
  if (expiresAt) {
    const expiresTime = new Date(expiresAt).getTime()
    if (!Number.isFinite(expiresTime)) {
      return { valid: false, reason: 'invalid_expiry', license: { key: state.key } }
    }
    if (expiresTime < Date.now()) {
      return { valid: false, reason: 'expired', license: { key: state.key, expires_at: expiresAt } }
    }
  }
  const storedIp = state.ip
  const allowedIps = normalizeIps(keyEntry.allowed_ips)
  if (allowedIps.length && storedIp && !allowedIps.includes(storedIp)) {
    return { valid: false, reason: 'ip_not_allowed', license: { key: state.key, ip: storedIp, allowed_ips: allowedIps } }
  }
  return {
    valid: true,
    license: {
      key: state.key,
      label: keyEntry.label,
      ip: storedIp,
      expires_at: expiresAt,
      activated_at: state.activated_at,
      allowed_ips: allowedIps,
      key_id: keyEntry.id
    }
  }
}

function ensureDefaultAdmin() {
  const users = readJSON(files.users)
  const hasAdmin = users.some(u => u.is_admin)
  if (!hasAdmin) {
    const admin = {
      id: uuid(),
      username: 'admin',
      password: 'admin123',
      token: uuid(),
      balance: 0,
      is_admin: true,
      role: 'owner',
      status: 'active',
      created_at: nowISO()
    }
    users.push(admin)
    writeJSON(files.users, users)
  }
}

ensureDefaultAdmin()

function ensureOwnerDesignation() {
  const users = readJSON(files.users)
  let updated = false
  const owners = users.filter(u => u.role === 'owner')
  if (!owners.length) {
    const fallback = users.find(u => u.is_admin)
    if (fallback) {
      fallback.role = 'owner'
      fallback.is_admin = true
      updated = true
    }
  }
  users.forEach(user => {
    if (user.role === 'owner' && !user.is_admin) {
      user.is_admin = true
      updated = true
    }
  })
  if (updated) writeJSON(files.users, users)
}

ensureOwnerDesignation()

function seedDefaultLicenseKey() {
  const keys = readJSON(files.licenseKeys)
  if (!keys.length) {
    const fallback = {
      id: uuid(),
      key: '98765432101',
      label: 'Bootstrap Default',
      status: 'active',
      allowed_ips: [],
      max_ips: 1,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: nowISO(),
      updated_at: nowISO()
    }
    writeJSON(files.licenseKeys, [fallback])
  }
}

seedDefaultLicenseKey()

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr)
    const lib = urlObj.protocol === 'https:' ? https : http
    const req = lib.get(urlObj, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode || 0, text: data, json: JSON.parse(data) })
        } catch {
          resolve({ statusCode: res.statusCode || 0, text: data })
        }
      })
    })
    req.on('error', reject)
  })
}

async function sendTelegram(text, chatIdOverride) {
  const s = getSettings()
  const token = s.telegram_bot_token
  const chatId = chatIdOverride || s.telegram_chat_id
  if (!token || !chatId) return
  const urlStr = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage?chat_id=${encodeURIComponent(chatId)}&text=${encodeURIComponent(text)}&parse_mode=HTML&disable_web_page_preview=true`
  await httpsGet(urlStr)
}

function send(res, status, body, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers }
  res.writeHead(status, h)
  res.end(JSON.stringify(body))
}

function isExpired(tx) {
  if (!tx || !tx.expires_at) return false
  try {
    return new Date(tx.expires_at).getTime() < Date.now()
  } catch {
    return false
  }
}

function markExpiredTransactions() {
  const txs = readJSON(files.transactions)
  let changed = false
  txs.forEach(tx => {
    if (tx.type === 'deposit' && tx.status === 'pending' && isExpired(tx)) {
      tx.status = 'expired'
      tx.updated_at = nowISO()
      tx.expired_at = tx.expired_at || nowISO()
      changed = true
    }
  })
  if (changed) writeJSON(files.transactions, txs)
}

function serveStatic(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  let filePath = path.join(publicDir, urlObj.pathname)
  if (urlObj.pathname === '/') filePath = path.join(publicDir, 'index.html')
  const status = evaluateLicenseState()
  const normalized = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname
  const alwaysAllowed = new Set(['/license.html', '/license.js', '/styles.css', '/daniel.html'])
  if (!status.valid) {
    if (status.reason === 'expired') {
      if (!alwaysAllowed.has(normalized)) filePath = path.join(publicDir, 'daniel.html')
    } else {
      if (!alwaysAllowed.has(normalized)) filePath = path.join(publicDir, 'license.html')
    }
  }
  if (!filePath.startsWith(publicDir)) return send(res, 403, { error: 'forbidden' })
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, { error: 'not_found' })
    const ext = path.extname(filePath)
    const map = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' }
    res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

function parseBody(req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', d => chunks.push(d))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try { resolve(JSON.parse(raw)) } catch { resolve({}) }
    })
  })
}

function getUserByToken(token) {
  const users = readJSON(files.users)
  return users.find(u => u.token === token)
}

function requireUser(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  const token = req.headers['x-user-token'] || urlObj.searchParams.get('token')
  const user = getUserByToken(token || '')
  if (!user) {
    send(res, 401, { error: 'unauthorized' })
    return null
  }
  return user
}

function isAdmin(user) {
  return user && user.is_admin
}

function isOwner(user) {
  return user && user.role === 'owner'
}

async function handleApi(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  const pathname = urlObj.pathname
  if (req.method === 'GET' && pathname === '/api/license/status') {
    const status = evaluateLicenseState()
    send(res, 200, status)
    return
  }
  if (req.method === 'POST' && pathname === '/api/license/activate') {
    const body = await parseBody(req)
    const rawKey = String(body.key || '').trim()
    if (!/^\d{11}$/.test(rawKey)) return send(res, 400, { error: 'invalid_key_format' })
    let ip = String(body.ip || '').trim()
    if (!ip) ip = getClientIp(req)
    if (!ip) return send(res, 400, { error: 'ip_required' })
    const keys = readJSON(files.licenseKeys)
    const idx = keys.findIndex(k => k.key === rawKey)
    if (idx < 0) return send(res, 404, { error: 'key_not_found' })
    const keyEntry = keys[idx] || {}
    if (keyEntry.status && keyEntry.status !== 'active') {
      return send(res, 400, { error: 'key_not_active', status: keyEntry.status })
    }
    const expiresAt = keyEntry.expires_at
    if (expiresAt) {
      const time = new Date(expiresAt).getTime()
      if (!Number.isFinite(time) || time < Date.now()) {
        keys[idx].status = 'expired'
        keys[idx].updated_at = nowISO()
        writeJSON(files.licenseKeys, keys)
        return send(res, 400, { error: 'key_expired' })
      }
    }
    const allowedIps = normalizeIps(keyEntry.allowed_ips)
    const maxIps = Number(keyEntry.max_ips || 1)
    if (!allowedIps.includes(ip)) {
      if (allowedIps.length >= Math.max(1, maxIps)) {
        return send(res, 400, { error: 'ip_limit_reached', allowed_ips: allowedIps })
      }
      allowedIps.push(ip)
      keys[idx].allowed_ips = allowedIps
    }
    keys[idx].updated_at = nowISO()
    writeJSON(files.licenseKeys, keys)
    const state = {
      key: keyEntry.key,
      key_id: keyEntry.id,
      label: keyEntry.label,
      ip,
      activated_at: nowISO(),
      expires_at: expiresAt
    }
    writeLicenseInstance(state)
    send(res, 200, { ok: true, license: state })
    return
  }
  const licenseBypass = new Set(['/api/login', '/api/register', '/api/admin/login'])
  if (!licenseBypass.has(pathname)) {
    const status = evaluateLicenseState()
    if (!status.valid) {
      send(res, 403, { error: 'license_invalid', reason: status.reason, license: status.license })
      return
    }
  }
  if (req.method === 'POST' && pathname === '/api/register') {
    const body = await parseBody(req)
    const users = readJSON(files.users)
    if (users.find(u => u.username === body.username)) return send(res, 400, { error: 'username_taken' })
    const token = uuid()
    const user = { id: uuid(), username: body.username || 'user', password: body.password || '', token, balance: 0, is_admin: false, status: 'pending', created_at: nowISO() }
    users.push(user)
    writeJSON(files.users, users)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: null, message: `Registrasi baru: ${user.username} menunggu persetujuan`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    await sendTelegram(`🆕 <b>Registrasi User</b>\n👤 <b>Username:</b> ${user.username}\n⏳ <b>Status:</b> PENDING\n🕒 ${new Date().toLocaleString('id-ID')}\n\n• Approve: <code>/approve ${user.username}</code>\n• Reject: <code>/reject ${user.username}</code>`) 
    send(res, 200, { registered: true, status: 'pending' })
    return
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await parseBody(req)
    const users = readJSON(files.users)
    const user = users.find(u => u.username === body.username && u.password === body.password)
    if (!user) return send(res, 401, { error: 'invalid_credentials' })
    if (user.status && user.status !== 'active') return send(res, 403, { error: 'pending_approval' })
    send(res, 200, { token: user.token, username: user.username, is_admin: !!user.is_admin, is_owner: !!isOwner(user) })
    return
  }
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await parseBody(req)
    const users = readJSON(files.users)
    const admin = users.find(u => u.username === body.username && u.is_admin)
    if (!admin || admin.password !== body.password) return send(res, 401, { error: 'invalid_credentials' })
    send(res, 200, { token: admin.token, username: admin.username, is_admin: true, is_owner: !!isOwner(admin) })
    return
  }
  if (pathname.startsWith('/api/admin') && req.method !== 'GET') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
  }
  if (req.method === 'GET' && pathname === '/api/admin/license-keys') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    const keys = readJSON(files.licenseKeys)
    const payload = keys.map(k => ({
      id: k.id,
      key: k.key,
      label: k.label,
      status: k.status || 'active',
      allowed_ips: normalizeIps(k.allowed_ips),
      max_ips: k.max_ips || 1,
      expires_at: k.expires_at,
      created_at: k.created_at,
      updated_at: k.updated_at
    }))
    send(res, 200, payload)
    return
  }
  if (req.method === 'POST' && pathname === '/api/admin/license-keys') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    if (!isOwner(user)) return send(res, 403, { error: 'owner_required' })
    const body = await parseBody(req)
    const keys = readJSON(files.licenseKeys)
    let keyValue = generateLicenseKey()
    while (keys.some(k => k.key === keyValue)) keyValue = generateLicenseKey()
    const durationDays = Number(body.duration_days || 30)
    let expiresAt = body.expires_at ? new Date(body.expires_at).toISOString() : ''
    if (!expiresAt) {
      const ms = Date.now() + Math.max(1, durationDays) * 86400000
      expiresAt = new Date(ms).toISOString()
    }
    const allowedIps = normalizeIps(body.allowed_ips)
    const entry = {
      id: uuid(),
      key: keyValue,
      label: body.label || 'Lisensi',
      status: 'active',
      allowed_ips: allowedIps,
      max_ips: Math.max(1, Number(body.max_ips || 1)),
      expires_at: expiresAt,
      created_at: nowISO(),
      updated_at: nowISO()
    }
    keys.push(entry)
    writeJSON(files.licenseKeys, keys)
    send(res, 200, entry)
    return
  }
  if (req.method === 'POST' && pathname.startsWith('/api/admin/license-keys/') && pathname.endsWith('/revoke')) {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    if (!isOwner(user)) return send(res, 403, { error: 'owner_required' })
    const id = pathname.split('/')[4]
    const keys = readJSON(files.licenseKeys)
    const idx = keys.findIndex(k => k.id === id)
    if (idx < 0) return send(res, 404, { error: 'license_not_found' })
    keys[idx].status = 'revoked'
    keys[idx].updated_at = nowISO()
    writeJSON(files.licenseKeys, keys)
    send(res, 200, keys[idx])
    return
  }
  if (req.method === 'POST' && pathname.startsWith('/api/admin/license-keys/') && pathname.endsWith('/activate')) {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    if (!isOwner(user)) return send(res, 403, { error: 'owner_required' })
    const id = pathname.split('/')[4]
    const keys = readJSON(files.licenseKeys)
    const idx = keys.findIndex(k => k.id === id)
    if (idx < 0) return send(res, 404, { error: 'license_not_found' })
    keys[idx].status = 'active'
    keys[idx].updated_at = nowISO()
    writeJSON(files.licenseKeys, keys)
    send(res, 200, keys[idx])
    return
  }
  if (req.method === 'POST' && pathname.startsWith('/api/admin/license-keys/') && pathname.endsWith('/allow-ip')) {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    if (!isOwner(user)) return send(res, 403, { error: 'owner_required' })
    const id = pathname.split('/')[4]
    const body = await parseBody(req)
    const ip = String(body.ip || '').trim()
    if (!ip) return send(res, 400, { error: 'ip_required' })
    const keys = readJSON(files.licenseKeys)
    const idx = keys.findIndex(k => k.id === id)
    if (idx < 0) return send(res, 404, { error: 'license_not_found' })
    const key = keys[idx]
    const allowedIps = normalizeIps(key.allowed_ips)
    if (!allowedIps.includes(ip)) {
      if (allowedIps.length >= Math.max(1, Number(key.max_ips || 1))) {
        return send(res, 400, { error: 'ip_limit_reached', allowed_ips: allowedIps })
      }
      allowedIps.push(ip)
      keys[idx].allowed_ips = allowedIps
      keys[idx].updated_at = nowISO()
      writeJSON(files.licenseKeys, keys)
    }
    send(res, 200, keys[idx])
    return
  }
  if (req.method === 'POST' && pathname.startsWith('/api/admin/license-keys/') && pathname.endsWith('/reset')) {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    if (!isOwner(user)) return send(res, 403, { error: 'owner_required' })
    const id = pathname.split('/')[4]
    const keys = readJSON(files.licenseKeys)
    const idx = keys.findIndex(k => k.id === id)
    if (idx < 0) return send(res, 404, { error: 'license_not_found' })
    keys[idx].allowed_ips = []
    keys[idx].updated_at = nowISO()
    writeJSON(files.licenseKeys, keys)
    send(res, 200, keys[idx])
    return
  }
  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    const status = urlObj.searchParams.get('status')
    const users = readJSON(files.users)
    const list = status ? users.filter(u => (u.status || 'active') === status) : users
    const safe = list.map(u => ({ id: u.id, username: u.username, is_admin: !!u.is_admin, status: u.status || 'active', balance: u.balance }))
    send(res, 200, safe)
    return
  }
  if (req.method === 'POST' && pathname.startsWith('/api/admin/users/') && pathname.endsWith('/approve')) {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    const id = pathname.split('/')[4]
    const users = readJSON(files.users)
    const idx = users.findIndex(u => u.id === id)
    if (idx < 0) return send(res, 404, { error: 'user_not_found' })
    users[idx].status = 'active'
    writeJSON(files.users, users)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: users[idx].id, message: `Akun disetujui: ${users[idx].username}`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    send(res, 200, { ok: true })
    return
  }
  if (req.method === 'POST' && pathname === '/api/admin/servers') {
    const body = await parseBody(req)
    const servers = readJSON(files.servers)
    const server = {
      id: uuid(),
      name: body.name,
      domain: body.domain,
      auth: body.auth,
      prices: body.prices || { ssh: 0, vmess: 0, vless: 0, trojan: 0 },
      types: body.types || { ssh: true, vmess: true, vless: true, trojan: true },
      defaults: body.defaults || { limitip: 1, quota: 0 },
      created_at: nowISO()
    }
    servers.push(server)
    writeJSON(files.servers, servers)
    send(res, 200, server)
    return
  }
  if (req.method === 'GET' && pathname === '/api/admin/servers') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    const servers = readJSON(files.servers)
    send(res, 200, servers)
    return
  }
  if (req.method === 'GET' && pathname === '/api/servers') {
    const servers = readJSON(files.servers)
    const sanitized = servers.map(s => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      prices: s.prices,
      types: s.types,
      defaults: s.defaults
    }))
    send(res, 200, sanitized)
    return
  }
  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/servers/')) {
    const id = pathname.split('/').pop()
    const servers = readJSON(files.servers)
    const next = servers.filter(s => s.id !== id)
    writeJSON(files.servers, next)
    send(res, 200, { ok: true })
    return
  }
  if (req.method === 'POST' && pathname === '/api/admin/settings') {
    const body = await parseBody(req)
    const settings = readJSON(files.settings)
    const merged = { ...(settings[0] || {}), ...body, updated_at: nowISO() }
    writeJSON(files.settings, [merged])
    send(res, 200, merged)
    return
  }
  if (req.method === 'GET' && pathname === '/api/admin/settings') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
    const settings = readJSON(files.settings)
    send(res, 200, settings[0] || {})
    return
  }
  if (req.method === 'POST' && pathname === '/api/deposit') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await parseBody(req)
    markExpiredTransactions()
    const s = getSettings()
    const apikey = s.apikey
    const amount = Number(body.amount || 0)
    if (!(amount > 0)) return send(res, 400, { error: 'invalid_amount' })
    const transactions = readJSON(files.transactions)
    const pending = transactions.find(t => t.user_id === user.id && t.type === 'deposit' && t.status === 'pending')
    if (pending && !isExpired(pending)) return send(res, 400, { error: 'pending_deposit_exists', transaction: pending })
    if (!apikey) return send(res, 400, { error: 'missing_apikey' })
    const urlStr = `https://my-payment.autsc.my.id/api/deposit?amount=${encodeURIComponent(amount)}&apikey=${encodeURIComponent(apikey)}`
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'deposit_api_error', details: resp.text })
    const data = resp.json && resp.json.data ? resp.json.data : {}
    const bonusPercent = Number(s.topup_bonus_percent || 0)
    const bonusAmount = Math.floor(Number(data.amount || amount) * bonusPercent / 100)
    const tx = {
      id: uuid(),
      user_id: user.id,
      type: 'deposit',
      amount: Number(data.amount || amount),
      fee: Number(data.fee || 0),
      total: Number(data.total_amount || 0),
      status: 'pending',
      external_transaction_id: data.transaction_id,
      qris_url: data.qris_url,
      bonus_percent: bonusPercent,
      bonus_amount: bonusAmount,
      expires_at: data.expired_at,
      expired_minutes: data.expired_minutes,
      created_at: nowISO()
    }
    transactions.push(tx)
    writeJSON(files.transactions, transactions)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: null, message: `Deposit dibuat oleh ${user.username} sebesar ${tx.amount}`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    await sendTelegram(`💳 <b>Top Up Pending</b>\n👤 <b>User:</b> ${user.username}\n💰 <b>Jumlah:</b> Rp ${Number(tx.amount||0).toLocaleString('id-ID')}\n💸 <b>Biaya:</b> Rp ${Number(tx.fee||0).toLocaleString('id-ID')}\n🧾 <b>Total:</b> Rp ${Number(tx.total||0).toLocaleString('id-ID')}\n🎁 <b>Bonus:</b> Rp ${Number(tx.bonus_amount||0).toLocaleString('id-ID')} (${Number(tx.bonus_percent||0)}%)\n🆔 <b>ID:</b> <code>${tx.external_transaction_id}</code>\n🔗 <a href="${String(tx.qris_url||'').replace(/`/g,'').trim()}">QRIS</a>`)
    send(res, 200, { transaction: tx, deposit: { ...data, bonus_amount: bonusAmount, bonus_percent: bonusPercent } })
    return
  }
  if (req.method === 'GET' && pathname === '/api/deposit/status') {
    const user = requireUser(req, res)
    if (!user) return
    const transaction_id = urlObj.searchParams.get('transaction_id')
    markExpiredTransactions()
    const s = getSettings()
    const apikey = s.apikey
    if (!apikey) return send(res, 400, { error: 'missing_apikey' })
    const urlStr = `https://my-payment.autsc.my.id/api/status/payment?transaction_id=${encodeURIComponent(transaction_id)}&apikey=${encodeURIComponent(apikey)}`
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'status_api_error', details: resp.text })
    const paid = resp.json && resp.json.paid === true
    let txs = readJSON(files.transactions)
    const tx = txs.find(t => t.external_transaction_id === transaction_id && t.user_id === user.id)
    if (!tx) return send(res, 404, { error: 'transaction_not_found' })
    if (tx.status === 'pending' && isExpired(tx)) {
      tx.status = 'expired'
      tx.updated_at = nowISO()
      tx.expired_at = tx.expired_at || nowISO()
      writeJSON(files.transactions, txs)
      return send(res, 200, { paid: false, status: 'expired', transaction: tx })
    }
    if (paid && tx.status !== 'success') {
      tx.status = 'success'
      tx.paid_at = nowISO()
      tx.updated_at = nowISO()
      const users = readJSON(files.users)
      const idx = users.findIndex(u => u.id === user.id)
      if (idx >= 0) {
        const bonus = Number(tx.bonus_amount || 0)
        const credit = Number(tx.amount || 0) + bonus
        users[idx].balance = Number(users[idx].balance || 0) + credit
        writeJSON(files.users, users)
      }
      writeJSON(files.transactions, txs)
      const notifs = readJSON(files.notifications)
      notifs.push({ id: uuid(), user_id: null, message: `Deposit dibayar oleh ${user.username} sebesar ${tx.amount} (bonus ${Number(tx.bonus_amount||0)})`, created_at: nowISO() })
      writeJSON(files.notifications, notifs)
      await sendTelegram(`✅ <b>Top Up Berhasil</b>\n👤 <b>User:</b> ${user.username}\n💰 <b>Jumlah:</b> Rp ${Number(tx.amount||0).toLocaleString('id-ID')}\n🎁 <b>Bonus:</b> Rp ${Number(tx.bonus_amount||0).toLocaleString('id-ID')}\n🆔 <b>ID:</b> <code>${tx.external_transaction_id}</code>`)
    } else {
      tx.updated_at = nowISO()
      writeJSON(files.transactions, txs)
    }
    send(res, 200, { paid, status: tx.status, external_status: resp.json && resp.json.status, transaction: tx })
    return
  }
  if (req.method === 'GET' && pathname === '/api/deposit/active') {
    const user = requireUser(req, res)
    if (!user) return
    markExpiredTransactions()
    const txs = readJSON(files.transactions)
    const deposits = txs.filter(t => t.user_id === user.id && t.type === 'deposit').sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    if (!deposits.length) return send(res, 404, { error: 'not_found' })
    send(res, 200, { transaction: deposits[0] })
    return
  }
  if (req.method === 'POST' && pathname === '/api/deposit/cancel') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await parseBody(req)
    markExpiredTransactions()
    const txs = readJSON(files.transactions)
    const tx = txs.find(t => t.external_transaction_id === body.transaction_id && t.user_id === user.id && t.type === 'deposit')
    if (!tx) return send(res, 404, { error: 'transaction_not_found' })
    if (tx.status !== 'pending') return send(res, 400, { error: 'cannot_cancel', status: tx.status })
    tx.status = 'canceled'
    tx.canceled_at = nowISO()
    tx.updated_at = nowISO()
    writeJSON(files.transactions, txs)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: null, message: `Deposit dibatalkan oleh ${user.username}`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    await sendTelegram(`🚫 <b>Deposit Dibatalkan</b>\n👤 <b>User:</b> ${user.username}\n🆔 <b>ID:</b> <code>${tx.external_transaction_id}</code>`)
    send(res, 200, { ok: true, transaction: tx })
    return
  }
  if (req.method === 'GET' && pathname === '/api/me') {
    const user = requireUser(req, res)
    if (!user) return
    send(res, 200, {
      id: user.id,
      username: user.username,
      balance: user.balance,
      is_admin: !!user.is_admin,
      is_owner: !!isOwner(user),
      role: user.role || (user.is_admin ? 'admin' : 'user')
    })
    return
  }
  if (req.method === 'GET' && pathname === '/api/notifications') {
    const user = requireUser(req, res)
    if (!user) return
    const notifs = readJSON(files.notifications)
    const list = notifs.filter(n => !n.user_id || n.user_id === user.id)
    send(res, 200, list)
    return
  }
  if (req.method === 'POST' && pathname === '/api/change-password') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await parseBody(req)
    const current = String(body.current_password || '')
    const next = String(body.new_password || '')
    if (!next || next.length < 4) return send(res, 400, { error: 'invalid_new_password' })
    const users = readJSON(files.users)
    const idx = users.findIndex(u => u.id === user.id)
    if (idx < 0) return send(res, 404, { error: 'user_not_found' })
    if (String(users[idx].password || '') !== current) return send(res, 400, { error: 'invalid_current_password' })
    users[idx].password = next
    writeJSON(files.users, users)
    send(res, 200, { ok: true })
    return
  }
  if (req.method === 'POST' && pathname === '/api/admin/notify') {
    const body = await parseBody(req)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: body.user_id || null, message: body.message || '', created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    send(res, 200, { ok: true })
    return
  }
  if (req.method === 'POST' && pathname === '/api/purchase') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await parseBody(req)
    const servers = readJSON(files.servers)
    const server = servers.find(s => s.id === body.server_id)
    if (!server) return send(res, 404, { error: 'server_not_found' })
    if (server.types && server.types[body.type] === false) return send(res, 400, { error: 'type_not_available' })
    const prices = server.prices || {}
    const basePrice = Number(prices[body.type] || 0)
    const expDays = Math.max(1, Number(body.exp || 30))
    const multiplier = Math.max(1, Math.ceil(expDays / 30))
    const price = basePrice * multiplier
    if (Number(user.balance || 0) < Number(price || 0)) return send(res, 400, { error: 'insufficient_balance', required: price })
    let urlStr = ''
    if (body.type === 'ssh') {
      urlStr = `https://${server.domain}/api/create-ssh?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&password=${encodeURIComponent(body.password)}&exp=${encodeURIComponent(body.exp)}&limitip=${encodeURIComponent(body.limitip)}`
    } else if (body.type === 'vmess') {
      urlStr = `https://${server.domain}/api/create-vmess?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&quota=${encodeURIComponent(body.quota || server.defaults.quota || 0)}&limitip=${encodeURIComponent(body.limitip)}&exp=${encodeURIComponent(body.exp)}`
    } else if (body.type === 'vless') {
      urlStr = `https://${server.domain}/api/create-vless?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&quota=${encodeURIComponent(body.quota || server.defaults.quota || 0)}&limitip=${encodeURIComponent(body.limitip)}&exp=${encodeURIComponent(body.exp)}`
    } else if (body.type === 'trojan') {
      urlStr = `https://${server.domain}/api/create-trojan?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&quota=${encodeURIComponent(body.quota || server.defaults.quota || 0)}&limitip=${encodeURIComponent(body.limitip)}&exp=${encodeURIComponent(body.exp)}`
    } else {
      return send(res, 400, { error: 'unknown_type' })
    }
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'create_api_error', details: resp.text })
    const j = resp.json || {}
    if (j.status && j.status === 'failed') return send(res, 400, { error: 'external_failed', details: j.message })
    const users = readJSON(files.users)
    const idx = users.findIndex(u => u.id === user.id)
    users[idx].balance = Number(users[idx].balance || 0) - Number(price || 0)
    writeJSON(files.users, users)
    const accounts = readJSON(files.accounts)
    accounts.push({ id: uuid(), user_id: user.id, server_id: server.id, type: body.type, details: j.data || j, price, duration_days: expDays, created_at: nowISO() })
    writeJSON(files.accounts, accounts)
    const transactions = readJSON(files.transactions)
    transactions.push({ id: uuid(), user_id: user.id, type: 'purchase', amount: price, status: 'success', created_at: nowISO() })
    writeJSON(files.transactions, transactions)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: null, message: `Pembelian ${body.type} oleh ${user.username} sebesar ${price}`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    await sendTelegram(`🛒 <b>Pembelian Akun</b>\n👤 <b>User:</b> ${user.username}\n📦 <b>Tipe:</b> ${body.type}\n💵 <b>Harga:</b> Rp ${Number(price||0).toLocaleString('id-ID')}`) 
    send(res, 200, { ok: true, account: accounts[accounts.length - 1] })
    return
  }
  if (req.method === 'POST' && pathname === '/api/trial') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await parseBody(req)
    const servers = readJSON(files.servers)
    const server = servers.find(s => s.id === body.server_id)
    if (!server) return send(res, 404, { error: 'server_not_found' })
    if (server.types && server.types[body.type] === false) return send(res, 400, { error: 'type_not_available' })
    let urlStr = ''
    if (body.type === 'ssh') {
      urlStr = `https://${server.domain}/api/trial-ssh?auth=${encodeURIComponent(server.auth)}`
    } else if (body.type === 'vmess') {
      urlStr = `https://${server.domain}/api/trial-vmess?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&quota=${encodeURIComponent(body.quota || server.defaults.quota || 0)}&limitip=${encodeURIComponent(body.limitip)}&exp=${encodeURIComponent(body.exp)}`
    } else if (body.type === 'vless') {
      urlStr = `https://${server.domain}/api/trial-vless?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&quota=${encodeURIComponent(body.quota || server.defaults.quota || 0)}&limitip=${encodeURIComponent(body.limitip)}&exp=${encodeURIComponent(body.exp)}`
    } else if (body.type === 'trojan') {
      urlStr = `https://${server.domain}/api/trial-trojan?auth=${encodeURIComponent(server.auth)}&user=${encodeURIComponent(body.user)}&quota=${encodeURIComponent(body.quota || server.defaults.quota || 0)}&limitip=${encodeURIComponent(body.limitip)}&exp=${encodeURIComponent(body.exp)}`
    } else {
      return send(res, 400, { error: 'unknown_type' })
    }
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'trial_api_error', details: resp.text })
    const j = resp.json || {}
    if (j.status && j.status === 'failed') return send(res, 400, { error: 'external_failed', details: j.message })
    const accounts = readJSON(files.accounts)
    accounts.push({ id: uuid(), user_id: user.id, server_id: server.id, type: body.type, details: j.data || j, price: 0, trial: true, created_at: nowISO() })
    writeJSON(files.accounts, accounts)
    send(res, 200, { ok: true, account: accounts[accounts.length - 1] })
    return
  }
  if (req.method === 'POST' && pathname === '/api/renew') {
    const user = requireUser(req, res)
    if (!user) return
    const body = await parseBody(req)
    const servers = readJSON(files.servers)
    const server = servers.find(s => s.id === body.server_id)
    if (!server) return send(res, 404, { error: 'server_not_found' })
    const prices = server.prices || {}
    if (server.types && server.types[body.type] === false) return send(res, 400, { error: 'type_not_available' })
    const basePrice = Number(prices[body.type] || 0)
    const expDays = Math.max(1, Number(body.exp || 30))
    const multiplier = Math.max(1, Math.ceil(expDays / 30))
    const price = basePrice * multiplier
    if (Number(user.balance || 0) < Number(price || 0)) return send(res, 400, { error: 'insufficient_balance', required: price })
    let pathName = ''
    if (body.type === 'vmess') pathName = 'renws'
    else if (body.type === 'ssh') pathName = 'rensh'
    else if (body.type === 'trojan') pathName = 'rentr'
    else if (body.type === 'vless') pathName = 'renvl'
    else return send(res, 400, { error: 'unknown_type' })
    const urlStr = `https://${server.domain}/api/${pathName}?auth=${encodeURIComponent(server.auth)}&num=${encodeURIComponent(body.num)}&exp=${encodeURIComponent(body.exp)}`
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'renew_api_error', details: resp.text })
    const j = resp.json || {}
    if (j.status && j.status === 'failed') return send(res, 400, { error: 'external_failed', details: j.message })
    const users = readJSON(files.users)
    const idx = users.findIndex(u => u.id === user.id)
    users[idx].balance = Number(users[idx].balance || 0) - Number(price || 0)
    writeJSON(files.users, users)
    const transactions = readJSON(files.transactions)
    transactions.push({ id: uuid(), user_id: user.id, type: 'renew', amount: price, status: 'success', created_at: nowISO(), duration_days: expDays })
    writeJSON(files.transactions, transactions)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: null, message: `Perpanjangan ${body.type} oleh ${user.username} sebesar ${price}`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    await sendTelegram(`🔁 <b>Perpanjangan Akun</b>\n👤 <b>User:</b> ${user.username}\n📦 <b>Tipe:</b> ${body.type}\n💵 <b>Harga:</b> Rp ${Number(price||0).toLocaleString('id-ID')}`) 
    send(res, 200, { ok: true })
    return
  }
  if (req.method === 'POST' && pathname === '/api/telegram/webhook') {
    const body = await parseBody(req)
    const update = body || {}
    const msg = update.message || update.edited_message || {}
    const text = String(msg.text || '').trim()
    const chatId = msg.chat && msg.chat.id
    const fromId = msg.from && msg.from.id
    const settings = readJSON(files.settings)
    const s = settings[0] || {}
    const allowedChat = s.telegram_chat_id
    const allowedAdmins = Array.isArray(s.telegram_admin_ids) ? s.telegram_admin_ids : []
    if (allowedChat && String(chatId) !== String(allowedChat) && !allowedAdmins.includes(String(fromId))) {
      return send(res, 403, { error: 'forbidden' })
    }
    const lower = text.toLowerCase()
    let m
    if ((m = lower.match(/^\/?(approve|setujui)\s+(\S+)/))) {
      const username = m[2]
      const users = readJSON(files.users)
      const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase())
      if (idx < 0) { await sendTelegram(`User ${username} tidak ditemukan`, chatId); return send(res, 200, { ok: false }) }
      users[idx].status = 'active'
      writeJSON(files.users, users)
      await sendTelegram(`Akun disetujui: <b>${users[idx].username}</b>`, chatId)
      return send(res, 200, { ok: true })
    }
    if ((m = lower.match(/^\/?(reject|tolak)\s+(\S+)/))) {
      const username = m[2]
      const users = readJSON(files.users)
      const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase())
      if (idx < 0) { await sendTelegram(`User ${username} tidak ditemukan`, chatId); return send(res, 200, { ok: false }) }
      users[idx].status = 'rejected'
      writeJSON(files.users, users)
      await sendTelegram(`Akun ditolak: <b>${users[idx].username}</b>`, chatId)
      return send(res, 200, { ok: true })
    }
    await sendTelegram('Perintah tidak dikenali. Gunakan /approve <username> atau /reject <username>', chatId)
    return send(res, 200, { ok: true })
  }
  if (req.method === 'GET' && pathname === '/api/accounts') {
    const user = requireUser(req, res)
    if (!user) return
    const accounts = readJSON(files.accounts)
    const list = accounts.filter(a => a.user_id === user.id)
    send(res, 200, list)
    return
  }
  send(res, 404, { error: 'not_found' })
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res)
  } else {
    serveStatic(req, res)
  }
})

const PORT = Number(process.env.PORT || 3000)
server.listen(PORT)