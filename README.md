# JDE CaféOne — Sales Order Dashboard

A lightweight, embeddable dashboard for JD Edwards EnterpriseOne Sales Orders (P4210). Designed to run inside a JDE CaféOne iFrame, showing real-time order data from the AIS REST API.

## What It Does

When a user opens a Sales Order in JDE and clicks the CaféOne panel, this dashboard displays:

1. **🥧 Orders by Status** — Pie chart showing order line counts grouped by Next Status code (NXTR)
2. **📊 Amount by Item** — Sortable table of extended price (AEXP) by item, with visual bar indicators
3. **📅 Ship Date Timeline** — Bar chart showing order amounts bucketed by Requested Ship Date (DRQJ)

If no order number is passed (default mode), the page shows sample data with a "Connect to JDE" watermark.

---

## Architecture

```
┌─────────────────────────────────┐
│  JDE EnterpriseOne (Browser)    │
│  ┌───────────────────────────┐  │
│  │  CaféOne iFrame           │  │
│  │  ?orderNumber=X&BU=Y      │  │
│  │  ┌─────────────────────┐  │  │
│  │  │ index.html           │  │  │
│  │  │  js/api.js → fetch() │  │  │
│  │  └────────┬────────────┘  │  │
│  └───────────┼───────────────┘  │
└──────────────┼──────────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────────┐
│  Azure Static Web App            │
│  ├── index.html + js/*           │
│  └── /api/getOrderData (Function)│
│       │                          │
│       ├── Azure Key Vault        │
│       │   (AIS credentials)      │
│       │                          │
│       └── JDE AIS Server         │
│           POST /jderest/v2/...   │
│           (F4211 data service)   │
└──────────────────────────────────┘
```

**Key security detail**: AIS credentials (username/password) are stored in Azure Key Vault. The Azure Function reads them at runtime using Managed Identity. The browser **never** sees AIS credentials.

---

## Prerequisites

