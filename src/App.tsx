import { useEffect, useMemo, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import type { MapViewState } from '@deck.gl/core'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

type LayerMode = 'composite' | 'base' | 'track' | 'desert'
type TravelMode = 'walk' | 'bike' | 'transit' | 'drive'

type FacilityCounts = {
  fitness: number
  outdoor_fitness: number
  sport_fields: number
  public_pool: number
  mind_body: number
  fresh_food: number
}

type HexRecord = {
  h3: string
  district_name: string
  base_modes: Record<TravelMode, number>
  composite_modes: Record<TravelMode, number>
  track_a_score: number
  healthy_score: number
  desert_class: string
  green_ratio: number
  green_score: number
  aqi_avg: number
  aqi_score: number
  aqi_good_days_pct: number
  aqi_quality_mode: string
  aqi_primary_pollutant: string
  nearest_metro_m: number | null
  nearest_metro_band: string
  nearest_metro_name: string
  rent_price_yuan_m2: number | null
  rent_band: string
  rent_score: number
  rent_sample_name: string
  rent_distance_m: number | null
  facility_counts: FacilityCounts
}

type TransparencyItem = {
  name: string
  source: string
  collection_date: string
  limitations: string
}

type TransparencyMeta = {
  generated_at: string
  h3_resolution: number
  sources: TransparencyItem[]
}

type CompactPayload = {
  dictionaries: {
    districts: string[]
    desert_classes: string[]
    metro_bands: string[]
    rent_bands: string[]
    aqi_quality: string[]
    aqi_pollutants: string[]
  }
  rows: Array<Array<string | number | null>>
}

type Priority = {
  base: number
  health: number
  metro: number
  rent: number
  air: number
}

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 121.47,
  latitude: 31.23,
  zoom: 9.65,
  pitch: 0,
  bearing: 0,
}

