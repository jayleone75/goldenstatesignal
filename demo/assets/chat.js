/* Golden State Signal — demo guide chat.
   A floating button, a panel, opening chips, and a Cloudflare Worker in front
   of the Anthropic API so no key is ever in this file. Static hosting cannot
   keep a secret; the Worker can.

   ENDPOINT must be this site's own worker — deploy
   demo/worker/gss-chat-worker.js and paste its URL here. It is deliberately
   not shared with any other site: a public marketing page with unpredictable
   traffic should never sit on the same key and budget as something else, with
   no way to throttle or kill one without the other.

   Left blank the widget does not render at all. A missing chat button is a
   non-event; a chat button that always errors is worse than none on a page
   whose job is to earn a meeting. */
(function () {
  "use strict";

  var ENDPOINT = "https://gss-chat.bitter-violet-c86f.workers.dev";
  var MODEL = "claude-sonnet-5";
  var MAX_TOKENS = 400;

  /* The system prompt deliberately does NOT live here. It is in the worker.

     A prompt sent from the browser is a prompt anyone can replace: read the
     page source, copy the endpoint, post whatever system prompt you like, and
     the bill is Jay's. Keeping it server-side means the worker will only ever
     run this assistant. The text is version-controlled in
     demo/worker/gss-chat-worker.js — editing the copy means redeploying the
     worker, which is the price of it not being editable by strangers.

     For reference, the prompt states the demo's real figures (9,458 POs,
     $9.03B, the department split, top categories and suppliers, 1,046 running
     terms) so the model answers concretely and never has to invent one. */

  var CHIPS = [
    "How do I use this site?",
    "What am I actually looking at?",
    "Why does this data matter?",
    "What could I do with the full dataset?"
  ];

  var history = [];
  var isLoading = false;
  var els = {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Deliberately minimal: paragraphs and bold only. The reply is model output
     rendered into the page, so it is escaped first and then a fixed, closed set
     of formatting is reintroduced. Nothing here can emit a tag the model wrote. */
  function format(text) {
    return esc(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .split(/\n{2,}/).map(function (p) {
        return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
      }).join("");
  }

  function addMessage(text, who) {
    var div = document.createElement("div");
    div.className = "gsc-msg gsc-" + who;
    div.innerHTML = who === "ai" ? format(text) : "<p>" + esc(text) + "</p>";
    els.messages.appendChild(div);
    els.messages.scrollTop = els.messages.scrollHeight;
    return div;
  }

  function addTyping() {
    var div = document.createElement("div");
    div.className = "gsc-typing";
    div.innerHTML = "<span></span><span></span><span></span>";
    els.messages.appendChild(div);
    els.messages.scrollTop = els.messages.scrollHeight;
    return div;
  }

  /* What the visitor has on screen, in one line, so the answer can be about
     their view rather than the dataset in general. Read fresh on every send —
     they may have changed the filters mid-conversation. */
  function currentView() {
    var count = document.getElementById("matchcount");
    if (!count) return "";
    var parts = [count.textContent.replace(/\s+/g, " ").trim()];
    var depts = [].slice.call(document.querySelectorAll('#dept-opts input:checked'))
      .map(function (c) { return c.value.toUpperCase(); });
    var cats = [].slice.call(document.querySelectorAll('#cat-opts input:checked'))
      .map(function (c) { return c.value; });
    if (depts.length) parts.push("departments: " + depts.join(", "));
    if (cats.length) parts.push("categories: " + cats.join(", "));
    ["keyword", "supplier"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value.trim()) parts.push(id + ': "' + el.value.trim() + '"');
    });
    var fut = document.getElementById("future-only");
    if (fut && fut.checked) parts.push("showing only terms still running");
    return "[The visitor currently has on screen — " + parts.join("; ") + "]";
  }

  function send(text) {
    if (isLoading || !text.trim()) return;
    isLoading = true;
    els.send.disabled = true;
    els.chips.style.display = "none";

    addMessage(text, "user");
    // The view line rides along with the question rather than being stored, so
    // it never goes stale in the history.
    var view = currentView();
    history.push({ role: "user", content: view ? view + "\n\n" + text : text });
    els.input.value = "";
    els.input.style.height = "auto";
    var typing = addTyping();

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: MAX_TOKENS, messages: history
      })
    }).then(function (res) {
      return res.json().catch(function () { return null; })
        .then(function (data) { return { res: res, data: data }; });
    }).then(function (r) {
      typing.remove();
      var d = r.data;
      // The response may contain a `thinking` block before the text, so
      // content[0] is not reliably the answer. Take the first text block.
      // Assuming index 0 made the widget report a connection failure on a
      // perfectly successful reply.
      var reply = null;
      if (d && Array.isArray(d.content)) {
        for (var i = 0; i < d.content.length; i++) {
          if (d.content[i] && d.content[i].type === "text" && d.content[i].text) {
            reply = d.content[i].text;
            break;
          }
        }
      }
      if (reply) {
        history.push({ role: "assistant", content: reply });
        addMessage(reply, "ai");
      } else {
        console.error("[gs-chat] no content from proxy.",
          "\n  HTTP:", r.res.status, r.res.statusText,
          "\n  error:", d && d.error && (d.error.type + " " + d.error.message));
        addMessage("I couldn't reach the assistant just then. The demo itself works "
          + "fine — everything on this page is live. For anything specific, "
          + "jay@goldenstatesignal.com is the fastest route.", "ai");
      }
    }).catch(function (err) {
      typing.remove();
      console.error("[gs-chat] request failed:", err);
      addMessage("I couldn't reach the assistant just then — that's a connection "
        + "problem on my side, not a problem with the data. Try again in a moment, "
        + "or email jay@goldenstatesignal.com.", "ai");
    }).then(function () {
      isLoading = false;
      els.send.disabled = false;
      els.input.focus();
    });
  }

  function build() {
    if (!ENDPOINT) {
      console.info("[gs-chat] no ENDPOINT configured — widget not rendered. "
        + "Deploy demo/worker/gss-chat-worker.js and set ENDPOINT in this file.");
      return;
    }
    var wrap = document.createElement("div");
    wrap.className = "gsc";
    wrap.innerHTML =
      '<button class="gsc-fab" aria-label="Ask about this data" aria-expanded="false">' +
        '<span class="gsc-fab-dot"></span>Ask about this data</button>' +
      '<div class="gsc-window" role="dialog" aria-label="Golden State Signal guide" hidden>' +
        '<div class="gsc-head"><div><strong>Ask about this data</strong>' +
          '<div class="gsc-sub">A guide to the demo — not a substitute for the briefing</div></div>' +
          '<button class="gsc-close" aria-label="Close">&times;</button></div>' +
        '<div class="gsc-messages"></div>' +
        '<div class="gsc-chips"></div>' +
        '<div class="gsc-input-row">' +
          '<textarea class="gsc-input" rows="1" placeholder="Ask a question…"></textarea>' +
          '<button class="gsc-send" aria-label="Send">Send</button></div>' +
      "</div>";
    document.body.appendChild(wrap);

    els.fab = wrap.querySelector(".gsc-fab");
    els.win = wrap.querySelector(".gsc-window");
    els.messages = wrap.querySelector(".gsc-messages");
    els.chips = wrap.querySelector(".gsc-chips");
    els.input = wrap.querySelector(".gsc-input");
    els.send = wrap.querySelector(".gsc-send");

    els.chips.innerHTML = CHIPS.map(function (c) {
      return '<button class="gsc-chip">' + esc(c) + "</button>";
    }).join("");
    els.chips.addEventListener("click", function (e) {
      if (e.target.classList.contains("gsc-chip")) send(e.target.textContent);
    });

    addMessage("This is real California purchasing data — two departments, every "
      + "figure filed by the state itself. Ask me what any of it means, or start "
      + "with one of these.", "ai");

    function toggle(open) {
      els.win.hidden = !open;
      els.fab.setAttribute("aria-expanded", String(open));
      if (open) els.input.focus();
    }
    els.fab.addEventListener("click", function () { toggle(els.win.hidden); });
    wrap.querySelector(".gsc-close").addEventListener("click", function () { toggle(false); });
    els.send.addEventListener("click", function () { send(els.input.value); });
    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(els.input.value); }
    });
    els.input.addEventListener("input", function () {
      els.input.style.height = "auto";
      els.input.style.height = Math.min(els.input.scrollHeight, 110) + "px";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !els.win.hidden) toggle(false);
    });
  }

  document.addEventListener("DOMContentLoaded", build);
})();
