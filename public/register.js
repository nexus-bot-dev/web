function on(id, handler) { const el = document.getElementById(id); if (el) el.onclick = handler }
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}
on('btnRegister', async () => {
  const username = document.getElementById('regUser').value
  const password = document.getElementById('regPass').value
  try {
    const res = await post('/api/register', { username, password })
    document.getElementById('regMsg').textContent = 'Registrasi berhasil. Menunggu persetujuan admin.'
  } catch (e) {
    document.getElementById('regMsg').textContent = 'Registrasi gagal atau username sudah digunakan'
  }
})