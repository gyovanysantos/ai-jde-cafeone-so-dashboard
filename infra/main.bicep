// ============================================================================
// JDE CaféOne Sales Order Dashboard — Azure Infrastructure
// ============================================================================
// Provisions:
//   1. Azure Static Web App (Free tier) — hosts the dashboard frontend + managed API
//   2. Azure Key Vault — stores AIS credentials (AIS-BASE-URL, AIS-USERNAME, AIS-PASSWORD)
//   3. RBAC — grants the SWA managed identity "Key Vault Secrets User" role
//
// Deploy with:
//   az deployment group create \
//     -g rg-hackathon-2603 \
//     --template-file infra/main.bicep \
//     --parameters @infra/parameters.json
// ============================================================================

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Name of the Static Web App')
param staticWebAppName string = 'swa-jde-cafeone-so-dashboard'

@description('Name of the Key Vault')
param keyVaultName string = 'kv-jde-cafeone-so'

@description('GitHub repository URL (HTTPS)')
param repositoryUrl string = 'https://github.com/YOUR_ORG/ai-jde-cafeone-so-dashboard'

@description('GitHub branch to deploy from')
param repositoryBranch string = 'main'

@description('SKU for the Static Web App')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Free'

@description('Object ID of the user or service principal that should get Key Vault admin access')
param keyVaultAdminObjectId string = ''

// ============================================================================
// 1. Azure Static Web App
// ============================================================================
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: repositoryBranch
    buildProperties: {
      appLocation: '/'           // Root of the repo contains index.html
      apiLocation: 'api'         // Azure Functions managed API folder
      outputLocation: ''         // No build step — serve files as-is
    }
  }
  // SWA gets a system-assigned managed identity to access Key Vault
  identity: {
    type: 'SystemAssigned'
  }
}

// ============================================================================
// 2. Azure Key Vault
// ============================================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    // Use Azure RBAC for access control (recommended over access policies)
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: false  // Allow purge in dev/hackathon — enable in production
  }
}

// ============================================================================
// 3. RBAC — Key Vault Secrets User role for the SWA managed identity
// ============================================================================
// Role definition ID for "Key Vault Secrets User" (built-in)
// This lets the Azure Function read secrets but not modify them
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource swaKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, staticWebApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: staticWebApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// 4. (Optional) Key Vault Admin role for the deploying user
// ============================================================================
// Grants the deploying user "Key Vault Administrator" so they can set secrets
var keyVaultAdminRoleId = '00482a5a-887f-4fb3-b363-3b7fe8e74483'

resource adminKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(keyVaultAdminObjectId)) {
  name: guid(keyVault.id, keyVaultAdminObjectId, keyVaultAdminRoleId)
  scope: keyVault
  properties: {
    principalId: keyVaultAdminObjectId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultAdminRoleId)
    principalType: 'User'
  }
}

// ============================================================================
// 5. Static Web App — App Settings (Key Vault reference for AIS URL)
// ============================================================================
// NOTE: SWA Free tier does not support linked backends or Key Vault references
// in app settings natively. The Azure Function code will use @azure/keyvault-secrets
// SDK with DefaultAzureCredential to read secrets at runtime.
// We store the Key Vault URI as an app setting so the function knows where to look.
resource swaAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    KEY_VAULT_URI: keyVault.properties.vaultUri
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('The default hostname of the Static Web App')
output staticWebAppHostname string = staticWebApp.properties.defaultHostname

@description('The Key Vault URI (set this in the Azure Function environment)')
output keyVaultUri string = keyVault.properties.vaultUri

@description('The SWA resource ID')
output staticWebAppId string = staticWebApp.id
