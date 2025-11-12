const token = localStorage.getItem('token') || ''
const isAdmin = localStorage.getItem('is_admin') === 'true'
let isOwner = localStorage.getItem('is_owner') === 'true'

if (!token || !isAdmin) {
  window.location.replace('/login.html')
}

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('is_admin')
  localStorage.removeItem('is_owner')
  window.location.replace('/login.html')
}

document.getElementById('btnLogout')?.addEventListener('click', logout)

function applyRoleVisibility() {
  document.querySelectorAll('[data-owner-only]').forEach(el => {
    el.classList.toggle('hidden', !isOwner)
  })
  document.querySelectorAll('[data-non-owner]').forEach(el => {
    el.classList.toggle('hidden', isOwner)
  })
}

applyRoleVisibility()

function parseError(error) {
  try {
    const data = JSON.parse(error.message)
    if (data && data.error) {
      const map = {
        invalid_credentials: 'Kredensial tidak valid.',
        missing_apikey: 'API Key belum diatur.',
        invalid_current_password: 'Password saat ini salah.',
        invalid_new_password: 'Password baru minimal 4 karakter.',
        license_not_found: 'Lisensi tidak ditemukan.',
        ip_limit_reached: 'Kuota IP untuk kunci lisensi tersebut sudah terpenuhi.',
        owner_required: 'Hanya admin owner yang dapat melakukan aksi ini.'
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

function setStatus(id, message, type = 'subtle') {
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
  isOwner = !!me.is_owner
  localStorage.setItem('is_owner', String(isOwner))
  applyRoleVisibility()
  document.getElementById('adminUserName')?.textContent = name
  document.getElementById('adminSaldo')?.textContent = saldoLabel
  document.getElementById('adminTopbarName')?.textContent = name
  const roleEl = document.getElementById('adminRole')
  if (roleEl) roleEl.textContent = me.is_owner ? 'Owner Admin' : (me.is_admin ? 'Admin' : 'Pengguna')
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('id-ID')
  } catch {
    return value
  }
}

async function refreshLicenseStatus() {
  const summary = document.getElementById('licenseSummary')
  try {
    const res = await fetch('/api/license/status', { headers: { 'x-user-token': token } })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (data.valid) {
      if (summary) {
        summary.textContent = 'Lisensi aktif'
        summary.className = 'pill success'
      }
      const keyEl = document.getElementById('licenseKeyLabel')
      const ipEl = document.getElementById('licenseIp')
      const expEl = document.getElementById('licenseExpiry')
      if (keyEl) keyEl.textContent = data.license?.key || '-'
      if (ipEl) ipEl.textContent = data.license?.ip || '-'
      if (expEl) expEl.textContent = formatDate(data.license?.expires_at)
    } else {
      if (summary) {
        summary.textContent = `Lisensi tidak aktif (${data.reason || 'unknown'})`
        summary.className = 'pill error'
      }
      const keyEl = document.getElementById('licenseKeyLabel')
      const ipEl = document.getElementById('licenseIp')
      const expEl = document.getElementById('licenseExpiry')
      if (keyEl) keyEl.textContent = '-'
      if (ipEl) ipEl.textContent = '-'
      if (expEl) expEl.textContent = '-'
    }
  } catch (e) {
    if (summary) {
      summary.textContent = 'Gagal memuat status lisensi'
      summary.className = 'pill error'
    }
  }
}

async function refreshLicenseKeys() {
  const wrap = document.getElementById('licenseKeys')
  if (!wrap) return
  if (!isOwner) {
    wrap.innerHTML = ''
    const info = document.createElement('div')
    info.className = 'pill subtle'
    info.textContent = 'Kunci lisensi hanya dapat dilihat oleh admin owner.'
    wrap.appendChild(info)
    return
  }
  try {
    const keys = await api('/api/admin/license-keys')
    wrap.innerHTML = ''
    const sorted = (keys || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    sorted.forEach(key => {
      const div = document.createElement('div')
      div.className = 'detail'
      const statusValue = (key.status || 'active')
      const status = statusValue.toUpperCase()
      const statusClass = statusValue.toLowerCase()
      const ips = (key.allowed_ips || []).length ? key.allowed_ips.join(', ') : 'Belum ada'
      div.innerHTML = `
        <div class="kv">
          <div>Label</div><div>${key.label || '-'}</div>
          <div>Kunci</div><div class="monos">${key.key}</div>
          <div>Status</div><div><span class="status status-${statusClass}">${status}</span></div>
          <div>IP Terdaftar</div><div>${ips}</div>
          <div>Kuota IP</div><div>${key.max_ips || 1}</div>
          <div>Berakhir</div><div>${formatDate(key.expires_at)}</div>
        </div>
      `
      if (isOwner) {
        const actions = document.createElement('div')
        actions.className = 'actions'
        const allowBtn = document.createElement('button')
        allowBtn.className = 'secondary'
        allowBtn.textContent = 'Tambah IP'
        allowBtn.addEventListener('click', async () => {
          const ip = prompt('Masukkan IP yang ingin diizinkan untuk kunci ini:')
          if (!ip) return
          try {
            await api(`/api/admin/license-keys/${key.id}/allow-ip`, { method: 'POST', body: JSON.stringify({ ip }) })
            await refreshLicenseKeys()
          } catch (e) {
            alert(parseError(e))
          }
        })
        actions.appendChild(allowBtn)
        const resetBtn = document.createElement('button')
        resetBtn.className = 'secondary'
        resetBtn.textContent = 'Reset IP'
        resetBtn.addEventListener('click', async () => {
          if (!confirm('Kosongkan seluruh IP yang terhubung dengan kunci ini?')) return
          try {
            await api(`/api/admin/license-keys/${key.id}/reset`, { method: 'POST' })
            await refreshLicenseKeys()
          } catch (e) {
            alert(parseError(e))
          }
        })
        actions.appendChild(resetBtn)
        if (key.status === 'revoked') {
          const activateBtn = document.createElement('button')
          activateBtn.textContent = 'Aktifkan'
          activateBtn.addEventListener('click', async () => {
            try {
              await api(`/api/admin/license-keys/${key.id}/activate`, { method: 'POST' })
              await refreshLicenseKeys()
            } catch (e) {
              alert(parseError(e))
            }
          })
          actions.appendChild(activateBtn)
        } else {
          const revokeBtn = document.createElement('button')
          revokeBtn.className = 'secondary'
          revokeBtn.textContent = 'Nonaktifkan'
          revokeBtn.addEventListener('click', async () => {
            if (!confirm('Nonaktifkan kunci ini?')) return
            try {
              await api(`/api/admin/license-keys/${key.id}/revoke`, { method: 'POST' })
              await refreshLicenseKeys()
            } catch (e) {
              alert(parseError(e))
            }
          })
          actions.appendChild(revokeBtn)
        }
        div.appendChild(actions)
      }
      wrap.appendChild(div)
    })
    if (!sorted.length) {
      const empty = document.createElement('div')
      empty.className = 'pill subtle'
      empty.textContent = 'Belum ada kunci lisensi.'
      wrap.appendChild(empty)
    }
  } catch (e) {
    console.error(e)
  }
}

async function refreshSettings() {
  try {
    const settings = await api('/api/admin/settings')
    if (!settings) return
    const assign = (id, value) => {
      const el = document.getElementById(id)
      if (el) el.value = value ?? ''
    }
    assign('apiKey', settings.apikey || '')
    assign('topupBonus', settings.topup_bonus_percent || 0)
    assign('tgBotToken', settings.telegram_bot_token || '')
    assign('tgChatId', settings.telegram_chat_id || '')
    assign('tgAdminIds', Array.isArray(settings.telegram_admin_ids) ? settings.telegram_admin_ids.join(',') : '')
    const domainLabel = document.getElementById('adminPrimaryDomain')
    if (domainLabel) domainLabel.textContent = settings.primary_domain || '-'
  } catch (e) {
    console.error(e)
  }
}

async function refreshServers() {
  const servers = await api('/api/admin/servers')
  const wrap = document.getElementById('servers')
  if (!wrap) return
  wrap.innerHTML = ''
  servers.forEach(server => {
    const div = document.createElement('div')
    div.className = 'detail'
    const types = server.types || {}
    const enabled = Object.entries(types)
      .filter(([, v]) => v !== false)
      .map(([k]) => k.toUpperCase())
    div.innerHTML = `
      <div class="kv">
        <div>Nama</div><div>${server.name}</div>
        <div>Domain</div><div class="monos">${server.domain}</div>
        <div>Auth</div><div class="monos">${server.auth}</div>
        <div>Harga SSH</div><div>Rp ${Number(server.prices?.ssh || 0).toLocaleString('id-ID')}</div>
        <div>Harga VMess</div><div>Rp ${Number(server.prices?.vmess || 0).toLocaleString('id-ID')}</div>
        <div>Harga VLess</div><div>Rp ${Number(server.prices?.vless || 0).toLocaleString('id-ID')}</div>
        <div>Harga Trojan</div><div>Rp ${Number(server.prices?.trojan || 0).toLocaleString('id-ID')}</div>
        <div>Default Limit IP</div><div>${server.defaults?.limitip ?? '-'}</div>
        <div>Default Kuota</div><div>${server.defaults?.quota ?? '-'} GB</div>
        <div>Layanan</div><div>${enabled.length ? enabled.join(', ') : 'Tidak ada'}</div>
      </div>
    `
    wrap.appendChild(div)
  })
}

async function refreshPendingUsers() {
  const users = await api('/api/admin/users?status=pending')
  const wrap = document.getElementById('pendingUsers')
  if (!wrap) return
  wrap.innerHTML = ''
  users.forEach(user => {
    const row = document.createElement('div')
    row.className = 'detail'
    row.innerHTML = `
      <div class="kv">
        <div>Username</div><div>${user.username}</div>
        <div>Status</div><div>${user.status}</div>
      </div>
    `
    const btn = document.createElement('button')
    btn.textContent = 'Setujui'
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/admin/users/${user.id}/approve`, { method: 'POST' })
        await refreshPendingUsers()
        await refreshNotifications()
      } catch (e) {
        alert(parseError(e))
      }
    })
    row.appendChild(btn)
    wrap.appendChild(row)
  })
}

async function refreshNotifications() {
  const notifs = await api('/api/notifications')
  const wrap = document.getElementById('adminNotifs')
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

function attach(id, handler) {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', handler)
}

attach('btnSaveDepositSettings', async () => {
  const payload = {
    apikey: document.getElementById('apiKey')?.value || '',
    topup_bonus_percent: Number(document.getElementById('topupBonus')?.value || 0)
  }
  try {
    await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) })
    setStatus('btnSaveDepositSettingsMsg', 'Pengaturan deposit disimpan.', 'success')
  } catch (e) {
    setStatus('btnSaveDepositSettingsMsg', parseError(e), 'error')
  }
})

attach('btnSaveTelegram', async () => {
  const payload = {
    telegram_bot_token: document.getElementById('tgBotToken')?.value || '',
    telegram_chat_id: document.getElementById('tgChatId')?.value || '',
    telegram_admin_ids: (document.getElementById('tgAdminIds')?.value || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }
  try {
    await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) })
    setStatus('btnSaveTelegramMsg', 'Pengaturan telegram disimpan.', 'success')
  } catch (e) {
    setStatus('btnSaveTelegramMsg', parseError(e), 'error')
  }
})

attach('btnCreateLicense', async () => {
  if (!isOwner) {
    setStatus('licenseCreateMsg', 'Fitur ini hanya untuk admin owner.', 'error')
    return
  }
  const payload = {
    label: document.getElementById('licenseLabel')?.value || '',
    duration_days: Number(document.getElementById('licenseDays')?.value || 30),
    allowed_ips: (document.getElementById('licenseIps')?.value || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    max_ips: Number(document.getElementById('licenseQuota')?.value || 1)
  }
  try {
    const key = await api('/api/admin/license-keys', { method: 'POST', body: JSON.stringify(payload) })
    setStatus('licenseCreateMsg', `Kunci dibuat: ${key.key}`, 'success')
    document.getElementById('licenseLabel').value = ''
    document.getElementById('licenseIps').value = ''
    await refreshLicenseKeys()
  } catch (e) {
    setStatus('licenseCreateMsg', parseError(e), 'error')
  }
})

attach('btnRefreshLicense', async () => {
  await refreshLicenseStatus()
})

attach('btnAddServer', async () => {
  const payload = {
    name: document.getElementById('srvName')?.value,
    domain: document.getElementById('srvDomain')?.value,
    auth: document.getElementById('srvAuth')?.value,
    prices: {
      ssh: Number(document.getElementById('priceSSH')?.value || 0),
      vmess: Number(document.getElementById('priceVMess')?.value || 0),
      vless: Number(document.getElementById('priceVLess')?.value || 0),
      trojan: Number(document.getElementById('priceTrojan')?.value || 0)
    },
    defaults: {
      limitip: Number(document.getElementById('defLimitIP')?.value || 1),
      quota: Number(document.getElementById('defQuota')?.value || 0)
    },
    types: {
      ssh: document.getElementById('typeSSH')?.checked,
      vmess: document.getElementById('typeVMess')?.checked,
      vless: document.getElementById('typeVLess')?.checked,
      trojan: document.getElementById('typeTrojan')?.checked
    }
  }
  try {
    await api('/api/admin/servers', { method: 'POST', body: JSON.stringify(payload) })
    setStatus('btnAddServerMsg', 'Server berhasil ditambahkan.', 'success')
    await refreshServers()
  } catch (e) {
    setStatus('btnAddServerMsg', parseError(e), 'error')
  }
})

attach('btnSendNotif', async () => {
  const payload = {
    user_id: document.getElementById('notifUserId')?.value || null,
    message: document.getElementById('notifMessage')?.value || ''
  }
  try {
    await api('/api/admin/notify', { method: 'POST', body: JSON.stringify(payload) })
    setStatus('btnSendNotifMsg', 'Notifikasi dikirim.', 'success')
    const area = document.getElementById('notifMessage')
    if (area) area.value = ''
    await refreshNotifications()
  } catch (e) {
    setStatus('btnSendNotifMsg', parseError(e), 'error')
  }
})

attach('btnRefreshUsers', async () => {
  await refreshPendingUsers()
})

attach('btnAdminChangePassword', async () => {
  const current = document.getElementById('adminCurrentPassword')?.value || ''
  const next = document.getElementById('adminNewPassword')?.value || ''
  const confirm = document.getElementById('adminConfirmPassword')?.value || ''
  if (next !== confirm) {
    setStatus('adminChangePasswordMsg', 'Konfirmasi password tidak sama.', 'error')
    return
  }
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) })
    setStatus('adminChangePasswordMsg', 'Password diperbarui.', 'success')
    document.getElementById('adminCurrentPassword').value = ''
    document.getElementById('adminNewPassword').value = ''
    document.getElementById('adminConfirmPassword').value = ''
  } catch (e) {
    setStatus('adminChangePasswordMsg', parseError(e), 'error')
  }
})

async function init() {
  await refreshMe()
  await refreshSettings()
  await refreshServers()
  await refreshPendingUsers()
  await refreshNotifications()
  await refreshLicenseStatus()
  if (isOwner) {
    await refreshLicenseKeys()
  }
}

init()
