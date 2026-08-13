import React, { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'

function Login() {
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') || 'client'
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    // Após login com sucesso, verificar se a role bate com a do perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    setLoading(false)

    // Se for admin, sempre permite entrar e joga pro painel de admin
    if (profile && profile.role === 'admin') {
      navigate('/admin')
      return
    }

    if (profile && profile.role !== role) {
      setError(`Sua conta não tem permissões de ${role === 'owner' ? 'Proprietário' : 'Cliente'}.`)
      // Faz o logout caso não bata
      await supabase.auth.signOut()
      return
    }

    // Sucesso - Redirecionar pro painel depois
    const redirect = searchParams.get('redirect')
    if (redirect) {
      navigate(redirect)
    } else if (role === 'owner') {
      navigate('/painel')
    } else {
      navigate('/cliente')
    }
  }

  return (
    <div className="ds-auth-page">
      <main className="ds-card ds-auth-card">
        <h2 className="ds-auth-title">Entrar como {role === 'owner' ? 'Proprietário' : 'Cliente'}</h2>
        {error && <p className="ds-alert-danger" role="alert">{error}</p>}
        <form onSubmit={handleLogin} className="ds-auth-form">
          <div className="ds-field">
            <label className="ds-label" htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              name="email"
              type="email"
              className="ds-input"
              placeholder="voce@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              name="password"
              type="password"
              className="ds-input"
              placeholder="Sua senha"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="ds-btn ds-btn-primary ds-btn-full">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="ds-auth-link">
          Não tem uma conta? <Link to={`/cadastro?role=${role}${searchParams.get('redirect') ? `&redirect=${searchParams.get('redirect')}` : ''}`}>Cadastre-se aqui</Link>
        </p>
        <p className="ds-auth-link">
          <Link to="/">Voltar ao início</Link>
        </p>
      </main>
    </div>
  )
}

export default Login
