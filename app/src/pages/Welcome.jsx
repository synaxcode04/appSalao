import React, { useEffect } from 'react'
import { Scissors, Smartphone, CalendarCheck, Check, ArrowRight } from 'lucide-react'
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
    <div className="landing-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--ds-bg)', color: 'var(--ds-text)' }}>
      
      {/* Header Flat */}
      <header style={{ padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--ds-surface)', borderBottom: '1px solid var(--ds-surface-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/logo.png" alt="Logo appSalão" style={{ height: '44px', objectFit: 'contain' }} />
          <span style={{ fontWeight: '700', fontSize: '1.35rem', color: 'var(--ds-text)', letterSpacing: '-0.02em' }}>
            appSalão
          </span>
          <span className="ds-badge ds-badge-primary" style={{ marginLeft: '4px' }}>
            v1.0
          </span>
        </div>
        <button 
          className="ds-btn ds-btn-outline ds-btn-pill"
          style={{ padding: '8px 18px', fontSize: '14px' }}
          onClick={() => navigate('/login?role=owner')}
        >
          Entrar
        </button>
      </header>

      {/* Hero Section Flat & Dynamic */}
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 1.5rem 3.5rem', textAlign: 'center', backgroundColor: 'var(--ds-surface)' }}>
        <div style={{ maxWidth: '780px', width: '100%' }}>
          
          <div className="ds-badge ds-badge-primary" style={{ padding: '6px 14px', fontSize: '13px', marginBottom: '1.5rem' }}>
            ✨ O sistema de agendamento feito para o seu salão
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', fontWeight: '600', lineHeight: '1.15', marginBottom: '1.25rem', letterSpacing: '-0.03em', color: 'var(--ds-text)' }}>
            Transforme seu salão em um <span style={{ color: 'var(--ds-primary)' }}>aplicativo próprio</span>.
          </h1>

          <p style={{ fontSize: '1.1rem', color: 'var(--ds-text-2)', lineHeight: '1.6', maxWidth: '640px', margin: '0 auto 2rem' }}>
            Receba agendamentos 24 horas por dia com seu link personalizado. Elimine a confusão de mensagens no WhatsApp e fidelize seus clientes com seu app instalado direto no celular.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            <button 
              className="ds-btn ds-btn-primary ds-btn-pill"
              style={{ padding: '14px 28px', fontSize: '16px' }}
              onClick={() => navigate('/cadastro?role=owner')}
            >
              Criar meu App agora <ArrowRight size={18} />
            </button>
            <button 
              className="ds-btn ds-btn-secondary ds-btn-pill"
              style={{ padding: '14px 28px', fontSize: '16px' }}
              onClick={() => navigate('/login?role=owner')}
            >
              Já tenho uma conta
            </button>
          </div>

        </div>
      </main>

      {/* Planos e Preços — Flat Surface Cards */}
      <section style={{ padding: '4rem 1.5rem', backgroundColor: 'var(--ds-bg)' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: '600', color: 'var(--ds-text)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              Planos transparentes e sem comissão por agendamento
            </h2>
            <p style={{ color: 'var(--ds-text-2)', fontSize: '15px' }}>
              Escolha a melhor opção para o seu salão. Cancele ou altere seu plano quando quiser.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'stretch' }}>

            {/* Plano Mensal */}
            <div className="ds-card" style={{ display: 'flex', flexDirection: 'column', padding: '28px' }}>
              <div style={{ marginBottom: '16px' }}>
                <span className="ds-badge ds-badge-neutral">Mensal</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '8px', color: 'var(--ds-text)' }}>Plano Mensal</h3>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '2.2rem', fontWeight: '700', color: 'var(--ds-text)', letterSpacing: '-0.03em' }}>R$ 29,90</span>
                <span style={{ color: 'var(--ds-text-2)', fontSize: '14px' }}> / mês</span>
              </div>
              <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', lineHeight: '1.5', flex: 1, marginBottom: '24px' }}>
                Acesso completo a todos os recursos de agendamento, serviços e profissionais com cobrança mês a mês.
              </p>
              <button
                className="ds-btn ds-btn-secondary ds-btn-full ds-btn-pill"
                onClick={() => navigate('/cadastro?role=owner&plano=mensal')}
              >
                Assinar Mensal
              </button>
            </div>

            {/* Plano Semestral */}
            <div className="ds-card" style={{ display: 'flex', flexDirection: 'column', padding: '28px' }}>
              <div style={{ marginBottom: '16px' }}>
                <span className="ds-badge ds-badge-primary">Pague 5, ganhe 1</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '8px', color: 'var(--ds-text)' }}>Plano Semestral</h3>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '2.2rem', fontWeight: '700', color: 'var(--ds-text)', letterSpacing: '-0.03em' }}>R$ 149,50</span>
                <span style={{ color: 'var(--ds-text-2)', fontSize: '14px' }}> / 6 meses</span>
              </div>
              <p style={{ color: 'var(--ds-primary)', fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>
                Economia equivalente a R$ 24,92/mês
              </p>
              <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', lineHeight: '1.5', flex: 1, marginBottom: '24px' }}>
                Pague 5 mensalidades e ganhe 1 mês totalmente grátis para organizar seu negócio.
              </p>
              <button
                className="ds-btn ds-btn-soft ds-btn-full ds-btn-pill"
                onClick={() => navigate('/cadastro?role=owner&plano=semestral')}
              >
                Assinar Semestral
              </button>
            </div>

            {/* Plano Anual (Destaque Flat) */}
            <div className="ds-card ds-card-surface-2" style={{ display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)' }}>
                <span className="ds-badge ds-badge-success" style={{ padding: '6px 14px', fontSize: '12px' }}>
                  ★ Mais vantajoso
                </span>
              </div>
              <div style={{ marginBottom: '16px', marginTop: '6px' }}>
                <span className="ds-badge ds-badge-success">Pague 9, ganhe 3</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '8px', color: 'var(--ds-text)' }}>Plano Anual</h3>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '2.2rem', fontWeight: '700', color: 'var(--ds-text)', letterSpacing: '-0.03em' }}>R$ 262,80</span>
                <span style={{ color: 'var(--ds-text-2)', fontSize: '14px' }}> / 12 meses</span>
              </div>
              <p style={{ color: 'var(--ds-primary)', fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>
                Melhor custo-benefício (~R$ 21,90/mês)
              </p>
              <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', lineHeight: '1.5', flex: 1, marginBottom: '24px' }}>
                Pague 9 mensalidades e ganhe 3 meses grátis. Uso ilimitado e garantia de tranquilidade o ano todo.
              </p>
              <button
                className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill"
                onClick={() => navigate('/cadastro?role=owner&plano=anual')}
              >
                Assinar Anual
              </button>
            </div>

          </div>

          {/* WhatsApp CTA */}
          <div style={{ textAlign: 'center', marginTop: '3.5rem' }}>
            <a
              href={`https://wa.me/5531997452809?text=${encodeURIComponent('Olá! Quero assinar o appSalão')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ds-btn ds-btn-primary ds-btn-pill"
              style={{ padding: '14px 28px', fontSize: '15px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              Assinar via WhatsApp
            </a>
            <p style={{ color: 'var(--ds-text-3)', fontSize: '13px', marginTop: '12px' }}>
              Pagamento rápido e seguro por Pix, Cartão de Crédito ou Mercado Pago.
            </p>
          </div>

        </div>
      </section>

      {/* Grid de Funcionalidades */}
      <section style={{ padding: '4rem 1.5rem', backgroundColor: 'var(--ds-surface)', borderTop: '1px solid var(--ds-surface-2)' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: '600', color: 'var(--ds-text)', marginBottom: '3rem', letterSpacing: '-0.02em' }}>
            Tudo o que seu salão precisa para organizar a rotina
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            <div className="ds-card ds-card-surface-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--ds-primary-soft)', color: 'var(--ds-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Scissors size={22} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: 'var(--ds-text)' }}>Link Próprio de Agendamento</h3>
              <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                Coloque seu link personalizado na bio do Instagram ou no WhatsApp. Seus clientes escolhem o serviço e o horário sozinhos.
              </p>
            </div>

            <div className="ds-card ds-card-surface-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--ds-primary-soft)', color: 'var(--ds-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Smartphone size={22} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: 'var(--ds-text)' }}>Aplicativo sem Loja de Apps</h3>
              <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                Seu cliente instala o aplicativo do seu salão direto na tela inicial do celular dele com 1 clique, sem precisar baixar na Play Store ou App Store.
              </p>
            </div>

            <div className="ds-card ds-card-surface-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--ds-primary-soft)', color: 'var(--ds-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <CalendarCheck size={22} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: 'var(--ds-text)' }}>Zero Conflitos de Horário</h3>
              <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                O sistema gerencia os horários de atendimento e folgas dos profissionais automaticamente. Nunca mais marque dois clientes no mesmo horário.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Flat */}
      <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', color: 'var(--ds-text-3)', fontSize: '13px', backgroundColor: 'var(--ds-bg)', borderTop: '1px solid var(--ds-surface-2)' }}>
        &copy; {new Date().getFullYear()} appSalão. Todos os direitos reservados.
      </footer>

    </div>
  )
}

export default Welcome
