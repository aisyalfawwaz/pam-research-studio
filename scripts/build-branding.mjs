import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
// Bundle plain metadata once so Electron, the renderer and this static startup
// document share the same names and references. No remote resources or scripts.
const result = await build({
  entryPoints: ["packages/branding.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { identity, libraryCredits, methodCredits } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const libraries =
  libraryCredits
    .slice(0, 2)
    .map(
      (c) =>
        `<section><h2>${escape(c.name)} <span>${escape(c.version)} · ${escape(c.role)}</span></h2><p>${escape(c.authors)}</p></section>`,
    )
    .join("") +
  `<section><p style="font-size:10px;line-height:1.5">RF conditioning: SciPy — Virtanen and contributors.<br>CT/DICOM: pydicom — Mason and contributors; GDCM — Malaterre/CREATIS; Python-GDCM — de Moraes.<br>Public head CTA: Blagosklonova et al. · CC BY 4.0.</p></section>`;
const methods = methodCredits
  .map(
    (c) =>
      `<div class="method"><b>${escape(c.name)}</b><span>${escape(c.authors)}</span></div>`,
  )
  .join("");
await writeFile(
  "apps/desktop/public/splash.html",
  `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>PAM Research Studio — Starting</title><style>
*{box-sizing:border-box}body{margin:0;font:12px 'Segoe UI',sans-serif;color:#20394b;background:#f9fafb;border:1px solid #c0cbd3;height:100vh;display:flex;flex-direction:column}main{display:grid;grid-template-columns:184px 1fr;flex:1;min-height:0}.mark{background:#173449;color:#d9e8ef;padding:32px 24px;display:flex;flex-direction:column}.mark img{width:136px;height:136px;margin:5px 0 23px}.mark .label{font-size:11px;letter-spacing:2px;line-height:1.9}.release{margin-top:auto;color:#b3cbd9;line-height:1.7}.content{padding:25px 29px 15px}h1{font-size:28px;font-weight:500;letter-spacing:-.5px;margin:0 0 3px}.subtitle{color:#627584;font-size:12px;margin-bottom:21px}.researcher{border-left:3px solid #087d82;padding-left:12px;margin-bottom:20px}.researcher strong{font-size:18px;font-weight:600}.researcher p{margin:3px 0;color:#506779}h2{font-size:13px;margin:11px 0 3px}h2 span{font-weight:400;color:#627584;font-size:11px}section p{margin:0;line-height:1.5;font-size:11px}.methods{border-top:1px solid #d7dfe5;margin-top:14px;padding-top:10px}.method{display:grid;grid-template-columns:155px 1fr;gap:10px;font-size:10px;line-height:1.5;margin:4px 0}.method b{font-weight:600}.notice{color:#73818d;font-size:10px;margin:12px 0 0}footer{height:36px;display:flex;align-items:center;gap:9px;border-top:1px solid #ccd6de;padding:0 15px;background:#f0f4f7;color:#405c70;font-size:11px}.activity{width:8px;height:8px;background:#16858b;animation:pulse 1.2s ease-in-out infinite}footer .right{margin-left:auto;color:#72838f}@keyframes pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.activity{animation:none}}
</style></head><body><main><aside class="mark"><img src="brand/app-icon.svg" alt="PAM Research Studio acoustic source and array emblem"><div class="label">PASSIVE<br>ACOUSTIC<br>MAPPING</div><div class="release">Version ${escape(identity.version)}<br>Research software</div></aside><div class="content"><h1>${escape(identity.title)}</h1><div class="subtitle">Acoustic simulation &amp; passive mapping workbench</div><div class="researcher"><strong>${escape(identity.researcher)}</strong><p>${escape(identity.project)} · ${escape(identity.discipline)}</p><p>${escape(identity.institution)}</p></div>${libraries}<div class="methods">${methods}</div><p class="notice">Original libraries and method authors are credited independently.<br>Full references and notices: Help → About &amp; credits.</p></div></main><footer><i class="activity" aria-hidden="true"></i><span>Starting local scientific engine…</span><span class="right">CPU · Local workspace</span></footer></body></html>`,
  "utf8",
);
