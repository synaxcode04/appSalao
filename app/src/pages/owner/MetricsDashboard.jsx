import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function MetricsDashboard() {
  const { salon } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState([])
  const [professionalsList, setProfessionalsList] = useState([])
  const [filterProfessional, setFilterProfessional] = useState('')

  // Padrão: Últimos 30 dias
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    if (salon) {
      fetchProfessionals()
      fetchMetrics()
    }
  }, [salon, startDate, endDate, filterProfessional])

  const fetchProfessionals = async () => {
    const { data } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('salon_id', salon.id)
      .eq('is_active', true)
    
    if (data) setProfessionalsList(data)
  }

  const fetchMetrics = async () => {
    setLoading(true)
    
    let query = supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        status,
        professional_id,
        services ( id, name, price )
      `)
      .eq('salon_id', salon.id)
      .gte('appointment_date', startDate)
      .lte('appointment_date', endDate)
      .neq('status', 'canceled')

    if (filterProfessional) {
      query = query.eq('professional_id', filterProfessional)
    }
      
    const { data } = await query
      
    if (data) {
      setAppointments(data)
    }
    setLoading(false)
  }

  // --- Processamento dos Dados ---

  // 1. Totais
  const totalAgendamentos = appointments.length
  const concluidosCount = appointments.filter(a => a.status === 'completed').length
  const faturamentoEstimado = appointments.reduce((acc, curr) => acc + Number(curr.services?.price || 0), 0)
  const faturamentoReal = appointments.filter(a => a.status === 'completed').reduce((acc, curr) => acc + Number(curr.services?.price || 0), 0)

  // 2. Gráfico: Faturamento por Dia
  const revenueByDayMap = {}
  appointments.forEach(appt => {
    const date = appt.appointment_date.split('-').reverse().slice(0, 2).join('/') // DD/MM
    if (!revenueByDayMap[date]) {
      revenueByDayMap[date] = { date, Estimado: 0, Realizado: 0 }
    }
    
    const price = Number(appt.services?.price || 0)
    revenueByDayMap[date].Estimado += price
    if (appt.status === 'completed') {
      revenueByDayMap[date].Realizado += price
    }
  })
  const revenueChartData = Object.values(revenueByDayMap).sort((a, b) => {
    const [da, ma] = a.date.split('/')
    const [db, mb] = b.date.split('/')
    return new Date(2020, mb-1, da) - new Date(2020, mb-1, db) // Simple sort logic
  })

  // 3. Gráfico: Top Serviços
  const servicesMap = {}
  appointments.forEach(appt => {
    const serviceName = appt.services?.name || 'Desconhecido'
    if (!servicesMap[serviceName]) {
      servicesMap[serviceName] = { name: serviceName, value: 0 }
    }
    servicesMap[serviceName].value += 1
  })
  const topServicesData = Object.values(servicesMap).sort((a, b) => b.value - a.value)

  return (
    <div className="page-content" style={{ paddingBottom: '2rem' }}>
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Métricas do Salão</h1>
        <p className="subtitle">Acompanhe seu desempenho e faturamento.</p>
      </header>

      {/* Filtros */}
      <div className="card" style={{ padding: '1rem', marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Data Inicial</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Data Final</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
          />
        </div>
        
        {professionalsList.length > 0 && (
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Profissional</label>
            <select 
              value={filterProfessional}
              onChange={(e) => setFilterProfessional(e.target.value)}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
            >
              <option value="">Geral do Salão</option>
              {professionalsList.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <p>Carregando métricas...</p>
      ) : (
        <>
          {/* Cards Principais */}
          <section className="dashboard-cards" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="card stat-card" style={{ flex: 1, minWidth: '200px' }}>
              <h3>Faturamento Realizado</h3>
              <p className="stat-number" style={{ color: 'var(--dark-green)' }}>R$ {faturamentoReal.toFixed(2).replace('.', ',')}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Apenas serviços concluídos</p>
            </div>
            
            <div className="card stat-card" style={{ flex: 1, minWidth: '200px' }}>
              <h3>Faturamento Estimado</h3>
              <p className="stat-number" style={{ color: 'var(--text-secondary)' }}>R$ {faturamentoEstimado.toFixed(2).replace('.', ',')}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Todos agendamentos no período</p>
            </div>

            <div className="card stat-card" style={{ flex: 1, minWidth: '150px' }}>
              <h3>Taxa de Conclusão</h3>
              <p className="stat-number" style={{ color: '#3b82f6' }}>
                {totalAgendamentos > 0 ? Math.round((concluidosCount / totalAgendamentos) * 100) : 0}%
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{concluidosCount} de {totalAgendamentos} agendamentos</p>
            </div>
          </section>

          {/* Gráficos */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            
            <div className="card" style={{ flex: 2, minWidth: '300px', padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Faturamento Diário (R$)</h3>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem', paddingTop: '10px' }} />
                    <Bar dataKey="Estimado" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Realizado" fill="var(--primary-green)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ flex: 1, minWidth: '300px', padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Serviços Mais Agendados</h3>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={topServicesData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {topServicesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}

export default MetricsDashboard
