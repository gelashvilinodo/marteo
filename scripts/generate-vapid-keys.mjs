// Prints a fresh VAPID key pair for Web Push. Run once:
//   node scripts/generate-vapid-keys.mjs
// Put VAPID_PUBLIC_KEY in wrangler vars and .env, VAPID_PRIVATE_KEY only as a secret
// (wrangler secret put VAPID_PRIVATE_KEY) and in the local .env.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const publicKey = Buffer.from(raw).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log("VAPID_SUBJECT=mailto:marteobusiness@gmail.com");
