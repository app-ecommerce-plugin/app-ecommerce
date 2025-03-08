// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Reemplaza el subdominio con el que te da ngrok
// Por ejemplo: "f2e0-188-26-196-143.ngrok-free.app"
const NGROK_SUBDOMAIN = '8c98-188-26-196-143.ngrok-free.app';

export default defineConfig({
  plugins: [react()],
  server: {
    // Puerto local donde corre Vite
    port: 5173,

    // Permite a otros dispositivos de tu LAN acceder, si lo deseas.
    // "host: true" o "host: '0.0.0.0'" hace que se abra en la red local.
    host: '0.0.0.0',

    // Aquí autorizas dominios externos, como el de ngrok.
    allowedHosts: [
      NGROK_SUBDOMAIN
    ],
  },
});