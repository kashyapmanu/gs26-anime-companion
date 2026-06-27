# CrunchyFake Anime Companion

A virtual **3D anime companion** embedded in a Crunchyroll-style demo website ("CrunchyFake"). The companion is a voice-driven AI buddy (speech-in / speech-out, with lip-sync) that is aware of the user's watch history and proactively reminds them when a new episode drops.

Developed as a hackathon submission (Sony/Crunchyroll), this project is built using a single JS/TS stack with a Vite + React frontend and a Fastify backend.

## 🚀 Key Features

* **3D VRM Avatar Stage**: Renders true 3D anime avatars in-browser using `@pixiv/three-vrm`.
* **Full Voice Conversation**: Speech-to-text (STT) via the browser Web Speech API and Text-to-Speech (TTS) via a cloud provider.
* **Lip-Sync Integration**: The avatar's mouth movements are dynamically driven by the incoming TTS audio.
* **Watch-History Aware**: The AI's prompt is initialized with the user's mock watch history.
* **Proactive Greeting**: Automatically greets the user with personalized comments and episode drop reminders when the companion widget is opened.
* **Streaming & Low-Latency**: Sentences are chunked and streamed to TTS immediately to reduce latency.

## 🏗️ Architecture

```
Browser (localhost)              Node Proxy Backend              Cloud Providers
-----------------                ------------------              ---------------
CrunchyFake Site Shell           PersonaPromptBuilder            OpenAI-compatible LLM
  |                              LLMProxy (streaming)            TTS Provider
CompanionWidget (embed)          TTSProxy                        (STT is in-browser)
  |- VRMStage (three-vrm)        MockDataService
  |- VoiceController (STT/play)  Greeter
  |- ConversationClient          SessionRouter (HTTP/WS)
```

## 📂 Project Structure

* `docs/`: Specs and plans.
  * [Design Spec](docs/superpowers/specs/2026-06-27-anime-companion-design.md)
  * [Implementation Plan](docs/superpowers/plans/2026-06-27-anime-companion.md)
