
# 1. Git Init
if (-not (Test-Path .git)) {
    git init
    Write-Host "Git deposu başlatıldı."
}

# 2. Add and Commit
git add .
git commit -m "Initial commit of Yuva Enerjisi App"
Write-Host "Dosyalar commitlendi."

Write-Host "---------------------------------------------------"
Write-Host "Şimdi GitHub'da yeni bir 'Repo' oluşturun (Public)."
Write-Host "Sonra şu komutları sırasıyla çalıştırın:"
Write-Host "---------------------------------------------------"
Write-Host "git branch -M main"
Write-Host "git remote add origin https://github.com/KULLANICI_ADINIZ/REPO_ADINIZ.git"
Write-Host "git push -u origin main"
Write-Host "---------------------------------------------------"
