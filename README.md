<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set API keys in [.env.local](.env.local):
   - `GEMINI_API_KEY` - Your Gemini API key (required for Gemini provider)
   - `OPENAI_API_KEY` - Your OpenAI API key (optional, required for OpenAI provider)
3. Run the app:
   `npm run dev`

### API Key Management

API keys can be provided in two ways:

1. **Environment Variables** (recommended for development): Set `GEMINI_API_KEY` and/or `OPENAI_API_KEY` in `.env.local`
2. **In-App UI**: The app will prompt you to enter API keys on first launch if none are found. You can also access the API settings at any time using the gear icon (⚙️) in the header.

Keys entered via the UI are stored locally in your browser and take precedence over environment variables. At least one API key (Gemini or OpenAI) is required for the app to function.
