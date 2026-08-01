import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { Star, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'

function OwnerReviews() {
  const { salon } = useOutletContext()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Controle de formulário de resposta
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (salon) {
      fetchReviews()
    }
  }, [salon])

  const fetchReviews = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('reviews')
      .select('id, rating, comment, owner_reply, created_at, profiles(full_name)')
      .eq('salon_id', salon.id)
      .order('created_at', { ascending: false })

    if (data) setReviews(data)
    setLoading(false)
  }

  const handleOpenReply = (review) => {
    setReplyingTo(review.id)
    setReplyText(review.owner_reply || '')
  }

  const handleSubmitReply = async (reviewId) => {
    if (!replyText.trim()) {
      toast.error("A resposta não pode estar vazia.")
      return
    }

    setSubmitting(true)
    const { error } = await supabase
      .from('reviews')
      .update({ owner_reply: replyText })
      .eq('id', reviewId)

    setSubmitting(false)

    if (error) {
      toast.error("Erro ao enviar resposta: " + error.message)
    } else {
      setReplyingTo(null)
      fetchReviews() // Recarrega a lista
    }
  }

  if (!salon) return <div>Carregando...</div>

  // Calcular média de avaliação do salão
  let avgRating = 0
  if (reviews.length > 0) {
    const sum = reviews.reduce((acc, curr) => acc + curr.rating, 0)
    avgRating = (sum / reviews.length).toFixed(1)
  }

  return (
    <div className="page-content">
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Star size={24} fill="#ffb400" color="#ffb400" /> Avaliações
        </h1>
        <p className="subtitle">Veja o que seus clientes dizem e responda aos comentários.</p>
      </header>

      {/* Resumo da Nota */}
      <section className="dashboard-cards" style={{ marginBottom: '2rem' }}>
        <div className="card stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Nota Média</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '2.5rem', fontWeight: 'bold', color: '#ffb400' }}>
            {avgRating} <Star size={32} fill="#ffb400" />
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Baseado em {reviews.length} avaliações</p>
        </div>
      </section>

      {/* Lista de Avaliações */}
      <section>
        {loading ? (
          <p>Buscando avaliações...</p>
        ) : reviews.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <MessageSquare size={40} color="var(--border-color)" style={{ marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Seu salão ainda não recebeu nenhuma avaliação.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {reviews.map(review => (
              <div key={review.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Header da Avaliação */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                      {review.profiles?.full_name || 'Cliente Oculto'}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {new Date(review.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.2rem' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star key={star} size={16} fill={star <= review.rating ? "#ffb400" : "none"} color={star <= review.rating ? "#ffb400" : "var(--border-color)"} />
                    ))}
                  </div>
                </div>

                {/* Comentário do Cliente */}
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', color: 'var(--text-primary)', fontStyle: review.comment ? 'normal' : 'italic' }}>
                  {review.comment || 'Nenhum comentário por escrito.'}
                </div>

                {/* Área de Resposta do Proprietário */}
                {replyingTo === review.id ? (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escreva sua resposta para o cliente..."
                      style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--primary-green)', minHeight: '80px' }}
                      autoFocus
                    ></textarea>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button className="btn-secondary" onClick={() => setReplyingTo(null)} style={{ width: 'auto', padding: '0.5rem 1rem' }}>Cancelar</button>
                      <button className="btn-primary" onClick={() => handleSubmitReply(review.id)} disabled={submitting} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
                        {submitting ? 'Salvando...' : 'Salvar Resposta'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {review.owner_reply && (
                      <div style={{ marginLeft: '1rem', padding: '1rem', borderLeft: '4px solid var(--primary-green)', backgroundColor: 'var(--light-green)', borderRadius: '0 8px 8px 0' }}>
                        <strong style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--dark-green)', fontSize: '0.9rem' }}>Sua Resposta:</strong>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{review.owner_reply}</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => handleOpenReply(review)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: 'none', color: 'var(--primary-green)', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        <MessageSquare size={16} /> 
                        {review.owner_reply ? 'Editar Resposta' : 'Responder Cliente'}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

export default OwnerReviews
