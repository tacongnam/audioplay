// --- State Variables ---
let playlist = [];
let currentIndex = -1;
let isPlaying = false;
let rotation = 0;
let lyricsData = [];
let playbackMode = "normal"; // normal, repeat-all, repeat-one, shuffle
let draggedIndex = null;

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const audio = document.getElementById("audio");
  const songTitleEl = document.getElementById("song-title");
  const titleWrapper = document.getElementById("title-wrapper");
  const artistNameEl = document.getElementById("artist-name");
  const disk = document.getElementById("disk");
  const diskLabel = document.getElementById("disk-cover");
  const lyricsBox = document.getElementById("lyrics-box");
  const galleryContainer = document.getElementById("gallery-container");
  const armTrigger = document.getElementById("arm-trigger");
  const settingsPanel = document.getElementById("settings-panel");
  const trackListItems = document.getElementById("track-list-items");
  // Metadata inputs
  const artistInput = document.getElementById("artist-input");
  const titleInput = document.getElementById("title-input");
  const coverUrlInput = document.getElementById("cover-url-input");

  // --- SETTINGS PANEL CONTROLS ---
  document.getElementById("settings-toggle").onclick = () =>
    settingsPanel.classList.toggle("open");
  document.getElementById("close-settings").onclick = () =>
    settingsPanel.classList.remove("open");
  document.getElementById("color-bg").oninput = (e) =>
    document.documentElement.style.setProperty("--bg-color", e.target.value);
  document.getElementById("color-vinyl").oninput = (e) =>
    document.documentElement.style.setProperty("--vinyl-color", e.target.value);
  document
    .getElementById("folder-input")
    .addEventListener("change", handleFolderSelect);
  document.getElementById("vol-slider").oninput = (e) =>
    (audio.volume = e.target.value);
  document.getElementById("pitch-slider").oninput = (e) =>
    (audio.playbackRate = e.target.value);

  // Metadata and cover URL handler
  coverUrlInput.onchange = (e) => {
    if (currentIndex > -1) {
      playlist[currentIndex].cover = e.target.value;
      updateUI(); // Redraw gallery
      loadSong(currentIndex, false); // Reload song to show new cover on vinyl
    }
  };
  artistInput.onchange = (e) => {
    if (currentIndex > -1) playlist[currentIndex].artist = e.target.value;
  };
  titleInput.onchange = (e) => {
    if (currentIndex > -1) playlist[currentIndex].title = e.target.value;
  };
  document.getElementById("refetch-lyrics").onclick = () => {
    if (currentIndex > -1) fetchAndParseLyrics();
  };

  // Playback mode controls
  document
    .getElementById("playback-controls")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".pm-btn");
      if (!btn) return;
      document
        .querySelectorAll(".pm-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      playbackMode = btn.id.replace("mode-", "");
    });

  // --- CORE FUNCTIONS ---
  async function handleFolderSelect(e) {
    const files = Array.from(e.target.files);
    const map = new Map();
    files.forEach((f) => {
      const parts = f.name.split(".");
      const ext = parts.pop().toLowerCase();
      const base = parts.join(".");

      if (!map.has(base)) {
        let title = base;
        let artist = "UNKNOWN ARTIST";
        if (base.includes(" - ")) {
          [artist, title] = base.split(" - ").map((s) => s.trim());
        }
        map.set(base, { title, artist, mp3: null, lrc: null, cover: null });
      }

      if (["mp3", "wav", "m4a", "flac"].includes(ext)) map.get(base).mp3 = f;
      if (ext === "lrc") map.get(base).lrc = f;
    });
    playlist = Array.from(map.values()).filter((x) => x.mp3);
    updateUI();
    if (playlist.length) loadSong(0);
  }

  function updateUI() {
    document.getElementById("track-count").innerText = playlist.length;
    trackListItems.innerHTML = playlist
      .map(
        (s, i) =>
          `<div class="track-item ${i === currentIndex ? "active-track" : ""}" 
                onclick="loadSongWrapper(${i})" 
                draggable="true" 
                data-index="${i}">
             ${s.artist} - ${s.title}
           </div>`,
      )
      .join("");

    document.getElementById("album-gallery").innerHTML = playlist
      .map(
        (s, i) =>
          `<div class="album-circle" onclick="loadSongWrapper(${i})" title="${s.artist} - ${s.title}">
             ${s.cover ? `<img src="${s.cover}" alt="${s.title}">` : `<div style="width:100%; height:100%; background:hsl(${i * 75},40%,25%);"></div>`}
           </div>`,
      )
      .join("");
  }

  async function loadSong(index, shouldPlay = true) {
    if (index < 0 || index >= playlist.length) return;

    pauseMusic();
    currentIndex = index;
    const song = playlist[index];

    updateUI(); // To highlight active track

    // Update title marquee
    titleWrapper.classList.remove("running");
    songTitleEl.innerHTML = song.title;
    setTimeout(() => {
      const containerWidth = document.querySelector(
        ".title-marquee-container",
      ).offsetWidth;
      if (songTitleEl.offsetWidth > containerWidth) {
        songTitleEl.innerHTML = `${song.title} &nbsp;&nbsp;&nbsp; ${song.title} &nbsp;&nbsp;&nbsp;`;
        titleWrapper.classList.add("running");
      }
    }, 150);

    // Update metadata inputs
    artistInput.value = song.artist || "";
    titleInput.value = song.title || "";
    coverUrlInput.value = song.cover || "";

    audio.src = URL.createObjectURL(song.mp3);

    // Update vinyl label
    if (song.cover) {
      diskLabel.style.backgroundImage = `url(${song.cover})`;
      diskLabel.style.backgroundColor = "transparent";
    } else {
      diskLabel.style.backgroundImage = `none`;
      diskLabel.style.backgroundColor = `hsl(${index * 75}, 35%, 20%)`;
    }

    await fetchAndParseLyrics();

    galleryContainer.classList.add("visible");
    setTimeout(() => galleryContainer.classList.remove("visible"), 3000);

    if (shouldPlay) {
      playMusic();
    }
  }

  let isSynced = false;

  async function fetchAndParseLyrics() {
    const artist = artistInput.value;
    const title = titleInput.value;

    // Xóa lyrics cũ ngay để người dùng biết là đang tải bài mới
    lyricsBox.innerHTML = `<div class="lyric-line active">SYNCING_STATION...</div>`;
    artistNameEl.innerText = "LOADING_DATA...";

    try {
      const res = await fetch(
        `http://localhost:5000/get-metadata?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}`,
      );
      const data = await res.json();

      // Cập nhật Cover ngay khi có
      if (data.cover) {
        playlist[currentIndex].cover = data.cover;
        diskLabel.style.backgroundImage = `url(${data.cover})`;
        updateUI();
      }

      // Cập nhật Lyrics
      if (data.lyrics) {
        parseLyrics(data.lyrics);
        artistNameEl.innerText = data.artist.toUpperCase();
      } else {
        lyricsBox.innerHTML = `<div class="lyric-line active">(No Lyrics Available)</div>`;
        artistNameEl.innerText = data.artist.toUpperCase();
      }
    } catch (e) {
      artistNameEl.innerText = "CONNECTION_ERROR";
    }
  }

  function parseLyrics(lrc) {
    // Kiểm tra xem có phải định dạng LRC ([00:00.00]) không
    const hasTimestamps = lrc.match(/\[\d+:\d+\.\d+\]/);

    if (hasTimestamps) {
      isSynced = true;
      lyricsBox.style.overflowY = "hidden"; // Tự động cuộn
      lyricsData = lrc
        .split("\n")
        .map((line) => {
          const m = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
          return m
            ? {
                time: parseInt(m[1]) * 60 + parseFloat(m[2]),
                text: m[3].trim(),
              }
            : null;
        })
        .filter((x) => x && x.text);

      lyricsBox.innerHTML = lyricsData
        .map((l, i) => `<div class="lyric-line" id="l-${i}">${l.text}</div>`)
        .join("");
    } else {
      isSynced = false;
      lyricsBox.style.overflowY = "auto"; // Cho phép cuộn tay
      lyricsBox.innerHTML = `<div class="lyric-line active" style="transform:none; opacity:1; text-align:center; white-space:pre-wrap;">${lrc}</div>`;
    }
  }

  armTrigger.onclick = () => (isPlaying ? pauseMusic() : playMusic());

  function playMusic() {
    if (!audio.src || currentIndex < 0) return;
    isPlaying = true;
    document.body.classList.add("playing");
    setTimeout(() => audio.play(), 1400); // Wait for arm animation
    requestAnimationFrame(spin);
  }

  function pauseMusic() {
    isPlaying = false;
    document.body.classList.remove("playing");
    audio.pause();
  }

  function spin() {
    if (!isPlaying) return;
    rotation += 0.3 * audio.playbackRate;
    disk.style.transform = `rotate(${rotation}deg)`;
    requestAnimationFrame(spin);
  }

  // --- EVENT LISTENERS ---
  audio.ontimeupdate = () => {
    if (isNaN(audio.duration)) return;
    document.getElementById("progress-fill").style.width =
      `${(audio.currentTime / audio.duration) * 100}%`;
    const idx = lyricsData.findIndex(
      (l, i) =>
        audio.currentTime >= l.time &&
        (!lyricsData[i + 1] || audio.currentTime < lyricsData[i + 1].time),
    );
    if (idx !== -1) {
      const el = document.getElementById(`l-${idx}`);
      if (el && !el.classList.contains("active")) {
        document
          .querySelectorAll(".lyric-line.active")
          .forEach((l) => l.classList.remove("active"));
        el.classList.add("active");

        const container = lyricsBox;
        const targetScroll =
          el.offsetTop - container.offsetHeight / 2 + el.offsetHeight / 2;

        container.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
      }
    }
  };

  audio.onended = () => {
    let nextIndex;
    switch (playbackMode) {
      case "repeat-one":
        nextIndex = currentIndex;
        break;
      case "shuffle":
        if (playlist.length <= 1) {
          nextIndex = currentIndex;
        } else {
          do {
            nextIndex = Math.floor(Math.random() * playlist.length);
          } while (nextIndex === currentIndex);
        }
        break;
      case "repeat-all":
        nextIndex = (currentIndex + 1) % playlist.length;
        break;
      case "normal":
      default:
        if (currentIndex < playlist.length - 1) {
          nextIndex = currentIndex + 1;
        } else {
          pauseMusic();
          return; // Stop here
        }
        break;
    }
    loadSong(nextIndex);
  };

  // --- DRAG & DROP PLAYLIST REORDERING ---
  trackListItems.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("track-item")) {
      draggedIndex = parseInt(e.target.dataset.index);
      e.target.classList.add("dragging");
    }
  });

  trackListItems.addEventListener("dragend", (e) => {
    e.target.classList.remove("dragging");
  });

  trackListItems.addEventListener("dragover", (e) => {
    e.preventDefault();
    const target = e.target.closest(".track-item");
    if (target) {
      // visual feedback for drop zone can be added here
    }
  });

  trackListItems.addEventListener("drop", (e) => {
    e.preventDefault();
    const dropTarget = e.target.closest(".track-item");
    if (dropTarget) {
      const droppedOnIndex = parseInt(dropTarget.dataset.index);
      if (draggedIndex !== null && draggedIndex !== droppedOnIndex) {
        const item = playlist.splice(draggedIndex, 1)[0];
        playlist.splice(droppedOnIndex, 0, item);

        // Update currentIndex if the playing song's position changed
        if (currentIndex === draggedIndex) {
          currentIndex = droppedOnIndex;
        } else if (
          draggedIndex < currentIndex &&
          droppedOnIndex >= currentIndex
        ) {
          currentIndex--;
        } else if (
          draggedIndex > currentIndex &&
          droppedOnIndex <= currentIndex
        ) {
          currentIndex++;
        }
        updateUI();
      }
    }
    draggedIndex = null;
  });

  // --- GLOBAL ACCESS ---
  window.loadSongWrapper = (index) => {
    if (index !== currentIndex) loadSong(index);
  };
});

