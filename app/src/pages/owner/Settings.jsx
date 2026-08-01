import React, { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { Upload, Image as ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'

function SettingsPage() {
  const { salon, refreshSalon } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [name, setName] = useState(salon?.name || '')
  const [address, setAddress] = useState(salon?.address || '')
  const [googleReviewLink, setGoogleReviewLink] = useState(salon?.google_review_link || '')
  
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (salon && salon.owner_id) {
      fetchOwnerData()
    }
  }, [salon])

  const fetchOwnerData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setEmail(user.email)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', salon.owner_id)
      .single()
    
    if (profileData) setPhone(profileData.phone || '')
  }

  const handleUpdateInfo = async (e) => {
    e.preventDefault()
    if (!salon) return
    setLoading(true)

    let lat = salon.latitude
    let lng = salon.longitude

    // Se o endereço foi alterado ou ainda não tem coordenadas, busca na API
    if (address && address !== salon.address) {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        const data = await response.json()
        if (data && data.length > 0) {
          lat = parseFloat(data[0].lat)
          lng = parseFloat(data[0].lon)
        } else {
          toast.error('Aviso: Não conseguimos encontrar esse endereço no mapa. As coordenadas não foram atualizadas.')
        }
      } catch (error) {
        console.error('Erro na geocodificação:', error)
      }
    }

    const payload = { 
      name, 
      address,
      latitude: lat,
      longitude: lng,
      google_review_link: googleReviewLink || null
    }

    const { error: updateError } = await supabase.from('salons').update(payload).eq('id', salon.id)
    
    if (updateError) {
      if (updateError.message.includes('google_review_link')) {
        toast.error('Erro: A coluna "google_review_link" não existe na tabela "salons" no Supabase. Crie-a primeiro!')
        setLoading(false)
        return
      }
      toast.error('Erro ao atualizar: ' + updateError.message)
      setLoading(false)
      return
    }

    await supabase.from('profiles').update({ phone }).eq('id', salon.owner_id)

    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.email !== email) {
      const { error: authError } = await supabase.auth.updateUser({ email })
      if (authError) {
        toast.error('Erro ao atualizar e-mail: ' + authError.message)
      } else {
        toast.success('E-mail atualizado! Verifique a caixa de entrada para confirmar.')
      }
    }

    await refreshSalon()
    
    toast.success('Informações atualizadas com sucesso!')
    setLoading(false)
  }

  const handleFileUpload = async (e) => {
    try {
      setUploading(true)
      const file = e.target.files[0]
      if (!file) return

      const fileExt = file.name.split('.').pop()
      const fileName = `${salon.id}-${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      // 1. Fazer o Upload para o Storage
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      // 2. Pegar a URL pública da imagem
      const { data: publicUrlData } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath)

      const logoUrl = publicUrlData.publicUrl

      // 3. Atualizar a tabela salons com a nova URL
      await supabase.from('salons').update({ logo_url: logoUrl }).eq('id', salon.id)
      
      // 4. Atualizar o layout
      await refreshSalon()
      toast.success('Logo atualizado com sucesso!')

    } catch (error) {
      toast.error('Erro ao enviar imagem: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  if (!salon) return <div>Carregando...</div>

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Configurações do Salão</h1>
        <p className="subtitle">Personalize a marca e as informações do seu negócio.</p>
      </header>

      <div className="dashboard-cards" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Card do Link Exclusivo (Multi-tenant) */}
        <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--light-green)', border: '1px solid var(--primary-green)' }}>
          <h3 style={{ color: 'var(--dark-green)' }}>Seu Link de Agendamento</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Compartilhe este link com seus clientes via WhatsApp, Instagram, etc. Os clientes acessarão o seu sistema diretamente por ele.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              readOnly 
              value={`${window.location.origin}/${salon.id}-${salon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'var(--text-primary)' }}
            />
            <button 
              className="btn-primary" 
              style={{ width: 'auto', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/${salon.id}-${salon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
                toast.success('Link copiado para a área de transferência!')
              }}
            >
              Copiar
            </button>
          </div>
        </div>

        {/* Card de Notificações */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Notificações Push</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Ative para receber avisos de novos agendamentos e cancelamentos.
            </p>
          </div>
          <button 
            onClick={async () => {
              try {
                const OneSignal = window.OneSignal;
                if (!OneSignal) {
                  toast.error("O sistema de notificações ainda está carregando. Tente novamente em 2 segundos.");
                  return;
                }
                
                if (OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.optedIn) {
                  toast.success("As notificações já estão ativadas no seu aparelho!");
                  return;
                }
                
                // Dispara o prompt nativo
                const accepted = await OneSignal.Notifications.requestPermission();
                if (accepted) {
                  toast.success("Notificações ativadas com sucesso!");
                } else {
                  toast.error("A permissão foi negada ou já estava bloqueada nas configurações.");
                }
              } catch (error) {
                toast.error("Erro: " + error.message);
              }
            }}
            style={{ padding: '0.6rem 1.2rem', background: '#e8f5e9', border: '1px solid var(--primary-green)', color: 'var(--dark-green)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
          >
            Ativar Notificações
          </button>
        </div>

        {/* Card do Logo */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
          <div style={{ 
            width: '90px', height: '90px', borderRadius: '50%', 
            backgroundColor: 'var(--bg-color)', border: '2px dashed var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
          }}>
            {salon.logo_url ? (
              <img src={salon.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <ImageIcon size={30} color="var(--text-secondary)" />
            )}
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Logotipo do Salão</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
              Recomendamos uma imagem quadrada (PNG ou JPG) de até 2MB.
            </p>
            
            <label className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', width: 'auto', fontSize: '0.9rem' }}>
              <Upload size={18} />
              {uploading ? 'Enviando...' : 'Escolher Imagem'}
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileUpload} 
                style={{ display: 'none' }}
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        {/* Card de Informações */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ color: 'var(--text-primary)' }}>Informações Básicas</h3>
          <form onSubmit={handleUpdateInfo} className="auth-form" style={{ marginTop: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome do Salão</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required 
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Telefone (WhatsApp)</label>
              <input 
                type="tel" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required 
              />
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>E-mail (Login)</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Este é o e-mail usado para acessar sua conta.
              </p>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Endereço Completo (Para clientes te acharem no Mapa)</label>
              <textarea 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Rua das Flores, 123, Centro, Belo Horizonte - MG"
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', minHeight: '80px', marginTop: '0.5rem', fontFamily: 'inherit' }}
                required 
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                O sistema buscará automaticamente as coordenadas GPS deste endereço quando você salvar.
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Link de Avaliação do Google Meu Negócio</label>
              <input 
                type="url" 
                value={googleReviewLink}
                onChange={(e) => setGoogleReviewLink(e.target.value)}
                placeholder="Ex: https://g.page/r/Cdfg34.../review"
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Se preenchido, pediremos para clientes que derem 4 ou 5 estrelas avaliarem também no Google.
              </p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '1rem' }}>
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}

export default SettingsPage
