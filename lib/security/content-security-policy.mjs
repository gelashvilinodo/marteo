export const THEME_SCRIPT_HASH = 'sha256-Q1g1mNzNKiDGrFW79GkS97oD5ZhMDvoXn1rjdNiMh+g=';
const STORAGE = 'https://uwxmbyweyvnekzzecroz.supabase.co';
// Google Analytics loads only after cookie consent; these are Google's documented GA4 hosts.
const GA_SCRIPT = 'https://*.googletagmanager.com';
const GA_DATA = 'https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com';

/** @param {{nonce?: string, hashes?: string[], development?: boolean, baseline?: boolean}} [options] */
export function contentSecurityPolicy({nonce, hashes = [], development = false, baseline = false} = {}) {
    if (nonce && !/^[A-Za-z0-9+/]{22}==$/.test(nonce)) throw new Error('Invalid CSP nonce');
    if (hashes.some(hash => !/^sha256-[A-Za-z0-9+/]{43}=$/.test(hash))) throw new Error('Invalid CSP hash');
    const trusted = (development || baseline ? [] : [...new Set([THEME_SCRIPT_HASH, ...hashes])]).map(hash => `'${hash}'`);
    const scripts = ["'self'", "'wasm-unsafe-eval'", GA_SCRIPT, ...trusted];
    if (nonce) scripts.push(`'nonce-${nonce}'`);
    // Only the diagnostic Node server uses baseline. The Cloudflare entrypoint
    // replaces it with per-response nonces or hashes; never with unsafe-inline.
    if (development || baseline) scripts.push("'unsafe-inline'");
    if (development) scripts.push("'unsafe-eval'");
    return [
        "default-src 'self'",
        `script-src ${scripts.join(' ')}`,
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${STORAGE} ${GA_DATA}`,
        "font-src 'self' data:",
        `connect-src 'self' ${STORAGE} https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com ${GA_DATA}${development ? ' ws: wss:' : ''}`,
        "worker-src 'self' blob:",
        "frame-src 'self' blob:",
        "media-src 'self' blob:",
        "manifest-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "object-src 'none'",
        "base-uri 'self'",
    ].join('; ');
}

/** @param {string} pathname */
export function canonicalPath(pathname) {
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** @param {Request} request @param {{routes: Record<string, string[]>}} manifest */
export function prepareCspRequest(request, manifest) {
    const path = canonicalPath(new URL(request.url).pathname);
    const hashes = Object.hasOwn(manifest.routes, path) ? manifest.routes[path] : undefined;
    const resource = path.startsWith('/api/') || path === '/api' || path.startsWith('/_next/') || /\.[a-z0-9]{1,8}$/i.test(path);
    let nonce;
    if ((!hashes || path === '/_not-found' || path === '/_global-error' || !['GET', 'HEAD'].includes(request.method)) && !resource) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        nonce = btoa(String.fromCharCode(...bytes));
    }
    const headers = new Headers(request.headers);
    // A client-supplied nonce/CSP must never become trusted input to Next's renderer.
    headers.delete('x-nonce');
    headers.delete('content-security-policy-report-only');
    headers.set('x-marteo-csp-render', '1');
    headers.set('content-security-policy', contentSecurityPolicy({nonce, hashes}));
    return {request: new Request(request, {headers}), nonce, hashes, https: new URL(request.url).protocol === 'https:'};
}

/** @param {Response} response @param {{nonce?:string, hashes?:string[], https?:boolean}} context @param {{routes: Record<string, string[]>}} manifest */
export function secureCspResponse(response, context, manifest) {
    if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) return response;
    // Static 404/error fallbacks can be served for otherwise dynamic URLs.
    const fallback = response.status === 404 ? manifest.routes['/_not-found'] : response.status >= 500 ? manifest.routes['/_global-error'] : [];
    const headers = new Headers(response.headers);
    headers.set('content-security-policy', contentSecurityPolicy({nonce: context.nonce, hashes: [...(context.hashes ?? []), ...(fallback ?? [])]}));
    headers.delete('content-security-policy-report-only');
    headers.delete('x-nonce');
    headers.delete('x-marteo-csp-render');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-frame-options', 'SAMEORIGIN');
    headers.set('referrer-policy', 'no-referrer');
    headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (context.https) headers.set('strict-transport-security', 'max-age=31536000');
    if (context.nonce) {
        headers.set('cache-control', 'private, no-store');
        headers.delete('etag');
        headers.delete('cdn-cache-control');
        headers.delete('cloudflare-cdn-cache-control');
    }
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
