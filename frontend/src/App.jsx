import { useEffect, useMemo, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock3,
  MapPin,
  Map as MapIcon,
  LayoutGrid,
  Phone,
  Search,
  Utensils,
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

function FestivalCalendar({ data }) {
  const today = new Date()
  const initialMonth = data.events.find((event) => event.start_date >= today.toISOString().slice(0, 10))?.start_date.slice(0, 7)
    || data.events.at(-1)?.start_date.slice(0, 7)
    || today.toISOString().slice(0, 7)
  const [month, setMonth] = useState(initialMonth)
  const [selected, setSelected] = useState(null)
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = new Date(year, monthNumber - 1, 1)
  const lastDay = new Date(year, monthNumber, 0)
  const cells = Array.from({ length: Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7 }, (_, index) => {
    const day = index - firstDay.getDay() + 1
    return day > 0 && day <= lastDay.getDate() ? day : null
  })
  const eventsForDay = (day) => {
    const value = `${month}-${String(day).padStart(2, '0')}`
    return data.events.filter((event) => event.start_date <= value && (event.end_date || event.start_date) >= value)
  }
  const moveMonth = (offset) => setMonth(offsetMonth(month, offset))

  useEffect(() => {
    setSelected(null)
  }, [month])

  return (
    <>
      <section className="festival-hero">
        <div><p className="eyebrow">BUSAN · FESTIVAL</p><h1>부산 축제 캘린더</h1><p>부산 곳곳의 축제 일정을 월별로 한눈에 확인하세요.</p></div>
        <CalendarDays size={74} strokeWidth={1.2} aria-hidden="true" />
      </section>
      <section className="festival-layout">
        <div className="festival-calendar-card">
          <div className="festival-calendar-head">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft /></button>
            <h2>{year}년 {monthNumber}월</h2>
            <div><button type="button" className="today-button" onClick={() => setMonth(today.toISOString().slice(0, 7))}>오늘</button><button type="button" onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight /></button></div>
          </div>
          <div className="festival-weekdays">{['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="festival-grid">
            {cells.map((day, index) => {
              const dayEvents = day ? eventsForDay(day) : []
              const isToday = day && month === today.toISOString().slice(0, 7) && day === today.getDate()
              return <div className={`festival-day ${day ? '' : 'empty'} ${isToday ? 'today' : ''}`} key={`${month}-${index}`}><span className="day-number">{day}</span>{dayEvents.slice(0, 3).map((event) => <button type="button" key={event.id} title={event.title} onClick={() => setSelected(event)}>{event.title}</button>)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3}개 더보기</small>}</div>
            })}
          </div>
        </div>
        <aside className="festival-detail">
          {selected ? <>
            {selected.image && <img src={selected.image} alt="" />}
            <p className="section-kicker">{selected.district || '부산광역시'}</p>
            <h2>{selected.title}</h2>
            <p className="festival-period">{selected.period_text || `${selected.start_date} — ${selected.end_date}`}</p>
            {selected.place && <p><MapPin size={15} /> {selected.place}</p>}
            {selected.address && <p>{selected.address}</p>}
            {selected.description && <p className="festival-description">{selected.description}</p>}
            {selected.homepage && <a href={selected.homepage} target="_blank" rel="noreferrer">공식 홈페이지 <ExternalLink size={14} /></a>}
          </> : <div className="festival-empty"><CalendarDays size={34} /><b>축제를 선택해 보세요</b><span>달력의 일정에서 상세 정보를 확인할 수 있습니다.</span></div>}
        </aside>
      </section>
      {data.undated.length > 0 && <p className="festival-notice">운영기간이 날짜 형식으로 제공되지 않은 축제 {data.undated.length}건은 달력에서 제외했습니다.</p>}
      <footer className="dashboard-footer"><span>자료: {data.source}</span><span>공공데이터 수정일 {data.source_updated}</span></footer>
    </>
  )
}

function FoodMap({ restaurants, onSelect }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return undefined
    const busanBounds = L.latLngBounds([34.85, 128.75], [35.4, 129.35])
    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      minZoom: 10,
      maxBounds: busanBounds,
      maxBoundsViscosity: 1,
    })
    map.fitBounds(busanBounds)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const bounds = []
    restaurants.forEach((restaurant) => {
      const lat = Number(restaurant.lat)
      const lng = Number(restaurant.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !busanBounds.contains([lat, lng])) return
      bounds.push([lat, lng])
      const tooltip = document.createElement('div')
      tooltip.className = 'food-map-tooltip'
      if (restaurant.thumbnail) {
        const image = document.createElement('img')
        image.src = restaurant.thumbnail
        image.alt = ''
        tooltip.appendChild(image)
      }
      const copy = document.createElement('div')
      const district = document.createElement('span')
      district.textContent = restaurant.district
      const name = document.createElement('b')
      name.textContent = restaurant.name
      const menu = document.createElement('small')
      menu.textContent = restaurant.menu || restaurant.address || '상세정보 보기'
      copy.append(district, name, menu)
      tooltip.appendChild(copy)
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#fff8e9',
        weight: 2,
        fillColor: '#c66f27',
        fillOpacity: .9,
      }).addTo(map).bindTooltip(tooltip, { direction: 'top', offset: [0, -7], opacity: 1 })
      marker.on('click', () => {
        marker.closeTooltip()
        onSelect(restaurant)
      })
    })
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 })
    setTimeout(() => map.invalidateSize(), 0)
    return () => map.remove()
  }, [restaurants, onSelect])

  return <div ref={containerRef} className="food-map" aria-label="부산 맛집 지도" />
}

