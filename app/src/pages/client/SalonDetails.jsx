import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { ArrowLeft, MapPin, Home } from 'lucide-react'
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

  if (loading) return <div style={{ padding: '2rem' }}>Carregando salão...</div>

  return (
    <div className="page-content" style={{ paddingBottom: '100px' }}>
      
      {/* Botões do Topo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button 
          onClick={() => navigate(-1)} 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500' }}
        >
          <ArrowLeft size={18} /> Voltar
        </button>

        {profile && profile.role === 'client' && (
          <button
            onClick={() => navigate(`/s/${slug}/agenda`)}
            className="btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            <Home size={16} /> Início
          </button>
        )}
      </div>

      {/* Cabeçalho do Salão */}
      <div className="card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'var(--light-green)', flexShrink: 0 }}>
          {salon.logo_url ? (
            <img src={salon.logo_url} alt={salon.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dark-green)', fontWeight: 'bold', fontSize: '2rem' }}>
              {salon.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>{salon.name}</h1>
          <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
            <MapPin size={16} /> {salon.address || 'Endereço não informado'}
          </p>
        </div>
      </div>

      {/* Saudação Personalizada */}
      {(profile || clientSession) && (
        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: 'var(--light-green)', borderRadius: '12px', borderLeft: '4px solid var(--primary-green)' }}>
          <h3 style={{ color: 'var(--dark-green)', margin: 0, fontSize: '1.1rem' }}>
            Olá, {(profile?.full_name || clientSession?.full_name)?.split(' ')[0]}!
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.95rem' }}>
            Seja bem-vindo(a) ao {salon.name}.
          </p>
        </div>
      )}

      {/* CTA que abre o wizard de agendamento (4 etapas) */}
      {services.length === 0 ? (
        <>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Serviços Disponíveis</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Este salão ainda não cadastrou nenhum serviço.</p>
        </>
      ) : (
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }}
          onClick={() => setWizardOpen(true)}
        >
          Agendar Horário
        </button>
      )}

      <BookingWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        services={services}
        salonId={salon.id}
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
