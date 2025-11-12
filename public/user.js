const token = localStorage.getItem('token') || ''
const storedIsAdmin = localStorage.getItem('is_admin') === 'true'

if (!token) {
  window.location.replace('/login.html')
} else if (storedIsAdmin) {
  window.location.replace('/admin.html')
}

const state = {
  servers: []
}

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('is_admin')
  localStorage.removeItem('is_owner')
  window.location.replace('/login.html')
}

const logoutBtn = document.getElementById('btnLogout')
if (logoutBtn) logoutBtn.addEventListener('click', logout)

function parseError(error) {
  try {
    const data = JSON.parse(error.message)
    if (data && data.error) {
      const map = {
        pending_deposit_exists: 'Masih ada QRIS yang aktif, selesaikan atau batalkan terlebih dahulu.',
        invalid_amount: 'Masukkan nominal deposit yang valid.',
        missing_apikey: 'API Key deposit belum diatur admin.',
        cannot_cancel: 'Transaksi tidak dapat dibatalkan.',
        insufficient_balance: 'Saldo tidak mencukupi.',
        type_not_available: 'Layanan tidak tersedia di server terpilih.',
        invalid_current_password: 'Password saat ini tidak sesuai.',
        invalid_new_password: 'Password baru minimal 4 karakter.'
      }
      return map[data.error] || data.error
    }
  } catch {}
  return error.message || 'Terjadi kesalahan'
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), 'x-user-token': token }
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { ...options, headers })
  const text = await res.text()
  if (res.status === 401) {
    logout()
    return {}
  }
  if (!res.ok) throw new Error(text || res.statusText)
  return text ? JSON.parse(text) : {}
}

function showStatus(id, message, type = 'subtle') {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = message
  el.className = `pill ${type}`
}

async function refreshMe() {
  const me = await api('/api/me')
  if (!me) return
  const saldo = Number(me.balance || 0)
  const saldoLabel = `Rp ${saldo.toLocaleString('id-ID')}`
  const name = me.username || '-'
  const nameEl = document.getElementById('userName')
  if (nameEl) nameEl.textContent = name
  const saldoEl = document.getElementById('saldo')
  if (saldoEl) saldoEl.textContent = saldoLabel
  const topbarName = document.getElementById('topbarName')
  if (topbarName) topbarName.textContent = name
}

async function refreshServers() {
  const res = await api('/api/servers')
  const servers = Array.isArray(res) ? res : []
  state.servers = servers
  const serverSelect = document.getElementById('serverSelect')
  const renewSelect = document.getElementById('renewServer')
  if (serverSelect) serverSelect.innerHTML = ''
  if (renewSelect) renewSelect.innerHTML = ''
  servers.forEach(server => {
    const opt = document.createElement('option')
    opt.value = server.id
    opt.textContent = `${server.name} (${server.domain})`
    serverSelect?.appendChild(opt)
    const opt2 = document.createElement('option')
    opt2.value = server.id
    opt2.textContent = `${server.name} (${server.domain})`
    renewSelect?.appendChild(opt2)
  })
  updateTypeOptions()
  updateRenewTypeOptions()
}

function updateTypeOptions() {
  const serverId = document.getElementById('serverSelect')?.value
  const server = state.servers.find(s => s.id === serverId)
  const typeSelect = document.getElementById('typeSelect')
  if (!typeSelect) return
  let fallback = null
  Array.from(typeSelect.options).forEach(opt => {
    const allowed = !server || !server.types || server.types[opt.value] !== false
    opt.disabled = !allowed
    if (allowed && !fallback) fallback = opt
  })
  if (typeSelect.selectedOptions[0]?.disabled && fallback) {
    typeSelect.value = fallback.value
  }
  if (server?.defaults) {
    const limitInput = document.getElementById('accLimitIP')
    const quotaInput = document.getElementById('accQuota')
    if (limitInput && !limitInput.dataset.dirty) limitInput.value = server.defaults.limitip ?? 1
    if (quotaInput && !quotaInput.dataset.dirty) quotaInput.value = server.defaults.quota ?? 0
  }
}

