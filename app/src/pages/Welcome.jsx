import React, { useEffect } from 'react'
import { Scissors, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function Welcome() {
  const navigate = useNavigate()

  useEffect(() => {
    const checkUser = async () => {
      // Verifica se está rodando em um ambiente de Aplicativo (APK / PWA / Capacitor / Cordova)
      const isApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || window.Capacitor || window.cordova || document.referrer.includes('android-app://')
      
      // Se for web normal (navegador), não faz auto-login. Deixa o usuário na tela de Bem-vindo.
      if (!isApp) return

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Busca o perfil para saber se é owner ou client
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
          
        if (profile) {
          if (profile.role === 'owner') navigate('/painel')
          else if (profile.role === 'client') navigate('/cliente')
        }
      }
    }
    checkUser()
  }, [navigate])


  return (
    <div className="landing-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', color: '#1e293b' }}>
      
      {/* Navbar Simple */}
      <header style={{ padding: '0.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)', backgroundColor: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--primary-green)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: '70px', objectFit: 'contain' }} />
          <span>appSalão</span>
        </div>
        <button 
          style={{ background: 'transparent', border: '1px solid var(--primary-green)', color: 'var(--primary-green)', borderRadius: '8px', padding: '0.5rem 1rem', fontWeight: '500', cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' }}
          onClick={() => navigate('/login?role=owner')}
          onMouseOver={(e) => { e.currentTarget.style.background = 'var(--primary-green)'; e.currentTarget.style.color = '#fff' }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--primary-green)' }}
        >
          Entrar
        </button>
      </header>

      {/* Hero Section */}
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 2rem 1.5rem 2rem', textAlign: 'center', position: 'relative', overflow: 'hidden', backgroundColor: '#ffffff' }}>
        
        {/* Decorative Blur background */}
        <div style={{ position: 'absolute', top: '10%', left: '20%', width: '300px', height: '300px', background: 'var(--primary-green)', filter: 'blur(150px)', opacity: 0.1, zIndex: 0 }}></div>
        <div style={{ position: 'absolute', bottom: '10%', right: '20%', width: '300px', height: '300px', background: '#3b82f6', filter: 'blur(150px)', opacity: 0.05, zIndex: 0 }}></div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px' }}>
          <span style={{ display: 'inline-block', padding: '0.4rem 1rem', background: 'var(--light-green)', color: 'var(--dark-green)', borderRadius: '20px', fontWeight: 'bold', marginBottom: '1.5rem', fontSize: '0.9rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            O sistema definitivo para salões
          </span>
          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: '800', lineHeight: '1.1', marginBottom: '1.5rem', letterSpacing: '-1px', color: '#0f172a' }}>
            Transforme seu salão em um <span style={{ color: 'var(--primary-green)' }}>aplicativo</span>.
          </h1>
          <p style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem auto', lineHeight: '1.6' }}>
            Receba agendamentos 24 horas por dia. Tenha um link exclusivo, sem depender de plataformas caras e com a sua própria marca.
          </p>

          <div className="hero-cta-group">
            <button 
              style={{ background: 'var(--primary-green)', color: '#fff', border: 'none', padding: '1rem 2rem', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.39)', transition: 'all 0.2s' }}
              onClick={() => navigate('/cadastro?role=owner')}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Criar meu App agora
            </button>
            <button 
              style={{ background: 'transparent', color: '#475569', border: '1px solid #cbd5e1', padding: '1rem 2rem', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={() => navigate('/login?role=owner')}
              onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Já tenho uma conta
            </button>
          </div>
        </div>
      </main>

      {/* Planos e Preços */}
      <section style={{ padding: '1.5rem 2rem 3rem 2rem', background: '#ffffff' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: '800', color: '#0f172a', marginBottom: '1.5rem', letterSpacing: '-0.5px' }}>
          Planos e preços
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

          {/* Plano Mensal */}
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center', padding: '1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>Plano Mensal</h3>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a' }}>R$ 29,90</span>
              <span style={{ color: '#475569', fontSize: '0.95rem' }}> /mês</span>
            </div>
            <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '1.25rem', flex: 1 }}>Acesso completo ao sistema, com cobrança mensal.</p>
            <button
              onClick={() => navigate('/cadastro?role=owner&plano=mensal')}
              style={{ background: 'var(--primary-green)', color: '#fff', border: 'none', width: '100%', padding: '0.9rem 1.5rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'block' }}
            >
              Assinar
            </button>
          </div>

          {/* Plano Semestral */}
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center', padding: '1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>Plano Semestral</h3>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a' }}>R$ 149,50</span>
              <span style={{ color: '#475569', fontSize: '0.95rem' }}> / 6 meses</span>
            </div>
            <p style={{ color: 'var(--primary-green)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Pague 5, ganhe 1</p>
            <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '1.25rem', flex: 1 }}>Equivale a 5 mensalidades com 1 mês grátis (~R$ 24,92/mês).</p>
            <button
              onClick={() => navigate('/cadastro?role=owner&plano=semestral')}
              style={{ background: 'var(--primary-green)', color: '#fff', border: 'none', width: '100%', padding: '0.9rem 1.5rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'block' }}
            >
              Assinar
            </button>
          </div>

          {/* Plano Anual (destaque) */}
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center', padding: '1.5rem', background: '#ffffff', borderRadius: '16px', border: '2px solid var(--primary-green)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary-green)', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', padding: '0.3rem 0.9rem', borderRadius: '20px', whiteSpace: 'nowrap' }}>
              Mais vantajoso
            </span>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>Plano Anual</h3>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a' }}>R$ 299,00</span>
              <span style={{ color: '#475569', fontSize: '0.95rem' }}> / 12 meses</span>
            </div>
            <p style={{ color: 'var(--primary-green)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Pague 10, ganhe 2</p>
            <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '1.25rem', flex: 1 }}>Equivale a 10 mensalidades com 2 meses grátis (~R$ 24,92/mês).</p>
            <button
              onClick={() => navigate('/cadastro?role=owner&plano=anual')}
              style={{ background: 'var(--primary-green)', color: '#fff', border: 'none', width: '100%', padding: '0.9rem 1.5rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'block' }}
            >
              Assinar
            </button>
          </div>
        </div>

        {/* CTA e formas de pagamento */}
        <div style={{ textAlign: 'center', maxWidth: '600px', margin: '3rem auto 0 auto' }}>
          <a
            href={`https://wa.me/5531997452809?text=${encodeURIComponent('Olá! Quero assinar o appSalão')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: 'var(--primary-green)', color: '#fff', border: 'none', padding: '1rem 2rem', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.39)' }}
          >
            Assinar pelo WhatsApp
          </a>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '1rem', lineHeight: '1.5' }}>
            Pagamento via Pix, cartão ou Mercado Pago — combine tudo direto pelo WhatsApp.
          </p>
        </div>
      </section>

      {/* Features Simple */}
      <section style={{ padding: '4rem 2rem', background: '#f8fafc', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: '800', color: '#0f172a', marginBottom: '3rem', letterSpacing: '-0.5px' }}>
          Tudo o que seu salão precisa para agendar online
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '50px', height: '50px', background: 'var(--light-green)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', color: 'var(--primary-green)' }}>
            <Scissors size={24} />
          </div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>Link Exclusivo</h3>
          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5' }}>Coloque o link na bio do Instagram e deixe seus clientes agendarem direto com você.</p>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '50px', height: '50px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', color: '#3b82f6' }}>
            <User size={24} />
          </div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>Instalação PWA</h3>
          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5' }}>Seu salão vira um app instalado no celular do cliente, sem precisar passar pelas lojas de aplicativos.</p>
        </div>
        </div>
      </section>

      <footer style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        &copy; {new Date().getFullYear()} appSalão. Todos os direitos reservados.
      </footer>
    </div>
  )
}

export default Welcome
