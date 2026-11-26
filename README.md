# makefun-best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/belski21-growl/makefun-best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/belski21-growl/makefun-best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Merpati Kilat** — game terbang 3D arcade di atas Indonesia. Tiga misi
(PAGI / SIANG / SENJA): lepas landas, lewati ring, hancurkan target darat,
lalu mendarat untuk **bank** skor. Tanpa menu — langsung di landasan, tahan
↑ dan terbang.

## Kenapa seru

- **Cuaca itu mekanik, bukan hiasan.** Awan menyembunyikanmu dari tembakan
  darat, tapi kelamaan di awan = es di sayap, pesawat melambat. Petir di
  SENJA bikin HUD berkedip. Angin lembah mendorong pesawat saat terbang
  rendah di ngarai.
- **Dunia Indonesia nyata.** Ngarai Bromo saat matahari terbit, kepulauan
  Raja Ampat, Monas, Borobudur — semua prosedural, tanpa aset unduhan.
- **Radio chatter menara kontrol Indonesia.** "Merpati 1, angin barat
  20 knot…" — drama murah via teks + beep.
- **Musik per stage, disintesis WebAudio.** PAGI: sasando Rote (petikan
  harpa lembut). SIANG: gamelan cerah. SENJA: kecak chant + gong kebyar
  Bali yang dramatis. Tanpa file audio sama sekali.
- **Progression antar misi.** Pilih 1 dari 3 modul: Mesin Kilat, Badan
  Baja, atau Meriam Ganda — trade-off, bukan upgrade lurus.
- **Combo meter + bonus mendarat presisi.** Ring dan target beruntun
  menaikkan multiplier; mendarat mulus di landasan pendek = bonus besar,
  mendarat kasar = badan rusak.
- **3D WebGL tulisan tangan.** Tanpa Three.js, tanpa library, tanpa CDN —
  matriks, shader, terrain heightmap, dan pesawat semuanya ditulis dari nol.
  Total ~2.500 baris kode game, semuanya authored (vendor 0 baris) — lihat
  `build-log.md` untuk hitungan ceiling reproduces.

## Cara menang

Skor misi hanya aman setelah **mendarat** — skor yang belum di-bank hilang
kalau pesawat jatuh. Tinggal lebih lama di udara = poin lebih banyak, tapi
bahan bakar menipis dan meriam darat terus menembak. Ring pertama ada kurang
dari 5 detik setelah lepas landas: jangan buang waktu.

## Kontrol

| Tombol | Fungsi |
| --- | --- |
| ↑ / W | Gas (thrust) — lepas gas = jatuh pelan, gas lagi = melesat |
| ← → / A D | Belok (bank) |
| ↓ / S | Rem udara |
| Spasi | Tembak |
| C | Ganti kamera (chase / kokpit) |
| M | Suara on/off |
| 1 / 2 / 3 | Pilih modul antar misi |
| Enter | Lanjut / mulai misi |

## Run it

```sh
node serve.ts
```

Lalu buka http://localhost:8080 di browser desktop (Chrome).

Mode screenshot deterministik (untuk juri): `?shot=hero`,
`?shot=cockpit`, `?shot=storm`, atau `?shot=landing`.

## Struktur

- `game/index.html` — halaman + HUD (DOM overlay)
- `game/engine.js` — WebGL tulisan tangan: matriks, shader, mesh builder
- `game/world.js` — terrain, landmark Indonesia, landasan, ring, target, awan
- `game/flight.js` — fisika terbang, cuaca, misi, peluru, partikel
- `game/audio.js` — musik per stage (sasando / gamelan / kecak) + SFX + radio
- `game/presentation.js` — HUD, banner, overlay misi/modul
- `game/main.js` — loop utama, kamera, render, alur misi
- `main.ts` — entrypoint: salin game + screenshots, tulis dossier.json
- `serve.ts` — server statik lokal
- `shots.json` — definisi 4 screenshot

<sub>Entered on [make.fun](https://make.fun/?ref=quick-lynx-56&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