function updateRenewTypeOptions() {
  const serverId = document.getElementById('renewServer')?.value
  const server = state.servers.find(s => s.id === serverId)
  const renewSelect = document.getElementById('renewType')
  if (!renewSelect) return
  let fallback = null
  Array.from(renewSelect.options).forEach(opt => {
    const allowed = !server || !server.types || server.types[opt.value] !== false
    opt.disabled = !allowed
    if (allowed && !fallback) fallback = opt
  })
  if (renewSelect.selectedOptions[0]?.disabled && fallback) {
    renewSelect.value = fallback.value
  }
}

function markDirty(id) {
  const el = document.getElementById(id)
  if (el) el.dataset.dirty = 'true'
}

['accLimitIP', 'accQuota'].forEach(id => {
  const el = document.getElementById(id)
  if (el) el.addEventListener('input', () => markDirty(id))
})

async function refreshAccounts() {
  const accounts = await api('/api/accounts')
  const wrap = document.getElementById('accounts')
  if (!wrap) return
  wrap.innerHTML = ''
  accounts.forEach(account => {
    const details = account.details || {}
    const card = document.createElement('div')
    card.className = 'detail'
    const durationRow = account.duration_days ? `<div>Durasi</div><div>${account.duration_days} hari</div>` : ''
    if (account.type === 'vmess' || account.type === 'vless' || account.type === 'trojan') {
      card.innerHTML = `
        <div class="kv">
          <div>User</div><div>${details.user || ''}</div>
          <div>UUID</div><div class="monos">${details.uuid || ''}</div>
          <div>Kadaluarsa</div><div>${details.expired || ''}</div>
          <div>Domain</div><div class="monos">${details.domain || ''}</div>
          <div>WS TLS</div><div class="monos">${details.ws_tls || ''}</div>
          <div>WS Non TLS</div><div class="monos">${details.ws_none_tls || ''}</div>
          <div>gRPC</div><div class="monos">${details.grpc || ''}</div>
          <div>OpenClash</div><div>${details.openclash ? `<a target="_blank" href="${String(details.openclash).trim()}">Unduh</a>` : '-'}</div>
          <div>Dashboard</div><div>${details.dashboard_url ? `<a target="_blank" href="${String(details.dashboard_url).trim()}">Lihat</a>` : '-'}</div>
          ${durationRow}
          <div>Harga</div><div>Rp ${Number(account.price || 0).toLocaleString('id-ID')}</div>
        </div>
      `
      const link = details.vless || details.trojan || details.link
      if (link) {
        const extra = document.createElement('div')
        extra.className = 'kv'
        extra.innerHTML = `<div>Link</div><div class="monos">${link}</div>`
        card.appendChild(extra)
      }
    } else if (account.type === 'ssh') {
      const ports = details.ports || {}
      const formats = details.formats || {}
      const payloads = details.payloads || {}
      card.innerHTML = `
        <div class="kv">
          <div>Username</div><div>${details.username || ''}</div>
          <div>Password</div><div class="monos">${details.password || ''}</div>
          <div>Host</div><div class="monos">${details.host || ''}</div>
          <div>IP</div><div>${details.ip || ''}</div>
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
          <div>OVPN</div><div>${details.ovpnDownload ? `<a target="_blank" href="${String(details.ovpnDownload).trim()}">Unduh</a>` : '-'}</div>
          <div>Simpan Link</div><div>${details.saveLink ? `<a target="_blank" href="${String(details.saveLink).trim()}">Unduh</a>` : '-'}</div>
          <div>Payload WS Non TLS</div><div class="monos">${payloads.wsNtls || ''}</div>
          <div>Payload WS TLS</div><div class="monos">${payloads.wsTls || ''}</div>
          <div>Payload Enhanced</div><div class="monos">${payloads.enhanced || ''}</div>
          <div>Dibuat</div><div>${details.created || ''}</div>
          <div>Kadaluarsa</div><div>${details.expired || ''}</div>
          <div>ISP</div><div>${details.isp || ''}</div>
          <div>Kota</div><div>${details.city || ''}</div>
          <div>Limit IP</div><div>${details.limitIP || ''}</div>
          ${durationRow}
          <div>Harga</div><div>Rp ${Number(account.price || 0).toLocaleString('id-ID')}</div>
        </div>
      `
    } else {
      card.innerHTML = `<div class="kv"><div>Detail</div><div>${JSON.stringify(details)}</div>${durationRow ? `<div>Durasi</div><div>${account.duration_days} hari</div>` : ''}</div>`
    }
    wrap.appendChild(card)
  })
}