- **Azure CLI** (`az`) v2.50+ — [Install](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- **Azure subscription** with permissions to create resources
- **GitHub repository** — this code pushed to a GitHub repo
- **JDE AIS Server** — accessible from Azure (network/firewall rules configured)

---

## Deploy to Azure

### Step 1: Update Parameters

Edit `infra/parameters.json`:

```json
{
  "repositoryUrl": { "value": "https://github.com/YOUR_ORG/ai-jde-cafeone-so-dashboard" },
  "keyVaultAdminObjectId": { "value": "YOUR_AZURE_AD_USER_OBJECT_ID" }
}
```

> **How to find your Object ID**: Run `az ad signed-in-user show --query id -o tsv`

### Step 2: Deploy Bicep

```bash
# Login to Azure
az login --tenant e50a00e6-d58e-48eb-8d39-a6601a1b7550

# Set subscription
az account set --subscription 74528fbf-d0fa-4d72-b3ef-dee45c2a8293

# Create resource group (if not exists)
az group create --name rg-hackathon-2603 --location eastus2

# Deploy infrastructure
az deployment group create \
  --resource-group rg-hackathon-2603 \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json
```

The deployment outputs the Static Web App hostname (e.g., `https://blue-sky-abc123.azurestaticapps.net`).

### Step 3: Configure Key Vault Secrets

Set the 3 AIS secrets that the Azure Function needs:

```bash
# Replace with your actual AIS server details
KV_NAME="kv-jde-cafeone-so"

az keyvault secret set --vault-name $KV_NAME --name "AIS-BASE-URL" --value "https://your-jde-ais-server:port"
az keyvault secret set --vault-name $KV_NAME --name "AIS-USERNAME" --value "your_ais_username"
az keyvault secret set --vault-name $KV_NAME --name "AIS-PASSWORD" --value "your_ais_password"
```

> **Important**: The AIS user should have minimum permissions — only read access to F4211 (Sales Order Detail) via data service. Create a dedicated JDE user for this purpose.

### Step 4: Install Azure Function Dependencies

After the SWA is deployed, the `api/` folder is automatically deployed as a managed Azure Function. The `package.json` dependencies (`@azure/identity`, `@azure/keyvault-secrets`) are installed automatically during the SWA build.

If you're using GitHub Actions (recommended), the SWA deploys automatically on every push to `main`.

### Step 5: Verify

1. Open the SWA URL in a browser — you should see the dashboard in **mock data mode**
2. Add URL params to test: `?orderNumber=12345&businessUnit=M30`
3. The dashboard should fetch live data from your AIS server

---

## Register in JDE CaféOne (P98CAFE)

To make this dashboard appear inside JDE:

1. Open JDE and navigate to **P98CAFE** (CaféOne Application Configuration)
2. Add a new CaféOne Application:
   - **Application**: `P4210` (Sales Order Entry)
   - **Form**: `W4210A` (or whichever form you want the panel on)
   - **URL**: `https://YOUR-SWA-HOSTNAME.azurestaticapps.net/?orderNumber=<DOCO>&businessUnit=<MCU>`
   - **Description**: `Sales Order Dashboard`
3. The `<DOCO>` and `<MCU>` tokens are JDE Form Interconnect tokens — JDE replaces them with the current order number and business unit when loading the CaféOne page.

> **Note**: The exact token syntax (`<DOCO>` vs `[DOCO]`) depends on your JDE Tools Release. Consult your JDE CNC administrator for the correct format.

---

## File Structure

```
so-cafeone/
├── index.html                    # Main dashboard page
├── staticwebapp.config.json      # SWA routing config
├── js/
│   ├── api.js                    # Browser API client (calls Azure Function)
│   ├── charts.js                 # Chart.js pie + bar chart rendering
│   ├── tables.js                 # Sortable table with CSS bar indicators
│   └── mockData.js               # Sample data for demo mode
├── api/
│   ├── package.json              # Azure Function dependencies
│   └── getOrderData/
│       ├── function.json         # HTTP trigger config
│       └── index.js              # AIS proxy (auth + query + normalize)
└── infra/
    ├── main.bicep                # Azure Static Web App + Key Vault
    └── parameters.json           # Deployment parameters
```

---

## JDE Tables & Fields Referenced

| Table | Alias | Description |
|-------|-------|-------------|
| F4201 | OH | Sales Order Header |
| F4211 | OD | Sales Order Detail |

| Field | Table | Description |
|-------|-------|-------------|
| DOCO | F4211 | Document Order Number (SO number) |
| MCU | F4211 | Business Unit / Branch Plant |
| NXTR | F4211 | Next Status Code (order line status) |
| AEXP | F4211 | Extended Price (line amount) |
| SHAN | F4211 | Ship To Address Number |
| LITM | F4211 | 2nd Item Number (short item ID) |
| DRQJ | F4211 | Date — Requested (Julian format) |
| DSC1 | F4211 | Description Line 1 |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Dashboard shows mock data with params | Azure Function not deployed | Check SWA build logs, ensure `api/` is included |
| "AIS request timed out" | AIS server unreachable from Azure | Check AIS firewall rules, ensure HTTPS is open |
| "AIS authentication failed" | Wrong credentials | Verify Key Vault secrets match a valid JDE user |
| "No status data returned" | Order not found in F4211 | Verify order number exists and has detail lines |
| Charts don't render | Chart.js CDN blocked | Check if corporate firewall blocks cdn.jsdelivr.net |

---

## Tech Stack

| Component | Version | Why |
|-----------|---------|-----|
| Vanilla HTML/CSS/JS | ES6+ | No framework overhead — fast load in CaféOne iFrame |
| Chart.js | 4.4.7 (CDN) | Lightweight, canvas-based charts. Only ~60KB gzipped |
| Azure Static Web Apps | Free tier | Zero-cost hosting with built-in managed API functions |
| Azure Key Vault | Standard | Secure credential storage — AIS passwords never in code |
| Azure Bicep | Latest | Infrastructure as Code — reproducible deployments |
| Node.js | 18+ | Azure Function runtime for AIS proxy |
