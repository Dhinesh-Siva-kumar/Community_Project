// Minimal ambient typing for the one `qrcode` API this app uses. The
// package's own @types/qrcode declarations reference Node's "stream"
// module, which pulls @types/node's ambient globals into the whole app and
// breaks the browser-only `window.setInterval`/`setTimeout` typings used
// elsewhere (e.g. community-detail.component.ts) — so a self-contained
// browser-safe shim is used here instead of installing @types/qrcode.
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    color?: { dark?: string; light?: string };
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