async function refreshNotifications() {
  const notifs = await api('/api/notifications')
  const wrap = document.getElementById('notifications')
  if (!wrap) return
  wrap.innerHTML = ''
  notifs.forEach(item => {
    const div = document.createElement('div')
    div.className = 'pill'
    const created = item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : ''
    div.textContent = `${created} — ${item.message}`
    wrap.appendChild(div)
  })
}

function renderDeposit(tx) {
  const wrap = document.getElementById('depositResult')
  if (!wrap) return
  wrap.innerHTML = ''
  if (!tx) return
  const statusMap = {
    pending: 'Menunggu Pembayaran',
    success: 'Sukses',
    expired: 'Kadaluarsa',
    canceled: 'Dibatalkan'
  }
  const status = tx.status || 'pending'
  const bonusAmount = Number(tx.bonus_amount || 0)
  const bonusPercent = Number(tx.bonus_percent || 0)
  const totalAmount = Number((tx.total ?? tx.total_amount) || 0)
  const qrisUrl = tx.qris_url ? String(tx.qris_url).replace(/`/g, '').trim() : ''
  const expiredInfo = tx.expired_minutes ? ` (${tx.expired_minutes} menit)` : ''
  const formatDateTime = value => {
    if (!value) return ''
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('id-ID')
  }
  const div = document.createElement('div')
  div.className = 'detail'
  div.innerHTML = `
    <div class="kv">
      <div>Status</div><div><span class="status status-${status}">${statusMap[status] || status}</span></div>
      <div>Jumlah</div><div>Rp ${Number(tx.amount || 0).toLocaleString('id-ID')}</div>
      <div>Biaya</div><div>Rp ${Number(tx.fee || 0).toLocaleString('id-ID')}</div>
      <div>Total</div><div>Rp ${totalAmount.toLocaleString('id-ID')}</div>
      <div>ID Transaksi</div><div class="monos">${tx.external_transaction_id || ''}</div>
      <div>Kadaluarsa</div><div>${formatDateTime(tx.expires_at)}${expiredInfo}</div>
      <div>QRIS</div><div>${qrisUrl ? `<img src="${qrisUrl}" alt="QRIS" class="qris" />` : '-'}</div>
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
    const showError = message => {
      const existing = wrap.querySelector('.deposit-error')
      if (existing) existing.remove()
      const pill = document.createElement('div')
      pill.className = 'pill error deposit-error'
      pill.textContent = message
      wrap.appendChild(pill)
    }
    const checkBtn = wrap.querySelector('.btn-check')
    const cancelBtn = wrap.querySelector('.btn-cancel')
    if (checkBtn) checkBtn.onclick = async () => {
      try {
        const res = await api(`/api/deposit/status?transaction_id=${encodeURIComponent(tx.external_transaction_id || '')}`)
        renderDeposit(res.transaction)
        if (res.paid) await refreshMe()
      } catch (e) {
        showError(parseError(e))
      }
    }
    if (cancelBtn) cancelBtn.onclick = async () => {
      try {
        const res = await api('/api/deposit/cancel', { method: 'POST', body: JSON.stringify({ transaction_id: tx.external_transaction_id }) })
        renderDeposit(res.transaction)
      } catch (e) {
        showError(parseError(e))
      }
    }
  }
}

async function loadActiveDeposit() {
  try {
    const res = await api('/api/deposit/active')
    renderDeposit(res.transaction)
  } catch {
    renderDeposit(null)
  }
}

