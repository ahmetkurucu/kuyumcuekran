# ⚠️ HTML DOSYALARI EKSİK - TAMAMLANMASI GEREKEN

## 📋 Eksik Dosyalar

Aşağıdaki 3 HTML dosyası oluşturulmalı:

1. **public/login.html** - Giriş sayfası
2. **public/admin.html** - Marj ayarları sayfası  
3. **public/vitrin.html** - Fiyat gösterim sayfası

---

## ✅ ÇÖZÜM: Mevcut Uygulamadan Kopyala

Mevcut büyük uygulamanızdan bu dosyaları kopyalayabilirsiniz:

### 1️⃣ login.html
```bash
cp /big-app/public/login.html kuyumcu-vitrin-mini/public/
```

**Değişiklik gerekmiyor!** Aynen kullanılabilir.

### 2️⃣ admin.html

Mevcut admin.html'den sadece **marj ayarları** bölümünü alın.

**Kaldırılacaklar:**
- ❌ Stok modülü
- ❌ Sarrafiye modülü
- ❌ Satış modülü  
- ❌ Cari modülü
- ❌ Bozma modülü
- ❌ Döviz modülü

**Kalacaklar:**
- ✅ Marj ayarları kartı
- ✅ Şifre değiştir
- ✅ Çıkış butonu

### 3️⃣ vitrin.html
```bash
cp /big-app/public/vitrin.html kuyumcu-vitrin-mini/public/
```

**Değişiklik gerekmiyor!** Aynen kullanılabilir.

---

## 🎯 Hızlı Çözüm

Tam çalışır halde hazır uygulamayı istiyorsanız:

```
Mevcut uygulamanızı kullanın ama sadece:
- login.html
- admin.html (sadece marj kısmı)
- vitrin.html

sayfalarını açık tutun. Diğer linkleri kaldırın.
```

---

## 📦 Alternatif: Basit HTML Şablonları

Eğer sıfırdan oluşturmak isterseniz:

### login.html şablonu
```html
<!DOCTYPE html>
<html>
<head>
  <title>Giriş</title>
</head>
<body>
  <form id="loginForm">
    <input type="text" id="username" placeholder="Kullanıcı adı">
    <input type="password" id="password" placeholder="Şifre">
    <button type="submit">Giriş</button>
  </form>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/admin.html';
      }
    });
  </script>
</body>
</html>
```

---

## ✅ Sonuç

Backend tamam! Frontend HTML dosyalarını ekleyince tam çalışır hale gelecek.

**En kolay yol:** Mevcut uygulamanızdan 3 HTML dosyasını kopyalayın.
