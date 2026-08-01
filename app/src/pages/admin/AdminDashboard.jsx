import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Search, DollarSign, Calendar, Lock, Unlock, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

function AdminDashboard() {
  const [salonList, setSalonList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showOnlyActive, setShowOnlyActive] = useState(true)

  // Modal States
  const [selectedSalon, setSelectedSalon] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [exactDate, setExactDate] = useState('')
  
  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const fetchSalons = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('salons')
      .select(`
        *,
        owner:owner_id(full_name, phone, email)
      `)
      .order('created_at', { ascending: false })

    if (data) setSalonList(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchSalons()
  }, [])

  const filteredSalons = salonList.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.owner?.full_name?.toLowerCase().includes(search.toLowerCase()) ?? false)
    
    if (showOnlyActive) {
      return matchesSearch && s.status !== 'expired'
    }
    return matchesSearch
  })

  const openWhatsApp = (phone) => {
    if (!phone) return
    const numericPhone = phone.replace(/\D/g, '')
    // Se o telefone já tiver 55, não adiciona de novo. Caso contrário, assume Brasil.
    const fullPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`
    window.open(`https://wa.me/${fullPhone}`, '_blank')
  }

  const openPaymentModal = (salon) => {
    setSelectedSalon(salon)
    setPaymentAmount(salon.monthly_fee || 50)
    
    // Se já tiver vencimento, mostra a data, senão pega a data de hoje + 30 dias
    let initialDate = salon.subscription_expires_at ? new Date(salon.subscription_expires_at) : new Date()
    if (!salon.subscription_expires_at) initialDate.setDate(initialDate.getDate() + 30)
    
    // Formata para o input type="date" (YYYY-MM-DD)
    const yyyy = initialDate.getFullYear()
    const mm = String(initialDate.getMonth() + 1).padStart(2, '0')
    const dd = String(initialDate.getDate()).padStart(2, '0')
    setExactDate(`${yyyy}-${mm}-${dd}`)
    
    setShowModal(true)
  }

  const handleRegisterPayment = async (e) => {
    e.preventDefault()
    if (!selectedSalon) return

    // Usa a data exata escolhida no campo
    const newExpiryString = new Date(exactDate + 'T23:59:59').toISOString()

    // 1. Atualizar o Salão
    const { error: salonError } = await supabase
      .from('salons')
      .update({ 
        subscription_expires_at: newExpiryString,
        status: 'active'
      })
      .eq('id', selectedSalon.id)

    if (salonError) {
      toast.error('Erro ao atualizar salão: ' + salonError.message)
      return
    }

    // 2. Registrar no Extrato
    const { error: paymentError } = await supabase
      .from('payments')
      .insert([{
        salon_id: selectedSalon.id,
        amount: parseFloat(paymentAmount),
        description: `Renovação manual. Novo vencimento: ${new Date(newExpiryString).toLocaleDateString('pt-BR')}`
      }])

    if (paymentError) {
      toast.error('Erro ao registrar extrato: ' + paymentError.message)
    } else {
      toast.success('Pagamento registrado e licença renovada com sucesso!')
      setShowModal(false)
      fetchSalons()
    }
  }

  const toggleBlockStatus = async (salon) => {
    const newStatus = salon.status === 'active' ? 'expired' : 'active'
    const confirmMsg = newStatus === 'active' 
      ? `Deseja ATIVAR o salão ${salon.name}?` 
      : `Deseja BLOQUEAR o salão ${salon.name}?`
      
    if (!window.confirm(confirmMsg)) return

    const { error } = await supabase
      .from('salons')
      .update({ status: newStatus })
      .eq('id', salon.id)

    if (!error) {
      fetchSalons()
    }
  }

  const handleResetPassword = async (email) => {
    if (!email) {
      toast.error("Este salão não tem e-mail salvo no perfil. Só funciona para novos cadastros ou se você atualizar via banco.")
      return
    }
    
    const confirmMsg = `Deseja enviar um e-mail de redefinição de senha para ${email}?`
    if (!window.confirm(confirmMsg)) return

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    })

    if (error) {
      toast.error("Erro ao enviar e-mail: " + error.message)
    } else {
      toast.success("E-mail de redefinição enviado com sucesso para " + email)
    }
  }

  const openHistoryModal = async (salon) => {
    setSelectedSalon(salon)
    setShowHistoryModal(true)
    setLoadingHistory(true)
    
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('salon_id', salon.id)
      .order('payment_date', { ascending: false })
      
    if (data) setPaymentHistory(data)
    setLoadingHistory(false)
  }

  return (
    <div className="admin-dashboard-container">
      <style>{`
        .admin-dashboard-container {
          padding: 1rem;
        }
        .header-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .table-wrapper {
          background-color: #fff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          overflow-x: auto;
        }
        .actions-cell {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: flex-end;
        }
        @media (max-width: 768px) {
          .header-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .actions-cell {
            justify-content: flex-start;
          }
        }
      `}</style>
      <div className="header-actions">
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#1e293b', marginBottom: '0.5rem' }}>Gestão de Licenças</h1>
          <p style={{ color: '#64748b' }}>Controle pagamentos e acessos dos salões assinantes.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#475569', fontSize: '0.9rem' }}>
            <input 
              type="checkbox" 
              checked={showOnlyActive}
              onChange={e => setShowOnlyActive(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Somente Ativos
          </label>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input 
              type="text" 
              placeholder="Buscar por salão ou dono..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p>Carregando salões...</p>
      ) : (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '1rem', color: '#475569', fontWeight: '600' }}>Salão</th>
                <th style={{ padding: '1rem', color: '#475569', fontWeight: '600' }}>Proprietário</th>
                <th style={{ padding: '1rem', color: '#475569', fontWeight: '600' }}>Vencimento</th>
                <th style={{ padding: '1rem', color: '#475569', fontWeight: '600' }}>Status</th>
                <th style={{ padding: '1rem', color: '#475569', fontWeight: '600', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredSalons.map(salon => {
                const isExpired = salon.subscription_expires_at && new Date(salon.subscription_expires_at) < new Date()
                const isBlocked = salon.status === 'expired'
                const badgeColor = isBlocked || isExpired ? '#ef4444' : '#10b981'
                const badgeBg = isBlocked || isExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'

                return (
                  <tr key={salon.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '1rem' }}>
                      <strong style={{ color: '#1e293b', display: 'block' }}>{salon.name}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>ID: {salon.id.substring(0,8)}</span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ display: 'block', color: '#334155' }}>{salon.owner?.full_name || 'Desconhecido'}</span>
                      <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {salon.owner?.phone}
                        {salon.owner?.phone && (
                          <button 
                            onClick={() => openWhatsApp(salon.owner.phone)}
                            style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            title="Chamar no WhatsApp"
                          >
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.062-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                          </button>
                        )}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block' }}>{salon.owner?.email || 'Sem e-mail salvo'}</span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {salon.subscription_expires_at 
                        ? new Date(salon.subscription_expires_at).toLocaleDateString('pt-BR')
                        : 'Sem data'}
                      {isExpired && <span style={{ color: '#ef4444', fontSize: '0.8rem', display: 'block' }}>Vencido</span>}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', color: isBlocked ? '#ef4444' : '#10b981' }}>
                        <input 
                          type="checkbox" 
                          checked={!isBlocked}
                          onChange={() => toggleBlockStatus(salon)}
                          style={{ cursor: 'pointer' }}
                        />
                        {isBlocked ? 'Inativo' : 'Ativo'}
                      </label>
                    </td>
                    <td style={{ padding: '1rem' }} className="actions-cell">
                      <button 
                        onClick={() => openHistoryModal(salon)}
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                        title="Ver Extrato de Pagamentos"
                      >
                        Ver Extrato
                      </button>

                      <button 
                        onClick={() => openPaymentModal(salon)}
                        style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                        title="Lançar Pagamento"
                      >
                        Renovar
                      </button>

                      <button 
                        onClick={() => handleResetPassword(salon.owner?.email)}
                        style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                        title="Enviar Link de Redefinição de Senha"
                      >
                        Resetar Senha
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredSalons.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Nenhum salão encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Pagamento */}
      {showModal && selectedSalon && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>Registrar Pagamento</h2>
            <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Alterando a licença de <strong>{selectedSalon.name}</strong>.
            </p>
            
            <form onSubmit={handleRegisterPayment}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Valor Recebido (R$)</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Data de Vencimento</label>
                <input 
                  type="date"
                  required
                  value={exactDate}
                  onChange={e => setExactDate(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'transparent', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Histórico */}
      {showHistoryModal && selectedSalon && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', color: '#1e293b' }}>Extrato de Pagamentos</h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{selectedSalon.name}</p>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', color: '#475569' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              {loadingHistory ? (
                <p style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Carregando extrato...</p>
              ) : paymentHistory.length === 0 ? (
                <p style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Nenhum pagamento registrado ainda.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '0.8rem 1rem', color: '#475569', fontWeight: '600' }}>Data</th>
                      <th style={{ padding: '0.8rem 1rem', color: '#475569', fontWeight: '600' }}>Valor</th>
                      <th style={{ padding: '0.8rem 1rem', color: '#475569', fontWeight: '600' }}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map(payment => (
                      <tr key={payment.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.8rem 1rem' }}>{new Date(payment.payment_date).toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '0.8rem 1rem', color: '#10b981', fontWeight: 'bold' }}>R$ {parseFloat(payment.amount).toFixed(2).replace('.', ',')}</td>
                        <td style={{ padding: '0.8rem 1rem', color: '#475569' }}>{payment.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
