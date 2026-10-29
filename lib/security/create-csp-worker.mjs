import {canonicalPath, prepareCspRequest, secureCspResponse} from './content-security-policy.mjs';

// Dependencies are explicit so both asset delivery and dynamic rendering can be
// tested without opening a database or creating application records.
export function createCspWorker(openNextWorker, manifest) {
    return {
        async fetch(request, env, ctx) {
            const url = new URL(request.url);
            // Build artifacts are only reachable through the public route that owns
            // their CSP. ASSETS.fetch below bypasses this external-path restriction.
            if (url.pathname.startsWith('/_csp-static/')) return new Response('Not found', {status: 404});
            const context = prepareCspRequest(request, manifest);
            const route = canonicalPath(url.pathname);
            const asset = Object.hasOwn(manifest.assets, route) ? manifest.assets[route] : undefined;
            if (asset && !route.startsWith('/_') && ['GET', 'HEAD'].includes(request.method) && request.headers.get('rsc') !== '1' && !request.headers.has('next-router-prefetch')) {
                url.pathname = asset;
                url.search = '';
                const response = await env.ASSETS.fetch(new Request(url, {method: request.method, headers: request.headers}));
                if (response.status === 200 || response.status === 304) {
                    const headers = new Headers(response.headers);
                    headers.set('cache-control', 'public, max-age=0, s-maxage=31536000, must-revalidate');
                    // Binary snapshots cannot execute if reached through an asset alias.
                    headers.set('content-type', 'text/html; charset=utf-8');
                    headers.delete('content-disposition');
                    return secureCspResponse(new Response(response.body, {status: response.status, headers}), context, manifest);
                }
                // Never serve re-rendered, differently chunked HTML under build hashes.
                return new Response('Page temporarily unavailable', {status: 503, headers: {'cache-control':'no-store'}});
            }
            const response = await openNextWorker.fetch(context.request, env, ctx);
            return secureCspResponse(response, context, manifest);
        },
    };

}
