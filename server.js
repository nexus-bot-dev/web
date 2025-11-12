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
  settings: path.join(dataDir, 'settings.json')
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
  const settings = readJSON(files.settings)
  const s = settings[0] || {}
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

function serveStatic(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  let filePath = path.join(publicDir, urlObj.pathname)
  if (urlObj.pathname === '/') filePath = path.join(publicDir, 'index.html')
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

async function handleApi(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  const pathname = urlObj.pathname
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
    send(res, 200, { token: user.token, username: user.username, is_admin: !!user.is_admin })
    return
  }
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await parseBody(req)
    let users = readJSON(files.users)
    let admin = users.find(u => u.username === body.username)
    if (!admin) {
      admin = { id: uuid(), username: body.username, password: body.password || '', token: uuid(), balance: 0, is_admin: true, created_at: nowISO() }
      users.push(admin)
      writeJSON(files.users, users)
    }
    if (admin.password !== body.password) return send(res, 401, { error: 'invalid_credentials' })
    send(res, 200, { token: admin.token, username: admin.username, is_admin: true })
    return
  }
  if (pathname.startsWith('/api/admin') && req.method !== 'GET') {
    const user = requireUser(req, res)
    if (!user) return
    if (!isAdmin(user)) return send(res, 403, { error: 'forbidden' })
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
    const servers = readJSON(files.servers)
    send(res, 200, servers)
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
    const settings = readJSON(files.settings)
    const apikey = (settings[0] || {}).apikey
    if (!apikey) return send(res, 400, { error: 'missing_apikey' })
    const urlStr = `https://my-payment.autsc.my.id/api/deposit?amount=${encodeURIComponent(body.amount)}&apikey=${encodeURIComponent(apikey)}`
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'deposit_api_error', details: resp.text })
    const data = resp.json && resp.json.data ? resp.json.data : {}
    const transactions = readJSON(files.transactions)
    const tx = {
      id: uuid(),
      user_id: user.id,
      type: 'deposit',
      amount: data.amount || body.amount,
      fee: data. fee || 0,
      total: data.total_amount || 0,
      status: 'pending',
      external_transaction_id: data.transaction_id,
      qris_url: data.qris_url,
      created_at: nowISO()
    }
    transactions.push(tx)
    writeJSON(files.transactions, transactions)
    const notifs = readJSON(files.notifications)
    notifs.push({ id: uuid(), user_id: null, message: `Deposit dibuat oleh ${user.username} sebesar ${tx.amount}`, created_at: nowISO() })
    writeJSON(files.notifications, notifs)
    await sendTelegram(`💳 <b>Top Up Pending</b>\n👤 <b>User:</b> ${user.username}\n💰 <b>Jumlah:</b> Rp ${Number(tx.amount||0).toLocaleString('id-ID')}\n💸 <b>Biaya:</b> Rp ${Number(tx.fee||0).toLocaleString('id-ID')}\n🧾 <b>Total:</b> Rp ${Number(tx.total||0).toLocaleString('id-ID')}\n🆔 <b>ID:</b> <code>${tx.external_transaction_id}</code>\n🔗 <a href="${String(tx.qris_url||'').replace(/`/g,'').trim()}">QRIS</a>`) 
    send(res, 200, { transaction: tx, deposit: data })
    return
  }
  if (req.method === 'GET' && pathname === '/api/deposit/status') {
    const user = requireUser(req, res)
    if (!user) return
    const transaction_id = urlObj.searchParams.get('transaction_id')
    const settings = readJSON(files.settings)
    const apikey = (settings[0] || {}).apikey
    if (!apikey) return send(res, 400, { error: 'missing_apikey' })
    const urlStr = `https://my-payment.autsc.my.id/api/status/payment?transaction_id=${encodeURIComponent(transaction_id)}&apikey=${encodeURIComponent(apikey)}`
    const resp = await httpsGet(urlStr)
    if (resp.statusCode !== 200) return send(res, 400, { error: 'status_api_error', details: resp.text })
    const paid = resp.json && resp.json.paid === true
    let txs = readJSON(files.transactions)
    const tx = txs.find(t => t.external_transaction_id === transaction_id && t.user_id === user.id)
    if (!tx) return send(res, 404, { error: 'transaction_not_found' })
    if (paid && tx.status !== 'paid') {
      tx.status = 'paid'
      const users = readJSON(files.users)
      const idx = users.findIndex(u => u.id === user.id)
      if (idx >= 0) {
        users[idx].balance = Number(users[idx].balance || 0) + Number(tx.amount || 0)
        writeJSON(files.users, users)
      }
      writeJSON(files.transactions, txs)
      const notifs = readJSON(files.notifications)
      notifs.push({ id: uuid(), user_id: null, message: `Deposit dibayar oleh ${user.username} sebesar ${tx.amount}`, created_at: nowISO() })
      writeJSON(files.notifications, notifs)
      await sendTelegram(`✅ <b>Top Up Berhasil</b>\n👤 <b>User:</b> ${user.username}\n💰 <b>Jumlah:</b> Rp ${Number(tx.amount||0).toLocaleString('id-ID')}\n🆔 <b>ID:</b> <code>${tx.external_transaction_id}</code>`) 
    }
    send(res, 200, { paid, status: resp.json && resp.json.status })
    return
  }
  if (req.method === 'GET' && pathname === '/api/me') {
    const user = requireUser(req, res)
    if (!user) return
    send(res, 200, { id: user.id, username: user.username, balance: user.balance, is_admin: !!user.is_admin })
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
    const prices = server.prices || {}
    const price = prices[body.type]
    if (Number(user.balance || 0) < Number(price || 0)) return send(res, 400, { error: 'insufficient_balance' })
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
    accounts.push({ id: uuid(), user_id: user.id, server_id: server.id, type: body.type, details: j.data || j, price, created_at: nowISO() })
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
    const price = prices[body.type]
    if (Number(user.balance || 0) < Number(price || 0)) return send(res, 400, { error: 'insufficient_balance' })
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
    transactions.push({ id: uuid(), user_id: user.id, type: 'renew', amount: price, status: 'success', created_at: nowISO() })
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

server.listen(3000)