function RestaurantExplorer() {
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('list')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setError('')
        const params = new URLSearchParams({ q: query, district, page: String(page), page_size: view === 'map' ? '500' : '24' })
        const response = await fetch(`/api/restaurants?${params}`, { signal: controller.signal })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '맛집 정보를 불러오지 못했습니다.')
        }
        setData(await response.json())
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message)
      }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, district, page, view])

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / data.page_size)) : 1
  return <>
    <section className="food-hero">
      <div><p className="eyebrow">TASTE OF BUSAN</p><h1>부산의 한 끼를 찾다</h1><p>동네와 메뉴로 부산의 맛집을 가볍게 탐색해 보세요.</p></div>
      <Utensils size={72} strokeWidth={1.15} aria-hidden="true" />
    </section>
    <section className="food-toolbar" aria-label="맛집 검색 조건">
      <label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="맛집, 메뉴, 주소 검색" /></label>
      <select value={district} onChange={(event) => { setDistrict(event.target.value); setPage(1) }} aria-label="구군 선택"><option value="">부산 전체</option>{data?.districts.map((name) => <option key={name}>{name}</option>)}</select>
      <span>{data ? `${numberFormat.format(data.total_count)}곳` : '불러오는 중'}</span>
      <div className="food-view-switch" aria-label="보기 방식"><button type="button" className={view === 'list' ? 'active' : ''} onClick={() => { setView('list'); setPage(1) }}><LayoutGrid /> 목록</button><button type="button" className={view === 'map' ? 'active' : ''} onClick={() => { setView('map'); setPage(1) }}><MapIcon /> 지도</button></div>
    </section>
    {error && <div className="error-message" role="alert"><strong>맛집 정보를 불러오지 못했습니다.</strong><span>{error}</span></div>}
    {!data && !error && <div className="state-message"><RefreshCw className="spin" size={18} /> 부산 맛집을 찾는 중입니다.</div>}
    {data && <>
      {data.restaurants.length && view === 'map' && <FoodMap restaurants={data.restaurants} onSelect={setSelected} />}
      {data.restaurants.length && view === 'list' && <section className="food-grid">
        {data.restaurants.map((restaurant) => <button className="food-card" type="button" key={restaurant.id} onClick={() => setSelected(restaurant)}>
          <div className="food-image">{restaurant.thumbnail ? <img src={restaurant.thumbnail} alt="" loading="lazy" /> : <Utensils size={28} />}</div>
          <div className="food-card-body"><span>{restaurant.district}</span><h2>{restaurant.name}</h2><p>{restaurant.menu || restaurant.title || '대표 메뉴 정보 없음'}</p><small><MapPin size={12} />{restaurant.address || '주소 정보 없음'}</small></div>
        </button>)}
      </section>}
      {!data.restaurants.length && <div className="food-no-result"><Search size={30} /><b>검색 결과가 없습니다</b><span>다른 지역이나 메뉴로 찾아보세요.</span></div>}
      {view === 'list' && <nav className="food-pagination" aria-label="맛집 목록 페이지"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /> 이전</button><span>{page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>다음 <ChevronRight /></button></nav>}
      <footer className="dashboard-footer"><span>자료: {data.source}</span><span>공공데이터포털 실시간 연동</span></footer>
    </>}
    {selected && <div className="food-modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><article className="food-modal" role="dialog" aria-modal="true" aria-label={`${selected.name} 상세정보`} onMouseDown={(event) => event.stopPropagation()}>
      <button className="food-modal-close" type="button" onClick={() => setSelected(null)} aria-label="닫기">×</button>
      {selected.image && <img src={selected.image} alt="" />}
      <div className="food-modal-copy"><p className="section-kicker">{selected.district}</p><h2>{selected.name}</h2>{selected.subtitle && <strong>{selected.subtitle}</strong>}{selected.menu && <p className="food-menu"><Utensils size={15} /> {selected.menu}</p>}{selected.address && <p><MapPin size={15} /> {selected.address}</p>}{selected.hours && <p><Clock3 size={15} /> {selected.hours}</p>}{selected.contact && <p><Phone size={15} /> {selected.contact}</p>}{selected.description && <p className="food-description">{selected.description}</p>}{selected.homepage && <a href={selected.homepage} target="_blank" rel="noreferrer">홈페이지 보기 <ExternalLink size={14} /></a>}</div>
    </article></div>}
  </>
}

