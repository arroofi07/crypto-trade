# Fixture lokal

Fixture tidak boleh memuat secret, private key, atau data provider live. `session.ts` berisi token publik deterministik untuk server tes pada port 14317; runtime produksi selalu membuat token acak baru. `runtime-child.mjs` meneruskan pesan IPC ke lifecycle SIGINT agar graceful shutdown dapat diuji di Windows tanpa mematikan proses lain.
