# Publishing NRI FinWealth (Windows)

## A. Put the code on GitHub (once)
1. Create an account at github.com. Click New repository. Name: `nri-finwealth`. Public. Do NOT tick "add README".
2. Install Git for Windows (git-scm.com), then in PowerShell:
```
cd C:\Users\User\projects\nri-finwealth-engine
git init
git add .
git commit -m "First public version"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/nri-finwealth.git
git push -u origin main
```
Later updates: `git add .`, `git commit -m "what changed"`, `git push`.

## B. Put it online with Cloudflare Pages (free)
1. Create an account at cloudflare.com. Workers & Pages > Create > Pages > Connect to Git. Choose the repository.
2. Build command: `npm run build`. Output directory: `dist`. Framework preset: Vite.
3. Save and deploy. You get `something.pages.dev`. Every `git push` redeploys.

## C. Your own domain (later)
Buy a domain (Cloudflare Registrar sells at cost). In the Pages project: Custom domains > Set up a domain.
