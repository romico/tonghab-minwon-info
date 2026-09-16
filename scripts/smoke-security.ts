import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";

const dir = "/tmp/tm-sec-test";
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
process.env.TM_DATA_DIR = dir;

const { initDb, listComplaints, getDb } = await import("../server/db.ts");
const {
  initAuthTables,
  login,
  beginTotpSetup,
  confirmTotpSetup,
  completeTotpLogin,
} = await import("../server/auth.ts");
const { verifyTotp, base32Decode } = await import("../server/totp.ts");

function currentTotp(secretBase32: string): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 30_000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

initDb();
initAuthTables();

const r1 = login("admin", "admin");
if ("requiresTotp" in r1 && r1.requiresTotp) throw new Error("unexpected totp");
console.log("OK login vault", r1.vault);

const row = getDb().prepare("SELECT data FROM complaints LIMIT 1").get() as {
  data: string;
};
const raw = JSON.parse(row.data) as { complainantName: string };
console.log("OK stored", raw.complainantName.slice(0, 24));
if (!raw.complainantName.startsWith("enc:v1:")) {
  throw new Error("PII not encrypted at rest");
}

const list = listComplaints();
console.log("OK decrypted", list[0]?.complainantName);

const setup = await beginTotpSetup(r1.user.id);
const code = currentTotp(setup.secret);
if (!verifyTotp(setup.secret, code)) throw new Error("totp self-check fail");
const confirmed = confirmTotpSetup(r1.user.id, code);
console.log("OK totp enabled, recovery", confirmed.recoveryCodes.length);

const challenge = login("admin", "admin");
if (!("requiresTotp" in challenge) || !challenge.requiresTotp) {
  throw new Error("expected totp challenge");
}
const code2 = currentTotp(setup.secret);
const r2 = completeTotpLogin(challenge.challengeToken, code2);
console.log("OK 2fa login", r2.user.username, r2.vault);

console.log("ALL PASSED");