function attach(id, handler) {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', handler)
}

attach('btnDeposit', async () => {
  const amount = Number(document.getElementById('depositAmount')?.value || 0)
  const wrap = document.getElementById('depositResult')
  if (!wrap) return
  try {
    const res = await api('/api/deposit', { method: 'POST', body: JSON.stringify({ amount }) })
    renderDeposit(res.transaction)
  } catch (e) {
    const msg = parseError(e)
    await loadActiveDeposit()
    const existing = wrap.querySelector('.deposit-error')
    if (existing) existing.remove()
    const err = document.createElement('div')
    err.className = 'pill error deposit-error'
    err.textContent = msg
    wrap.appendChild(err)
  }
})

attach('btnBuy', async () => {
  const body = {
    server_id: document.getElementById('serverSelect')?.value,
    type: document.getElementById('typeSelect')?.value,
    user: document.getElementById('accUser')?.value,
    password: document.getElementById('accPass')?.value || '123456',
    exp: Number(document.getElementById('accExp')?.value || 30),
    limitip: Number(document.getElementById('accLimitIP')?.value || 1),
    quota: Number(document.getElementById('accQuota')?.value || 0)
  }
  try {
    await api('/api/purchase', { method: 'POST', body: JSON.stringify(body) })
    showStatus('buyResult', 'Akun berhasil dibuat.', 'success')
    await refreshMe()
    await refreshAccounts()
    await refreshNotifications()
  } catch (e) {
    showStatus('buyResult', parseError(e), 'error')
  }
})

attach('btnTrial', async () => {
  const body = {
    server_id: document.getElementById('serverSelect')?.value,
    type: document.getElementById('typeSelect')?.value,
    user: document.getElementById('accUser')?.value,
    exp: Number(document.getElementById('accExp')?.value || 1),
    limitip: Number(document.getElementById('accLimitIP')?.value || 1),
    quota: Number(document.getElementById('accQuota')?.value || 0)
  }
  try {
    await api('/api/trial', { method: 'POST', body: JSON.stringify(body) })
    showStatus('buyResult', 'Trial berhasil dibuat.', 'success')
    await refreshAccounts()
    await refreshNotifications()
  } catch (e) {
    showStatus('buyResult', parseError(e), 'error')
  }
})

attach('btnRenew', async () => {
  const body = {
    server_id: document.getElementById('renewServer')?.value,
    type: document.getElementById('renewType')?.value,
    num: document.getElementById('renewNum')?.value,
    exp: Number(document.getElementById('renewExp')?.value || 30)
  }
  try {
    await api('/api/renew', { method: 'POST', body: JSON.stringify(body) })
    showStatus('renewResult', 'Perpanjangan berhasil.', 'success')
    await refreshMe()
    await refreshNotifications()
  } catch (e) {
    showStatus('renewResult', parseError(e), 'error')
  }
})

attach('btnChangePassword', async () => {
  const current = document.getElementById('currentPassword')?.value || ''
  const next = document.getElementById('newPassword')?.value || ''
  const confirm = document.getElementById('confirmPassword')?.value || ''
  if (next !== confirm) {
    showStatus('changePasswordMsg', 'Konfirmasi password tidak sama.', 'error')
    return
  }
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) })
    showStatus('changePasswordMsg', 'Password berhasil diperbarui.', 'success')
    document.getElementById('currentPassword').value = ''
    document.getElementById('newPassword').value = ''
    document.getElementById('confirmPassword').value = ''
  } catch (e) {
    showStatus('changePasswordMsg', parseError(e), 'error')
  }
})

const serverSelectEl = document.getElementById('serverSelect')
if (serverSelectEl) serverSelectEl.addEventListener('change', updateTypeOptions)
const renewServerEl = document.getElementById('renewServer')
if (renewServerEl) renewServerEl.addEventListener('change', updateRenewTypeOptions)

async function init() {
  await refreshMe()
  await refreshServers()
  await refreshAccounts()
  await refreshNotifications()
  await loadActiveDeposit()
}

init()
