import { env } from './env.js';

/**
 * Validates whether an incoming HTTP or WebSocket Origin header is permitted.
 * Supports:
 * - Native mobile applications (which typically send no Origin header)
 * - Explicit FRONTEND_URL
 * - Local development (localhost / 127.0.0.1 on any port)
 * - Local Area Network IPv4 addresses (10.x.x.x, 192.168.x.x, 172.16-31.x.x) for physical mobile phone testing
 * - Expo development origins (exp:// or *.exp.direct tunnel domains)
 */
export function isAllowedOrigin(origin?: string): boolean {
  // Allow requests without Origin header (native React Native / OkHttp, Postman, curl, server-to-server)
  if (!origin) {
    return true;
  }

  // Allow all if explicitly configured in environment
  if (env.ENABLE_CORS_ALL) {
    return true;
  }

  // Allow configured frontend URL
  if (env.FRONTEND_URL && origin === env.FRONTEND_URL) {
    return true;
  }

  // Allow localhost and loopback with any port
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  // Allow private LAN IPv4 addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (
    /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
      origin
    )
  ) {
    return true;
  }

  // Allow Expo development client origins
  if (/^exp:\/\//.test(origin) || /^https?:\/\/[a-z0-9-]+\.exp\.direct(:\d+)?$/.test(origin)) {
    return true;
  }

  // Allow Cloudflare Tunnel origins (*.trycloudflare.com)
  if (/^https?:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) {
    return true;
  }

  return false;
}