const BUSAN_GUIDES = {
  해운대구: { morning: '동백섬 해안 산책', afternoon: '청사포 다릿돌전망대', evening: '더베이101 야경', backup: '해운대 블루라인파크' },
  수영구: { morning: '광안리 해변 산책', afternoon: '민락수변공원과 골목 탐방', evening: '광안대교 야경', backup: 'F1963 문화공간' },
  중구: { morning: '용두산공원과 부산타워', afternoon: 'BIFF광장·국제시장 탐방', evening: '부평깡통시장 야시장', backup: '보수동 책방골목' },
  영도구: { morning: '흰여울문화마을 산책', afternoon: '태종대 해안 전망', evening: '청학배수지 전망대', backup: '국립해양박물관' },
  사하구: { morning: '감천문화마을 골목 산책', afternoon: '다대포 꿈의 낙조분수', evening: '다대포 일몰 감상', backup: '을숙도 생태공원' },
  동구: { morning: '초량 이바구길', afternoon: '부산역 차이나타운', evening: '북항 친수공원 야경', backup: '168계단 모노레일 일대' },
  부산진구: { morning: '부산시민공원 산책', afternoon: '전포카페거리 탐방', evening: '서면 야간 산책', backup: '부전시장' },
  동래구: { morning: '동래읍성 역사 산책', afternoon: '복천박물관', evening: '온천천 산책', backup: '금강공원' },
  남구: { morning: '이기대 해안산책로', afternoon: 'UN기념공원', evening: '용호별빛공원', backup: '오륙도 스카이워크' },
  금정구: { morning: '금정산성 산책', afternoon: '범어사', evening: '온천장 로컬 탐방', backup: '회동수원지' },
  기장군: { morning: '해동용궁사', afternoon: '아난티 해안산책로', evening: '죽성성당 해안 풍경', backup: '국립부산과학관' },
}

const DEFAULT_BUSAN_GUIDE = { morning: '부산 원도심 산책', afternoon: '해안 명소 탐방', evening: '부산 야경 감상', backup: '전통시장 탐방' }

