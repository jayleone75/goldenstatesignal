/* Golden State Signal — sample strategy document chat.
   Separate from the demo widget (assets/chat.js) because it does a different
   job: that one explains a dataset a visitor is filtering, this one answers
   questions about one finished document.

   SCOPE IS THE POINT. This assistant is confined to the text of the document
   on screen. It has no web access, no database, and no other departments. That
   confinement is deliberate and worth understanding: a general-purpose model
   reading a strategy document will happily reason past the evidence — one read
   this project's CDCR document and concluded identity was unowned there, which
   was an artefact of the document's scope, not a fact. Grounding beats
   fluency, and a narrow assistant that says "the document does not say" is
   more useful in front of a customer than a broad one that guesses.

   The system prompt lives in the worker, not here — see
   demo/worker/gss-chat-worker.js. Anything the browser sends, a stranger can
   replace. */
(function () {
  "use strict";

  var ENDPOINT = "https://gss-chat.bitter-violet-c86f.workers.dev";
  var MODE = "brief";          // selects the server-side prompt
  var MODEL = "claude-sonnet-5";
  var MAX_TOKENS = 500;

  var CHIPS = [
    "Why is play 1 ranked above the others?",
    "What would you do instead?",
    "How solid is the evidence here?",
    "What is withheld from this sample?"
  ];

  var history = [], isLoading = false, els = {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Model output is escaped first, then a fixed closed set of formatting is
     reintroduced. Nothing the model writes can emit a tag. */
  function format(t) {
    return esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .split(/\n{2,}/).map(function (p) {
        return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
      }).join("");
  }

  function addMessage(text, who) {
    var d = document.createElement("div");
    d.className = "gsc-msg gsc-" + who;
    d.innerHTML = who === "ai" ? format(text) : "<p>" + esc(text) + "</p>";
    els.messages.appendChild(d);
    els.messages.scrollTop = els.messages.scrollHeight;
    return d;
  }

  function addTyping() {
    var d = document.createElement("div");
    d.className = "gsc-typing";
    d.innerHTML = "<span></span><span></span><span></span>";
    els.messages.appendChild(d);
    els.messages.scrollTop = els.messages.scrollHeight;
    return d;
  }

  function send(text) {
    if (isLoading || !text.trim()) return;
    isLoading = true;
    els.send.disabled = true;
    els.chips.style.display = "none";

    addMessage(text, "user");
    history.push({ role: "user", content: text });
    els.input.value = "";
    els.input.style.height = "auto";
    var typing = addTyping();

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: MODE, model: MODEL,
                             max_tokens: MAX_TOKENS, messages: history })
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
        console.error("[gss-brief-chat] no content.",
          "\n  HTTP:", r.res.status, r.res.statusText,
          "\n  error:", d && d.error && (d.error.type + " " + d.error.message));
        addMessage("I couldn't reach the assistant just then. The document "
          + "itself is complete and unaffected — everything above is on the "
          + "page. For anything specific, jay@goldenstatesignal.com.", "ai");
      }
    }).catch(function (err) {
      typing.remove();
      console.error("[gss-brief-chat] request failed:", err);
      addMessage("I couldn't reach the assistant just then — a connection "
        + "problem on my side, not a problem with the document. Try again in a "
        + "moment, or email jay@goldenstatesignal.com.", "ai");
    }).then(function () {
      isLoading = false;
      els.send.disabled = false;
      els.input.focus();
    });
  }

  function build() {
    if (!ENDPOINT) return;   // ships harmlessly if the worker is not configured
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<button class="gsc-fab" aria-label="Collaborate on this strategy" aria-expanded="false">' +
        '<span class="gsc-fab-dot"></span>Collaborate on this strategy</button>' +
      '<div class="gsc-window" role="dialog" aria-label="Collaborate on this strategy" hidden>' +
        '<div class="gsc-head"><div><strong>Collaborate on this strategy</strong>' +
          '<div class="gsc-sub">Challenge it, and it answers from the evidence</div></div>' +
          '<button class="gsc-close" aria-label="Close">&times;</button></div>' +
        '<div class="gsc-messages"></div><div class="gsc-chips"></div>' +
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

    addMessage("Push back on any of this. Ask why a play is ranked where it is, "
      + "what a figure actually proves, or what you would do instead. I argue "
      + "from the evidence in this document and nothing else — so where it does "
      + "not support an answer, I will tell you that rather than guess.", "ai");

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
