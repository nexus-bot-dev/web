(function () {
  const token = localStorage.getItem('token')
  if (token) {
    const isAdmin = localStorage.getItem('is_admin') === 'true'
    window.location.replace(isAdmin ? '/admin.html' : '/user.html')
  }
})()

function setMessage(message, type = 'info') {
  const el = document.getElementById('loginMsg')
  if (!el) return
  el.textContent = message
  el.className = `pill ${type === 'error' ? 'error' : 'subtle'}`
}

function on(id, handler) {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', handler)
}

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text)
  return text ? JSON.parse(text) : {}
}

function handleSuccess(result) {
  localStorage.setItem('token', result.token)
  localStorage.setItem('is_admin', String(!!result.is_admin))
  localStorage.setItem('is_owner', String(!!result.is_owner))
  window.location.replace(result.is_admin ? '/admin.html' : '/user.html')
}

function parseError(err) {
  try {
    const data = JSON.parse(err.message)
    if (data?.error === 'pending_approval') return 'Akun Anda belum disetujui oleh admin.'
    if (data?.error === 'invalid_credentials') return 'Username atau password salah.'
  } catch {}
  return 'Gagal masuk, periksa kembali data Anda.'
}

on('btnLogin', async () => {
  const username = document.getElementById('loginUser').value
  const password = document.getElementById('loginPass').value
  try {
    const res = await post('/api/login', { username, password })
    handleSuccess(res)
  } catch (e) {
    setMessage(parseError(e), 'error')
  }
})

on('btnAdminLogin', async () => {
  const username = document.getElementById('loginUser').value
  const password = document.getElementById('loginPass').value
  try {
    const res = await post('/api/admin/login', { username, password })
    res.is_admin = true
    handleSuccess(res)
  } catch (e) {
    setMessage(parseError(e), 'error')
  }
})
