let token = localStorage.getItem('token') || ''
let isAdmin = localStorage.getItem('is_admin') === 'true'
const authEl = document.getElementById('auth')
const dashEl = document.getElementById('dashboard')
const adminPanel = document.getElementById('adminPanel')
let serversCache = []

function parseError(error) {
  try {
    const data = JSON.parse(error.message)
    if (data && data.error) {
      const map = {
        pending_deposit_exists: 'Masih ada QRIS yang masih aktif. Selesaikan atau batalkan terlebih dahulu.',
        invalid_amount: 'Masukkan nominal deposit yang valid.',
        missing_apikey: 'API Key deposit belum diatur oleh admin.',
        cannot_cancel: 'Deposit tidak dapat dibatalkan.',
        insufficient_balance: 'Saldo tidak mencukupi.',
        type_not_available: 'Layanan tidak tersedia di server yang dipilih.'
      }
      return map[data.error] || data.error
    }
  } catch {}
  return error.message || 'Terjadi kesalahan'
}

function show(el) { el.classList.remove('hidden') }
function hide(el) { el.classList.add('hidden') }

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'x-user-token': token } })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function refreshMe() {
  const me = await api('/api/me')
  document.getElementById('userName').textContent = me.username
  document.getElementById('saldo').textContent = `Rp ${Number(me.balance || 0).toLocaleString('id-ID')}`
}

async function refreshServers() {
  const servers = await fetch('/api/admin/servers').then(r => r.json())
  serversCache = Array.isArray(servers) ? servers : []
  const sel1 = document.getElementById('serverSelect')
  const sel2 = document.getElementById('renewServer')
  sel1.innerHTML = ''
  sel2.innerHTML = ''
  servers.forEach(s => {
    const o1 = document.createElement('option'); o1.value = s.id; o1.textContent = `${s.name} (${s.domain})`; sel1.appendChild(o1)
    const o2 = document.createElement('option'); o2.value = s.id; o2.textContent = `${s.name} (${s.domain})`; sel2.appendChild(o2)
  })
  const list = document.getElementById('servers')
  list.innerHTML = ''
  servers.forEach(s => {
    const div = document.createElement('div')
    div.className = 'detail'
    const types = s.types || { ssh: true, vmess: true, vless: true, trojan: true }
    const enabledTypes = Object.entries(types).filter(([, v]) => v !== false).map(([k]) => k.toUpperCase())
    div.innerHTML = `
      <div class="kv">
        <div>Nama</div><div>${s.name}</div>
        <div>Domain</div><div class="monos">${s.domain}</div>
        <div>Auth</div><div class="monos">${s.auth}</div>
        <div>Harga SSH</div><div>Rp ${Number(s.prices?.ssh||0).toLocaleString('id-ID')}</div>
        <div>Harga VMess</div><div>Rp ${Number(s.prices?.vmess||0).toLocaleString('id-ID')}</div>
        <div>Harga VLess</div><div>Rp ${Number(s.prices?.vless||0).toLocaleString('id-ID')}</div>
        <div>Harga Trojan</div><div>Rp ${Number(s.prices?.trojan||0).toLocaleString('id-ID')}</div>
        <div>Default Limit IP</div><div>${s.defaults?.limitip}</div>
        <div>Default Kuota</div><div>${s.defaults?.quota} GB</div>
        <div>Layanan</div><div>${enabledTypes.length ? enabledTypes.join(', ') : 'Tidak ada'}</div>
      </div>
    `
    list.appendChild(div)
  })
  updateTypeOptions()
  updateRenewTypeOptions()
}

