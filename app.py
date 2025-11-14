# app.py - patched for frontend compatibility and robustness
from flask import Flask, render_template, request, jsonify, send_from_directory
import pickle
import pandas as pd
import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pathlib import Path
import os
import sys
import logging

app = Flask(__name__, static_folder="static", template_folder="templates")
logging.basicConfig(level=logging.INFO)

# ---------- Configuration ----------
API_KEY = "8265bd1679663a7ea12ac168da84d2e8"  # replace with your key if needed
TMDB_MOVIE_URL = "https://api.themoviedb.org/3/movie/{id}?api_key={key}&language=en-US"
TMDB_CREDITS_URL = "https://api.themoviedb.org/3/movie/{id}/credits?api_key={key}"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

PROJECT_ROOT = Path(__file__).parent.resolve()
POSTER_CACHE_DIR = PROJECT_ROOT / "static" / "posters"
POSTER_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ---------- HTTP session with retries ----------
_session = requests.Session()
retries = Retry(total=3, backoff_factor=0.4, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset(['GET']))
_adapter = HTTPAdapter(max_retries=retries)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)

# ---------- Robust loading of data ----------
def load_movies_and_similarity():
    # ensure we run from project root
    os.chdir(PROJECT_ROOT)

    # movie_dict.pkl must exist
    movies_pkl = PROJECT_ROOT / "movie_dict.pkl"
    if not movies_pkl.exists():
        logging.error("movie_dict.pkl not found in project root: %s", PROJECT_ROOT)
        raise FileNotFoundError("movie_dict.pkl not found in project folder.")

    with open(movies_pkl, "rb") as f:
        movies_dict = pickle.load(f)

    movies_df = pd.DataFrame(movies_dict)

    # load similarity: prefer .npy, fallback to .pkl
    sim = None
    npy = PROJECT_ROOT / "similarity.npy"
    pkl = PROJECT_ROOT / "similarity.pkl"

    if npy.exists():
        try:
            sim = np.load(npy, allow_pickle=False)
            logging.info("Loaded similarity.npy")
        except Exception as e:
            logging.warning("Failed to load similarity.npy: %s", e)

    if sim is None and pkl.exists():
        try:
            with open(pkl, "rb") as f:
                sim = pickle.load(f)
            logging.info("Loaded similarity.pkl")
        except ModuleNotFoundError as e:
            logging.error("ModuleNotFoundError unpickling similarity.pkl: %s", e)
            logging.error("This usually means the pickle was created with an incompatible numpy build. Try installing numpy==1.23.5 or convert the pickle to .npy elsewhere.")
            raise
        except Exception as e:
            logging.error("Failed to load similarity.pkl: %s", e)
            raise

    if sim is None:
        raise FileNotFoundError("No similarity.npy or similarity.pkl found or loadable.")

    # ensure sim is an ndarray
    sim = np.array(sim)
    return movies_df, sim

try:
    movies, similarity = load_movies_and_similarity()
except Exception as e:
    logging.exception("Failed loading data: %s", e)
    # re-raise to avoid running server in broken state
    raise

# ---------- Helper functions ----------
def fetch_poster_url_from_tmdb(movie_id):
    """Return poster URL (TMDB remote) or local cached file path if downloaded."""
    # if poster cached locally, return local static path
    local_file = POSTER_CACHE_DIR / f"{movie_id}.jpg"
    if local_file.exists():
        return f"/static/posters/{movie_id}.jpg"

    # fetch movie metadata from TMDB to get poster path, then download image
    try:
        url = TMDB_MOVIE_URL.format(id=movie_id, key=API_KEY)
        resp = _session.get(url, timeout=6)
        resp.raise_for_status()
        data = resp.json()
        poster_path = data.get("poster_path")
        if poster_path:
            image_url = TMDB_IMAGE_BASE + poster_path
            # download image
            try:
                img_resp = _session.get(image_url, timeout=8)
                img_resp.raise_for_status()
                local_file.write_bytes(img_resp.content)
                return f"/static/posters/{movie_id}.jpg"
            except Exception as ex_img:
                logging.warning("Failed to download poster image %s: %s", image_url, ex_img)
                return TMDB_IMAGE_BASE + poster_path
        else:
            return "/static/no_poster.png"
    except requests.RequestException as e:
        logging.warning("TMDB metadata fetch failed for id %s: %s", movie_id, e)
        # fallback: return cached file if exists or a placeholder
        if local_file.exists():
            return f"/static/posters/{movie_id}.jpg"
        return "/static/no_poster.png"
    except Exception as e:
        logging.exception("Unexpected error fetching poster: %s", e)
        return "/static/no_poster.png"


