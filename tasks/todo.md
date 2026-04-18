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
- [x] Open index.html locally — mock data renders all 3 cards
- [x] Table columns are sortable (click headers)
- [x] Chart.js loads from CDN successfully
- [x] Resize to 900px — layout stays clean
- [x] Deploy to Azure — SWA URL loads correctly
- [ ] Set Key Vault secrets — live data flows through

## Review Notes
- Bicep needed `Standard` SKU (not `Free`) for hackathon subscription
- RBAC role assignments require elevated permissions; used access policies fallback
- Key Vault purge protection is irreversible once enabled
- SWA CLI local deploy silently failed; GitHub Actions workflow was the reliable path
- SWA CLI corrupted `.git` directory (deleted objects); had to reinitialize
- SWA live at: https://yellow-grass-05f04400f.7.azurestaticapps.net
- Key Vault URI: https://kv-jde-cafeone-so.vault.azure.net/
