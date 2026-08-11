import React, { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LogOut, User, Upload, Bell } from 'lucide-react'
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
          try {
            await OneSignal.login(clientSession.client_id)
          } catch {
            try {
              await OneSignal.logout()
              await OneSignal.login(clientSession.client_id)
            } catch {
              toast.error('Não foi possível vincular este aparelho. Feche o app, reabra e tente novamente.')
              return
            }
          }
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
    <div className="page-content ds-animate-fade-up" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '54px', height: '54px', borderRadius: '50%', backgroundColor: 'var(--ds-primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-primary)', overflow: 'hidden', flexShrink: 0 }}>
          {avatarPreview
            ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <User size={26} />}
        </div>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '600', color: 'var(--ds-text)', margin: '0 0 2px 0', letterSpacing: '-0.02em' }}>Meu Perfil</h1>
          <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', margin: 0 }}>Edite seus dados de identificação.</p>
        </div>
      </header>

      <form onSubmit={handleSave}>
        {/* Card de foto */}
        <div className="ds-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px', marginBottom: '16px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            backgroundColor: 'var(--ds-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
          }}>
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <User size={28} style={{ color: 'var(--ds-text-3)' }} />}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: 'var(--ds-text)', fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0' }}>Foto de Perfil</h3>
            <p style={{ color: 'var(--ds-text-2)', fontSize: '12px', margin: '0 0 10px 0' }}>
              Recomendamos uma imagem quadrada (PNG ou JPG).
            </p>
            <label className="ds-btn ds-btn-outline ds-btn-pill" style={{ cursor: 'pointer', padding: '6px 14px', fontSize: '12px' }}>
              <Upload size={14} />
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
        <div className="ds-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="ds-field" style={{ margin: 0 }}>
              <label className="ds-label">Nome Completo</label>
              <input
                type="text"
                className="ds-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="ds-field" style={{ margin: 0 }}>
              <label className="ds-label">WhatsApp</label>
              <input
                type="tel"
                className="ds-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div className="ds-field" style={{ margin: 0 }}>
              <label className="ds-label">Data de Nascimento</label>
              <div style={{ marginTop: '2px' }}>
                <BirthdateInput value={birthDate} onChange={setBirthDate} />
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill"
          disabled={saving || !hasChanges}
          style={{ marginBottom: '16px', padding: '12px 24px', fontSize: '15px' }}
        >
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </form>

      {/* Card Notificações Push */}
      <div className="ds-card ds-card-surface-2" style={{ padding: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ color: 'var(--ds-text)', fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Bell size={16} style={{ color: 'var(--ds-primary)' }} /> Notificações Push
          </h3>
          <p style={{ color: 'var(--ds-text-2)', fontSize: '12px', margin: 0 }}>
            Receba lembretes automáticos sobre seus agendamentos.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePushPermission}
          className="ds-btn ds-btn-soft ds-btn-pill"
          style={{ padding: '8px 14px', fontSize: '12px' }}
        >
          Ativar Avisos
        </button>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={handleLogout}
          className="ds-btn ds-btn-danger ds-btn-full ds-btn-pill"
          style={{ padding: '12px', fontSize: '14px' }}
        >
          <LogOut size={16} /> Sair da minha conta
        </button>
      </div>
    </div>
  )
}

export default ClientProfile