def recommend_for_movie(movie_title, topk=5):
    """Return lists: (titles, poster_urls, movie_ids)"""
    if movie_title not in movies['title'].values:
        raise ValueError("Movie not found: " + str(movie_title))

    idx = int(movies[movies['title'] == movie_title].index[0])
    distances = similarity[idx]
    if len(distances.shape) == 2:
        # handle weird shapes
        distances = distances.flatten()
    # enumerate and sort
    ranked = sorted(list(enumerate(distances)), key=lambda x: x[1], reverse=True)
    # skip first (self) then take topk
    selected = [r for r in ranked if r[0] != idx][:topk]

    names = []
    posters = []
    ids = []
    for pos, score in selected:
        try:
            mid = int(movies.iloc[pos].movie_id)
        except Exception:
            mid = movies.iloc[pos].movie_id
        title = movies.iloc[pos].title
        names.append(title)
        ids.append(mid)
        try:
            posters.append(fetch_poster_url_from_tmdb(mid))
        except Exception:
            posters.append("/static/no_poster.png")
    return names, posters, ids

# ---------- Routes ----------
@app.route("/")
def index():
    titles = movies['title'].values
    return render_template("index.html", movies=titles)

@app.route("/search")
def search():
    q = request.args.get("q", "").strip().lower()
    if not q:
        return jsonify([])
    # substring match (case-insensitive), limit 20
    matches = movies[movies['title'].str.lower().str.contains(q, na=False)]['title'].unique().tolist()
    return jsonify(matches[:20])

@app.route("/api/recommend", methods=["POST"])
def api_recommend():
    data = request.get_json(silent=True) or {}
    movie = data.get("movie")
    if not movie:
        return jsonify({"error": "no movie provided"}), 400
    try:
        names, posters, ids = recommend_for_movie(movie, topk=5)
        return jsonify({"names": names, "posters": posters, "ids": ids})
    except Exception as e:
        logging.exception("Recommend error: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/movie/<int:movie_id>")
def movie_details(movie_id):
    details = {
        "id": movie_id,
        "title": None,
        "overview": "No overview available.",
        "language": None,
        "main_star": "Unknown",
        "poster": "/static/no_poster.png",
        "release_date": None,
        "runtime": None,
        "genres": []
    }
    # details
    try:
        r = _session.get(TMDB_MOVIE_URL.format(id=movie_id, key=API_KEY), timeout=6)
        r.raise_for_status()
        d = r.json()
        details["title"] = d.get("title") or d.get("original_title")
        details["overview"] = d.get("overview") or details["overview"]
        langs = d.get("spoken_languages") or []
        if langs:
            details["language"] = ", ".join([l.get("name") for l in langs if l.get("name")])
        else:
            details["language"] = d.get("original_language")
        details["poster"] = TMDB_IMAGE_BASE + d.get("poster_path") if d.get("poster_path") else "/static/no_poster.png"
        details["release_date"] = d.get("release_date")
        details["runtime"] = d.get("runtime")
        genres = d.get("genres") or []
        details["genres"] = [g.get("name") for g in genres if g.get("name")]
    except Exception as e:
        logging.warning("Failed to fetch movie details for %s: %s", movie_id, e)

    # credits -> main star
    try:
        r2 = _session.get(TMDB_CREDITS_URL.format(id=movie_id, key=API_KEY), timeout=6)
        r2.raise_for_status()
        c = r2.json()
        cast = c.get("cast") or []
        if len(cast) > 0:
            details["main_star"] = cast[0].get("name") or cast[0].get("original_name") or "Unknown"
    except Exception as e:
        logging.warning("Failed to fetch credits for %s: %s", movie_id, e)

    return jsonify(details)

# optional: serve poster files (Flask static already handles /static/posters/<id>.jpg)
# but in case someone requests via /posters/<id>
@app.route("/posters/<path:filename>")
def posters(filename):
    return send_from_directory(str(POSTER_CACHE_DIR), filename)

# ---------- Run ----------
if __name__ == "__main__":
    app.run(debug=True)