function TravelPlanner({ dashboard, cruise, festivals, festivalError }) {
  const monthOptions = useMemo(() => (dashboard?.series || [])
    .filter((point) => point.forecast != null)
    .slice(0, 6), [dashboard])
  const [month, setMonth] = useState('')
  const [days, setDays] = useState(3)
  const [pace, setPace] = useState('balanced')
  const [restaurants, setRestaurants] = useState([])
  const [restaurantError, setRestaurantError] = useState('')
  const [planVersion, setPlanVersion] = useState(0)

  useEffect(() => {
    if (!month && monthOptions.length) setMonth(monthOptions[0].month)
  }, [month, monthOptions])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/restaurants?page=1&page_size=120', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '맛집 정보를 불러오지 못했습니다.')
        }
        return response.json()
      })
      .then((data) => setRestaurants(data.restaurants || []))
      .catch((error) => {
        if (error.name !== 'AbortError') setRestaurantError(error.message)
      })
    return () => controller.abort()
  }, [])

  const plan = useMemo(() => {
    if (!planVersion || !month) return null
    const air = monthOptions.find((point) => point.month === month)
    const cruisePoint = cruise?.series?.find((point) => point.month === month)
    const confirmedEvents = (festivals?.events || []).filter((event) => {
      const start = event.start_date?.slice(0, 7)
      const end = (event.end_date || event.start_date)?.slice(0, 7)
      return start && start <= month && end >= month
    })
    const monthNumber = month.slice(5, 7)
    const seasonalReferences = confirmedEvents.length ? [] : (festivals?.events || [])
      .filter((event) => event.start_date?.slice(5, 7) === monthNumber)
      .slice(0, 4)
      .map((event) => ({ ...event, isSeasonalReference: true }))
    const monthEvents = confirmedEvents.length ? confirmedEvents : seasonalReferences
    const districtRestaurants = [...restaurants].sort((a, b) => `${a.district}${a.name}`.localeCompare(`${b.district}${b.name}`, 'ko'))
    const districts = [...new Set([
      ...monthEvents.map((event) => event.district).filter(Boolean),
      ...districtRestaurants.map((restaurant) => restaurant.district).filter(Boolean),
      '해운대구', '중구', '영도구',
    ])]
    const stride = pace === 'relaxed' ? 3 : pace === 'active' ? 1 : 2
    const itinerary = Array.from({ length: Number(days) }, (_, index) => {
      const district = districts[(index * stride + planVersion - 1) % districts.length]
      const localRestaurants = districtRestaurants.filter((restaurant) => restaurant.district === district)
      const lunch = localRestaurants[index % Math.max(1, localRestaurants.length)]
      const dinner = localRestaurants[(index + 1) % Math.max(1, localRestaurants.length)]
      const localEvents = monthEvents.filter((event) => !event.district || event.district === district)
      const event = localEvents[index % Math.max(1, localEvents.length)] || monthEvents[index % Math.max(1, monthEvents.length)]
      const guide = BUSAN_GUIDES[district] || DEFAULT_BUSAN_GUIDE
      return {
        day: index + 1,
        district,
        morning: index === 0 ? `부산 도착 후 ${guide.morning}` : guide.morning,
        afternoon: event ? (event.isSeasonalReference ? `${event.title} 개최 일정 확인` : `${event.title} 관람`) : guide.afternoon,
        evening: guide.evening,
        backup: guide.backup,
        event,
        lunch,
        dinner,
      }
    })
    const airValues = monthOptions.map((point) => point.forecast)
    const airLevel = normalizeDemand(airValues, air?.forecast)
    return {
      air,
      cruise: cruisePoint,
      events: monthEvents,
      confirmedEventCount: confirmedEvents.length,
      usesSeasonalReferences: !confirmedEvents.length && seasonalReferences.length > 0,
      itinerary,
      crowd: airLevel >= .67 ? '혼잡 예상' : airLevel >= .34 ? '보통' : '비교적 여유',
    }
  }, [planVersion, month, days, pace, monthOptions, cruise, festivals, restaurants])

  return <>
    <section className="planner-hero">
      <div><p className="eyebrow">BUSAN · TRIP LAB</p><h1>데이터로 짜는 모의 여행</h1><p>항공 수요, 크루즈 입항, 축제와 맛집 정보를 엮어 부산 여행의 초안을 만듭니다.</p></div>
      <Waypoints size={76} strokeWidth={1.1} aria-hidden="true" />
    </section>
    <section className="planner-controls" aria-label="모의 여행 조건">
      <label><span>여행 월</span><select value={month} onChange={(event) => setMonth(event.target.value)}>{monthOptions.map((point) => <option key={point.month} value={point.month}>{formatMonth(point.month)}</option>)}</select></label>
      <label><span>여행 기간</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}일</option>)}</select></label>
      <label><span>여행 성향</span><select value={pace} onChange={(event) => setPace(event.target.value)}><option value="relaxed">느긋하게</option><option value="balanced">균형 있게</option><option value="active">알차게</option></select></label>
      <button type="button" onClick={() => setPlanVersion((value) => value + 1)} disabled={!month}><Waypoints size={17} /> 모의 일정 만들기</button>
    </section>
    {restaurantError && <div className="data-note" role="note">맛집 API 연결 문제로 구체적인 식당명 대신 지역 맛집 탐색 일정으로 구성합니다: {restaurantError}</div>}
    {festivalError && <div className="data-note" role="note">축제 API 연결 문제로 축제를 제외하고 일정을 구성합니다: {festivalError}</div>}
    {!plan && <section className="planner-empty"><CalendarDays size={38} /><b>조건을 고르고 모의 일정을 만들어 보세요.</b><span>실제 예약이 아닌 데이터 기반 여행 초안입니다.</span></section>}
    {plan && <>
      <section className="planner-signals" aria-label="선택 월 여행 신호">
        <article><span>항공 수요 추정</span><strong>{formatCount(plan.air?.forecast)}<small>명</small></strong><em>{plan.crowd}</em></article>
        <article><span>크루즈 입항</span><strong>{formatCount(plan.cruise?.calls || 0)}<small>건</small></strong><em>{plan.cruise?.status === '추정' ? '과거 자료 기반 추정치' : plan.cruise?.status || '일정 없음'}</em></article>
        <article><span>{plan.usesSeasonalReferences ? '과거 동월 축제 참고' : '연계 가능 축제'}</span><strong>{formatCount(plan.events.length)}<small>건</small></strong><em>{plan.usesSeasonalReferences ? '개최 확정 아님 · 일정 확인 필요' : festivals ? '공식 축제 데이터' : '축제 미반영'}</em></article>
        <article><span>맛집 후보</span><strong>{formatCount(restaurants.length)}<small>곳</small></strong><em>부산시 맛집 데이터</em></article>
      </section>
      <section className="planner-itinerary" aria-label="일자별 모의 일정">
        {plan.itinerary.map((item) => <article key={item.day}>
          <header><span>DAY {String(item.day).padStart(2, '0')}</span><b>{item.district}</b></header>
          <ol>
            <li><time>오전</time><div><strong>{item.morning}</strong><span>{pace === 'relaxed' ? '이동과 휴식 시간을 넉넉히 잡은 코스입니다.' : '오전 비교적 한산한 시간대를 권장합니다.'}</span></div></li>
            <li><time>점심</time><div><strong>{item.lunch ? item.lunch.name : `${item.district} 로컬 식당 탐색`}</strong><span>{item.lunch?.menu || item.lunch?.address || '현지 영업시간을 확인하세요.'}</span></div></li>
            <li><time>오후</time><div><strong>{item.afternoon}</strong><span>{item.event?.isSeasonalReference ? `과거 ${item.event.start_date?.slice(0, 4)}년 개최 자료입니다. 올해 일정을 확인하세요.` : item.event?.place || item.event?.address || '실내·실외 운영 여부를 출발 전에 확인하세요.'}</span></div></li>
            <li><time>저녁</time><div><strong>{item.dinner ? `${item.dinner.name}에서 식사` : `${item.district} 대표 메뉴 선택`}</strong><span>{item.dinner?.menu || item.dinner?.address || '대기 시간을 고려해 미리 예약하세요.'}</span></div></li>
            <li><time>야간</time><div><strong>{item.evening}</strong><span>우천 시 대안: {item.backup}</span></div></li>
          </ol>
        </article>)}
      </section>
      <aside className="proxy-note planner-note"><span className="note-mark">i</span><p>이 일정은 데이터 조합 예시입니다. 축제 운영일, 식당 영업시간, 이동시간과 예약 가능 여부는 출발 전에 반드시 다시 확인하세요.</p></aside>
    </>}
  </>
}

