# Awl Service Bus Explorer (v1.0.0)

Awl Service Bus adalah aplikasi desktop modern dan ringan untuk mengelola Azure Service Bus. Dibangun menggunakan arsitektur Rust (Tauri) dan React, aplikasi ini dirancang untuk inspeksi pesan yang cepat dengan konsumsi sumber daya minimal.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)

---

## Fitur Utama

* **Multi-Connection Manager:** Menyimpan dan mengelola daftar connection string Azure Service Bus secara aman.
* **Smart Message Peek:** Inspeksi pesan pada antrean Active maupun Dead-Letter (DLQ).
* **High-Speed Purge:** Penghapusan pesan massal dalam waktu singkat menggunakan mode ReceiveAndDelete.
* **Monaco Editor Integration:** Pengiriman pesan dengan validasi JSON otomatis dan dukungan Custom Properties.
* **Optimized Performance:** Backend menggunakan Rust untuk performa yang stabil dan penggunaan RAM yang sangat rendah.
* **Professional UI:** Sidebar intuitif, desain responsif, dan indikator status proses yang jelas.

---

## Teknologi

* **Frontend:** React, TypeScript, Vite, Lucide Icons, Monaco Editor.
* **Backend:** Rust, Tauri v2, Tokio (Async Runtime).
* **Styling:** Custom CSS dengan optimasi performa.

---

## Instalasi

### Windows
Unduh file .msi atau .exe dari halaman Releases, kemudian jalankan installer.

### Linux (Ubuntu/Debian)
1. Unduh file .deb.
2. Jalankan perintah instalasi melalui terminal:
   ```bash
   sudo dpkg -i awal-service-bus_1.0.0_amd64.deb
   ```
Pengembangan Lokal
Untuk melakukan pengembangan atau modifikasi pada mesin lokal:

1. Clone repositori:
  ```bash
  git clone [https://github.com/awaluddin-dev/awl-service-bus.git](https://github.com/awaluddin-dev/awl-service-bus.git)
  cd awal-service-bus
  ```
2. Instal dependensi:
  ```bash
  npm install
  ```
3. Menjalankan mode development:
  ```bash
  npm run tauri dev
  ```
4. Kompilasi produksi:
  ```bash
  npm run tauri build
  ```

---

## Kontribusi
Kontribusi dalam bentuk pelaporan bug atau usulan fitur baru sangat diapresiasi. Silakan buka issue atau kirimkan pull request melalui repositori ini.

---

## Lisensi
Proyek ini dilisensikan di bawah MIT License.

Dikembangkan oleh [Awaluddin](https://github.com/awaluddin-dev)

---

