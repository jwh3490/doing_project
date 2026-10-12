import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  PlaneLanding,
  RefreshCw,
  Waypoints,
} from 'lucide-react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const numberFormat = new Intl.NumberFormat('ko-KR')

function formatCount(value) {
  return value == null ? '—' : numberFormat.format(Math.round(value))
}

function formatMonth(value) {
  if (!value) return ''
  const [year, month] = value.split('-')
  return `${year}.${month}`
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return '비교 불가'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

function formatError(value) {
  return value == null ? '—' : `${formatCount(value)}명`
}

function ChartTooltip({ active, payload, label, selectedMethod }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const entries = [
    ['실제 여객 수', point.actual, 'tooltip-actual'],
    ['선택 예측', point.forecast, 'tooltip-forecast'],
    ['계절 기준선', point.baseline, 'tooltip-baseline'],
  ].filter(([name, value]) => value != null && !(name === '계절 기준선' && selectedMethod === '계절 기준선'))

  return (
    <div className="chart-tooltip">
      <strong>{formatMonth(label)}</strong>
      {entries.map(([name, value, className]) => (
        <div className="tooltip-row" key={name}>
          <span className={`tooltip-dot ${className}`} />
          <span>{name}</span>
          <b>{formatCount(value)}명</b>
        </div>
      ))}
      {point.lower != null && point.upper != null && (
        <small>예측 참고 범위 {formatCount(point.lower)}~{formatCount(point.upper)}명</small>
      )}
    </div>
  )
}

function App() {
  const [dashboard, setDashboard] = useState(null)
  const [airports, setAirports] = useState([])
  const [airportName, setAirportName] = useState('')
  const [airportSeries, setAirportSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [airportError, setAirportError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      try {
        const [dashboardResponse, airportResponse] = await Promise.all([
          fetch('/api/dashboard', { signal: controller.signal }),
          fetch('/api/airports', { signal: controller.signal }),
        ])
        if (!dashboardResponse.ok) {
          const responseBody = await dashboardResponse.json().catch(() => ({}))
          throw new Error(responseBody.detail || '분석 서버가 데이터를 보내지 못했습니다.')
        }
        if (!airportResponse.ok) {
          const responseBody = await airportResponse.json().catch(() => ({}))
          throw new Error(responseBody.detail || '출발 공항 목록을 불러오지 못했습니다.')
        }
        const dashboardData = await dashboardResponse.json()
        const airportData = await airportResponse.json()
        setDashboard(dashboardData)
        setAirports(airportData.airports)
        setAirportName(airportData.default_airport || '')
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message === 'Failed to fetch'
            ? '분석 서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해 주세요.'
            : loadError.message || '데이터를 불러오지 못했습니다.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadDashboard()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!airportName) return undefined
    const controller = new AbortController()

    async function loadAirport() {
      setAirportError('')
      try {
        const query = new URLSearchParams({ name: airportName })
        const response = await fetch(`/api/airport-trend?${query}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          const responseBody = await response.json().catch(() => ({}))
          throw new Error(responseBody.detail || '선택한 공항의 자료를 불러오지 못했습니다.')
        }
        const data = await response.json()
        setAirportSeries(data.series)
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setAirportError(loadError.message || '공항 자료를 불러오지 못했습니다.')
        }
      }
    }

    loadAirport()
    return () => controller.abort()
  }, [airportName])

  const selectedMethod = dashboard?.selected_method || '검증 중'
  const isLoading = loading && !dashboard

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="부산 항공 수요 대시보드 홈">
          <span className="brand-mark"><PlaneLanding size={18} strokeWidth={2.1} /></span>
          <span>BUSAN / AIR TRAFFIC</span>
        </a>
        <div className="topbar-meta">
          <span className="live-indicator" />
          <span>월간 데이터</span>
          <span className="topbar-divider" />
          <span>{dashboard?.last_actual_month ? formatMonth(dashboard.last_actual_month) : '데이터 확인 중'}</span>
        </div>
      </header>

      <main id="top" className="dashboard-main">
        <section className="intro-row">
          <div>
            <p className="eyebrow"><span>BUSAN · GIMHAE</span><span>국제선 도착</span></p>
            <h1>김해공항 여객 흐름</h1>
            <p className="intro-copy">
              월별 국제선 도착 여객 수와 향후 6개월 예측을 살펴봅니다.
            </p>
          </div>
          <div className="scope-stamp">
            <CalendarDays size={16} aria-hidden="true" />
            <span>2009.01 — 2026.09</span>
          </div>
        </section>

        <aside className="proxy-note" aria-label="지표 안내">
          <span className="note-mark">i</span>
          <p>
            이 지표는 <strong>김해공항 국제선 도착 여객 수</strong>입니다. 부산 방문 관광객 전체 인원과는 다릅니다.
          </p>
        </aside>

        {isLoading && <div className="state-message"><RefreshCw className="spin" size={18} /> 자료를 불러오는 중입니다.</div>}
        {error && (
          <div className="error-message" role="alert">
            <strong>자료를 불러오지 못했습니다.</strong>
            <span>{error} 분석 API가 실행 중인지 확인해 주세요.</span>
          </div>
        )}

        {dashboard && (
          <>
            {dashboard.data_notice && <div className="data-note" role="note">{dashboard.data_notice}</div>}
            <section className="metrics-grid" aria-label="핵심 지표">
              <article className="metric-block">
                <div className="metric-label"><span>가장 최근 실제값</span><Activity size={15} /></div>
                <div className="metric-value">{formatCount(dashboard.latest_value)}<small>명</small></div>
                <div className="metric-foot">{formatMonth(dashboard.last_actual_month)} · 월합계</div>
              </article>
              <article className="metric-block">
                <div className="metric-label"><span>전년 같은 달 대비</span>{dashboard.yoy_change_percent >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</div>
                <div className={`metric-value ${dashboard.yoy_change_percent >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(dashboard.yoy_change_percent)}
                </div>
                <div className="metric-foot">{dashboard.yoy_comparison_month ? `${formatMonth(dashboard.yoy_comparison_month)}와 비교` : '비교할 전년 자료 없음'}</div>
              </article>
              <article className="metric-block metric-forecast">
                <div className="metric-label"><span>향후 6개월 예측 합계</span><Waypoints size={15} /></div>
                <div className="metric-value">{formatCount(dashboard.forecast_total)}<small>명</small></div>
                <div className="metric-foot">{formatMonth(dashboard.forecast_start)} — {formatMonth(dashboard.forecast_end)}</div>
              </article>
            </section>

            <section className="section-block forecast-section">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">01 / TOTAL ARRIVALS</p>
                  <h2>전체 월별 여객 수</h2>
                </div>
                <div className="method-chip"><span className="method-dot" />검증 선택 · {selectedMethod}</div>
              </div>
              <div className="chart-legend" aria-label="그래프 범례">
                <span><i className="legend-line actual-line" />실제값</span>
                <span><i className="legend-line forecast-line" />선택 예측</span>
                {selectedMethod !== '계절 기준선' && <span><i className="legend-line baseline-line" />작년 같은 달 기준</span>}
                <span><i className="legend-band" />예측 참고 범위</span>
              </div>
              <div className="main-chart chart-frame">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dashboard.series} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="#e8e9e4" strokeDasharray="2 5" />
                    <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={48} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} width={42} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip selectedMethod={selectedMethod} />} />
                    <Area dataKey="lower" stackId="range" stroke="none" fill="transparent" isAnimationActive={false} />
                    <Area dataKey="range_width" stackId="range" stroke="none" fill="#f3c56c" fillOpacity={0.23} isAnimationActive={false} />
                    <Line dataKey="actual" name="실제값" type="monotone" stroke="#247d72" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                    {selectedMethod !== '계절 기준선' && <Line dataKey="baseline" name="작년 같은 달 기준" type="monotone" stroke="#a4aaa5" strokeWidth={1.4} strokeDasharray="3 5" dot={false} connectNulls={false} isAnimationActive={false} />}
                    <Line dataKey="forecast" name="선택 예측" type="monotone" stroke="#d47745" strokeWidth={2.2} strokeDasharray="7 5" dot={{ r: 2.5, fill: '#d47745' }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-caption">
                <span>실제값은 실선, 예측은 점선으로 표시합니다. 참고 범위는 검증 오차를 바탕으로 한 추정치입니다.</span>
                <span className="unit-label">단위: 명 / 월</span>
              </div>
              <div className="validation-strip">
                <span className="validation-title">과거 검증 평균 오차</span>
                {dashboard.model_scores.map((score) => (
                  <span className={`score-item ${score.method === selectedMethod ? 'score-selected' : ''}`} key={score.method}>
                    {score.method}<b>{formatError(score.mae)}</b>
                  </span>
                ))}
                <span className="validation-explainer">값이 작을수록 검증 구간에서 실제값에 가까웠습니다.</span>
              </div>
            </section>

            <section className="section-block airport-section">
              <div className="section-heading airport-heading">
                <div>
                  <p className="section-kicker">02 / ORIGIN AIRPORT</p>
                  <h2>출발 공항별 흐름</h2>
                </div>
                <label className="airport-select-wrap">
                  <span>출발 공항</span>
                  <select value={airportName} onChange={(event) => setAirportName(event.target.value)}>
                    {airports.map((airport) => <option key={airport} value={airport}>{airport}</option>)}
                  </select>
                </label>
              </div>
              <p className="airport-context">선택한 출발 공항에서 김해공항으로 도착한 국제선 여객 수입니다. 국적별 집계가 아닙니다.</p>
              {airportError && <div className="inline-error" role="alert">{airportError}</div>}
              <div className="airport-chart chart-frame">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={airportSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="#e8e9e4" strokeDasharray="2 5" />
                    <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={48} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} width={42} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line dataKey="actual" name="실제 여객 수" type="monotone" stroke="#315d78" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <footer className="dashboard-footer">
              <span>자료: 항공정보포털 · 김해공항 국제선 도착</span>
              <span><span className="footer-dot" />예측은 검증된 참고값이며 실제 결과와 다를 수 있습니다.</span>
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

export default App
