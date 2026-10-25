# Margin — a study app

Write notes, focus without distractions, and let an AI test what you know.

## Features

- **Notes** — write and organise notes. Everything saves automatically in your browser.
- **Focus mode** — pick 10, 25, 45 or 60 minutes. The app goes full screen and hides everything except the notepad and a timer. A chime plays when time is up, and you can add 5 more minutes.
- **AI quiz** — choose a note and get multiple-choice, written, or mixed questions.
  - Multiple choice is checked instantly, with an explanation.
  - Written answers are graded by the AI (0–100), with feedback and the correct answer when you're wrong.
  - At the end you get a score and a review of every question.
- **Flashcards** — make decks, add cards yourself, or have the AI make cards from a note. Study mode flips cards (click or Space) and repeats the ones you mark *Again* (keys 1 and 2).

## Run it

```bash
pip install -r requirements.txt
python app.py
```

Then open <http://localhost:5000>.

### Free AI with Ollama (recommended)

1. Install Ollama from <https://ollama.com> and open it.
2. Download a model once (about 2 GB):
   ```bash
   ollama pull llama3.2
   ```
3. Start the app with `python app.py`. It finds Ollama on its own, and the sidebar shows **AI: Ollama (llama3.2)**.

On a slower laptop, `ollama pull llama3.2:1b` is a smaller, faster model. Set `OLLAMA_MODEL=llama3.2:1b` in a `.env` file to use it.

### Other AI providers (optional, paid)

Copy `.env.example` to `.env` and set **one** key:

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (model set with `ANTHROPIC_MODEL`) |
| `OPENAI_API_KEY` | OpenAI (model set with `OPENAI_MODEL`) |

A key in `.env` takes priority over Ollama. `.env` is listed in `.gitignore`, so the key is never uploaded to GitHub.

### Offline demo mode

With no Ollama and no key, the app still runs. It builds questions and cards from lines written like `Term: definition`, and grades written answers by matching key words. It's fine for trying the app, but real feedback needs Ollama or a key.

## How it's built

| File | What it does |
|---|---|
| `app.py` | Flask server. Serves the page and exposes `/api/quiz`, `/api/grade`, `/api/flashcards`. |
| `llm.py` | Prompts, calls to Ollama/Claude/OpenAI, JSON parsing, and the offline demo mode. |
| `static/index.html` | The page layout. |
| `static/styles.css` | The styling (the ruled index-card look). |
| `static/app.js` | Notes, focus timer, quiz flow, flashcard decks and study mode. |

The API key is only used on the server, so it never reaches the browser. Notes and decks are stored in the browser's `localStorage`, so they stay on your computer and in that browser.
