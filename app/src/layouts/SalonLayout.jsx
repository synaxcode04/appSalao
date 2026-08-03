import React, { useEffect, useState } from 'react'
import { Outlet, NavLink, useParams } from 'react-router-dom'
import { CalendarDays, History, User, Store, Package } from 'lucide-react'
import { supabase } from '../supabase'
import SuspendedScreen from '../components/SuspendedScreen'
import { ClientSessionProvider, useClientSession } from '../contexts/ClientSessionContext'

// Nav composition decision: SalonLayout resolves slug→salon and also checks for an
// active client session (Supabase auth OR sessão leve por telefone) so it can render
// the scoped bottom-nav. Auth enforcement for protected client routes is done by
// ClientRoute in App.jsx. Profile is passed as part of the Outlet context so child
// pages can consume it with useOutletContext without making a duplicate fetch.

function SalonLayoutInner({ salon, profile, slug }) {
  const { clientSession } = useClientSession()
  const showNav = profile?.role === 'client' || !!clientSession

  return (
    <div className="client-layout">
      <main className="client-content">
        <Outlet context={{ salon, profile }} />
      </main>

      {showNav && (
        <nav className="client-bottom-nav">
          <NavLink to={`/s/${slug}`} end className={({ isActive }) => isActive ? 'c-nav-item active' : 'c-nav-item'}>
            <Store size={24} />
            <span>Salão</span>
          </NavLink>

          <NavLink to={`/s/${slug}/agenda`} className={({ isActive }) => isActive ? 'c-nav-item active' : 'c-nav-item'}>
            <CalendarDays size={24} />
            <span>Agenda</span>
          </NavLink>

          <NavLink to={`/s/${slug}/planos`} className={({ isActive }) => isActive ? 'c-nav-item active' : 'c-nav-item'}>
            <Package size={24} />
            <span>Planos</span>
          </NavLink>

          <NavLink to={`/s/${slug}/historico`} className={({ isActive }) => isActive ? 'c-nav-item active' : 'c-nav-item'}>
            <History size={24} />
            <span>Histórico</span>
          </NavLink>

          <NavLink to={`/s/${slug}/perfil`} className={({ isActive }) => isActive ? 'c-nav-item active' : 'c-nav-item'}>
            <User size={24} />
            <span>Perfil</span>
          </NavLink>
        </nav>
      )}
    </div>
  )
}

function SalonLayout() {
  const { slug } = useParams()
  // O slug tem o formato `<uuid-36-chars>-<nome-do-salao>`. Os 36 primeiros caracteres
  // são o UUID do salão. Isso é uma dependência do formato de slug atual.
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const rawId = slug && slug.length >= 36 ? slug.slice(0, 36) : null
  const id = rawId && UUID_REGEX.test(rawId) ? rawId : null

  const [salon, setSalon] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      if (!id) {
        if (mounted) {
          setNotFound(true)
          setLoading(false)
        }
        return
      }

      const [salonResult, sessionResult] = await Promise.all([
        supabase.from('salons').select('*').eq('id', id).single(),
        supabase.auth.getSession(),
      ])

      if (!mounted) return

      if (!salonResult.data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setSalon(salonResult.data)

      const session = sessionResult.data?.session
      if (session?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (mounted && profileData) setProfile(profileData)
      }

      if (mounted) setLoading(false)
    }

    fetchData()
    return () => { mounted = false }
  }, [id])

  useEffect(() => {
    if (!salon) return

    document.title = salon.name

    let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (!appleTitleMeta) {
      appleTitleMeta = document.createElement('meta')
      appleTitleMeta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(appleTitleMeta)
    }
    appleTitleMeta.content = salon.name

    // Substitui o href do manifest existente (ID "main-manifest") em vez de remover/recriar.
    // Isso preserva a instalação das rotas raiz (dono, admin) enquanto sobrescreve
    // dinamicamente o manifest para o contexto do cliente em /s/:slug.
    const mainManifest = document.getElementById('main-manifest')
    if (mainManifest) {
      mainManifest.href = `/api/manifest?slug=${slug}`
    } else {
      // Fallback: se por algum motivo o elemento não existir, cria um novo
      const manifestLink = document.createElement('link')
      manifestLink.rel = 'manifest'
      manifestLink.id = 'main-manifest'
      manifestLink.href = `/api/manifest?slug=${slug}`
      document.head.appendChild(manifestLink)
    }

    return () => {
      // Restaura o manifest estático ao sair do SalonLayout
      const mainManifest = document.getElementById('main-manifest')
      if (mainManifest) {
        mainManifest.href = '/manifest.webmanifest'
      }
    }
  }, [salon, slug])

  if (loading) return <div style={{ padding: '2rem' }}>Carregando...</div>

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Salão não encontrado</h1>
        <p style={{ color: '#475569' }}>O endereço acessado não corresponde a nenhum salão cadastrado.</p>
      </div>
    )
  }

  const isBlocked = salon.status === 'expired' || (salon.subscription_expires_at && new Date(salon.subscription_expires_at) < new Date())

  if (isBlocked) {
    return <SuspendedScreen variant="public" />
  }

  return (
    <ClientSessionProvider slug={slug}>
      <SalonLayoutInner salon={salon} profile={profile} slug={slug} />
    </ClientSessionProvider>
  )
}

export default SalonLayout
