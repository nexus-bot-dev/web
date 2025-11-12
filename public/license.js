async function activate() {
  const key = (document.getElementById('licenseKey')?.value || '').replace(/\D/g, '')
  const ip = document.getElementById('licenseIp')?.value || ''
  const msg = document.getElementById('licenseMsg')
  if (!/^\d{11}$/.test(key)) {
    setMessage('Kunci harus 11 digit angka.', 'error')
    return
  }
  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, ip })
    })
    const text = await res.text()
    if (!res.ok) throw new Error(text || res.statusText)
    setMessage('Lisensi berhasil diaktifkan. Silakan buka dashboard.', 'success')
    setTimeout(() => {
      window.location.replace('/login.html')
    }, 1000)
  } catch (e) {
    let detail = 'Terjadi kesalahan saat aktivasi.'
    try {
      const parsed = JSON.parse(e.message)
      if (parsed && parsed.error) {
        const map = {
          invalid_key_format: 'Kunci harus terdiri dari 11 digit angka.',
          key_not_found: 'Kunci tidak ditemukan. Periksa kembali atau hubungi admin.',
          key_not_active: 'Kunci tidak aktif atau diblokir.',
          key_expired: 'Kunci sudah kedaluwarsa.',
          ip_limit_reached: 'Kuota IP untuk kunci ini sudah penuh.',
          ip_required: 'Alamat IP VPS diperlukan.'
        }
        detail = map[parsed.error] || parsed.error
      }
    } catch {}
    setMessage(detail, 'error')
  }
}

function setMessage(text, type = 'subtle') {
  const msg = document.getElementById('licenseMsg')
  if (!msg) return
  msg.textContent = text
  msg.className = `pill ${type}`
}

const btn = document.getElementById('btnActivate')
if (btn) {
  btn.addEventListener('click', activate)
}

document.getElementById('licenseKey')?.addEventListener('keyup', e => {
  if (e.key === 'Enter') activate()
})