function normalizeDemand(values, value) {
  const valid = values.filter((item) => Number.isFinite(item))
  if (!valid.length || !Number.isFinite(value)) return 0
  const minimum = Math.min(...valid)
  const maximum = Math.max(...valid)
  if (maximum === minimum) return maximum > 0 ? 1 : 0
  return (value - minimum) / (maximum - minimum)
}

function demandLevel(score) {
  if (score >= 67) return { key: 'very-busy', label: '매우 혼잡' }
  if (score >= 34) return { key: 'busy', label: '혼잡' }
  return { key: 'normal', label: '보통' }
}

function DemandCalendar({ dashboard, cruise, festivals, festivalError }) {
  const months = useMemo(() => {
    const demandRows = (dashboard?.series || [])
      .filter((point) => point.forecast != null)
      .slice(0, 6)
      .map((point) => ({ ...point, isEstimate: true }))
    const cruiseByMonth = new Map((cruise?.series || []).map((point) => [point.month, point]))
    const events = festivals?.events || []
    const airValues = demandRows.map((point) => point.forecast)
    const cruiseValues = demandRows.map((point) => cruiseByMonth.get(point.month)?.capacity || 0)
    const festivalCounts = demandRows.map((point) => events.filter((event) => {
      const start = event.start_date?.slice(0, 7)
      const end = (event.end_date || event.start_date)?.slice(0, 7)
      return start && start <= point.month && end >= point.month
    }).length)

    return demandRows.map((point, index) => {
      const cruisePoint = cruiseByMonth.get(point.month)
      const monthEvents = events.filter((event) => {
        const start = event.start_date?.slice(0, 7)
        const end = (event.end_date || event.start_date)?.slice(0, 7)
        return start && start <= point.month && end >= point.month
      })
      const score = Math.round(100 * (
        normalizeDemand(airValues, point.forecast) * 0.7
        + normalizeDemand(cruiseValues, cruiseValues[index]) * 0.2
        + normalizeDemand(festivalCounts, festivalCounts[index]) * 0.1
      ))
      return {
        ...point,
        score,
        level: demandLevel(score),
        cruiseCapacity: cruisePoint?.capacity || 0,
        cruiseCalls: cruisePoint?.calls || 0,
        events: monthEvents,
      }
    })
  }, [dashboard, cruise, festivals])

  const peak = months.reduce((best, month) => (!best || month.score > best.score ? month : best), null)
  return <>
    <section className="demand-hero">
      <div><p className="eyebrow">BUSAN · DEMAND SIGNAL</p><h1>월별 종합 수요 캘린더</h1><p>현재부터 6개월간의 과거 자료 기반 추정치를 비교합니다.</p></div>
      <CalendarDays size={72} strokeWidth={1.15} aria-hidden="true" />
    </section>
    <aside className="proxy-note demand-note" aria-label="산정 방식 안내">
      <span className="note-mark">i</span>
      <p><strong>상대 혼잡지수</strong>는 현재부터 6개월간 항공 70%·크루즈 20%·축제 10%를 정규화한 추정 지표입니다. 항공 수요는 과거 자료로 검증한 예측 모델의 추정치이며 관광객 수를 직접 합산한 값이 아닙니다.</p>
    </aside>
    {peak && <section className="demand-summary" aria-label="종합 수요 요약">
      <div><span>예상 피크</span><strong>{formatMonth(peak.month)}</strong></div>
      <div><span>피크 혼잡지수</span><strong>{peak.score}<small>/100</small></strong></div>
      <div><span>분석 기간</span><strong>{formatMonth(months[0]?.month)} — {formatMonth(months.at(-1)?.month)}</strong></div>
    </section>}
    {festivalError && <div className="data-note" role="note">축제 정보를 불러오지 못해 항공과 크루즈 정보만 반영했습니다: {festivalError}</div>}
    <section className="demand-calendar-grid" aria-label="월별 종합 수요">
      {months.map((month) => <article className={`demand-month-card level-${month.level.key} is-estimate`} key={month.month}>
        <header><div><span>{month.month.slice(0, 4)}</span><h2>{Number(month.month.slice(5))}월</h2><em>추정치</em></div><b>{month.level.label}</b></header>
        <div className="demand-index"><span>혼잡지수</span><strong>{month.score}<small>/100</small></strong><i><span style={{ width: `${month.score}%` }} /></i></div>
        <dl>
          <div><dt><PlaneLanding size={15} /> 항공 추정</dt><dd>{formatCount(month.forecast)}명</dd></div>
          <div><dt><Ship size={15} /> 크루즈</dt><dd>{month.cruiseCalls ? `${month.cruiseCalls}회 · ${formatCount(month.cruiseCapacity)}명` : '일정 없음'}</dd></div>
          <div><dt><CalendarDays size={15} /> 주요 축제</dt><dd>{month.events.length ? `${month.events.length}건` : '일정 없음'}</dd></div>
        </dl>
        {month.events.length > 0 && <div className="demand-events">{month.events.slice(0, 3).map((event) => <span key={event.id || event.title}>{event.title}</span>)}</div>}
      </article>)}
    </section>
    <footer className="dashboard-footer"><span>자료: 항공정보포털 · 부산항 크루즈 입항 · 부산광역시 축제</span><span>향후 6개월 값은 과거 자료 기반 추정치이며 실제 결과와 다를 수 있습니다.</span></footer>
  </>
}