let isDraggingDisk = false;
let startAngle = 0;
let lastRotation = 0;

disk.addEventListener("mousedown", startRotate);
window.addEventListener("mousemove", rotateDisk);
window.addEventListener("mouseup", stopRotate);

function getAngle(e) {
  const rect = disk.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  const x = clientX - centerX;
  const y = clientY - centerY;
  return Math.atan2(y, x) * (180 / Math.PI);
}

function startRotate(e) {
  if (!audio.src || currentIndex < 0) return;
  isDraggingDisk = true;
  startAngle = getAngle(e);
  lastRotation = rotation;
  audio.pause(); // Tạm dừng để tua cho chuẩn
}

function rotateDisk(e) {
  if (!isDraggingDisk) return;

  const currentAngle = getAngle(e);
  let delta = currentAngle - startAngle;

  // Xử lý bước nhảy góc khi đi qua điểm -180/180 độ
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  rotation += delta; // Cập nhật biến global rotation
  disk.style.transform = `rotate(${rotation}deg)`;

  // Tính toán thời gian nhạc (360 độ = 10 giây nhạc)
  const timeDelta = (delta / 360) * 10;
  let newTime = audio.currentTime + timeDelta;

  if (newTime < 0) newTime = 0;
  if (newTime > audio.duration) newTime = audio.duration;

  audio.currentTime = newTime;

  // Cập nhật lyrics ngay lập tức khi tua
  updateLyricsManually();

  startAngle = currentAngle;
}

