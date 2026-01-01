# GeminiPress 🚀

**GeminiPress** is a powerful Node.js application that bridges the gap between **Google's Gemini 2.0 AI** and your **WordPress** website. It serves as an intelligent agent capable of drafting content, designing complex landing pages, and managing site information entirely through natural language commands.

## 🌟 Purpose

The goal of GeminiPress is to streamline WordPress management by leveraging advanced AI. Instead of manually navigating the WordPress dashboard to create posts or pages, you can simply chat with the agent to:
- "Draft a blog post about the future of AI."
- "Create a high-converting landing page with a hero section and pricing table."
- "Search for my articles about technology."

## 🌐 Live Demo

Experience the application live:
👉 **[GeminiPress Application](https://geminipress-919868300168.europe-west1.run.app/)**

*(Note: The live demo connects to a sandbox WordPress instance.)*

## ✨ Features

- **📝 Smart Drafting**: Create draft posts with formatted content instantly.
- **🎨 Page Designer**: Generate fully designed HTML/CSS landing pages (About Us, Sales Pages, etc.) that look premium.
- **🔍 Content Search**: Quickly search through your existing posts.
- **ℹ️ Site Insights**: Retrieve site metadata like name and description.
- **🔒 Secure Access**: Protected by Basic Authentication for the chat interface and uses Application Passwords for WordPress API security.
- **💬 Chat Interface**: Includes a simple, responsive web-based chat UI to interact with the agent.

## 🛠️ Tech Stack

- **Runtime**: Node.js (v20 via Docker)
- **Framework**: Express.js
- **AI Engine**: Google Gemini 2.0 Flash (`@google/genai`)
- **WordPress API**: WP REST API (v2)
- **Containerization**: Docker

## ☁️ Cloud & Deployment

This project is deployed on **Google Cloud Run**, demonstrating scalable, containerized architecture.

- **Platform**: Google Cloud Run (Serverless Container)
- **Region**: Europe-West1
- **Docker**: Simple containerization allows for easy deployment on any VPS or CaaS.
- **Environment**: Configuration is handled entirely via environment variables, ensuring security.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+) or [Docker](https://www.docker.com/)
- A **WordPress** site with:
  - REST API enabled (default).
  - An [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) generated for your user.
- A **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/)).

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/wp-gemini-press.git
    cd wp-gemini-press
    ```

2.  **Configure Environment:**
    Create a `.env` file in the root directory:
    ```env
    PORT=3000
    GEMINI_API_KEY=your_gemini_api_key
    
    # WordPress Settings
    WP_BASE_URL=https://your-wordpress-site.com
    WP_USER=your_wp_username
    WP_APP_PASSWORD=your_wp_app_password
    
    # App Security (for the chat UI)
    BASIC_AUTH_USER=admin
    BASIC_AUTH_PASS=your_secure_password
    
    # Optional Custom Instructions
    CUSTOM_PROMPT="You are a witty tech blogger."
    ```

3.  **Run Locally:**
    ```bash
    npm install
    npm start
    ```
    Visit `http://localhost:3000` to access the interface.

### 🐳 Running with Docker

1.  **Build the image:**
    ```bash
    docker build -t gemini-press .
    ```

2.  **Run the container:**
    ```bash
    docker run -p 3000:3000 --env-file .env gemini-press
    ```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
