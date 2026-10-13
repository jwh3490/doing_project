import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  PlaneLanding,
  RefreshCw,
  Ship,
  Waypoints,
} from 'lucide-react'
import {
  Area,
  Bar,
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

function offsetMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function previousMonth(month) {
  return offsetMonth(month, -1)
}

function recentYearStart(end, minimum) {
  const start = offsetMonth(end, -11)
  return start < minimum ? minimum : start
}

function filterSeriesWithPrevious(series, start, end, fields) {
  if (!series?.length) return []
  const lookup = new Map(series.map((point) => [point.month, point]))
  return series
    .filter((point) => (!start || point.month >= start) && (!end || point.month <= end))
    .map((point) => {
      const prior = lookup.get(previousMonth(point.month))
      return fields.reduce((result, [source, target]) => {
        result[target] = prior?.[source] ?? null
        return result
      }, { ...point })
    })
}

function MonthPicker({ value, min, max, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(Number((value || min || '2026-01').slice(0, 4)))
  const minYear = Number((min || `${viewYear}-01`).slice(0, 4))
  const maxYear = Number((max || `${viewYear}-12`).slice(0, 4))

  useEffect(() => {
    if (value) setViewYear(Number(value.slice(0, 4)))
  }, [value])

  return (
    <div className="month-picker">
      <span className="picker-label">{label}</span>
      <button className="month-picker-trigger" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <CalendarDays size={14} aria-hidden="true" />
        <b>{value ? `${value.slice(0, 4)}년 ${Number(value.slice(5))}월` : '연월 선택'}</b>
      </button>
      {open && (
        <div className="month-calendar" role="dialog" aria-label={`${label} 선택`}>
          <div className="month-calendar-head">
            <button type="button" aria-label="이전 연도" disabled={viewYear <= minYear} onClick={() => setViewYear((year) => year - 1)}>‹</button>
            <strong>{viewYear}년</strong>
            <button type="button" aria-label="다음 연도" disabled={viewYear >= maxYear} onClick={() => setViewYear((year) => year + 1)}>›</button>
          </div>
          <div className="month-grid">
            {Array.from({ length: 12 }, (_, index) => {
              const month = `${viewYear}-${String(index + 1).padStart(2, '0')}`
              const disabled = (min && month < min) || (max && month > max)
              return <button type="button" key={month} disabled={disabled} className={value === month ? 'selected' : ''} onClick={() => { onChange(month); setOpen(false) }}>{index + 1}월</button>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ChartControls({ start, end, min, max, onStart, onEnd, compare, onCompare }) {
  return (
    <div className="chart-controls" aria-label="그래프 조회 조건">
      <MonthPicker label="시작월" value={start} min={min} max={end || max} onChange={onStart} />
      <span className="range-arrow">→</span>
      <MonthPicker label="종료월" value={end} min={start || min} max={max} onChange={onEnd} />
      <label className="compare-toggle"><input type="checkbox" checked={compare} onChange={(event) => onCompare(event.target.checked)} /><span className="toggle-track" /><b>전월 데이터 같이 보기</b></label>
    </div>
  )
}

function ChartTooltip({ active, payload, label, selectedMethod, comparePrevious }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const entries = [
    ['실제 여객 수', point.actual, 'tooltip-actual'],
    ['선택 예측', point.forecast, 'tooltip-forecast'],
    ['계절 기준선', point.baseline, 'tooltip-baseline'],
    ['전월 데이터', comparePrevious ? (point.previousArrivals ?? point.previousActual) : null, 'tooltip-previous'],
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
  const [activeTab, setActiveTab] = useState('air')
  const [dashboard, setDashboard] = useState(null)
  const [cruise, setCruise] = useState(null)
  const [airports, setAirports] = useState([])
  const [airportName, setAirportName] = useState('')
  const [airportSeries, setAirportSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [airportError, setAirportError] = useState('')
  const [cruiseError, setCruiseError] = useState('')
  const [airStart, setAirStart] = useState('')
  const [airEnd, setAirEnd] = useState('')
  const [airCompare, setAirCompare] = useState(false)
  const [cruiseStart, setCruiseStart] = useState('')
  const [cruiseEnd, setCruiseEnd] = useState('')
  const [cruiseCompare, setCruiseCompare] = useState(false)

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
        const firstMonth = dashboardData.series[0]?.month || ''
        const latestActualMonth = dashboardData.last_actual_month || dashboardData.series.at(-1)?.month || ''
        setAirStart((current) => current || recentYearStart(latestActualMonth, firstMonth))
        setAirEnd((current) => current || latestActualMonth)
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
    if (activeTab !== 'cruise' || cruise) return undefined
    const controller = new AbortController()
    setCruiseError('')
    fetch('/api/cruise', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '크루즈 입항 자료를 불러오지 못했습니다.')
        }
        return response.json()
      })
      .then(setCruise)
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setCruiseError(loadError.message)
      })
    return () => controller.abort()
  }, [activeTab, cruise])

  useEffect(() => {
    if (!cruise) return
    const latestCurrentMonth = [...cruise.series].reverse().find((point) => point.status === '기록')?.month || cruise.period_end
    setCruiseStart((current) => current || recentYearStart(latestCurrentMonth, cruise.period_start))
    setCruiseEnd((current) => current || latestCurrentMonth)
  }, [cruise])

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
  const airSourceSeries = useMemo(() => (dashboard?.series || []).map((point) => ({
    ...point,
    arrivals: point.actual ?? point.forecast,
  })), [dashboard])
  const airChartSeries = useMemo(() => filterSeriesWithPrevious(
    airSourceSeries, airStart, airEnd, [['arrivals', 'previousArrivals']],
  ), [airSourceSeries, airStart, airEnd])
  const airportChartSeries = useMemo(() => filterSeriesWithPrevious(
    airportSeries, airStart, airEnd, [['actual', 'previousActual']],
  ), [airportSeries, airStart, airEnd])
  const cruiseChartSeries = useMemo(() => filterSeriesWithPrevious(
    cruise?.series || [], cruiseStart, cruiseEnd,
    [['calls', 'previousCalls'], ['capacity', 'previousCapacity']],
  ), [cruise, cruiseStart, cruiseEnd])
  const selectedAirport = airports.find((airport) => airport.name === airportName)
  return (
    <div className={`app-shell theme-${activeTab}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="부산 교통 수요 대시보드 홈">
          <span className="brand-mark">{activeTab === 'air' ? <PlaneLanding size={18} strokeWidth={2.1} /> : <Ship size={18} strokeWidth={2.1} />}</span>
          <span className="brand-copy"><b>BUSAN</b><small>모빌리티 데이터</small></span>
        </a>
        <div className="topbar-meta">
          <span className="live-indicator" />
          <span>월간 데이터</span>
          <span className="topbar-divider" />
          <span>{activeTab === 'air' ? (dashboard?.last_actual_month ? formatMonth(dashboard.last_actual_month) : '데이터 확인 중') : (cruise ? `${formatMonth(cruise.period_start)} — ${formatMonth(cruise.period_end)}` : '데이터 확인 중')}</span>
        </div>
      </header>

      <main id="top" className="dashboard-main">
        <nav className="data-tabs" aria-label="교통 데이터 선택">
          <button className={activeTab === 'air' ? 'active' : ''} onClick={() => setActiveTab('air')} type="button">
            <PlaneLanding size={16} /> 항공 여객
          </button>
          <button className={activeTab === 'cruise' ? 'active' : ''} onClick={() => setActiveTab('cruise')} type="button">
            <Ship size={16} /> 크루즈 입항
          </button>
        </nav>

        {activeTab === 'air' && <>
        <section className="intro-row busan-hero">
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
          <div className="airport-scene" aria-hidden="true">
            <span className="flight-path" />
            <PlaneLanding className="hero-plane" size={50} strokeWidth={1.25} />
            <i className="runway-edge edge-left" /><i className="runway-edge edge-right" />
            <i className="runway-center" />
            <span className="runway-lights lights-left" /><span className="runway-lights lights-right" />
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
              <ChartControls
                start={airStart} end={airEnd}
                min={airSourceSeries[0]?.month || ''} max={airSourceSeries.at(-1)?.month || ''}
                onStart={setAirStart} onEnd={setAirEnd}
                compare={airCompare} onCompare={setAirCompare}
              />
              <div className="chart-legend" aria-label="그래프 범례">
                <span><i className="legend-line actual-line" />실제값</span>
                <span><i className="legend-line forecast-line" />선택 예측</span>
                {selectedMethod !== '계절 기준선' && <span><i className="legend-line baseline-line" />작년 같은 달 기준</span>}
                <span><i className="legend-band" />예측 참고 범위</span>
                {airCompare && <span><i className="legend-line previous-line" />전월 데이터</span>}
              </div>
              <div className="main-chart chart-frame">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={airChartSeries} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="#e8e9e4" strokeDasharray="2 5" />
                    <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={48} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} width={42} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip selectedMethod={selectedMethod} comparePrevious={airCompare} />} />
                    <Area dataKey="lower" stackId="range" stroke="none" fill="transparent" isAnimationActive={false} />
                    <Area dataKey="range_width" stackId="range" stroke="none" fill="#f3c56c" fillOpacity={0.23} isAnimationActive={false} />
                    <Line dataKey="actual" name="실제값" type="monotone" stroke="#247d72" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                    {selectedMethod !== '계절 기준선' && <Line dataKey="baseline" name="작년 같은 달 기준" type="monotone" stroke="#a4aaa5" strokeWidth={1.4} strokeDasharray="3 5" dot={false} connectNulls={false} isAnimationActive={false} />}
                    <Line dataKey="forecast" name="선택 예측" type="monotone" stroke="#d47745" strokeWidth={2.2} strokeDasharray="7 5" dot={{ r: 2.5, fill: '#d47745' }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                    {airCompare && <Line dataKey="previousArrivals" name="전월 데이터" type="monotone" stroke="#7656a5" strokeWidth={1.7} strokeDasharray="2 4" dot={false} connectNulls={false} isAnimationActive={false} />}
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
                    {airports.map((airport) => <option key={airport.code} value={airport.name}>{airport.country} · {airport.name} ({airport.code})</option>)}
                  </select>
                </label>
              </div>
              <p className="airport-context">
                {selectedAirport && <span className="country-chip">{selectedAirport.country}<b>{selectedAirport.code}</b></span>}
                선택한 출발 공항에서 김해공항으로 도착한 국제선 여객 수입니다. 국적별 집계가 아닙니다.
              </p>
              {airportError && <div className="inline-error" role="alert">{airportError}</div>}
              <div className="airport-chart chart-frame">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={airportChartSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="#e8e9e4" strokeDasharray="2 5" />
                    <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={48} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} width={42} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip comparePrevious={airCompare} />} />
                    <Line dataKey="actual" name="실제 여객 수" type="monotone" stroke="#315d78" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                    {airCompare && <Line dataKey="previousActual" name="전월 데이터" type="monotone" stroke="#7656a5" strokeWidth={1.5} strokeDasharray="2 4" dot={false} connectNulls={false} isAnimationActive={false} />}
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
        </>}

        {activeTab === 'cruise' && (
          <>
            <section className="intro-row busan-hero cruise-hero">
              <div>
                <p className="eyebrow"><span>BUSAN · PORT</span><span>CRUISE CALLS</span></p>
                <h1>부산 크루즈 입항 기록</h1>
                <p className="intro-copy">부산항에 닿는 크루즈 항로와 월별 입항 움직임을 한눈에 살펴봅니다.</p>
              </div>
              <div className="scope-stamp">
                <CalendarDays size={16} aria-hidden="true" />
                <span>{cruise ? `${formatMonth(cruise.period_start)} — ${formatMonth(cruise.period_end)}` : '자료 확인 중'}</span>
              </div>
              <div className="harbor-scene" aria-hidden="true"><i className="bridge-deck" /><i className="bridge-tower tower-left" /><i className="bridge-tower tower-right" /><i className="bridge-cable cable-left" /><i className="bridge-cable cable-right" /><span className="harbor-sun" /><span className="cruise-ship"><i className="ship-cabin" /><i className="ship-window-row" /></span><span className="ship-wake" /></div>
            </section>

            <aside className="proxy-note" aria-label="크루즈 자료 안내">
              <span className="note-mark">i</span>
              <p>엑셀의 각 행을 <strong>입항 1건</strong>으로 집계했습니다. 인원은 실제 탑승객 수가 아닌 원자료의 선박 수용 인원입니다.</p>
            </aside>

            {!cruise && !cruiseError && <div className="state-message"><RefreshCw className="spin" size={18} /> 크루즈 자료를 불러오는 중입니다.</div>}
            {cruiseError && <div className="error-message" role="alert"><strong>크루즈 자료를 불러오지 못했습니다.</strong><span>{cruiseError}</span></div>}

            {cruise && <>
              <section className="metrics-grid cruise-metrics" aria-label="크루즈 핵심 지표">
                <article className="metric-block">
                  <div className="metric-label"><span>전체 입항 기록</span><Ship size={15} /></div>
                  <div className="metric-value">{formatCount(cruise.total_calls)}<small>건</small></div>
                  <div className="metric-foot">{formatMonth(cruise.period_start)} — {formatMonth(cruise.period_end)}</div>
                </article>
                <article className="metric-block">
                  <div className="metric-label"><span>수용 인원 합계</span><Activity size={15} /></div>
                  <div className="metric-value">{formatCount(cruise.total_capacity)}<small>명</small></div>
                  <div className="metric-foot">입항 선박별 원자료 합산</div>
                </article>
                <article className="metric-block metric-forecast">
                  <div className="metric-label"><span>향후 입항 예정</span><CalendarDays size={15} /></div>
                  <div className="metric-value">{formatCount(cruise.scheduled_calls)}<small>건</small></div>
                  <div className="metric-foot">현재 월 이후 일정</div>
                </article>
              </section>

              <section className="section-block cruise-chart-panel">
                <div className="section-heading">
                  <div><p className="section-kicker">01 / MONTHLY CRUISE CALLS</p><h2>월별 입항 흐름</h2></div>
                  <div className="method-chip"><span className="method-dot" />기록 · 예정 포함</div>
                </div>
                <ChartControls
                  start={cruiseStart} end={cruiseEnd}
                  min={cruise.period_start} max={cruise.period_end}
                  onStart={setCruiseStart} onEnd={setCruiseEnd}
                  compare={cruiseCompare} onCompare={setCruiseCompare}
                />
                <div className="chart-legend" aria-label="그래프 범례">
                  <span><i className="legend-block cruise-call" />입항 건수</span>
                  <span><i className="legend-line cruise-capacity" />수용 인원</span>
                  {cruiseCompare && <span><i className="legend-line previous-line" />전월 데이터</span>}
                </div>
                <div className="main-chart chart-frame">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cruiseChartSeries} margin={{ top: 12, right: 10, left: 2, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke="#e8e9e4" strokeDasharray="2 5" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={35} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="calls" allowDecimals={false} width={34} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="capacity" orientation="right" tickFormatter={(value) => `${Math.round(value / 1000)}k`} width={42} tickLine={false} axisLine={false} />
                      <Tooltip labelFormatter={formatMonth} formatter={(value, name) => [`${formatCount(value)}${name.includes('건수') ? '건' : '명'}`, name]} />
                      <Bar yAxisId="calls" dataKey="calls" name="입항 건수" fill="#7eaaa1" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Line yAxisId="capacity" dataKey="capacity" name="수용 인원" type="monotone" stroke="#d47745" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
                      {cruiseCompare && <Line yAxisId="calls" dataKey="previousCalls" name="전월 입항 건수" type="monotone" stroke="#7759a6" strokeWidth={1.8} strokeDasharray="2 4" dot={false} />}
                      {cruiseCompare && <Line yAxisId="capacity" dataKey="previousCapacity" name="전월 수용 인원" type="monotone" stroke="#9d87bd" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-caption"><span>막대는 월별 입항 건수, 선은 해당 월 선박 수용 인원 합계입니다.</span><span className="unit-label">건 / 명</span></div>
              </section>

              <section className="section-block cruise-detail-grid cruise-directory">
                <div>
                  <p className="section-kicker">02 / CONNECTED PORTS</p>
                  <h2>주요 연결 항구</h2>
                  <div className="rank-list">
                    {cruise.top_ports.map((item, index) => <div key={item.port}><span>{String(index + 1).padStart(2, '0')}</span><b>{item.port}</b><em>{formatCount(item.calls)}건</em></div>)}
                  </div>
                </div>
                <div>
                  <p className="section-kicker">03 / TERMINALS</p>
                  <h2>터미널별 입항</h2>
                  <div className="rank-list terminal-list">
                    {cruise.terminals.map((item, index) => <div key={item.terminal}><span>{String(index + 1).padStart(2, '0')}</span><b>{item.terminal}</b><em>{formatCount(item.calls)}건</em></div>)}
                  </div>
                </div>
              </section>

              <section className="section-block cruise-schedule">
                <div className="section-heading"><div><p className="section-kicker">04 / RECENT SCHEDULE</p><h2>최근·예정 입항 기록</h2></div></div>
                <div className="cruise-table-wrap">
                  <table className="cruise-table">
                    <thead><tr><th>입항월</th><th>상태</th><th>터미널</th><th>연결 항구</th><th>수용 인원</th></tr></thead>
                    <tbody>{cruise.records.slice(0, 18).map((record, index) => <tr key={`${record.month}-${record.port}-${index}`}><td>{formatMonth(record.month)}</td><td><span className={`status-badge ${record.status === '예정' ? 'planned' : ''}`}>{record.status}</span></td><td>{record.terminal}</td><td>{record.port}</td><td>{formatCount(record.capacity)}명</td></tr>)}</tbody>
                  </table>
                </div>
              </section>

              <footer className="dashboard-footer"><span>자료: {cruise.source_file}</span><span><span className="footer-dot" />현재 월 이후 자료는 입항 예정 일정입니다.</span></footer>
            </>}
          </>
        )}

      </main>
    </div>
  )
}

export default App