function stopRotate() {
  if (isDraggingDisk) {
    isDraggingDisk = false;
    // Nếu trước đó đang chơi thì chơi tiếp
    if (document.body.classList.contains("playing")) {
      audio.play();
    }
  }
}

// Hàm bổ trợ cập nhật lyrics tức thời
function updateLyricsManually() {
  if (!lyricsData || lyricsData.length === 0) return;
  const idx = lyricsData.findIndex(
    (l, i) =>
      audio.currentTime >= l.time &&
      (!lyricsData[i + 1] || audio.currentTime < lyricsData[i + 1].time),
  );
  if (idx !== -1) {
    const el = document.getElementById(`l-${idx}`);
    if (el && !el.classList.contains("active")) {
      document
        .querySelectorAll(".lyric-line.active")
        .forEach((l) => l.classList.remove("active"));
      el.classList.add("active");
      el.scrollIntoView({ behavior: "auto", block: "center" });
    }
  }
}

disk.addEventListener("mousedown", startRotate);
window.addEventListener("mousemove", rotateDisk);
window.addEventListener("mouseup", stopRotate);

// Hỗ trợ cảm ứng điện thoại
disk.addEventListener("touchstart", startRotate);
window.addEventListener("touchmove", rotateDisk);
window.addEventListener("touchend", stopRotate);
