"""Small wrapper around the AI provider.

Supports Anthropic (Claude), OpenAI, and an offline "mock" mode so the app
can be demoed without an API key. The provider is chosen with the
LLM_PROVIDER environment variable, or automatically from whichever API key
is set.
"""

import json
import os
import random
import re

import requests

TIMEOUT = 90


def get_provider():
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    if provider:
        return provider
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "mock"


class LLMError(Exception):
    pass


def _call_anthropic(system, prompt):
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise LLMError("ANTHROPIC_API_KEY is not set.")
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 4000,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        raise LLMError(f"Anthropic API error {r.status_code}: {r.text[:300]}")
    data = r.json()
    return "".join(b.get("text", "") for b in data.get("content", []))


def _call_openai(system, prompt):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise LLMError("OPENAI_API_KEY is not set.")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    r = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
        },
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        raise LLMError(f"OpenAI API error {r.status_code}: {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


def _extract_json(text):
    """Pull the first JSON object out of a model reply."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
    raise LLMError("The AI reply was not valid JSON. Try again.")


SYSTEM = (
    "You are a patient, precise study tutor. You only use facts that are "
    "supported by the student's notes, plus well-established general "
    "knowledge when the notes are clearly incomplete. Always reply with a "
    "single JSON object and nothing else."
)


def ask_json(prompt):
    provider = get_provider()
    if provider == "anthropic":
        return _extract_json(_call_anthropic(SYSTEM, prompt))
    if provider == "openai":
        return _extract_json(_call_openai(SYSTEM, prompt))
    raise LLMError(f"Unknown LLM_PROVIDER '{provider}'.")


# ---------------------------------------------------------------- tasks


def generate_questions(notes, count, qtype):
    if get_provider() == "mock":
        return mock.generate_questions(notes, count, qtype)

    type_rule = {
        "mc": 'Every question must be "mc".',
        "written": 'Every question must be "written".',
        "mixed": 'Mix "mc" and "written" questions roughly half and half.',
    }[qtype]
    prompt = f"""Write {count} quiz questions that test understanding of these notes.
{type_rule}

For "mc" questions give exactly 4 options, one correct, with plausible wrong
options. For "written" questions ask for a short explanation (1-4 sentences)
and give a model answer.

Return JSON in this shape:
{{"questions": [
  {{"type": "mc", "question": "...", "options": ["...", "...", "...", "..."],
    "answer_index": 0, "explanation": "why the right option is right"}},
  {{"type": "written", "question": "...", "model_answer": "..."}}
]}}

NOTES:
\"\"\"
{notes}
\"\"\""""
    data = ask_json(prompt)
    questions = data.get("questions", [])
    clean = []
    for q in questions:
        if q.get("type") == "mc" and len(q.get("options", [])) >= 2:
            idx = int(q.get("answer_index", 0))
            # Shuffle options so the correct answer is not always first.
            opts = list(q["options"])
            correct = opts[idx]
            random.shuffle(opts)
            clean.append(
                {
                    "type": "mc",
                    "question": q["question"],
                    "options": opts,
                    "answer_index": opts.index(correct),
                    "explanation": q.get("explanation", ""),
                }
            )
        elif q.get("type") == "written":
            clean.append(
                {
                    "type": "written",
                    "question": q["question"],
                    "model_answer": q.get("model_answer", ""),
                }
            )
    if not clean:
        raise LLMError("The AI did not return any usable questions.")
    return clean


def grade_written(notes, question, model_answer, user_answer):
    if get_provider() == "mock":
        return mock.grade_written(question, model_answer, user_answer)

    prompt = f"""Grade a student's written answer.

QUESTION: {question}
MODEL ANSWER: {model_answer}
STUDENT ANSWER: {user_answer}

Use the notes below as the source of truth. Be fair: accept answers that are
correct in substance even if worded differently. If the student is wrong or
missing something, say exactly what and give the correct version.

Return JSON:
{{"score": <integer 0-100>,
  "verdict": "correct" | "partly correct" | "incorrect",
  "feedback": "2-4 sentences speaking directly to the student",
  "correction": "the corrected or complete answer, or empty string if fully correct"}}

NOTES:
\"\"\"
{notes}
\"\"\""""
    data = ask_json(prompt)
    score = max(0, min(100, int(data.get("score", 0))))
    return {
        "score": score,
        "verdict": data.get("verdict", "incorrect"),
        "feedback": data.get("feedback", ""),
        "correction": data.get("correction", ""),
    }


def generate_flashcards(notes, count):
    if get_provider() == "mock":
        return mock.generate_flashcards(notes, count)

    prompt = f"""Make up to {count} flashcards from these notes. Each card tests one
idea. The front is a short question or term; the back is a concise answer
(at most 2 sentences). Skip trivia and duplicates.

Return JSON: {{"cards": [{{"front": "...", "back": "..."}}]}}

NOTES:
\"\"\"
{notes}
\"\"\""""
    data = ask_json(prompt)
    cards = [
        {"front": c["front"].strip(), "back": c["back"].strip()}
        for c in data.get("cards", [])
        if c.get("front") and c.get("back")
    ]
    if not cards:
        raise LLMError("The AI did not return any flashcards.")
    return cards


# ---------------------------------------------------------------- mock mode


class mock:
    """Offline stand-in so the app works with no API key.

    It is deliberately simple: it turns "term: definition" lines and
    sentences from the notes into cards and questions.
    """

    @staticmethod
    def _facts(notes):
        facts = []
        for line in notes.splitlines():
            line = line.strip(" -*\t")
            m = re.match(r"^(.{2,60}?)\s*[:=–—-]\s+(.{3,})$", line)
            if m:
                facts.append((m.group(1).strip(), m.group(2).strip()))
        if len(facts) < 2:
            sentences = re.split(r"(?<=[.!?])\s+", notes.replace("\n", " "))
            for s in sentences:
                words = s.split()
                if len(words) >= 5:
                    facts.append((" ".join(words[:4]) + " ...", s.strip()))
        return facts

    @staticmethod
    def generate_flashcards(notes, count):
        facts = mock._facts(notes)[:count]
        if not facts:
            raise LLMError("Mock mode needs notes with lines like 'Term: definition'.")
        return [{"front": f"What is {t}?", "back": d} for t, d in facts]

    @staticmethod
    def generate_questions(notes, count, qtype):
        facts = mock._facts(notes)
        if len(facts) < 2:
            raise LLMError("Mock mode needs at least 2 lines like 'Term: definition'.")
        random.shuffle(facts)
        out = []
        for i, (term, definition) in enumerate(facts[:count]):
            kind = qtype if qtype != "mixed" else ("mc" if i % 2 == 0 else "written")
            if kind == "mc":
                wrong = [d for t, d in facts if t != term]
                random.shuffle(wrong)
                opts = [definition] + wrong[:3]
                random.shuffle(opts)
                out.append(
                    {
                        "type": "mc",
                        "question": f"Which best describes {term}?",
                        "options": opts,
                        "answer_index": opts.index(definition),
                        "explanation": f"{term}: {definition}",
                    }
                )
            else:
                out.append(
                    {
                        "type": "written",
                        "question": f"Explain {term} in your own words.",
                        "model_answer": definition,
                    }
                )
        return out

    @staticmethod
    def grade_written(question, model_answer, user_answer):
        def words(s):
            return {w for w in re.findall(r"[a-zA-ZÀ-ſ]{4,}", s.lower())}

        target, given = words(model_answer), words(user_answer)
        score = round(100 * len(target & given) / len(target)) if target else 0
        verdict = "correct" if score >= 70 else "partly correct" if score >= 35 else "incorrect"
        missing = sorted(target - given)[:6]
        feedback = (
            "Offline mode compares key words only. "
            + ("You covered the main points." if not missing else "Key words you missed: " + ", ".join(missing) + ".")
        )
        return {
            "score": score,
            "verdict": verdict,
            "feedback": feedback,
            "correction": "" if verdict == "correct" else model_answer,
        }
