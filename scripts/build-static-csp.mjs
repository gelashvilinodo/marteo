import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {THEME_BOOTSTRAP} from '../lib/security/theme-bootstrap.mjs';
import {THEME_SCRIPT_HASH} from '../lib/security/content-security-policy.mjs';

export function inlineScriptHashes(html) {
    const hashes = new Set();
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
        hashes.add('sha256-' + createHash('sha256').update(match[2], 'utf8').digest('base64'));
    }
    return [...hashes];
}

export async function buildStaticCsp(root = process.cwd()) {
    if ('sha256-' + createHash('sha256').update(THEME_BOOTSTRAP).digest('base64') !== THEME_SCRIPT_HASH) throw new Error('Theme bootstrap CSP hash is stale');
    const prerender = JSON.parse(await readFile(path.join(root, '.next/prerender-manifest.json'), 'utf8'));
    const buildId = (await readFile(path.join(root, '.next/BUILD_ID'), 'utf8')).trim();
    const staticDir = path.join(root, 'public/_csp-static');
    await rm(staticDir, {recursive: true, force: true});
    await mkdir(staticDir, {recursive: true});
    const routes = {}, assets = {};
    for (const route of Object.keys(prerender.routes)) {
        const filename = path.join(root, '.next/server/app', (route === '/' ? 'index' : route.slice(1)) + '.html');
        let html;
        try { html = await readFile(filename, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT' && /\.[a-z0-9]+$/i.test(route)) continue; throw error; }
        const hashes = inlineScriptHashes(html);
        if (route !== '/_global-error' && !hashes.includes(THEME_SCRIPT_HASH)) throw new Error(`Missing theme bootstrap in ${route}`);
        routes[route] = hashes;
        const filenameHash = createHash('sha256').update(buildId + ':' + route).digest('hex');
        assets[route] = `/_csp-static/${filenameHash}.bin`;
        await writeFile(path.join(staticDir, filenameHash + '.bin'), html);
    }
    if (!routes['/'] || !routes['/_not-found']) throw new Error('Missing static CSP pages');
    const manifest = {version: 2, buildId, routes, assets};
    await writeFile(path.join(root, '.next/static-csp.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`CSP hashes generated for ${Object.keys(routes).length} static HTML routes.`);
    return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildStaticCsp();
