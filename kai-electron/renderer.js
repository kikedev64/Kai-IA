const $ = (id) => document.getElementById(id);

const chatEl = $("chat");
const backendUrlEl = $("backendUrl");
const chatIdEl = $("chatId");
const systemPromptEl = $("systemPrompt");
const messageEl = $("message");
const sendBtn = $("send");
const newChatBtn = $("newChat");
const clearUiBtn = $("clearUi");

let currentAssistantBubble = null;
let abortController = null;

function addBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `bubble ${role}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "You" : "Kai";

  const body = document.createElement("div");
  body.textContent = text || "";

  wrap.appendChild(meta);
  wrap.appendChild(body);

  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;

  return { wrap, body };
}

function ensureChatId() {
  if (!chatIdEl.value.trim()) chatIdEl.value = window.kai.uuid();
}

function setBusy(isBusy) {
  sendBtn.disabled = isBusy;
  messageEl.disabled = isBusy;
  newChatBtn.disabled = isBusy;
  backendUrlEl.disabled = isBusy;
  systemPromptEl.disabled = isBusy;
  chatIdEl.disabled = isBusy;
}

function parseSSELines(buffer) {
  // Devuelve {events:[], rest:""}
  const parts = buffer.split("\n\n");
  const rest = parts.pop(); // lo incompleto
  const events = parts.map((chunk) => chunk.trim()).filter(Boolean);
  return { events, rest };
}

async function sendMessage() {
  const msg = messageEl.value.trim();
  if (!msg) return;

  ensureChatId();

  const backendUrl = backendUrlEl.value.trim().replace(/\/$/, "");
  const chatId = chatIdEl.value.trim();
  const systemPrompt = systemPromptEl.value.trim();

  addBubble("user", msg);
  messageEl.value = "";

  const { body } = addBubble("assistant", "");
  currentAssistantBubble = body;

  setBusy(true);
  abortController = new AbortController();

  try {
    const payload = {
      chat_id: chatId,
      message: msg,
      system_prompt: systemPrompt || null
    };

    const res = await fetch(`${backendUrl}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${t}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = parseSSELines(buffer);
      buffer = rest;

      for (const ev of events) {
        const lines = ev.split("\n").map((l) => l.trim());
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;

          const data = line.slice(5).trim();

          if (data === "[DONE]") {
            // fin
            break;
          }

          // data: {"delta":"..."}
          try {
            const obj = JSON.parse(data);
            const delta = obj?.delta ?? "";
            if (delta && currentAssistantBubble) {
              currentAssistantBubble.textContent += delta;
              chatEl.scrollTop = chatEl.scrollHeight;
            }
          } catch {
            // si viene texto plano
            if (currentAssistantBubble) {
              currentAssistantBubble.textContent += data;
              chatEl.scrollTop = chatEl.scrollHeight;
            }
          }
        }
      }
    }
  } catch (err) {
    if (currentAssistantBubble) {
      currentAssistantBubble.textContent += `\n\n[ERROR] ${err.message || String(err)}`;
    }
  } finally {
    abortController = null;
    setBusy(false);
  }
}

newChatBtn.addEventListener("click", () => {
  chatIdEl.value = window.kai.uuid();
});

clearUiBtn.addEventListener("click", () => {
  chatEl.innerHTML = "";
});

sendBtn.addEventListener("click", sendMessage);

messageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Inicial
chatIdEl.value = window.kai.uuid();
messageEl.focus();