async function refreshAccounts() {
  const accounts = await api('/api/accounts')
  const wrap = document.getElementById('accounts')
  wrap.innerHTML = ''
  accounts.forEach(a => {
    const d = a.details || {}
    const card = document.createElement('div')
    card.className = 'detail'
    function labelize(k) { return String(k).replace(/_/g,' ').replace(/\b\w/g, s => s.toUpperCase()) }
    function renderKV(obj) {
      let html = '<div class="kv">'
      Object.entries(obj || {}).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          Object.entries(v).forEach(([sk, sv]) => {
            html += `<div>${labelize(k)}.${labelize(sk)}</div><div class="monos">${String(sv || '')}</div>`
          })
        } else if (Array.isArray(v)) {
          html += `<div>${labelize(k)}</div><div class="monos">${v.map(x => String(x)).join(', ')}</div>`
        } else {
          html += `<div>${labelize(k)}</div><div class="monos">${String(v || '')}</div>`
        }
      })
      html += '</div>'
      return html
    }
    const durationRow = a.duration_days ? `<div>Durasi</div><div>${a.duration_days} hari</div>` : ''
    if (a.type === 'vmess') {
      card.innerHTML = `
        <div class="kv">
          <div>User</div><div>${d.user || ''}</div>
          <div>UUID</div><div class="monos">${d.uuid || ''}</div>
          <div>Kadaluarsa</div><div>${d.expired || ''}</div>
          <div>Domain</div><div class="monos">${d.domain || ''}</div>
          <div>WS TLS</div><div class="monos">${d.ws_tls || ''}</div>
          <div>WS Non TLS</div><div class="monos">${d.ws_none_tls || ''}</div>
          <div>gRPC</div><div class="monos">${d.grpc || ''}</div>
          <div>OpenClash</div><div><a href="${(d.openclash||'').replace(/`/g,'').trim()}" target="_blank">Unduh</a></div>
          <div>Dashboard</div><div><a href="${(d.dashboard_url||'').replace(/`/g,'').trim()}" target="_blank">Lihat</a></div>
          ${durationRow}
          <div>Harga</div><div>Rp ${Number(a.price||0).toLocaleString('id-ID')}</div>
        </div>
      `
    } else if (a.type === 'vless') {
      card.innerHTML = `
        <div class="kv">
          <div>User</div><div>${d.user || ''}</div>
          <div>UUID</div><div class="monos">${d.uuid || ''}</div>
          <div>Kadaluarsa</div><div>${d.expired || ''}</div>
          <div>Domain</div><div class="monos">${d.domain || ''}</div>
          <div>WS TLS</div><div class="monos">${d.ws_tls || ''}</div>
          <div>WS Non TLS</div><div class="monos">${d.ws_none_tls || ''}</div>
          <div>gRPC</div><div class="monos">${d.grpc || ''}</div>
          <div>OpenClash</div><div><a href="${(d.openclash||'').replace(/`/g,'').trim()}" target="_blank">Unduh</a></div>
          <div>Dashboard</div><div><a href="${(d.dashboard_url||'').replace(/`/g,'').trim()}" target="_blank">Lihat</a></div>
          ${durationRow}
          <div>Harga</div><div>Rp ${Number(a.price||0).toLocaleString('id-ID')}</div>
        </div>
      `
      const link = d.vless || d.link || ''
      if (link) {
        const div = document.createElement('div')
        div.className = 'kv'
        div.innerHTML = `<div>VLess Link</div><div class="monos">${link}</div>`
        card.appendChild(div)
      }
    } else if (a.type === 'trojan') {
      card.innerHTML = `
        <div class="kv">
          <div>User</div><div>${d.user || ''}</div>
          <div>UUID</div><div class="monos">${d.uuid || ''}</div>
          <div>Kadaluarsa</div><div>${d.expired || ''}</div>
          <div>Domain</div><div class="monos">${d.domain || ''}</div>
          <div>WS TLS</div><div class="monos">${d.ws_tls || ''}</div>
          <div>WS Non TLS</div><div class="monos">${d.ws_none_tls || ''}</div>
          <div>gRPC</div><div class="monos">${d.grpc || ''}</div>
          <div>OpenClash</div><div><a href="${(d.openclash||'').replace(/`/g,'').trim()}" target="_blank">Unduh</a></div>
          <div>Dashboard</div><div><a href="${(d.dashboard_url||'').replace(/`/g,'').trim()}" target="_blank">Lihat</a></div>
          ${durationRow}
          <div>Harga</div><div>Rp ${Number(a.price||0).toLocaleString('id-ID')}</div>
        </div>
      `
      const link = d.trojan || d.link || ''
      if (link) {
        const div = document.createElement('div')
        div.className = 'kv'
        div.innerHTML = `<div>Trojan Link</div><div class="monos">${link}</div>`
        card.appendChild(div)
      }
    } else if (a.type === 'ssh') {
      const ports = d.ports || {}
      const formats = d.formats || {}
      const payloads = d.payloads || {}
      card.innerHTML = `
        <div class="kv">
          <div>Username</div><div>${d.username || ''}</div>
          <div>Password</div><div class="monos">${d.password || ''}</div>
          <div>Host</div><div class="monos">${d.host || ''}</div>
          <div>IP</div><div>${d.ip || ''}</div>
          <div>OpenSSH</div><div>${ports.openSSH || ''}</div>
          <div>Dropbear</div><div>${ports.dropbear || ''}</div>
          <div>DropbearWS</div><div>${ports.dropbearWS || ''}</div>
          <div>SSH UDP</div><div>${ports.sshUDP || ''}</div>
          <div>OVPN WS SSL</div><div>${ports.ovpnWSSSL || ''}</div>
          <div>OVPN SSL</div><div>${ports.ovpnSSL || ''}</div>
          <div>OVPN TCP</div><div>${ports.ovpnTCP || ''}</div>
          <div>OVPN UDP</div><div>${ports.ovpnUDP || ''}</div>
          <div>BadVPN</div><div>${ports.badVPN || ''}</div>
          <div>SSH WS</div><div>${ports.sshWS || ''}</div>
          <div>SSH WS SSL</div><div>${ports.sshWSSSL || ''}</div>
          <div>Format 80</div><div class="monos">${formats.port80 || ''}</div>
          <div>Format 443</div><div class="monos">${formats.port443 || ''}</div>
          <div>UDP</div><div class="monos">${formats.udp || ''}</div>
          <div>OVPN</div><div><a target="_blank" href="${(d.ovpnDownload||'').replace(/`/g,'').trim()}">Unduh</a></div>
          <div>Simpan Link</div><div><a target="_blank" href="${(d.saveLink||'').replace(/`/g,'').trim()}">Unduh</a></div>
          <div>Payload WS Non TLS</div><div class="monos">${payloads.wsNtls || ''}</div>
          <div>Payload WS TLS</div><div class="monos">${payloads.wsTls || ''}</div>
          <div>Payload Enhanced</div><div class="monos">${payloads.enhanced || ''}</div>
          <div>Dibuat</div><div>${d.created || ''}</div>
          <div>Kadaluarsa</div><div>${d.expired || ''}</div>
          <div>ISP</div><div>${d.isp || ''}</div>
          <div>Kota</div><div>${d.city || ''}</div>
          <div>Limit IP</div><div>${d.limitIP || ''}</div>
          ${durationRow}
          <div>Harga</div><div>Rp ${Number(a.price||0).toLocaleString('id-ID')}</div>
        </div>
      `
    } else {
      card.innerHTML = renderKV(d) + `<div class="kv">${durationRow || ''}<div>Harga</div><div>Rp ${Number(a.price||0).toLocaleString('id-ID')}</div></div>`
    }
    wrap.appendChild(card)
  })
}

async function refreshNotifications() {
  const notifs = await api('/api/notifications')
  const wrap = document.getElementById('notifications')
  wrap.innerHTML = ''
  notifs.forEach(n => {
    const div = document.createElement('div')
    div.className = 'pill'
    div.textContent = `${new Date(n.created_at).toLocaleString('id-ID')} — ${n.message}`
    wrap.appendChild(div)
  })
  const adminWrap = document.getElementById('adminNotifs')
  if (adminWrap) {
    adminWrap.innerHTML = ''
    notifs.forEach(n => {
      const div = document.createElement('div')
      div.className = 'pill'
      div.textContent = `${new Date(n.created_at).toLocaleString('id-ID')} — ${n.message}`
      adminWrap.appendChild(div)
    })
  }
}

function updateTypeOptions() {
  const serverId = document.getElementById('serverSelect').value
  const server = serversCache.find(s => s.id === serverId)
  const typeSelect = document.getElementById('typeSelect')
  if (!typeSelect) return
  const options = Array.from(typeSelect.options)
  let fallback = null
  options.forEach(opt => {
    const allowed = !server || !server.types || server.types[opt.value] !== false
    opt.disabled = !allowed
    if (allowed && !fallback) fallback = opt
  })
  if (typeSelect.selectedOptions[0]?.disabled && fallback) {
    typeSelect.value = fallback.value
  }
  if (server && server.defaults) {
    if (document.getElementById('accLimitIP')) document.getElementById('accLimitIP').value = server.defaults.limitip ?? 1
    if (document.getElementById('accQuota')) document.getElementById('accQuota').value = server.defaults.quota ?? 0
  }
}

function updateRenewTypeOptions() {
  const serverId = document.getElementById('renewServer').value
  const server = serversCache.find(s => s.id === serverId)
  const renewType = document.getElementById('renewType')
  if (!renewType) return
  const options = Array.from(renewType.options)
  let fallback = null
  options.forEach(opt => {
    const allowed = !server || !server.types || server.types[opt.value] !== false
    opt.disabled = !allowed
    if (allowed && !fallback) fallback = opt
  })
  if (renewType.selectedOptions[0]?.disabled && fallback) {
    renewType.value = fallback.value
  }
}

function renderDeposit(tx) {
  const wrap = document.getElementById('depositResult')
  wrap.innerHTML = ''
  if (!tx) return
  const statusMap = {
    pending: 'Menunggu Pembayaran',
    success: 'Sukses',
    expired: 'Kadaluarsa',
    canceled: 'Dibatalkan'
  }
  const status = tx.status || 'pending'
  const statusLabel = statusMap[status] || status
  const bonusAmount = Number(tx.bonus_amount || 0)
  const bonusPercent = Number(tx.bonus_percent || 0)
  const totalAmount = Number((tx.total ?? tx.total_amount) || 0)
  const qrisUrl = tx.qris_url ? String(tx.qris_url).replace(/`/g, '').trim() : ''
  const expiredInfo = tx.expired_minutes ? ` (${tx.expired_minutes} menit)` : ''
  const formatDateTime = value => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString('id-ID')
  }
  const showError = message => {
    const existing = wrap.querySelector('.deposit-error')
    if (existing) existing.remove()
    const pill = document.createElement('div')
    pill.className = 'pill error deposit-error'
    pill.textContent = message
    wrap.appendChild(pill)
  }
  const div = document.createElement('div')
  div.className = 'detail'
  div.innerHTML = `
    <div class="kv">
      <div>Status</div><div><span class="status status-${status}">${statusLabel}</span></div>
      <div>Jumlah</div><div>Rp ${Number(tx.amount||0).toLocaleString('id-ID')}</div>
      <div>Biaya</div><div>Rp ${Number(tx.fee||0).toLocaleString('id-ID')}</div>
      <div>Total</div><div>Rp ${totalAmount.toLocaleString('id-ID')}</div>
      <div>ID Transaksi</div><div class="monos">${tx.external_transaction_id || ''}</div>
      <div>Kadaluarsa</div><div>${formatDateTime(tx.expires_at)}${expiredInfo}</div>
      <div>QRIS</div><div>${qrisUrl ? `<img src="${qrisUrl}" alt="QRIS" class="qris"/>` : '-'}</div>
      ${bonusAmount > 0 ? `<div>Bonus</div><div>Rp ${bonusAmount.toLocaleString('id-ID')} (${bonusPercent}%)</div>` : ''}
    </div>
  `
  if (status === 'pending') {
    const actions = document.createElement('div')
    actions.className = 'row actions'
    actions.innerHTML = `
      <button class="btn-check">Cek Pembayaran</button>
      <button class="secondary btn-cancel">Batalkan</button>
    `
    div.appendChild(actions)
  }
  wrap.appendChild(div)
  if (status === 'pending') {
    const checkBtn = wrap.querySelector('.btn-check')
    const cancelBtn = wrap.querySelector('.btn-cancel')
    if (checkBtn) checkBtn.onclick = async () => {
      try {
        const res = await api(`/api/deposit/status?transaction_id=${encodeURIComponent(tx.external_transaction_id || '')}`)
        renderDeposit(res.transaction)
        if (res.paid) await refreshMe()
      } catch (e) {
        const msg = parseError(e)
        showError(msg)
      }
    }
    if (cancelBtn) cancelBtn.onclick = async () => {
      try {
        const res = await api('/api/deposit/cancel', { method: 'POST', body: JSON.stringify({ transaction_id: tx.external_transaction_id }) })
        renderDeposit(res.transaction)
      } catch (e) {
        const msg = parseError(e)
        showError(msg)
      }
    }
  }
}

