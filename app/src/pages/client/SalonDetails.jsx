import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { MapPin, Home, Calendar, Sparkles } from 'lucide-react'
import BookingWizard from '../../components/BookingWizard'
import { useClientSession } from '../../contexts/ClientSessionContext'

function SalonDetails() {
  // Salão e perfil vêm do SalonLayout (resolução de slug, bloqueio de licença e
  // injeção de manifest são responsabilidade do layout pai).
  const { salon, profile } = useOutletContext()
  const { clientSession, loginByPhone } = useClientSession()
  const { slug } = useParams()
  const navigate = useNavigate()

  const id = salon.id

  const [services, setServices] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    fetchSalonAndServices(mounted)
    return () => { mounted = false }
  }, [id])

  const fetchSalonAndServices = async (mounted = true) => {
    if (mounted) setLoading(true)

    // Buscar Serviços
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .eq('salon_id', id)
      .order('name', { ascending: true })

    if (!mounted) return

    if (servicesData) setServices(servicesData)

    // Buscar Profissionais
    const { data: profsData } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('salon_id', id)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (!mounted) return

    if (profsData) setProfessionals(profsData)
    setLoading(false)
  }

  const handleBookingSuccess = () => {
    navigate(`/s/${slug}/agenda`)
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <span className="ds-badge ds-badge-primary">Carregando salão...</span>
      </div>
    )
  }

  const clientFirstName = (profile?.full_name || clientSession?.full_name)?.split(' ')[0]

  return (
    <div className="page-content ds-animate-fade-up" style={{ paddingBottom: '100px' }}>
      
      {/* Navigation Controls */}
      {profile && profile.role === 'client' && (
        <div className="salon-nav-controls">
          <button
            onClick={() => navigate(`/s/${slug}/agenda`)}
            className="ds-btn ds-btn-outline ds-btn-pill"
          >
            <Home size={15} /> Início
          </button>
        </div>
      )}

      {/* Navbar de Identidade do Salão */}
      <div className="client-salon-navbar">
        <div className="salon-avatar">
          {salon.logo_url ? (
            <img src={salon.logo_url} alt={salon.name} />
          ) : (
            <span>{salon.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="salon-info">
          <h1 className="salon-name">{salon.name}</h1>
          <p className="salon-address">
            <MapPin size={13} />
            <span>{salon.address || 'Endereço não informado'}</span>
          </p>
        </div>
      </div>

      {/* Saudação Personalizada */}
      {clientFirstName && (
        <div className="ds-card ds-card-surface-2" style={{ marginBottom: '20px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Sparkles size={16} style={{ color: 'var(--ds-primary)' }} />
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ds-text)' }}>
              Olá, {clientFirstName}!
            </span>
          </div>
          <p style={{ color: 'var(--ds-text-2)', fontSize: '13px', margin: 0 }}>
            Seja bem-vindo(a) ao {salon.name}. Escolha o melhor dia e horário para o seu atendimento.
          </p>
        </div>
      )}

      {/* Ação Principal de Agendamento */}
      {services.length === 0 ? (
        <div className="ds-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: 'var(--ds-text)' }}>Serviços Disponíveis</h2>
          <p style={{ color: 'var(--ds-text-3)', fontSize: '13px', margin: 0 }}>Este salão ainda não cadastrou nenhum serviço.</p>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--ds-text)', margin: '0 0 6px 0' }}>
              Pronto para agendar seu horário?
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', margin: 0 }}>
              {services.length} {services.length === 1 ? 'serviço disponível' : 'serviços disponíveis'} para você escolher.
            </p>
          </div>
          <button
            type="button"
            className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill"
            style={{ padding: '14px 24px', fontSize: '15px' }}
            onClick={() => setWizardOpen(true)}
          >
            <Calendar size={18} /> Agendar Horário Agora
          </button>
        </div>
      )}

      <BookingWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        services={services}
        salonId={salon.id}
        salonName={salon.name}
        salonAddress={salon.address || ''}
        salonLogoUrl={salon.logo_url || ''}
        clientId={clientSession?.client_id ?? null}
        clientName={clientSession?.full_name || profile?.full_name || 'Cliente'}
        professionals={professionals}
        onSuccess={handleBookingSuccess}
        loginByPhone={loginByPhone}
        slotIntervalMinutes={salon?.slot_interval_minutes ?? null}
      />

    </div>
  )
}

export default SalonDetails
