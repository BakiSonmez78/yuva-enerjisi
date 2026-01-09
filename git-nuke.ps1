
# 1. Kill old git
Remove-Item -Recurse -Force .git
Write-Host "Eski Git geçmişi silindi."

# 2. Init New
git init
git add .
git commit -m "Initial clean commit"
Write-Host "Yeni temiz repo oluşturuldu."

# 3. Push Force
git branch -M main
git remote add origin https://github.com/BakiSonmez78/yuva-enerjisi.git
git push -u origin main --force
Write-Host "Zorla yüklendi!"