async function loadActiveDeposit() {
  try {
    const res = await api('/api/deposit/active')
    renderDeposit(res.transaction)
  } catch (e) {
    renderDeposit(null)
  }
}

function on(id, handler) {
  const el = document.getElementById(id)
  if (el) el.onclick = handler
}

on('btnLogin', async () => {
  const username = document.getElementById('loginUser').value
  const password = document.getElementById('loginPass').value
  const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password }), headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
  token = res.token; localStorage.setItem('token', token)
  isAdmin = !!res.is_admin; localStorage.setItem('is_admin', String(isAdmin))
  hide(authEl); show(dashEl); if (isAdmin) show(adminPanel)
  await refreshMe(); await refreshServers(); await refreshAccounts(); await refreshNotifications()
})

on('btnAdminLogin', async () => {
  const username = document.getElementById('loginUser').value
  const password = document.getElementById('loginPass').value
  const res = await fetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }), headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
  token = res.token; localStorage.setItem('token', token)
  isAdmin = true; localStorage.setItem('is_admin', 'true')
  hide(authEl); show(dashEl); show(adminPanel)
  await refreshMe(); await refreshServers(); await refreshAccounts(); await refreshNotifications()
})

async function saveSettings() {
  const apikey = document.getElementById('apiKey')?.value || ''
  const telegram_bot_token = document.getElementById('tgBotToken')?.value || ''
  const telegram_chat_id = document.getElementById('tgChatId')?.value || ''
  const telegram_admin_ids = (document.getElementById('tgAdminIds')?.value || '').split(',').map(s => s.trim()).filter(Boolean)
  const topup_bonus_percent = Number(document.getElementById('topupBonus')?.value || 0)
  await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ apikey, telegram_bot_token, telegram_chat_id, telegram_admin_ids, topup_bonus_percent }) })
}

