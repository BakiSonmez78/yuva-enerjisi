
# 1. Soft reset to undo the last commit that had the secrets
git reset --soft HEAD~1
Write-Host "Geçmiş sıfırlandı."

# 2. Add files again (ignoring .env because it is in .gitignore)
git add .
Write-Host "Dosyalar eklendi."

# 3. Commit clean version
git commit -m "Initial commit (Clean)"
Write-Host "Temiz versiyon paketlendi."

# 4. Push force (to overwrite any partial remote state)
git push -u origin main --force
Write-Host "GitHub'a yüklendi!"
