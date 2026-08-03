import React, { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LogOut, User, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientSession } from '../../contexts/ClientSessionContext'
import BirthdateInput from '../../components/BirthdateInput'

async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 512
        let { width, height } = img
        if (width > height && width > MAX) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else if (height > width && height > MAX) {
          width = Math.round((width * MAX) / height)
          height = MAX
        } else if (width > MAX) {
          height = Math.round((height * MAX) / width)
          width = MAX
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function ClientProfile() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { clientSession, updateSession, logout } = useClientSession()

  const [fullName, setFullName] = useState(clientSession?.full_name || '')
  const [phone, setPhone] = useState(clientSession?.phone || '')
  const [birthDate, setBirthDate] = useState(clientSession?.birth_date || '')
  const [avatarPreview, setAvatarPreview] = useState(clientSession?.avatar_url || null)
  const [avatarDataUrl, setAvatarDataUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!clientSession?.phone) return
    let mounted = true
    fetch('/api/client-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookup', phone: clientSession.phone }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!mounted || !data?.client) return
        updateSession({
          full_name: data.client.full_name,
          birth_date: data.client.birth_date || '',
          avatar_url: data.client.avatar_url || null,
        })
        setFullName(data.client.full_name || '')
        setBirthDate(data.client.birth_date || '')
        setAvatarPreview(data.client.avatar_url || null)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [clientSession?.phone])

  const hasChanges =
    fullName !== (clientSession?.full_name || '') ||
    phone !== (clientSession?.phone || '') ||
    birthDate !== (clientSession?.birth_date || '') ||
    !!avatarDataUrl

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const dataUrl = await compressImage(file)
    setAvatarPreview(dataUrl)
    setAvatarDataUrl(dataUrl)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        action: 'update',
        client_id: clientSession.client_id,
        current_phone: clientSession.phone,
      }
      if (fullName !== clientSession.full_name) body.full_name = fullName
      if (phone !== clientSession.phone) body.phone = phone
      if (birthDate !== (clientSession.birth_date || '')) body.birth_date = birthDate || null
      if (avatarDataUrl) body.avatar_base64 = avatarDataUrl

      const res = await fetch('/api/client-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          toast.error('Este número de WhatsApp já está em uso por outro cliente.')
        } else {
          toast.error(data.error || 'Erro ao salvar os dados.')
        }
        return
      }

      updateSession({
        full_name: data.client.full_name,
        phone: data.client.phone,
        birth_date: data.client.birth_date || '',
        avatar_url: data.client.avatar_url || null,
      })
      setAvatarDataUrl(null)
      toast.success('Perfil atualizado com sucesso!')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate(`/s/${slug}`, { replace: true })
  }

  const handlePushPermission = async () => {
    try {
      const OneSignal = window.OneSignal
      if (!OneSignal) {
        toast.error('O sistema de notificações ainda está carregando. Tente novamente em 2 segundos.')
        return
      }

      const sub = OneSignal.User?.PushSubscription
      const hasToken = sub?.token || sub?.id
      if (sub?.optedIn && hasToken) {
        toast.success('As notificações já estão ativadas no seu aparelho!')
        return
      }

      const accepted = await OneSignal.Notifications.requestPermission()
      if (accepted) {
        await new Promise(r => setTimeout(r, 1500))
        const token = OneSignal.User?.PushSubscription?.token || OneSignal.User?.PushSubscription?.id
        if (token) {
          toast.success('Notificações ativadas com sucesso!')
        } else {
          toast.error('Permissão concedida, mas token push não foi gerado. Feche o app, reabra e tente novamente.')
        }
      } else {
        toast.error('A permissão foi negada ou já estava bloqueada nas configurações.')
      }
    } catch (error) {
      toast.error('Erro ao ativar notificações: ' + (error?.message || String(error)))
    }
  }

  if (!clientSession) return null

  return (
    <div className="page-content" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--light-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dark-green)', overflow: 'hidden', flexShrink: 0 }}>
          {avatarPreview
            ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <User size={30} />}
        </div>
        <div>
          <h1 style={{ fontSize: '1.6rem' }}>Meu Perfil</h1>
          <p className="subtitle">Edite seus dados de identificação.</p>
        </div>
      </header>

      <form onSubmit={handleSave}>
        {/* Card de foto */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{
            width: '90px', height: '90px', borderRadius: '50%',
            backgroundColor: 'var(--bg-color)', border: '2px dashed var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
          }}>
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <User size={30} color="var(--text-secondary)" />}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Foto de Perfil</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
              Recomendamos uma imagem quadrada (PNG ou JPG).
            </p>
            <label className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', width: 'auto', fontSize: '0.9rem' }}>
              <Upload size={18} />
              Escolher Imagem
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {/* Card de dados */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome Completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                style={{ marginTop: '0.4rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                style={{ marginTop: '0.4rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Data de Nascimento</label>
              <div style={{ marginTop: '0.4rem' }}>
                <BirthdateInput value={birthDate} onChange={setBirthDate} />
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={saving || !hasChanges}
          style={{ width: '100%', marginBottom: '1.5rem' }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </form>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', border: '1px solid var(--primary-green)', backgroundColor: 'var(--light-green)' }}>
        <div>
          <h3 style={{ color: 'var(--dark-green)' }}>Notificações Push</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Ative para ser avisado sobre seus agendamentos.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePushPermission}
          style={{ padding: '0.6rem 1.2rem', background: '#e8f5e9', border: '1px solid var(--primary-green)', color: 'var(--dark-green)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Ativar Avisos
        </button>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button
          type="button"
          onClick={handleLogout}
          style={{ width: '100%', padding: '1rem', backgroundColor: '#ffebee', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '8px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
        >
          <LogOut size={20} /> Sair da minha conta
        </button>
      </div>
    </div>
  )
}

export default ClientProfile
