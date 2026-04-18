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