on('btnSaveDepositSettings', saveSettings)
on('btnSaveTelegram', saveSettings)

on('btnAddServer', async () => {
  const name = document.getElementById('srvName').value
  const domain = document.getElementById('srvDomain').value
  const auth = document.getElementById('srvAuth').value
  const prices = {
    ssh: Number(document.getElementById('priceSSH').value || 0),
    vmess: Number(document.getElementById('priceVMess').value || 0),
    vless: Number(document.getElementById('priceVLess').value || 0),
    trojan: Number(document.getElementById('priceTrojan').value || 0)
  }
  const defaults = { limitip: Number(document.getElementById('defLimitIP').value || 1), quota: Number(document.getElementById('defQuota').value || 0) }
  const types = {
    ssh: document.getElementById('typeSSH').checked,
    vmess: document.getElementById('typeVMess').checked,
    vless: document.getElementById('typeVLess').checked,
    trojan: document.getElementById('typeTrojan').checked
  }
  await api('/api/admin/servers', { method: 'POST', body: JSON.stringify({ name, domain, auth, prices, defaults, types }) })
  await refreshServers()
})

on('btnSendNotif', async () => {
  const user_id = document.getElementById('notifUserId').value || null
  const message = document.getElementById('notifMessage').value
  await api('/api/admin/notify', { method: 'POST', body: JSON.stringify({ user_id, message }) })
  await refreshNotifications()
})

