"""Study app backend.

Run with:  python app.py   then open http://localhost:5000
Notes and flashcards are stored in the browser (localStorage); this server
only serves the page and talks to the AI provider so the API key stays
private.
"""

import os

from flask import Flask, jsonify, request, send_from_directory

import llm

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = Flask(__name__, static_folder="static", static_url_path="")

MAX_NOTES_CHARS = 30000


def _notes_from(body):
    notes = (body.get("notes") or "").strip()
    if not notes:
        raise ValueError("Pick a note that has some text in it first.")
    return notes[:MAX_NOTES_CHARS]


def _handle(fn):
    try:
        return jsonify(fn(request.get_json(force=True) or {}))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except llm.LLMError as e:
        return jsonify({"error": str(e)}), 502
    except Exception as e:  # network errors, timeouts, etc.
        return jsonify({"error": f"Something went wrong talking to the AI: {e}"}), 500


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/status")
def status():
    return jsonify({"provider": llm.get_provider(), "model": llm.get_model()})


@app.post("/api/quiz")
def quiz():
    def run(body):
        count = max(1, min(15, int(body.get("count", 5))))
        qtype = body.get("type", "mixed")
        if qtype not in ("mc", "written", "mixed"):
            raise ValueError("Question type must be mc, written or mixed.")
        return {"questions": llm.generate_questions(_notes_from(body), count, qtype)}

    return _handle(run)


@app.post("/api/grade")
def grade():
    def run(body):
        answer = (body.get("answer") or "").strip()
        if not answer:
            raise ValueError("Write an answer before checking it.")
        return llm.grade_written(
            _notes_from(body),
            body.get("question", ""),
            body.get("model_answer", ""),
            answer,
        )

    return _handle(run)


@app.post("/api/flashcards")
def flashcards():
    def run(body):
        count = max(1, min(40, int(body.get("count", 10))))
        return {"cards": llm.generate_flashcards(_notes_from(body), count)}

    return _handle(run)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    print(f"AI provider: {llm.get_provider()} {llm.get_model()}")
    print(f"Open http://localhost:{port}")
    app.run(debug=True, port=port)