function App() {
  const [activeTab, setActiveTab] = useState('air')
  const [dashboard, setDashboard] = useState(null)
  const [cruise, setCruise] = useState(null)
  const [festivals, setFestivals] = useState(null)
  const [airports, setAirports] = useState([])
  const [airportName, setAirportName] = useState('')
  const [airportSeries, setAirportSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [airportError, setAirportError] = useState('')
  const [cruiseError, setCruiseError] = useState('')
  const [festivalError, setFestivalError] = useState('')
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
    if (!['cruise', 'demand', 'planner'].includes(activeTab) || cruise) return undefined
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
    if (!['festival', 'demand', 'planner'].includes(activeTab) || festivals) return undefined
    const controller = new AbortController()
    setFestivalError('')
    fetch('/api/festivals', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || '축제 일정을 불러오지 못했습니다.')
        }
        return response.json()
      })
      .then(setFestivals)
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setFestivalError(loadError.message)
      })
    return () => controller.abort()
  }, [activeTab, festivals])

  useEffect(() => {
    if (!cruise) return
    const sourceEnd = cruise.data_period_end || cruise.period_end
    setCruiseStart((current) => current || recentYearStart(sourceEnd, cruise.period_start))
    setCruiseEnd((current) => current || cruise.period_end)
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
          <span className="brand-mark">{activeTab === 'air' ? <PlaneLanding size={18} strokeWidth={2.1} /> : activeTab === 'cruise' ? <Ship size={18} strokeWidth={2.1} /> : ['festival', 'demand'].includes(activeTab) ? <CalendarDays size={18} strokeWidth={2.1} /> : activeTab === 'planner' ? <Waypoints size={18} strokeWidth={2.1} /> : <Utensils size={18} strokeWidth={2.1} />}</span>
          <span className="brand-copy"><b>BUSAN</b><small>모빌리티 데이터</small></span>
        </a>
        <div className="topbar-meta">
          <span className="live-indicator" />
          <span>월간 데이터</span>
          <span className="topbar-divider" />
          <span>{activeTab === 'air' ? (dashboard?.last_actual_month ? formatMonth(dashboard.last_actual_month) : '데이터 확인 중') : activeTab === 'cruise' ? (cruise ? `${formatMonth(cruise.period_start)} — ${formatMonth(cruise.period_end)}` : '데이터 확인 중') : activeTab === 'festival' ? '실시간 축제 정보' : activeTab === 'demand' ? '현재부터 6개월 추정' : activeTab === 'planner' ? '데이터 기반 모의 일정' : '부산 맛집 정보'}</span>
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
          <button className={activeTab === 'festival' ? 'active' : ''} onClick={() => setActiveTab('festival')} type="button">
            <CalendarDays size={16} /> 부산 축제
          </button>
          <button className={activeTab === 'demand' ? 'active' : ''} onClick={() => setActiveTab('demand')} type="button">
            <Activity size={16} /> 수요 캘린더
          </button>
          <button className={activeTab === 'planner' ? 'active' : ''} onClick={() => setActiveTab('planner')} type="button">
            <Waypoints size={16} /> 여행 플래너
          </button>
          <button className={activeTab === 'food' ? 'active' : ''} onClick={() => setActiveTab('food')} type="button">
            <Utensils size={16} /> 부산 맛집
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

        {activeTab === 'festival' && <>
          {!festivals && !festivalError && <div className="state-message"><RefreshCw className="spin" size={18} /> 축제 일정을 불러오는 중입니다.</div>}
          {festivalError && <div className="error-message" role="alert"><strong>축제 일정을 불러오지 못했습니다.</strong><span>{festivalError}</span></div>}
          {festivals && <FestivalCalendar data={festivals} />}
        </>}

        {activeTab === 'food' && <RestaurantExplorer />}

        {activeTab === 'demand' && <>
          {(!dashboard || !cruise) && !error && !cruiseError && <div className="state-message"><RefreshCw className="spin" size={18} /> 종합 수요를 계산하는 중입니다.</div>}
          {error && <div className="error-message" role="alert"><strong>항공 수요 자료를 불러오지 못했습니다.</strong><span>{error}</span></div>}
          {cruiseError && <div className="error-message" role="alert"><strong>크루즈 자료를 불러오지 못했습니다.</strong><span>{cruiseError}</span></div>}
          {dashboard && cruise && <DemandCalendar dashboard={dashboard} cruise={cruise} festivals={festivals} festivalError={festivalError} />}
        </>}

        {activeTab === 'planner' && <>
          {(!dashboard || !cruise) && !error && !cruiseError && <div className="state-message"><RefreshCw className="spin" size={18} /> 여행 데이터를 준비하는 중입니다.</div>}
          {error && <div className="error-message" role="alert"><strong>항공 수요 자료를 불러오지 못했습니다.</strong><span>{error}</span></div>}
          {cruiseError && <div className="error-message" role="alert"><strong>크루즈 자료를 불러오지 못했습니다.</strong><span>{cruiseError}</span></div>}
          {dashboard && cruise && <TravelPlanner dashboard={dashboard} cruise={cruise} festivals={festivals} festivalError={festivalError} />}
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
              <p>엑셀의 각 행을 <strong>입항 1건</strong>으로 집계했습니다. 2026년까지는 원자료이며, 2027년 월별 값은 2024~2026년 전체 자료에서 같은 달의 입항 건수와 선박 수용 인원을 평균한 <strong>추정치</strong>입니다. 인원은 실제 탑승객 수가 아닙니다.</p>
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
                  <div className="metric-label"><span>2027년 추정 입항</span><CalendarDays size={15} /></div>
                  <div className="metric-value">{formatCount(cruise.estimated_calls)}<small>건</small></div>
                  <div className="metric-foot">2024~2026년 동월 평균 추정</div>
                </article>
              </section>

              <section className="section-block cruise-chart-panel">
                <div className="section-heading">
                  <div><p className="section-kicker">01 / MONTHLY CRUISE CALLS</p><h2>월별 입항 흐름</h2></div>
                  <div className="method-chip"><span className="method-dot" />2027년 추정치 포함</div>
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
                  <span><i className="legend-block cruise-estimate-call" />추정 입항 건수</span>
                  <span><i className="legend-line cruise-estimate-capacity" />추정 수용 인원</span>
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
                      <Bar yAxisId="calls" dataKey="recorded_calls" name="입항 건수" fill="#7eaaa1" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Bar yAxisId="calls" dataKey="estimated_calls" name="추정 입항 건수" fill="#a89bd7" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Line yAxisId="capacity" dataKey="recorded_capacity" name="수용 인원" type="monotone" stroke="#d47745" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
                      <Line yAxisId="capacity" dataKey="estimated_capacity" name="추정 수용 인원" type="monotone" stroke="#806cc5" strokeWidth={2.2} strokeDasharray="7 5" dot={{ r: 2, fill: '#806cc5' }} activeDot={{ r: 4 }} />
                      {cruiseCompare && <Line yAxisId="calls" dataKey="previousCalls" name="전월 입항 건수" type="monotone" stroke="#7759a6" strokeWidth={1.8} strokeDasharray="2 4" dot={false} />}
                      {cruiseCompare && <Line yAxisId="capacity" dataKey="previousCapacity" name="전월 수용 인원" type="monotone" stroke="#9d87bd" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-caption"><span>2027년 점선·보라색 값은 2024~2026년 전체 자료의 동월 평균 추정치입니다.</span><span className="unit-label">건 / 명</span></div>
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

              <footer className="dashboard-footer"><span>자료: {cruise.source_file}</span><span><span className="footer-dot" />2026년까지는 원자료, 2027년은 2024~2026년 동월 평균 추정치입니다.</span></footer>
            </>}
          </>
        )}

      </main>
    </div>
  )
}

export default App
