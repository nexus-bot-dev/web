function on(id, handler) { const el = document.getElementById(id); if (el) el.onclick = handler }
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}
on('btnLogin', async () => {
  const username = document.getElementById('loginUser').value
  const password = document.getElementById('loginPass').value
  try {
    const res = await post('/api/login', { username, password })
    localStorage.setItem('token', res.token)
    localStorage.setItem('is_admin', String(!!res.is_admin))
    window.location.href = '/'
  } catch (e) {
    document.getElementById('loginMsg').textContent = 'Gagal masuk atau akun belum disetujui'
  }
})
on('btnAdminLogin', async () => {
  const username = document.getElementById('loginUser').value
  const password = document.getElementById('loginPass').value
  try {
    const res = await post('/api/admin/login', { username, password })
    localStorage.setItem('token', res.token)
    localStorage.setItem('is_admin', 'true')
    window.location.href = '/'
  } catch (e) {
    document.getElementById('loginMsg').textContent = 'Gagal masuk admin'
  }
})