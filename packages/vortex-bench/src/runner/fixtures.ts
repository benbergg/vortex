// L0/L1 fixture 静态站点（express）。随机端口，避免冲突。

import express from "express";
import type { Server } from "node:http";

export interface FixtureServer {
  url: string;
  close: () => Promise<void>;
}

function page(title: string, body: string, extraHead = ""): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;padding:2em;max-width:640px;margin:auto;line-height:1.5}
button,input{font:inherit;padding:.4em .8em;margin:.2em 0}
button{cursor:pointer}
.target{font-weight:700;color:#0050b3}</style>
${extraHead}</head><body>${body}</body></html>`;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const app = express();

  app.get("/smoke/basic-click", (_req, res) => {
    res.send(
      page(
        "basic-click",
        `<h1>Basic Click</h1>
<p>Click the submit button.</p>
<button id="submit" onclick="history.pushState({},'','?done=1');document.getElementById('status').textContent='DONE';">Submit</button>
<p id="status">IDLE</p>`,
      ),
    );
  });

  app.get("/smoke/fill-form", (_req, res) => {
    res.send(
      page(
        "fill-form",
        `<h1>Fill Form</h1>
<form onsubmit="event.preventDefault();document.getElementById('out').textContent='OK name='+this.name_.value+' email='+this.email_.value;">
  <p><label>Name: <input name="name_" id="name-input"></label></p>
  <p><label>Email: <input name="email_" id="email-input" type="email"></label></p>
  <button type="submit" id="submit-btn">Submit</button>
</form>
<p id="out">PENDING</p>`,
      ),
    );
  });

  app.get("/smoke/read-text", (_req, res) => {
    res.send(
      page(
        "read-text",
        `<h1>Read Target</h1>
<p>The magic string is: <span class="target" id="target">VORTEX_SMOKE_42</span></p>`,
      ),
    );
  });

  app.get("/smoke/navigate", (_req, res) => {
    res.send(
      page(
        "navigate",
        `<h1>Navigate Start</h1>
<p>Click the link below to reach page 2.</p>
<p><a href="/smoke/navigate/page2" id="goto">Go to page 2</a></p>`,
      ),
    );
  });
  app.get("/smoke/navigate/page2", (_req, res) => {
    res.send(
      page(
        "navigate-page2",
        `<h1>Page 2</h1>
<p class="target" id="banner">REACHED</p>`,
      ),
    );
  });

  app.get("/smoke/wait-dynamic", (_req, res) => {
    res.send(
      page(
        "wait-dynamic",
        `<h1>Wait Dynamic</h1>
<p id="status">LOADING</p>
<script>
setTimeout(() => {
  const p = document.createElement('p');
  p.id = 'loaded';
  p.className = 'target';
  p.textContent = 'LOADED';
  document.body.appendChild(p);
  document.getElementById('status').textContent = 'DONE';
}, 700);
</script>`,
      ),
    );
  });

  // ─── L1 anti-patterns ───

  // 目标按钮被遮罩盖住 → ELEMENT_OCCLUDED
  app.get("/anti/occluded", (_req, res) => {
    res.send(
      page(
        "anti-occluded",
        `<h1>Click Submit</h1>
<p>There is an overlay blocking the page. Dismiss it first.</p>
<button id="submit" onclick="history.pushState({},'','?done=1');document.getElementById('status').textContent='DONE';">Submit</button>
<p id="status">IDLE</p>
<div id="overlay" style="position:fixed;inset:0;background:rgba(30,30,30,.8);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff">
  <p style="font-size:1.2em;margin-bottom:1em">⚠️ Dismiss me before interacting</p>
  <button id="dismiss" style="background:#fff;color:#000;padding:.6em 1.2em" onclick="this.parentElement.remove()">Dismiss</button>
</div>`,
      ),
    );
  });

  // 5 个同名 Submit 按钮，只有特定一个才是 target → SELECTOR_AMBIGUOUS
  app.get("/anti/ambiguous", (_req, res) => {
    res.send(
      page(
        "anti-ambiguous",
        `<h1>Submit the target form</h1>
<p>Multiple "Submit" buttons exist. Only the one under "the target form" should succeed.</p>
<p>Form A: <button>Submit</button></p>
<p>Form B: <button>Submit</button></p>
<p>The target form: <button id="target-submit" onclick="history.pushState({},'','?done=1');document.getElementById('status').textContent='DONE';">Submit</button></p>
<p>Form D: <button>Submit</button></p>
<p>Form E: <button>Submit</button></p>
<p id="status">IDLE</p>`,
      ),
    );
  });

  // Submit 默认 disabled，填完两个字段才能点 → ELEMENT_DISABLED
  app.get("/anti/disabled", (_req, res) => {
    res.send(
      page(
        "anti-disabled",
        `<h1>Submit is disabled until both fields are filled</h1>
<form onsubmit="event.preventDefault();history.pushState({},'','?done=1');document.getElementById('status').textContent='DONE';">
  <p><label>Name: <input id="name-input" oninput="checkEnable()"></label></p>
  <p><label>Email: <input id="email-input" oninput="checkEnable()"></label></p>
  <button type="submit" id="submit-btn" disabled>Submit</button>
</form>
<p id="status">IDLE</p>
<script>
function checkEnable(){
  const n=document.getElementById('name-input').value;
  const e=document.getElementById('email-input').value;
  document.getElementById('submit-btn').disabled=!(n&&e);
}
</script>`,
      ),
    );
  });

  // Submit 在视口下方很远 → ELEMENT_OFFSCREEN
  app.get("/anti/offscreen", (_req, res) => {
    res.send(
      page(
        "anti-offscreen",
        `<h1>Scroll down to find Submit</h1>
<p>There is a Submit button 5000px below this text. You must scroll to reach it.</p>
<div style="height:5000px;background:linear-gradient(#fafafa,#eee)"></div>
<button id="submit" onclick="history.pushState({},'','?done=1');document.getElementById('status').textContent='DONE';">Submit</button>
<p id="status">IDLE</p>`,
      ),
    );
  });

  // 页面根本没 "Submit" 按钮，只有 "Place Order" → ELEMENT_NOT_FOUND
  app.get("/anti/not-found", (_req, res) => {
    res.send(
      page(
        "anti-not-found",
        `<h1>Place your order</h1>
<p>Confirm by clicking the order button.</p>
<button id="order" onclick="history.pushState({},'','?done=1');document.getElementById('status').textContent='DONE';">Place Order</button>
<p id="status">IDLE</p>`,
      ),
    );
  });

  // Health check
  app.get("/_health", (_req, res) => res.json({ ok: true }));

  return await new Promise((resolve, reject) => {
    const server: Server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr && typeof addr.port === "number") {
        resolve({
          url: `http://127.0.0.1:${addr.port}`,
          close: () =>
            new Promise<void>((r) => {
              // Chrome 的 keep-alive 会一直占着 socket，不强制断就 hang
              server.closeAllConnections?.();
              server.close(() => r());
            }),
        });
      } else {
        reject(new Error("fixture server failed to get port"));
      }
    });
  });
}