on('btnDeposit', async () => {
  const amount = Number(document.getElementById('depositAmount').value || 0)
  const wrap = document.getElementById('depositResult')
  try {
    const res = await api('/api/deposit', { method: 'POST', body: JSON.stringify({ amount }) })
    renderDeposit(res.transaction)
  } catch (e) {
    const msg = parseError(e)
    try { await loadActiveDeposit() } catch {}
    if (wrap) {
      const pill = document.createElement('div')
      pill.className = 'pill error deposit-error'
      pill.textContent = msg
      wrap.appendChild(pill)
    }
  }
})

on('btnBuy', async () => {
  const server_id = document.getElementById('serverSelect').value
  const type = document.getElementById('typeSelect').value
  const user = document.getElementById('accUser').value
  const password = document.getElementById('accPass').value || '123456'
  const exp = Number(document.getElementById('accExp').value || 30)
  const limitip = Number(document.getElementById('accLimitIP').value || 1)
  const quota = Number(document.getElementById('accQuota').value || 0)
  const wrap = document.getElementById('buyResult')
  try {
    await api('/api/purchase', { method: 'POST', body: JSON.stringify({ server_id, type, user, password, exp, limitip, quota }) })
    wrap.textContent = 'Akun berhasil dibuat.'
    await refreshMe(); await refreshAccounts(); await refreshNotifications()
  } catch (e) {
    wrap.textContent = parseError(e)
  }
})

