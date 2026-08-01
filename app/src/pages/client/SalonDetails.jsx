import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { ArrowLeft, Clock, MapPin, Star, MessageSquare, Home } from 'lucide-react'
import BookingEngine from '../../components/BookingEngine'
import { useClientSession } from '../../contexts/ClientSessionContext'
import toast from 'react-hot-toast'

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

  // Reviews States
  const [reviews, setReviews] = useState([])
  const [newRating, setNewRating] = useState(5)
  const [newComment, setNewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Booking Modal States
  const [selectedService, setSelectedService] = useState(null)
  const [isBookingOpen, setIsBookingOpen] = useState(false)

  const [canReview, setCanReview] = useState(false)

  // mountedRef persists across renders so avulsa calls (outside useEffect) can
  // also check whether the component is still mounted before calling setState.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      if (mounted) checkReviewEligibility(mounted)
      await fetchSalonAndServices(mounted)
    }

    fetchData()
    return () => { mounted = false }
  }, [id])

  const checkReviewEligibility = async (mounted) => {
    if (!clientSession?.client_id) return

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_history', salon_id: id, client_id: clientSession.client_id })
    })
    if (mounted && res.ok) {
      const data = await res.json()
      if (data.appointments && data.appointments.length > 0) setCanReview(true)
    }
  }

  const fetchSalonAndServices = async (mounted = true) => {
    if (mounted) setLoading(true)

    // Buscar Avaliações
    const { data: reviewsData } = await supabase
      .from('reviews')
      .select('id, rating, comment, owner_reply, created_at, clients(full_name)')
      .eq('salon_id', id)
      .order('created_at', { ascending: false })

    if (!mounted) return

    if (reviewsData) setReviews(reviewsData)

    // Buscar Serviços
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .eq('salon_id', id)
      .order('price', { ascending: true })

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

  const handleOpenBooking = (service) => {
    setSelectedService(service)
    setIsBookingOpen(true)
  }

  const handleBookingSuccess = () => {
    setIsBookingOpen(false)
    navigate(`/s/${slug}/agenda`)
  }

  const handleSubmitReview = async (e) => {
    e.preventDefault()
    if (!clientSession?.client_id) {
      toast.error('Identifique-se para enviar uma avaliação.')
      return
    }
    if (!newRating) return
    setSubmittingReview(true)

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_review', salon_id: id, client_id: clientSession.client_id, rating: newRating, comment: newComment })
    })

    setSubmittingReview(false)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error('Erro ao enviar avaliação: ' + (err.error || 'Tente novamente.'))
    } else {
      toast.success('Avaliação enviada com sucesso!')
      
      // Filtro Inteligente: Redireciona para o Google Meu Negócio se nota for alta e o salão tiver o link
      if (newRating >= 4 && salon.google_review_link) {
        if (window.confirm('Ficamos felizes que adorou! Nos ajudaria muito se pudesse avaliar também no Google. Deseja ir para lá agora?')) {
          window.open(salon.google_review_link, '_blank')
        }
      }

      setNewRating(5)
      setNewComment('')
      fetchSalonAndServices(mountedRef.current) // Recarrega para mostrar a nova
    }
  }

  // Calculando a média de estrelas para o cabeçalho
  let avgRating = 0
  if (reviews.length > 0) {
    const sum = reviews.reduce((acc, curr) => acc + curr.rating, 0)
    avgRating = (sum / reviews.length).toFixed(1)
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
          {reviews.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.4rem', color: '#ffb400', fontWeight: 'bold' }}>
              <Star size={16} fill="#ffb400" /> {avgRating} ({reviews.length} avaliações)
            </div>
          )}
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

      {/* Lista de Serviços */}
      <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Serviços Disponíveis</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {services.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Este salão ainda não cadastrou nenhum serviço.</p>
        ) : (
          services.map(service => (
            <div key={service.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
              <div>
                <h3 style={{ color: 'var(--dark-green)', marginBottom: '0.2rem' }}>{service.name}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={14} /> {service.duration_minutes} min
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  R$ {Number(service.price).toFixed(2).replace('.', ',')}
                </span>
                <button 
                  className="btn-primary" 
                  style={{ padding: '0.6rem 1.2rem', width: 'auto' }}
                  onClick={() => handleOpenBooking(service)}
                >
                  Agendar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Avaliações e Comentários */}
      <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <MessageSquare size={20} /> O que os clientes dizem
      </h2>

      {/* Formulário para Nova Avaliação */}
      {canReview ? (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', backgroundColor: 'var(--bg-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Deixe sua avaliação</h3>
          <form onSubmit={handleSubmitReview}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <Star 
                  key={star} 
                  size={24} 
                  fill={star <= newRating ? "#ffb400" : "none"} 
                  color={star <= newRating ? "#ffb400" : "var(--border-color)"}
                  style={{ cursor: 'pointer', transition: '0.2s' }}
                  onClick={() => setNewRating(star)}
                />
              ))}
            </div>
            <textarea 
              placeholder="Conte como foi sua experiência no salão..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', minHeight: '80px', marginBottom: '1rem' }}
            ></textarea>
            <button type="submit" className="btn-primary" disabled={submittingReview} style={{ width: 'auto', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}>
              {submittingReview ? 'Enviando...' : 'Enviar Avaliação'}
            </button>
          </form>
        </div>
      ) : (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', backgroundColor: '#f1f5f9', borderLeft: '4px solid #cbd5e1', color: 'var(--text-secondary)' }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>Você precisa concluir um serviço neste salão para deixar uma avaliação.</p>
        </div>
      )}

      {/* Lista de Avaliações */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {reviews.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Nenhuma avaliação ainda. Seja o primeiro a avaliar!</p>
        ) : (
          reviews.map(review => (
            <div key={review.id} className="card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ color: 'var(--dark-green)' }}>{review.clients?.full_name || 'Cliente Oculto'}</strong>
                <div style={{ display: 'flex', gap: '0.2rem' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star key={star} size={14} fill={star <= review.rating ? "#ffb400" : "none"} color={star <= review.rating ? "#ffb400" : "var(--border-color)"} />
                  ))}
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.4' }}>
                {review.comment || <em>Sem comentário.</em>}
              </p>
              
              {review.owner_reply && (
                <div style={{ marginTop: '1rem', marginLeft: '1rem', padding: '1rem', borderLeft: '4px solid var(--primary-green)', backgroundColor: 'var(--light-green)', borderRadius: '0 8px 8px 0' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', color: 'var(--dark-green)', fontSize: '0.85rem' }}>
                    <MessageSquare size={14} /> Resposta do Salão
                  </strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{review.owner_reply}</p>
                </div>
              )}

              <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: '#999' }}>
                {new Date(review.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
          ))
        )}
      </div>

      <BookingEngine
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        salonId={salon.id}
        service={selectedService}
        services={services}
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
