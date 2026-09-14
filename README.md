# 🛍️ Aura — Trilingual AI Shopping Agent for Kapruka

[![Live Demo](https://img.shields.io/badge/Live_Demo-aura--kapruka.vercel.app-7C3AED?style=for-the-badge&logo=vercel)](https://aura-kapruka.vercel.app/)
[![Kapruka Challenge](https://img.shields.io/badge/Kapruka-Agent_Challenge_2026-000000?style=for-the-badge)](https://www.kapruka.com/contactUs/agentChallenge.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**Aura** is an intelligent, full-screen conversational shopping assistant built for [Kapruka](https://www.kapruka.com) — Sri Lanka's leading e-commerce platform. Powered by the **Kapruka Model Context Protocol (MCP)**, Aura transforms traditional product searches into a localized, visually rich dialogue supporting English, Sinhala, and Tamil.

---

## 🌟 Key Features

* **💬 Script-Agnostic Trilingual NLU:** Handles natural language switching across **English**, **Sinhala (සිංහල / Singlish)**, and **Tamil (தமிழ் / Tanglish)** natively using a 50-point Sri Lankan colloquial lexicon.
* **🎨 Generative Visual UI:** Replaces text-only outputs with dynamic, interactive product cards, carousels, multi-item carts, and delivery countdown tools.
* **🎁 Conversational Gifting Suite:** Built specifically for local users and the Sri Lankan diaspora to seamlessly configure greeting cards, cake options, and hampers directly within the chat window.
* **🚚 Real-Time Logistics & MCP Integration:** Connects directly to live Kapruka product streams, local delivery rate calculators, and end-to-end guest checkout links.
* **⚡ Ultra-Low Latency:** Optimized with the Vercel AI SDK and Edge Functions for near-instant streaming responses.

---

## 📐 System Architecture

```
                                ┌─────────────────────────────────────────┐
                                │             User Interface              │
                                │   Next.js (App Router) + Tailwind CSS   │
                                └────────────────────┬────────────────────┘
                                                     │
                                                     ▼
                                ┌─────────────────────────────────────────┐
                                │          Vercel AI SDK Core             │
                                │   (Streaming Response Orchestrator)    │
                                └─────────┬─────────────────────┬─────────┘
                                          │                     │
                                          ▼                     ▼
┌───────────────────────────────────────────┐         ┌───────────────────────────────────────────┐
│     Localized Lexicon & Context Parser    │         │          Remote MCP Client Engine          │
│   (English, Singlish & Tanglish Mapping)  │         │          (@modelcontextprotocol/sdk)      │
└───────────────────────────────────────────┘         └─────────────────────┬─────────────────────┘
                                                                            │
                                                                            ▼
                                                      ┌───────────────────────────────────────────┐
                                                      │           Kapruka Public MCP Endpoint     │
                                                      │          (https://mcp.kapruka.com/mcp)    │
                                                      └───────────────────────────────────────────┘
```

### Architecture Overview
1. **Client Layer:** Renders streaming chat logs and generative UI components (carousels, cart drawers, delivery date pickers).
2. **Streaming Serverless Core:** Leverages Vercel AI SDK Edge handlers to bypass serverless timeout limits and deliver token-by-token responses.
3. **Colloquial Lexicon Resolver:** Intercepts raw text queries to map local slang terms (`ela`, `machan`, `challe`, `gedarata yawanna`) into structured parameters.
4. **Kapruka MCP Connector:** Formats validated requests to invoke remote tools for catalog searches, delivery cost estimates, and guest checkout generation.

---

## 🛠️ Tech Stack Breakdown

* **Core Framework:** [Next.js (App Router)](https://nextjs.org/)
* **Deployment & Edge Compute:** [Vercel Cloud Platform](https://vercel.app)
* **Agent Protocol:** [Model Context Protocol (MCP)](https://mcp.kapruka.com/) via `@modelcontextprotocol/sdk`
* **Streaming Engine:** [Vercel AI SDK Core](https://sdk.vercel.ai/docs)
* **Model Inference (Free Tier):** Google AI Studio Gemini 1.5 Flash / GitHub Models (Azure AI Proxy)
* **UI & Styling:** TailwindCSS + Radix UI / Shadcn

---

## 🚀 Getting Started Locally

### Prerequisites
* **Node.js**: `v18.x` or later
* **npm** or **pnpm**
* A free API key from [Google AI Studio](https://aistudio.google.com) or a [GitHub Personal Access Token](https://github.com/settings/tokens)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lahirukavinda/kapruka-ai-shopping-agent-deploy.git
   cd kapruka-ai-shopping-agent-deploy
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the project root:
   ```env
   # Model API Keys
   GEMINI_API_KEY=your_gemini_api_key_here
   # Optional fallback: GITHUB_TOKEN=your_github_pat_here
   
   # Kapruka Remote MCP Endpoint
   KAPRUKA_MCP_ENDPOINT=https://mcp.kapruka.com/mcp
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔗 Submission Links

* **Live Hosted Demo:** [aura-kapruka.vercel.app](https://aura-kapruka.vercel.app/)
* **Kapruka Agent Challenge Page:** [Challenge Details](https://www.kapruka.com/contactUs/agentChallenge.html)
* **Public Kapruka MCP Documentation:** [mcp.kapruka.com](https://mcp.kapruka.com/)

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
