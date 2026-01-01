import express from "express";
import "dotenv/config";
import basicAuth from "basic-auth";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 2) Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// Fallback to index.html for SPA feel (though this is single page)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
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

// Helper: Create/Publish a Page (for handling landing pages)
async function wpCreatePage({ title, content, status = "draft" }) {
    const url = `${WP_BASE_URL.replace(/\/$/, "")}/wp-json/wp/v2/pages`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            ...wpAuthHeader(),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            title,
            content,
            status
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
                    name: "wp_create_page",
                    description: "ACTUALLY creates a WordPress page in the dashboard. Use this tool immediately when asked to design/create a page. Do NOT return the HTML code to the user.",
                    parameters: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            content: { type: "string", description: "The full, designed HTML content (with inline CSS) to be inserted into the WordPress page editor." },
                            status: { type: "string", enum: ["draft", "publish"], description: "Default is draft." }
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
        // We use a base instruction + any user custom prompt from environment
        const baseInstruction = `You are an intelligent agent managing a WordPress website at ${WP_BASE_URL}.
        
        CRITICAL RULES:
        1. ACTIONS OVER TALK: If the user asks you to create/write/design something, YOU MUST CALL THE RELEVANT TOOL.
        2. NO RAW HTML: Never output raw HTML, CSS, or code blocks in the chat response. The code must go strictly into the 'content' parameter of the 'wp_create_page' or 'wp_create_draft_post' tool.
        3. CONFIRMATION ONLY: After calling a tool, simply confirm the action (e.g., "I created the page 'About Us'. You can see it in your dashboard.").
        
        Capabilities:
        - Create blog posts (drafts).
        - DESIGN and CREATE Pages (Landing pages, About pages, etc.). 
           * When asked for a landing page, generate specific, beautiful HTML with inline CSS and pass it DIRECTLY to the 'wp_create_page' tool.
        - Look up site info and search content.
        
        Start your response by using a tool if the user's request implies an action.
        Always be helpful, concise, and proactive with design ideas.`;

        const systemInstruction = process.env.CUSTOM_PROMPT
            ? `${baseInstruction}\n\nUSER CUSTOM INSTRUCTIONS:\n${process.env.CUSTOM_PROMPT}`
            : baseInstruction;

        // Ask Gemini
        const model = "gemini-2.0-flash";
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
            } else if (call.name === "wp_create_page") {
                result = await wpCreatePage(call.args);
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
