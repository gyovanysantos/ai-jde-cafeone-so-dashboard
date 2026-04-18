# LEARNING.md — Lessons Learned

## Azure Static Web Apps (SWA)
- **SKU**: Hackathon/sandbox subscriptions may not support `Free` SKU. Use `Standard` instead.
- **Deployment**: Bicep `repositoryUrl` alone doesn't auto-deploy code. You need either:
  1. A **GitHub Actions workflow** (recommended) with the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret, OR
  2. The **SWA CLI** (`swa deploy`) with the deployment token
- **SWA CLI pitfalls**: The CLI may silently fail on Windows and can corrupt the `.git` directory. GitHub Actions is more reliable.
- **API runtime**: Specify `--api-language node --api-version 18` explicitly; default is Node 16.

## Azure Key Vault
- **Purge protection**: Once enabled, it **cannot** be disabled. Set `enablePurgeProtection: true` in Bicep if the vault already has it on.
- **RBAC vs Access Policies**: If your account lacks `Microsoft.Authorization/roleAssignments/write`, use access policies instead of RBAC. Use a `deployRbac` bool parameter to toggle.

## Azure Bicep / ARM
- **RBAC permission errors**: Sandbox/hackathon subscriptions often don't have permission to create role assignments. Make RBAC resources conditional with `if (deployRbac)`.
- **Parameters file overrides defaults**: If `parameters.json` specifies a value, it overrides the `param` default in Bicep. Always check both files.

## Git
- **Corrupted `.git` directory**: If `.git` exists but `git status` says "not a git repository," the directory is corrupted (missing HEAD, config, refs). Fix with:
  ```bash
  rmdir /s /q .git
  git init
  git remote add origin <url>
  git fetch origin
  git reset --mixed origin/master
  ```
- **GitHub CLI (`gh`)**: Use `--repo owner/repo` flag if `gh` can't detect the repo automatically.

## GitHub Actions
- **SWA deploy action**: Use `Azure/static-web-apps-deploy@v1` with `skip_app_build: true` for vanilla HTML/JS (no build step needed).
- **GitHub secret setup**: Use `gh secret set SECRET_NAME --body "value" --repo owner/repo` to set secrets from CLI.
