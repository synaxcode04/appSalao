import React from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, Clock, XCircle } from 'lucide-react'

// Página de retorno do Checkout Pro do Mercado Pago (back_urls de criar-preferencia-plano.js:
// /s/pagamento?status=sucesso|pendente|falha&sub=<subscription_id>).
//
// IMPORTANTE: a ativação real do plano acontece via WEBHOOK (mp-plano-webhook), não aqui.
// Mesmo em "sucesso" o pagamento ainda pode estar em confirmação — por isso a mensagem
// de sucesso fala em "em processamento / confirmando", nunca "plano ativo".
//
// Esta rota é standalone (fora do SalonLayout) porque as back_urls do MP não carregam o
// slug do salão. O caminho de volta aos planos é recuperado do localStorage, gravado por
// ClientPlans antes de redirecionar ao checkout (chave 'mp_return_slug').
function PaymentReturn() {
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')

  const returnSlug = (() => {
    try {
      return window.localStorage.getItem('mp_return_slug')
    } catch {
      return null
    }
  })()

  const plansHref = returnSlug ? `/s/${returnSlug}/planos` : '/'

  const isFailure = status === 'falha'

  const config = isFailure
    ? {
        Icon: XCircle,
        color: '#d32f2f',
        title: 'Pagamento não concluído',
        message: 'O pagamento não foi finalizado. Você pode tentar novamente ou escolher pagar diretamente com o salão.'
      }
    : {
        Icon: status === 'sucesso' ? CheckCircle : Clock,
        color: 'var(--primary-green)',
        title: status === 'sucesso' ? 'Pagamento recebido!' : 'Pagamento em processamento',
        message: 'Estamos confirmando o seu pagamento. Assim que ele for aprovado, o seu plano será ativado automaticamente. Isso costuma levar apenas alguns instantes.'
      }

  const { Icon, color, title, message } = config

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <Icon size={64} color={color} />
      <h1 style={{ fontSize: '1.6rem', margin: '1.2rem 0 0.6rem', color: 'var(--text-primary)' }}>{title}</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>{message}</p>

      <Link
        to={plansHref}
        className="btn-primary"
        style={{ marginTop: '1.8rem', width: 'auto', padding: '0.8rem 1.6rem', textDecoration: 'none', display: 'inline-block' }}
      >
        {isFailure ? 'Voltar aos planos' : 'Ver meus planos'}
      </Link>
    </div>
  )
}

export default PaymentReturn
