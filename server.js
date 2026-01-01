import express from "express";
import "dotenv/config";
import basicAuth from "basic-auth";
import { GoogleGenAI } from "@google/genai";

const {
    GEMINI_API_KEY,
    WP_BASE_URL,
    WP_USER,
    WP_APP_PASSWORD,
    BASIC_AUTH_USER,
    BASIC_AUTH_PASS
} = process.env;

if (!GEMINI_API_KEY || !WP_BASE_URL || !WP_USER || !WP_APP_PASSWORD || !BASIC_AUTH_USER || !BASIC_AUTH_PASS) {
    throw new Error("Missing env vars. Check .env");
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// 1) Basic Auth for the whole subdomain (simple and effective)
app.use((req, res, next) => {
    const user = basicAuth(req);
    if (!user || user.name !== BASIC_AUTH_USER || user.pass !== BASIC_AUTH_PASS) {
        res.set("WWW-Authenticate", 'Basic realm="AI Admin"');
        return res.status(401).send("Auth required.");
    }
    next();
});

// 2) Simple chat UI
app.get("/", (req, res) => {
    res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>WordPress Gemini Control</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 16px; }
    textarea { width: 100%; height: 90px; }
    #log { white-space: pre-wrap; border: 1px solid #ddd; padding: 12px; min-height: 260px; margin-top: 12px; }
    button { padding: 10px 14px; margin-top: 10px; }
  </style>
</head>
<body>
  <h2>Gemini → WordPress (Draft-safe)</h2>
  <p>Try: “Create a draft post titled Test with 2 paragraphs.”</p>
  <textarea id="msg" placeholder="Type message..."></textarea>
  <br />
  <button onclick="send()">Send</button>
  <div id="log"></div>

  <script>
    const log = (t) => document.getElementById('log').textContent += t + "\\n\\n";
    async function send() {
      const text = document.getElementById('msg').value.trim();
      if (!text) return;
      log("YOU: " + text);
      document.getElementById('msg').value = "";
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      const data = await r.json();
      if (!r.ok) log("ERROR: " + JSON.stringify(data, null, 2));
      else log("AI: " + data.reply);
    }
  </script>
</body>
</html>
  `);
});

// Helper: WP Basic Auth header using Application Passwords (HTTPS)
function wpAuthHeader() {
    const token = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");
    return { Authorization: `Basic ${token}` };
}

// WordPress tool: create draft post
async function wpCreateDraftPost({ title, content }) {
    const url = `${WP_BASE_URL.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            ...wpAuthHeader(),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            title,
            content,
            status: "draft"
        })
    });

    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(`WP error ${resp.status}: ${JSON.stringify(data)}`);
    }

    return {
        id: data.id,
        link: data.link,
        status: data.status
    };
}

// Helper: Get site basic info
async function wpGetSiteInfo() {
    const url = `${WP_BASE_URL.replace(/\/$/, "")}/wp-json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to fetch site info");
    const data = await resp.json();
    return {
        name: data.name,
        description: data.description,
        url: data.url
    };
}

// Helper: Search posts
async function wpSearchPosts({ search }) {
    const url = `${WP_BASE_URL.replace(/\/$/, "")}/wp-json/wp/v2/posts?search=${encodeURIComponent(search)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Search failed");
    const data = await resp.json();
    return data.map(p => ({ id: p.id, title: p.title.rendered, link: p.link }));
}

// 3) Chat endpoint: Gemini function calling → run WP tools → respond
app.post("/api/chat", async (req, res) => {
    try {
        const userMessage = String(req.body?.message || "").slice(0, 5000);

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // Function declarations (tools)
        const tools = [{
            functionDeclarations: [
                {
                    name: "wp_create_draft_post",
                    description: "Create a NEW WordPress blog post as a draft (safe).",
                    parameters: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            content: { type: "string", description: "HTML content is allowed." }
                        },
                        required: ["title", "content"]
                    }
                },
                {
                    name: "wp_get_site_info",
                    description: "Get general information about this WordPress site (name, tagline, URL).",
                    parameters: { type: "object", properties: {} }
                },
                {
                    name: "wp_search_posts",
                    description: "Search existing posts on the website by keyword.",
                    parameters: {
                        type: "object",
                        properties: {
                            search: { type: "string", description: "Keywords to search for." }
                        },
                        required: ["search"]
                    }
                }
            ]
        }];

        // System instruction to give identity
        // Note: Gemini 1.5 Pro/Flash supports systemInstruction. 
        // If using older library versions or models, you might prepend this to the prompt.
        // But the official @google/genai SDK v1.0+ supports it.
        const systemInstruction = `You are an intelligent assistant managing a WordPress website at ${WP_BASE_URL}.
        You can create drafts, look up site info, and search posts. 
        Always be helpful and concise.`;

        // Ask Gemini
        const model = "gemini-2.0-flash"; // you can change later
        const first = await ai.models.generateContent({
            model,
            config: { systemInstruction },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            tools
        });

        // If Gemini returns a function call, run it, then send result back
        const part = first?.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
        const call = part?.functionCall;

        if (call) {
            let result;
            if (call.name === "wp_create_draft_post") {
                result = await wpCreateDraftPost(call.args);
            } else if (call.name === "wp_get_site_info") {
                result = await wpGetSiteInfo();
            } else if (call.name === "wp_search_posts") {
                result = await wpSearchPosts(call.args);
            } else {
                result = { error: "Unknown function" };
            }

            // IMPORTANT: function response must come immediately after call
            const second = await ai.models.generateContent({
                model,
                config: { systemInstruction },
                contents: [
                    { role: "user", parts: [{ text: userMessage }] },
                    { role: "model", parts: [{ functionCall: call }] },
                    { role: "user", parts: [{ functionResponse: { name: call.name, response: result } }] }
                ]
            });

            const replyText = second?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || `Action ${call.name} completed.`;
            return res.json({ reply: replyText });
        }

        // No function call, just normal text
        const textReply = first?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || "No response.";
        return res.json({ reply: textReply });
    } catch (err) {
        return res.status(500).json({ error: String(err?.message || err) });
    }
});

const port = process.env.PORT || 3000; // use Hostinger's port if provided

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
