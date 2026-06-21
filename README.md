# Application V1 - Healthy Access Explorer

Public-facing Shanghai 15-minute-city H3 web application built with React, Vite,
MapLibre/Mapbox-style raster tiles, and deck.gl `H3HexagonLayer`.

## Features

- H3 choropleth at resolution 8, colored by comprehensive score
- Travel mode switch: walk, bike, transit, drive
- Layer switch: composite score, base accessibility, Healthy Lifestyle track, sports desert risk
- Click hexagon for main facilities, nearest metro, rent / housing price proxy, and AQI
- Home recommender with priority sliders and top-10 H3 highlights
- Data transparency panel with source, date, and limitations
- Mobile-friendly sidebar + map layout

## Local Run

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 4174
```

Local URL:

```text
http://127.0.0.1:4174
```

## Rebuild Data

From the repository root:

```bash
D:/anaconda/envs/geo_env/python.exe scripts/build_application_v1_data.py
```

The app reads:

- `public/data/app_v1_h3_data_compact.json`
- `public/data/transparency_v1.json`

## Build

```bash
npm run build
```

## Vercel

- Root directory: `submit/applicationV1`
- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
