import React, { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, ShieldCheck, Users } from 'lucide-react'
import { supabase } from '../supabase'

function AdminLayout() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (mounted) setLoading(false)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (mounted) {
        if (data) setProfile(data)
        setLoading(false)
      }
    }

    fetchProfile()
    return () => { mounted = false }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando painel admin...</div>
  if (!profile) return null

  return (
    <div className="admin-layout-container">
      <style>{`
        .admin-layout-container {
          display: flex;
          min-height: 100vh;
          background-color: #f1f5f9;
        }
        .admin-sidebar {
          width: 250px;
          background-color: #1e293b;
          color: #fff;
          display: flex;
          flex-direction: column;
          transition: all 0.3s ease;
        }
        .admin-main {
          flex: 1;
          padding: 2rem;
          overflow-y: auto;
          width: 100%;
        }
        @media (max-width: 1024px) {
          .admin-layout-container {
            flex-direction: column;
          }
          .admin-sidebar {
            width: 100%;
            height: auto;
          }
          .admin-nav {
            display: flex;
            flex-direction: row;
            overflow-x: auto;
            white-space: nowrap;
          }
          .admin-nav a {
            flex: 1;
            justify-content: center;
          }
          .admin-main {
            padding: 1rem;
          }
        }
      `}</style>

      {/* Sidebar Lateral */}
      <aside className="admin-sidebar">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={28} color="#10b981" />
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Super Admin</h2>
        </div>

        <nav className="admin-nav" style={{ flex: 1, padding: '0.5rem 0' }}>
          <NavLink
            to="/admin"
            end
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '1rem',
              color: isActive ? '#fff' : '#94a3b8',
              backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
              textDecoration: 'none', borderLeft: isActive ? '4px solid #10b981' : '4px solid transparent',
              borderBottom: isActive ? 'none' : 'none'
            })}
          >
            <Users size={20} /> Clientes (Salões)
          </NavLink>
        </nav>

        <div style={{ padding: '1rem' }}>
          <button
            onClick={handleLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}
          >
            <LogOut size={20} /> Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="admin-main">
        <Outlet context={{ profile }} />
      </main>
    </div>
  )
}

export default AdminLayout
