// gate.js — client-side unlock for the encrypted dashboard.
//
// The dashboard bundle is AES-256-GCM encrypted with a Content Encryption Key
// (CEK). The CEK is wrapped two ways so EITHER unlocks it:
//   1. password  -> PBKDF2(pw) -> unwrap CEK            (always available; recovery)
//   2. passkey    -> WebAuthn PRF secret -> HKDF -> unwrap CEK   (Face ID; per-device)
// Passkey enrollments live in localStorage (origin-scoped). Nothing here is a
// server check — security comes from the encryption, not from trusting the page.

(() => {
  "use strict";
  const cfg = JSON.parse(document.getElementById("cfg").textContent);
  const LS_KEY = "baru.passkeys.v1";
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();

  // base64 <-> bytes
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64e = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));

  let cekBytes = null; // raw CEK, held in memory after a successful unlock

  // --- crypto helpers --------------------------------------------------------
  async function aesDecrypt(keyBytes, ivB64, dataB64) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(ivB64) }, key, b64d(dataB64));
    return new Uint8Array(pt);
  }
  async function aesEncrypt(keyBytes, ivBytes, plainBytes) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, key, plainBytes);
    return new Uint8Array(ct);
  }
  async function pbkdf2Key(password, saltB64, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: b64d(saltB64), iterations: iter, hash: "SHA-256" }, base, 256);
    return new Uint8Array(bits);
  }
  async function hkdfFromPrf(prfBytes) {
    const base = await crypto.subtle.importKey("raw", prfBytes, "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("baru-dashboard-kek-v1") },
      base, 256);
    return new Uint8Array(bits);
  }

  // --- reveal the decrypted dashboard ---------------------------------------
  // The plaintext is a complete, self-contained HTML document. Render it by
  // navigating to a Blob URL so its inline scripts execute normally (no
  // innerHTML / document.write). The bytes never touch the network.
  async function decryptAndRender() {
    const bytes = await aesDecrypt(cekBytes, cfg.payloadIv, cfg.payload);
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/html" }));
    location.replace(url);
  }

  // --- passkey storage -------------------------------------------------------
  const loadPasskeys = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
  const savePasskey = (e) => localStorage.setItem(LS_KEY, JSON.stringify([...loadPasskeys(), e]));

  // --- WebAuthn: derive the PRF secret for a given (credentialId, salt) ------
  async function prfSecret(allowCredentials, saltB64) {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials,
        userVerification: "required",
        timeout: 60000,
        extensions: { prf: { eval: { first: b64d(saltB64) } } },
      },
    });
    const res = assertion.getClientExtensionResults()?.prf?.results?.first;
    if (!res) throw new Error("no-prf");
    return new Uint8Array(res);
  }

  // --- unlock paths ----------------------------------------------------------
  async function unlockWithPasskey() {
    const list = loadPasskeys();
    if (!list.length) throw new Error("not-enrolled");
    const allow = list.map((e) => ({ id: b64d(e.credentialId), type: "public-key" }));
    const secret = await prfSecret(allow, cfg.prfSalt);
    const kek = await hkdfFromPrf(secret);
    for (const e of list) {
      try { cekBytes = await aesDecrypt(kek, e.iv, e.wrappedCEK); return; } catch {}
    }
    throw new Error("unwrap-failed");
  }
  async function unlockWithPassword(pw) {
    const pwKey = await pbkdf2Key(pw, cfg.pwSalt, cfg.iter);
    cekBytes = await aesDecrypt(pwKey, cfg.pwIv, cfg.pwWrappedCEK); // throws if wrong pw
  }

  // --- passkey enrollment (needs cekBytes already in hand) -------------------
  async function enrollPasskey() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "Baru's Dashboard", id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "baru", displayName: "Baru" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
        timeout: 60000,
        extensions: { prf: {} },
      },
    });
    // second ceremony to actually evaluate the PRF for this new credential
    const secret = await prfSecret([{ id: cred.rawId, type: "public-key" }], cfg.prfSalt);
    const kek = await hkdfFromPrf(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await aesEncrypt(kek, iv, cekBytes);
    savePasskey({ credentialId: b64e(cred.rawId), iv: b64e(iv), wrappedCEK: b64e(wrapped) });
  }

  // --- UI wiring -------------------------------------------------------------
  const bioBtn = $("bio"), orRow = $("or"), pwForm = $("pwForm"), pwInput = $("pw");
  const msg = $("msg"), enrollBox = $("enroll");
  const setMsg = (t, err = false) => { msg.textContent = t; msg.classList.toggle("err", err); };
  const hasWebAuthn = !!(window.PublicKeyCredential && navigator.credentials);
  const enrolled = () => loadPasskeys().length > 0;

  if (hasWebAuthn && enrolled()) {
    bioBtn.classList.remove("hidden");
    orRow.classList.remove("hidden");
  }

  function finishUnlock() {
    // Offer enrollment if WebAuthn exists and this device isn't enrolled yet.
    if (hasWebAuthn && !enrolled()) {
      setMsg("unlocked");
      enrollBox.style.display = "block";
    } else {
      decryptAndRender();
    }
  }

  bioBtn.addEventListener("click", async () => {
    setMsg("waiting for Face ID…");
    bioBtn.querySelector("svg").classList.add("spin");
    try {
      await unlockWithPasskey();
      decryptAndRender();
    } catch (e) {
      bioBtn.querySelector("svg").classList.remove("spin");
      setMsg(e.message === "no-prf" ? "this device can't do passkey unlock — use password" : "Face ID failed — try password", true);
    }
  });

  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("unlocking…");
    try {
      await unlockWithPassword(pwInput.value);
      finishUnlock();
    } catch {
      setMsg("wrong password", true);
      pwInput.select();
    }
  });

  $("enableBio").addEventListener("click", async () => {
    setMsg("setting up Face ID…");
    try {
      await enrollPasskey();
      setMsg("Face ID enabled ✓");
      decryptAndRender();
    } catch (e) {
      setMsg(e?.message === "no-prf" ? "passkeys unsupported here — opening anyway" : "couldn't enable Face ID — opening anyway", true);
      setTimeout(decryptAndRender, 900);
    }
  });
  $("skipBio").addEventListener("click", decryptAndRender);

  // Auto-prompt Face ID on load for returning, enrolled devices.
  if (hasWebAuthn && enrolled()) setTimeout(() => bioBtn.click(), 350);
  else pwInput.focus();
})();
