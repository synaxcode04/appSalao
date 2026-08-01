import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientSession } from '../../contexts/ClientSessionContext'

// Editar nome do cliente requer nova action "update" na /api/client-identity (devops).
// Enquanto isso, exibimos apenas os dados da sessão leve sem formulário de edição.

function ClientProfile() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { clientSession, logout } = useClientSession()

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

      if (OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.optedIn) {
        toast.success('As notificações já estão ativadas no seu aparelho!')
        return
      }

      const accepted = await OneSignal.Notifications.requestPermission()
      if (accepted) {
        toast.success('Notificações ativadas com sucesso!')
      } else {
        toast.error('A permissão foi negada ou já estava bloqueada nas configurações.')
      }
    } catch (error) {
      toast.error('Erro: ' + error.message)
    }
  }

  if (!clientSession) return null

  return (
    <div className="page-content" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--light-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dark-green)' }}>
          <User size={30} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.6rem' }}>Meu Perfil</h1>
          <p className="subtitle">Seus dados de identificação.</p>
        </div>
      </header>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome Completo</label>
            <p style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.4rem', background: 'var(--bg-color)' }}>
              {clientSession.full_name}
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>WhatsApp</label>
            <p style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.4rem', background: 'var(--bg-color)' }}>
              {clientSession.phone}
            </p>
          </div>

          {/* TODO (devops): para permitir edição do nome, adicionar action "update" na /api/client-identity */}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Para alterar seus dados, entre em contato com o salão.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', border: '1px solid var(--primary-green)', backgroundColor: 'var(--light-green)' }}>
        <div>
          <h3 style={{ color: 'var(--dark-green)' }}>Notificações Push</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Ative para ser avisado sobre seus agendamentos.
          </p>
        </div>
        <button
          onClick={handlePushPermission}
          style={{ padding: '0.6rem 1.2rem', background: '#e8f5e9', border: '1px solid var(--primary-green)', color: 'var(--dark-green)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Ativar Avisos
        </button>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button
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
