import React, { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { CalendarDays, Scissors, Clock, LogOut, Settings, Users, UserPlus, Bell, PieChart, Folder, ChevronDown, ChevronRight, Package } from 'lucide-react'
import { supabase } from '../supabase'
import SuspendedScreen from '../components/SuspendedScreen'

function OwnerLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [salon, setSalon] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  
  const [isCadastrosOpen, setIsCadastrosOpen] = useState(
    location.pathname.includes('/servicos') || 
    location.pathname.includes('/profissionais') || 
    location.pathname.includes('/horarios') ||
    location.pathname.includes('/planos') ||
    location.pathname.includes('/clientes')
  )

  const fetchSalon = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('salons')
        .select('*')
        .eq('owner_id', user.id)
        .single()
      if (data) setSalon(data)
    }
  }

  const fetchNotifications = async (salonId) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('salon_id', salonId)
      .is('client_id', null)
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (data) setNotifications(data)
  }

  useEffect(() => {
    fetchSalon()
  }, [])

  useEffect(() => {
    if (salon) {
      fetchNotifications(salon.id)

      // Supabase Realtime: Ouve novos inserts de notificações
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `salon_id=eq.${salon.id}` },
          (payload) => {
            if (payload.new.client_id === null) {
              setNotifications(prev => [payload.new, ...prev])
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [salon])

  // PWA com marca do salão para o dono: troca o href do manifest existente (#main-manifest)
  // para /api/manifest?slug=<id>&type=owner (start_url/scope = /painel). Espelha o padrão
  // do SalonLayout, sem criar segunda tag. Cleanup restaura o manifest estático para não
  // vazar a marca do salão para outras rotas ao desmontar.
  useEffect(() => {
    if (!salon?.id) return

    const mainManifest = document.getElementById('main-manifest')
    if (mainManifest) {
      mainManifest.href = `/api/manifest?slug=${salon.id}&type=owner`
    }

    return () => {
      const link = document.getElementById('main-manifest')
      if (link) {
        link.href = '/manifest.webmanifest'
      }
    }
  }, [salon])

  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      setIsCadastrosOpen(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('salon_id', salon.id).eq('is_read', false).is('client_id', null)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar Menu */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            {salon?.logo_url ? (
              <img
                src={salon.logo_url}
                alt="Logo do Salão"
                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--light-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dark-green)', fontWeight: 'bold', flexShrink: 0 }}>
                {salon?.name ? salon.name.charAt(0).toUpperCase() : 'S'}
              </div>
            )}
            <h2 className="sidebar-logo" style={{ fontSize: '1.2rem' }}>
              {salon?.name || 'SalãoAdmin'}
            </h2>
          </div>

          {/* Sino de notificações */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'relative', cursor: 'pointer', display: 'flex' }} onClick={() => setShowNotifications(!showNotifications)}>
              <Bell size={24} color="var(--text-secondary)" />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#ef4444', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
                  {unreadCount}
                </span>
              )}
            </div>

            {/* Dropdown Notificações */}
            {showNotifications && (
              <div className="owner-notif-dropdown">
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Notificações</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: 'var(--primary-green)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
                      Marcar lidas
                    </button>
                  )}
                </div>
                <div className="owner-notif-list">
                  {notifications.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nenhuma notificação.</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} onClick={() => !n.is_read && markAsRead(n.id)} style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: n.is_read ? '#fff' : '#f0fdf4', cursor: n.is_read ? 'default' : 'pointer', transition: 'background 0.2s' }}>
                        <p style={{ margin: '0 0 0.3rem 0', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{n.title}</p>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.message}</p>
                        <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <NavLink to="/painel" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
            <CalendarDays size={20} />
            <span>Agenda</span>
          </NavLink>
          
          <div className="nav-item-group">
            <button 
              className={`nav-item group-btn ${isCadastrosOpen ? 'active' : ''}`} 
              onClick={() => setIsCadastrosOpen(!isCadastrosOpen)}
            >
              <div className="group-btn-content">
                <Folder size={20} />
                <span>Cadastros</span>
              </div>
              <div className="hide-on-mobile">
                {isCadastrosOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            </button>
            
            {isCadastrosOpen && (
              <div className="cadastros-submenu">
                <NavLink to="/painel/servicos" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
                  <Scissors size={18} />
                  <span>Serviços</span>
                </NavLink>

                <NavLink to="/painel/profissionais" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
                  <Users size={18} />
                  <span>Profissionais</span>
                </NavLink>

                <NavLink to="/painel/horarios" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
                  <Clock size={18} />
                  <span>Horários</span>
                </NavLink>

                <NavLink to="/painel/clientes" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
                  <UserPlus size={18} />
                  <span>Clientes</span>
                </NavLink>

                <NavLink to="/painel/planos" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
                  <Package size={18} />
                  <span>Planos</span>
                </NavLink>
              </div>
            )}
          </div>

          <NavLink to="/painel/metricas" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
            <PieChart size={20} />
            <span>Métricas</span>
          </NavLink>

          <NavLink to="/painel/configuracoes" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
            <Settings size={20} />
            <span>Configurações</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-content" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(salon?.status === 'expired' || (salon?.subscription_expires_at && new Date(salon.subscription_expires_at) < new Date())) ? (
            <SuspendedScreen variant="owner" />
          ) : (
            <Outlet context={{ salon, refreshSalon: fetchSalon }} />
          )}
        </div>
      </main>
    </div>
  )
}

export default OwnerLayout