const MAP_STYLE = {
  version: 8,
  sources: {
    amap: {
      type: 'raster',
      tiles: [
        'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '&copy; AutoNavi',
    },
  },
  layers: [{ id: 'amap-layer', type: 'raster', source: 'amap', minzoom: 0, maxzoom: 20 }],
}

const TRAVEL_MODES: TravelMode[] = ['walk', 'bike', 'transit', 'drive']

function App() {
  const [records, setRecords] = useState<HexRecord[]>([])
  const [meta, setMeta] = useState<TransparencyMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [layerMode, setLayerMode] = useState<LayerMode>('composite')
  const [travelMode, setTravelMode] = useState<TravelMode>('walk')
  const [selected, setSelected] = useState<HexRecord | null>(null)
  const [priority, setPriority] = useState<Priority>({
    base: 40,
    health: 30,
    metro: 12,
    rent: 10,
    air: 8,
  })

  useEffect(() => {
    Promise.all([
      fetch('/data/app_v1_h3_data_compact.json').then((res) => res.json()),
      fetch('/data/transparency_v1.json').then((res) => res.json()),
    ])
      .then(([payload, transparency]: [CompactPayload, TransparencyMeta]) => {
        setRecords(decodeCompactPayload(payload))
        setMeta(transparency)
      })
      .catch((error) => setLoadError(String(error)))
  }, [])

  const renderRecords = useMemo(() => {
    return records.filter((item) => item.district_name && item.district_name !== '未知')
  }, [records])

  const recommendedTop10 = useMemo(() => {
    const total = Object.values(priority).reduce((sum, value) => sum + value, 0) || 1
    return [...renderRecords]
      .map((item) => {
        const score =
          item.base_modes[travelMode] * (priority.base / total) +
          item.healthy_score * (priority.health / total) +
          metroScore(item.nearest_metro_m) * (priority.metro / total) +
          item.rent_score * (priority.rent / total) +
          item.aqi_score * (priority.air / total)
        return { item, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => item.item.h3)
  }, [renderRecords, priority, travelMode])

  const recommendedSet = useMemo(() => new Set(recommendedTop10), [recommendedTop10])
  const highlightedRecords = useMemo(
    () => renderRecords.filter((item) => recommendedSet.has(item.h3)),
    [renderRecords, recommendedSet],
  )

  const layers = useMemo(() => {
    const scoreLayer = new H3HexagonLayer<HexRecord>({
      id: 'h3-v1-score-layer',
      data: renderRecords,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 95],
      filled: true,
      stroked: true,
      extruded: false,
      coverage: 0.84,
      opacity: 0.88,
      getHexagon: (d) => d.h3,
      getFillColor: (d) => getFillColor(d, layerMode, travelMode),
      getLineColor: [255, 255, 255, 150],
      getLineWidth: 1.4,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 0.65,
      onClick: (info) => {
        const object = info.object as HexRecord | undefined
        if (object) setSelected(object)
      },
      updateTriggers: {
        getFillColor: [layerMode, travelMode],
      },
      transitions: {
        getFillColor: 180,
      },
    })

    const recommendationLayer = new H3HexagonLayer<HexRecord>({
      id: 'h3-v1-recommendation-layer',
      data: highlightedRecords,
      pickable: false,
      filled: true,
      stroked: true,
      extruded: false,
      coverage: 0.74,
      getHexagon: (d) => d.h3,
      getFillColor: [11, 82, 73, 242],
      getLineColor: [255, 255, 255, 245],
      getLineWidth: 4,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 2,
    })

    return [scoreLayer, recommendationLayer]
  }, [renderRecords, highlightedRecords, layerMode, travelMode])

  const summary = useMemo(() => {
    if (!renderRecords.length) return null
    const values = renderRecords.map((item) => getLayerValue(item, layerMode, travelMode))
    return {
      count: renderRecords.length,
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      high: values.filter((value) => value >= 70).length,
    }
  }, [renderRecords, layerMode, travelMode])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="brand">
          <p className="eyebrow">Shanghai 15-Minute City</p>
          <h1>Healthy Access Explorer</h1>
          <p className="lede">面向公众的 H3 分辨率 8 等值区域图，整合基础通达、健康生活方式、AQI、地铁距离与租金代理。</p>
        </header>

        <section className="panel compact">
          <div className="stats-grid">
            <div>
              <span>H3 网格</span>
              <strong>{summary ? summary.count.toLocaleString() : '-'}</strong>
            </div>
            <div>
              <span>均值</span>
              <strong>{summary ? summary.avg.toFixed(1) : '-'}</strong>
            </div>
            <div>
              <span>高分区</span>
              <strong>{summary ? summary.high.toLocaleString() : '-'}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>图层</h2>
          <div className="segmented four">
            <button className={layerMode === 'composite' ? 'active' : ''} onClick={() => setLayerMode('composite')}>
              综合评分
            </button>
            <button className={layerMode === 'base' ? 'active' : ''} onClick={() => setLayerMode('base')}>
              基础层
            </button>
            <button className={layerMode === 'track' ? 'active' : ''} onClick={() => setLayerMode('track')}>
              赛道层
            </button>
            <button className={layerMode === 'desert' ? 'active' : ''} onClick={() => setLayerMode('desert')}>
              运动荒漠
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>出行方式</h2>
          <div className="segmented four">
            {TRAVEL_MODES.map((mode) => (
              <button key={mode} className={travelMode === mode ? 'active' : ''} onClick={() => setTravelMode(mode)}>
                {travelLabel(mode)}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>选择居住地</h2>
          <p className="hint">调整优先级，地图会实时高亮前 10 个候选六边形。</p>
          <Slider label="基础通达" value={priority.base} onChange={(value) => setPriority((s) => ({ ...s, base: value }))} />
          <Slider label="健康运动" value={priority.health} onChange={(value) => setPriority((s) => ({ ...s, health: value }))} />
          <Slider label="地铁便利" value={priority.metro} onChange={(value) => setPriority((s) => ({ ...s, metro: value }))} />
          <Slider label="租金可负担" value={priority.rent} onChange={(value) => setPriority((s) => ({ ...s, rent: value }))} />
          <Slider label="空气质量" value={priority.air} onChange={(value) => setPriority((s) => ({ ...s, air: value }))} />
          <p className="topline">已高亮 {recommendedTop10.length} 个六边形</p>
        </section>

        <section className="panel">
          <h2>六边形详情</h2>
          {selected ? (
            <DetailPanel selected={selected} travelMode={travelMode} />
          ) : (
            <p className="hint">点击地图上的 H3 六边形，查看设施、地铁距离、租金区间、AQI 与评分。</p>
          )}
        </section>

        <section className="panel">
          <h2>数据透明度</h2>
          {meta ? (
            <>
              <p className="hint">
                生成日期 {meta.generated_at}。H3 分辨率 {meta.h3_resolution}。
              </p>
              <div className="transparency-list">
                {meta.sources.map((item) => (
                  <div key={item.name} className="transparency-card">
                    <strong>{item.name}</strong>
                    <span>来源：{item.source}</span>
                    <span>采集日期：{item.collection_date}</span>
                    <span>局限性：{item.limitations}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="hint">正在加载...</p>
          )}
        </section>
      </aside>

      <main className="map-shell">
        <div className="map-canvas">
          <DeckGL initialViewState={INITIAL_VIEW_STATE} controller layers={layers}>
            <Map reuseMaps mapStyle={MAP_STYLE as never} style={{ width: '100%', height: '100%' }}>
              <NavigationControl position="top-right" />
            </Map>
          </DeckGL>
        </div>

        {loadError ? <div className="map-debug">Data load error: {loadError}</div> : null}
        {!loadError && records.length === 0 ? <div className="map-debug">正在加载 H3 数据...</div> : null}

        <div className="legend">
          {layerMode === 'desert' ? (
            <>
              <LegendRow color="#18825e" label="Adequate" />
              <LegendRow color="#efb743" label="Vulnerable" />
              <LegendRow color="#dc783f" label="Desert" />
              <LegendRow color="#96251f" label="Severe Desert" />
            </>
          ) : (
            <>
              <LegendRow color="#c74234" label="0 - 25" />
              <LegendRow color="#e6812a" label="25 - 40" />
              <LegendRow color="#f2c84b" label="40 - 55" />
              <LegendRow color="#7fc765" label="55 - 70" />
              <LegendRow color="#2f9f71" label="70 - 100" />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function DetailPanel({ selected, travelMode }: { selected: HexRecord; travelMode: TravelMode }) {
  return (
    <div className="detail-card">
      <div className="detail-head">
        <strong>{selected.district_name}</strong>
        <span>{selected.h3}</span>
      </div>
      <Metric label={`综合评分 ${travelLabel(travelMode)}`} value={selected.composite_modes[travelMode].toFixed(1)} />
      <Metric label={`基础通达 ${travelLabel(travelMode)}`} value={selected.base_modes[travelMode].toFixed(1)} />
      <Metric label="健康赛道" value={selected.healthy_score.toFixed(1)} />
      <Metric label="运动荒漠" value={selected.desert_class} />
      <Metric
        label="最近地铁"
        value={
          selected.nearest_metro_m === null
            ? selected.nearest_metro_band
            : `${selected.nearest_metro_band} · ${Math.round(selected.nearest_metro_m).toLocaleString()}m`
        }
      />
      <Metric label="租金区间" value={selected.rent_band} />
      <Metric
        label="房价代理"
        value={selected.rent_price_yuan_m2 ? `${Math.round(selected.rent_price_yuan_m2).toLocaleString()} 元/㎡` : '未知'}
      />
      <Metric label="AQI 年均值" value={`${selected.aqi_avg.toFixed(1)} · ${selected.aqi_quality_mode}`} />
      <Metric label="主要污染物" value={selected.aqi_primary_pollutant} />
      <Metric label="绿化代理" value={selected.green_ratio.toFixed(2)} />

      <div className="facilities">
        <h3>主要设施</h3>
        <FacilityRow label="健身房/工作室" value={selected.facility_counts.fitness} />
        <FacilityRow label="户外健身设施" value={selected.facility_counts.outdoor_fitness} />
        <FacilityRow label="运动场/球场" value={selected.facility_counts.sport_fields} />
        <FacilityRow label="公共游泳池" value={selected.facility_counts.public_pool} />
        <FacilityRow label="瑜伽/武术/舞蹈" value={selected.facility_counts.mind_body} />
        <FacilityRow label="新鲜食品零售" value={selected.facility_counts.fresh_food} />
      </div>
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FacilityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="facility-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="legend-row">
      <span className="legend-swatch" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

function getLayerValue(record: HexRecord, layerMode: LayerMode, travelMode: TravelMode) {
  if (layerMode === 'composite') return record.composite_modes[travelMode]
  if (layerMode === 'base') return record.base_modes[travelMode]
  if (layerMode === 'track') return record.healthy_score
  return desertValue(record.desert_class)
}

function decodeCompactPayload(payload: CompactPayload): HexRecord[] {
  const dict = payload.dictionaries
  return payload.rows.map((row) => ({
    h3: String(row[0]),
    district_name: dict.districts[Number(row[1])] ?? '未知',
    base_modes: {
      walk: Number(row[2]),
      bike: Number(row[3]),
      transit: Number(row[4]),
      drive: Number(row[5]),
    },
    composite_modes: {
      walk: Number(row[6]),
      bike: Number(row[7]),
      transit: Number(row[8]),
      drive: Number(row[9]),
    },
    track_a_score: Number(row[10]),
    healthy_score: Number(row[11]),
    desert_class: dict.desert_classes[Number(row[12])] ?? 'No Data',
    green_ratio: Number(row[13]),
    green_score: Number(row[13]) * 100,
    aqi_avg: Number(row[14]),
    aqi_score: Number(row[15]),
    aqi_good_days_pct: Number(row[16]),
    aqi_quality_mode: dict.aqi_quality[Number(row[17])] ?? '未知',
    aqi_primary_pollutant: dict.aqi_pollutants[Number(row[18])] ?? '未知',
    nearest_metro_m: numberOrNull(row[19]),
    nearest_metro_band: dict.metro_bands[Number(row[20])] ?? 'Unknown',
    nearest_metro_name: '',
    rent_price_yuan_m2: numberOrNull(row[21]),
    rent_band: dict.rent_bands[Number(row[22])] ?? '未知',
    rent_score: Number(row[23]),
    rent_sample_name: '',
    rent_distance_m: null,
    facility_counts: {
      fitness: Number(row[24]),
      outdoor_fitness: Number(row[25]),
      sport_fields: Number(row[26]),
      public_pool: Number(row[27]),
      mind_body: Number(row[28]),
      fresh_food: Number(row[29]),
    },
  }))
}

function numberOrNull(value: string | number | null) {
  if (value === null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getFillColor(record: HexRecord, layerMode: LayerMode, travelMode: TravelMode): [number, number, number, number] {
  if (layerMode === 'desert') return desertColor(record.desert_class)
  return scoreColor(getLayerValue(record, layerMode, travelMode))
}

function scoreColor(score: number): [number, number, number, number] {
  if (score >= 70) return [47, 159, 113, 232]
  if (score >= 55) return [127, 199, 101, 224]
  if (score >= 40) return [242, 200, 75, 222]
  if (score >= 25) return [230, 129, 42, 224]
  return [199, 66, 52, 230]
}

function desertColor(label: string): [number, number, number, number] {
  if (label === 'Adequate') return [24, 130, 94, 228]
  if (label === 'Vulnerable') return [239, 183, 67, 226]
  if (label === 'Desert') return [220, 120, 63, 230]
  return [150, 37, 31, 234]
}

function desertValue(label: string) {
  if (label === 'Adequate') return 85
  if (label === 'Vulnerable') return 60
  if (label === 'Desert') return 35
  return 12
}

function metroScore(distance: number | null) {
  if (distance === null || Number.isNaN(distance)) return 0
  if (distance <= 300) return 100
  if (distance <= 800) return 82
  if (distance <= 1500) return 58
  if (distance <= 3000) return 28
  return 10
}

function travelLabel(mode: TravelMode) {
  if (mode === 'walk') return '步行'
  if (mode === 'bike') return '骑行'
  if (mode === 'transit') return '公交'
  return '驾车'
}

export default App
