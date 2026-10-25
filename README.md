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
python -m venv venv
venv\Scripts\activate          # Windows  (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env         # macOS/Linux: cp .env.example .env
# put your API key in .env
python app.py
```

Then open <http://localhost:5000>.

### AI provider

Set **one** key in `.env`:

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (default model `claude-sonnet-5-5`, change with `ANTHROPIC_MODEL`) |
| `OPENAI_API_KEY` | OpenAI (default model `gpt-4o-mini`, change with `OPENAI_MODEL`) |

With no key, the app runs in **offline demo mode**: it builds questions and cards from lines written like `Term: definition` and grades written answers by keyword overlap. It's good for trying the app, but real feedback needs an API key.

## How it's built

| File | What it does |
|---|---|
| `app.py` | Flask server. Serves the page and exposes `/api/quiz`, `/api/grade`, `/api/flashcards`. |
| `llm.py` | Prompts, calls to Claude/OpenAI, JSON parsing, and the offline demo mode. |
| `static/index.html` | The page layout. |
| `static/styles.css` | The styling (the ruled index-card look). |
| `static/app.js` | Notes, focus timer, quiz flow, flashcard decks and study mode. |

The API key is only used on the server, so it never reaches the browser. Notes and decks are stored in the browser's `localStorage`, so they stay on your computer and in that browser.
