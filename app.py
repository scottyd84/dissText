"""dissText — the disappearing writing app.

Inspired by *The Most Dangerous Writing App*: pick a target, keep typing, and if
you stop for too long your words fade out and are wiped.

The backend is intentionally thin. All timing, text, fading, and wiping happen in
the browser (see static/js/writer.js) — the draft is NEVER sent to the server, so
the server genuinely cannot recover your lost words.
"""

from flask import Flask, render_template

app = Flask(__name__)

# Tunable game constants — injected into the page so config lives in one place.
GRACE_SECONDS = 5  # idle time before your words are wiped
FADE_SECONDS = 2   # how long the "fading out" warning lasts before the wipe

# Preset targets offered on the setup screen.
TIME_PRESETS = [3, 5, 10, 20]        # minutes
WORD_PRESETS = [250, 500, 1000]      # words


@app.route("/")
def index():
    return render_template(
        "index.html",
        grace_seconds=GRACE_SECONDS,
        fade_seconds=FADE_SECONDS,
        time_presets=TIME_PRESETS,
        word_presets=WORD_PRESETS,
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
