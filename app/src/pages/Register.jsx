import React, { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { createOrGetClient, linkClientToSalon, formatPhone } from '../utils/clientIdentity'
import BirthdateInput from '../components/BirthdateInput'

const PLANOS = [
  { id: 'mensal', nome: 'Mensal', preco: 'R$ 29,90', periodo: '/mês' },
  { id: 'semestral', nome: 'Semestral', preco: 'R$ 149,50', periodo: '/6 meses' },
  { id: 'anual', nome: 'Anual', preco: 'R$ 299,00', periodo: '/12 meses' }
]

const PLANOS_VALIDOS = ['mensal', 'semestral', 'anual']

// O slug de salão tem o formato `<uuid-36-chars>-<nome>`; os 36 primeiros
// caracteres são o UUID do salão. Mesmo formato usado em SalonLayout.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Extrai o salon_id de um caminho de redirect do tipo `/s/<slug>`. Retorna null
// quando o redirect não aponta para um salão — nesse caso o cadastro global do
// cliente é criado sem vínculo a salão.
function extractSalonId(redirect) {
  if (!redirect) return null
  const match = redirect.match(/\/s\/([^/?#]+)/)
  if (!match) return null
  const slug = match[1]
  const rawId = slug.length >= 36 ? slug.slice(0, 36) : null
  return rawId && UUID_REGEX.test(rawId) ? rawId : null
}

function Register() {
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') || 'client'
  const navigate = useNavigate()

  const planoParam = searchParams.get('plano')
  const [plano, setPlano] = useState(PLANOS_VALIDOS.includes(planoParam) ? planoParam : 'mensal')

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('') // Apenas para cliente
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [salonName, setSalonName] = useState('') // Apenas para owner
  const [document, setDocument] = useState('') // CPF ou CNPJ do salão/owner
  const [gender, setGender] = useState('masculino') // Apenas para cliente
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePhoneChange = (e) => {
    setPhone(formatPhone(e.target.value))
  }

  const handleDocumentChange = (e) => {
    let v = e.target.value.replace(/\D/g, '')
    if (v.length <= 11) {
      v = v.replace(/(\d{3})(\d)/, '$1.$2')
      v = v.replace(/(\d{3})(\d)/, '$1.$2')
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    } else {
      v = v.substring(0, 14) // Limita a 14 números
      v = v.replace(/^(\d{2})(\d)/, '$1.$2')
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      v = v.replace(/\.(\d{3})(\d)/, '.$1/$2')
      v = v.replace(/(\d{4})(\d)/, '$1-$2')
    }
    setDocument(v)
  }

  // Cadastro do cliente: identidade global por telefone via Vercel Function.
  // O cliente NÃO entra em auth.users nem em profiles — só existe em `clients`
  // (e `salon_clients` quando há contexto de salão), acessados server-side.
  const handleClientRegister = async () => {
    if (!fullName.trim()) {
      setError('Informe seu nome completo.')
      setLoading(false)
      return
    }
    if (!phone.trim()) {
      setError('Informe seu telefone (WhatsApp).')
      setLoading(false)
      return
    }

    const redirect = searchParams.get('redirect')
    const salonId = extractSalonId(redirect)

    try {
      if (salonId) {
        await linkClientToSalon({ phone, full_name: fullName, birth_date: birthDate || null, salon_id: salonId })
      } else {
        await createOrGetClient({ phone, full_name: fullName, birth_date: birthDate || null })
      }
    } catch (err) {
      setError(err.message || 'Não foi possível concluir o cadastro. Tente novamente.')
      setLoading(false)
      return
    }

    setLoading(false)
    navigate(redirect || '/')
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (role === 'client') {
      await handleClientRegister()
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      setLoading(false)
      return
    }

    // 1. Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      let msg = authError.message
      if (msg.includes('Password should be at least')) msg = 'A senha deve ter pelo menos 6 caracteres.'
      if (msg.includes('User already registered')) msg = 'Este e-mail já está cadastrado.'
      
      setError(msg)
      setLoading(false)
      return
    }

    const userId = authData.user.id

    // 2. Criar registro na tabela profiles
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: userId,
        role: role,
        full_name: fullName,
        phone: phone
      }
    ])

    if (profileError) {
      setError(`Erro ao salvar perfil: ${profileError.message}`)
      setLoading(false)
      return
    }

    // 3. Se for owner, criar o Salão vinculado ao perfil
    let salonId = null
    if (role === 'owner' && salonName) {
      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .insert([
          {
            owner_id: userId,
            name: salonName,
            document: document
          }
        ])
        .select('id')
        .single()

      if (salonError || !salonData) {
        setError(`Erro ao criar salão: ${salonError ? salonError.message : 'não foi possível obter o identificador do salão.'}`)
        setLoading(false)
        return
      }

      salonId = salonData.id
    }

    setLoading(false)

    const redirect = searchParams.get('redirect')
    if (redirect) {
      navigate(redirect)
      return
    }

    if (role === 'owner') {
      // Fluxo de pagamento: conta já criada, tenta abrir o checkout do Mercado Pago.
      // Qualquer falha não trava o usuário — ele segue para o painel com um aviso.
      try {
        const response = await fetch('/api/criar-preferencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plano, salonName, contactEmail: email, salonId })
        })
        if (response.ok) {
          const { initPoint } = await response.json()
          if (initPoint) {
            window.location.href = initPoint
            return
          }
        }
      } catch (err) {
        console.error('Falha ao iniciar pagamento após cadastro:', err)
      }

      navigate('/painel', {
        state: {
          avisoPagamento: 'Sua conta foi criada! Não foi possível abrir o pagamento agora — você pode assinar depois pelo painel ou pelo WhatsApp.'
        }
      })
      return
    }

    navigate('/cliente')
  }

  return (
    <div className="container">
      <div className="app-container">
        <main className="auth-screen">
          <h2>Cadastro de {role === 'owner' ? 'Proprietário' : 'Cliente'}</h2>
          {error && <p style={{color: 'red'}}>{error}</p>}
          <form onSubmit={handleRegister} className="auth-form">
            <input 
              type="text" 
              placeholder="Nome Completo" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required 
            />
            <input 
              type="tel" 
              placeholder="Telefone (WhatsApp)" 
              value={phone}
              onChange={handlePhoneChange}
              maxLength="15"
              required
            />

            {role === 'client' && (
              <BirthdateInput value={birthDate} onChange={setBirthDate} />
            )}

            {role === 'owner' && (
              <>
                <input 
                  type="text" 
                  placeholder="Nome do Salão" 
                  value={salonName}
                  onChange={(e) => setSalonName(e.target.value)}
                  required 
                />
                <input
                  type="text"
                  placeholder="CPF ou CNPJ"
                  value={document}
                  onChange={handleDocumentChange}
                  required
                />
                <div className="plano-selector" role="radiogroup" aria-label="Escolha o plano">
                  <span className="plano-selector-label">Escolha seu plano</span>
                  <div className="plano-options">
                    {PLANOS.map((p) => {
                      const selecionado = plano === p.id
                      return (
                        <button
                          type="button"
                          key={p.id}
                          role="radio"
                          aria-checked={selecionado}
                          onClick={() => setPlano(p.id)}
                          className="plano-option"
                          style={{
                            borderColor: selecionado ? 'var(--primary-green)' : '#cbd5e1',
                            background: selecionado ? 'var(--light-green, #ecfdf5)' : '#fff'
                          }}
                        >
                          <strong>{p.nome}</strong>
                          <span>{p.preco}<small>{p.periodo}</small></span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            {role === 'owner' && (
              <>
                <input
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </>
            )}
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>
          {role !== 'client' && (
            <p className="auth-link">
              Já tem uma conta? <Link to={`/login?role=${role}${searchParams.get('redirect') ? `&redirect=${searchParams.get('redirect')}` : ''}`}>Entre aqui</Link>
            </p>
          )}
          <p className="auth-link">
            <Link to="/">Voltar ao início</Link>
          </p>
        </main>
      </div>
    </div>
  )
}

export default Register