on('btnTrial', async () => {
  const server_id = document.getElementById('serverSelect').value
  const type = document.getElementById('typeSelect').value
  const user = document.getElementById('accUser').value
  const exp = Number(document.getElementById('accExp').value || 1)
  const limitip = Number(document.getElementById('accLimitIP').value || 1)
  const quota = Number(document.getElementById('accQuota').value || 0)
  const wrap = document.getElementById('buyResult')
  try {
    await api('/api/trial', { method: 'POST', body: JSON.stringify({ server_id, type, user, exp, limitip, quota }) })
    wrap.textContent = 'Trial berhasil dibuat.'
    await refreshAccounts(); await refreshNotifications()
  } catch (e) {
    wrap.textContent = parseError(e)
  }
})

on('btnRenew', async () => {
  const server_id = document.getElementById('renewServer').value
  const type = document.getElementById('renewType').value
  const num = document.getElementById('renewNum').value
  const exp = Number(document.getElementById('renewExp').value || 30)
  const wrap = document.getElementById('renewResult')
  try {
    await api('/api/renew', { method: 'POST', body: JSON.stringify({ server_id, type, num, exp }) })
    wrap.textContent = 'Perpanjangan berhasil.'
    await refreshMe(); await refreshNotifications()
  } catch (e) {
    wrap.textContent = parseError(e)
  }
})

async function init() {
  if (!token) { window.location.href = '/login.html'; return }
  hide(authEl); show(dashEl); if (isAdmin) show(adminPanel)
  await refreshMe(); await refreshServers(); await refreshAccounts(); await refreshNotifications(); await loadActiveDeposit()
  if (isAdmin) {
    const s = await api('/api/admin/settings')
    const m = id => document.getElementById(id)
    if (m('apiKey')) m('apiKey').value = s.apikey || ''
    if (m('topupBonus')) m('topupBonus').value = s.topup_bonus_percent || 0
    if (m('tgBotToken')) m('tgBotToken').value = s.telegram_bot_token || ''
    if (m('tgChatId')) m('tgChatId').value = s.telegram_chat_id || ''
    if (m('tgAdminIds')) m('tgAdminIds').value = Array.isArray(s.telegram_admin_ids) ? s.telegram_admin_ids.join(',') : ''
  }
}

init()
async function refreshPendingUsers() {
  const list = await api('/api/admin/users?status=pending')
  const wrap = document.getElementById('pendingUsers')
  wrap.innerHTML = ''
  list.forEach(u => {
    const row = document.createElement('div')
    row.className = 'detail'
    const btn = document.createElement('button')
    btn.textContent = 'Setujui'
    btn.onclick = async () => { await api(`/api/admin/users/${u.id}/approve`, { method: 'POST' }); await refreshPendingUsers() }
    row.innerHTML = `<div class="kv"><div>Username</div><div>${u.username}</div><div>Status</div><div>${u.status}</div></div>`
    row.appendChild(btn)
    wrap.appendChild(row)
  })
}
on('btnRefreshUsers', async () => { await refreshPendingUsers() })
if (isAdmin) { refreshPendingUsers() }

const serverSelectEl = document.getElementById('serverSelect')
if (serverSelectEl) serverSelectEl.onchange = () => updateTypeOptions()
const renewSelectEl = document.getElementById('renewServer')
if (renewSelectEl) renewSelectEl.onchange = () => updateRenewTypeOptions()
