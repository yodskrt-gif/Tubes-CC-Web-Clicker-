# Implementasi Containerization & Deployment AWS EC2: Quantum Clicker Game

Proyek ini mendemonstrasikan kontainerisasi aplikasi game clicker berbasis web menggunakan Docker & Docker Compose, serta panduan lengkap pendeployan ke layanan cloud **AWS EC2**.

---

## Prasyarat Utama
Sebelum melakukan deployment, pastikan Anda telah memiliki:
1. Akun AWS aktif.
2. Private Key SSH (`.pem`) untuk akses ke EC2.
3. Git diinstal secara lokal (opsional, untuk transfer kode).

---

## Langkah 1: Luncurkan Instans AWS EC2 (Launch Instance)

1. Masuk ke **AWS Management Console** dan buka dashboard **EC2**.
2. Klik tombol **Launch Instance**.
3. Isi konfigurasi instans berikut:
   - **Name**: `quantum-clicker-server` (atau nama pilihan Anda).
   - **OS Image (AMI)**: Pilih **Ubuntu Server 24.04 LTS** (Free Tier eligible).
   - **Instance Type**: Pilih **t2.micro** (Free Tier eligible).
   - **Key Pair**: Pilih Key Pair Anda (untuk login SSH).
4. **Network Settings (Security Group)**:
   - Buat Security Group baru dan konfigurasi aturan inbound (Inbound Rules) berikut:
     - **SSH**: Port `22` (Sumber: `Anywhere` atau `My IP` untuk keamanan maksimal).
     - **HTTP**: Port `80` (Sumber: `Anywhere 0.0.0.0/0` agar website bisa diakses publik).
5. Klik **Launch Instance**.

---

## Langkah 2: Hubungkan ke Instans EC2 via SSH

Buka terminal lokal Anda (atau Git Bash di Windows) dan jalankan perintah:

```bash
# Ganti path key dan IP Public EC2 Anda
ssh -i /path/ke/private-key.pem ubuntu@<IP_PUBLIC_EC2>
```

---

## Langkah 3: Instalasi Docker & Docker Compose di EC2 (Ubuntu)

Setelah berhasil login ke dalam EC2 Anda, jalankan perintah berikut secara berurutan untuk menginstal Docker:

```bash
# 1. Update package list
sudo apt-get update

# 2. Instal dependensi prasyarat
sudo apt-get install -y ca-certificates curl gnupg

# 3. Tambahkan Docker official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 4. Setup repositori Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Instal Docker Engine & Docker Compose
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6. Aktifkan user EC2 agar bisa menjalankan Docker tanpa 'sudo'
sudo usermod -aG docker ubuntu
```

> **PENTING:** Setelah perintah ke-6, silakan **logout** dari SSH (`exit`) lalu **login kembali** agar izin grup baru Anda aktif.

---

## Langkah 4: Transfer Kode Proyek ke EC2

Anda memiliki 2 cara untuk mentransfer kode proyek ini ke dalam server EC2:

### Cara A: Melalui Git (Direkomendasikan)
1. Unggah kode proyek ini ke repositori Git pribadi (GitHub/GitLab).
2. Di terminal EC2, jalankan perintah clone:
   ```bash
   git clone <URL_REPOSITORI_ANDA>
   cd calm-carson
   ```

### Cara B: Menggunakan SCP (Secure Copy) dari Komputer Lokal Anda
Jalankan perintah ini di **terminal lokal komputer Anda** (bukan di dalam EC2):
```bash
# Kirim seluruh folder proyek ke server EC2
scp -i /path/ke/private-key.pem -r C:\Users\Danu Yoda\Documents\antigravity\calm-carson ubuntu@<IP_PUBLIC_EC2>:~/
```
Setelah transfer selesai, kembali masuk ke terminal EC2 via SSH dan buka foldernya:
```bash
cd ~/calm-carson
```

---

## Langkah 5: Jalankan Aplikasi Menggunakan Docker Compose

Di dalam folder proyek di EC2, jalankan perintah berikut:

```bash
# Bangun image dan jalankan kontainer di background (-d)
docker compose up -d --build
```

Docker Compose akan otomatis mengunduh base image `node:18-alpine`, menginstal dependensi produksi, menyalin file frontend/backend, memetakan port 80 server EC2 ke port 3000 aplikasi, serta membuat volume mounting untuk database lokal di `./data`.

Untuk melihat logs kontainer, gunakan:
```bash
docker compose logs -f
```

---

## Langkah 6: Verifikasi & Uji Coba

1. Buka web browser Anda.
2. Akses alamat IP Public EC2 Anda: `http://<IP_PUBLIC_EC2>` (tanpa port, karena sudah dialihkan ke port 80).
3. Halaman game klik quantum core interaktif akan muncul.
4. Buka tab samaran (Incognito) atau bagikan link IP EC2 ke rekan Anda untuk menguji obrolan (real-time chat) dan leaderboard dinamis yang otomatis ter-refresh saat ada pemain yang mengklik core!
5. Untuk memverifikasi persistensi database, coba matikan kontainer (`docker compose down`) dan jalankan kembali (`docker compose up -d`). Skor leaderboard Anda tidak akan hilang karena telah tersimpan aman di volume host.
