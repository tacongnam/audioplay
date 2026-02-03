from flask import Flask, request, jsonify
from flask_cors import CORS
import syncedlyrics
import requests
import os

app = Flask(__name__)
CORS(app) # Cho phép Frontend gọi API

@app.route('/get-lyrics')
def get_lyrics():
    artist = request.args.get('artist', '')
    track = request.args.get('track', '')
    search_term = f"{artist} - {track}"
    
    try:
        # Tìm kiếm lời bài hát (trả về chuỗi định dạng LRC hoặc text)
        lrc = syncedlyrics.search(search_term)
        if lrc:
            return jsonify({"lyrics": lrc})
        return jsonify({"error": "Not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

app = Flask(__name__)
CORS(app)

def get_itunes_cover(artist, track):
    """Tìm ảnh cover từ iTunes Search API (Không cần API Key)"""
    query = f"{artist} {track}"
    url = f"https://itunes.apple.com/search?term={query}&entity=song&limit=1"
    try:
        response = requests.get(url, timeout=5)
        data = response.json()
        if data['resultCount'] > 0:
            # Lấy ảnh 100x100 và đổi thành 600x600 để có chất lượng cao
            cover_url = data['results'][0]['artworkUrl100'].replace('100x100bb', '600x600bb')
            return cover_url
    except Exception as e:
        print(f"Error fetching cover: {e}")
    return None

@app.route('/get-metadata')
def get_metadata():
    artist = request.args.get('artist', '')
    track = request.args.get('track', '')
    
    result = {
        "lyrics": None,
        "cover": None,
        "artist": artist,
        "track": track
    }

    # 1. Lấy Lyrics (Synced hoặc Plain)
    try:
        lrc = syncedlyrics.search(f"{artist} - {track}")
        if lrc:
            result["lyrics"] = lrc
    except:
        pass

    # 2. Lấy Cover Image
    cover = get_itunes_cover(artist, track)
    if cover:
        result["cover"] = cover

    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)