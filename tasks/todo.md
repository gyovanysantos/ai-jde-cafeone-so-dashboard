# Tasks — JDE CaféOne Sales Order Dashboard

## Phase 1: Infrastructure
- [x] Create `infra/main.bicep` — SWA + Key Vault + RBAC
- [x] Create `infra/parameters.json` — Azure defaults pre-filled

## Phase 2: Azure Function API Proxy
- [x] Create `api/package.json` — Function dependencies
- [x] Create `api/getOrderData/function.json` — HTTP trigger config
- [x] Create `api/getOrderData/index.js` — AIS proxy (auth + query F4211 + normalize)

## Phase 3: Frontend Dashboard
- [x] Create `js/mockData.js` — Sample datasets for demo mode
- [x] Create `js/api.js` — Browser API client → Azure Function
- [x] Create `js/charts.js` — Chart.js pie + bar chart
- [x] Create `js/tables.js` — Sortable table with CSS bars
- [x] Create `index.html` — Main page (HTML + CSS + module wiring)
- [x] Create `staticwebapp.config.json` — SWA routing

## Phase 4: Documentation
- [x] Create `README.md` — Deploy guide + JDE P98CAFE registration

## Phase 5: Verification
- [ ] Open index.html locally — mock data renders all 3 cards
- [ ] Table columns are sortable (click headers)
- [ ] Chart.js loads from CDN successfully
- [ ] Resize to 900px — layout stays clean
- [ ] Deploy to Azure — SWA URL loads correctly
- [ ] Set Key Vault secrets — live data flows through

## Review Notes
_To be filled after verification_
