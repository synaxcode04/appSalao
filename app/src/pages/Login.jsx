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
    <div className="container">
      <div className="app-container">
        <main className="auth-screen">
          <h2>Entrar como {role === 'owner' ? 'Proprietário' : 'Cliente'}</h2>
          {error && <p style={{color: 'red'}}>{error}</p>}
          <form onSubmit={handleLogin} className="auth-form">
            <input 
              type="email" 
              placeholder="Seu E-mail" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
            <input 
              type="password" 
              placeholder="Sua Senha" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="auth-link">
            Não tem uma conta? <Link to={`/cadastro?role=${role}${searchParams.get('redirect') ? `&redirect=${searchParams.get('redirect')}` : ''}`}>Cadastre-se aqui</Link>
          </p>
          <p className="auth-link">
            <Link to="/">Voltar ao início</Link>
          </p>
        </main>
      </div>
    </div>
  )
}

export default Login
