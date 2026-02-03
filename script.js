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
  const settingsPanel = document.getElementById("settings-panel");
  const trackListItems = document.getElementById("track-list-items");
  const armPivot = document.getElementById("arm-pivot");
  const armTimeHint = document.getElementById("arm-time-indicator");

  const artistInput = document.getElementById("artist-input");
  const titleInput = document.getElementById("title-input");
  const coverUrlInput = document.getElementById("cover-url-input");

  // --- State Variables ---
  let playlist = [];
  let currentIndex = -1;
  let isPlaying = false;
  let rotation = 0; // Để xoay đĩa (visual)
  let lyricsData = [];
  let playbackMode = "normal";

  // Arm Control Constants
  let dragStartX, dragStartY, dragStartTime;
  const START_ANGLE = 22; // Tâm đĩa (Start)
  const END_ANGLE = 55; // Rìa đĩa (End)
  const IDLE_ANGLE = 75; // Vị trí nghỉ (Pause)
  let isDraggingArm = false;
  let idleTimer;

  // --- API CONFIG ---
  const BACKEND_URL = "https://audioplay-4mhg.onrender.com"; // Thay bằng link Render của bạn

  // --- SETTINGS & UI HANDLERS ---
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
  document.getElementById("refetch-lyrics").onclick = () => {
    if (currentIndex > -1) fetchMetadata();
  };

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
        let title = base,
          artist = "UNKNOWN";
        if (base.includes(" - "))
          [artist, title] = base.split(" - ").map((s) => s.trim());
        map.set(base, { title, artist, mp3: null, lrc: null, cover: null });
      }
      if (["mp3", "wav", "m4a", "flac"].includes(ext)) map.get(base).mp3 = f;
    });
    playlist = Array.from(map.values()).filter((x) => x.mp3);
    updateUI();
    if (playlist.length) loadSong(0);
  }

  function updateUI() {
    document.getElementById("track-count").innerText = playlist.length;

    // Thêm tooltip cho từng bài nhạc trong danh sách
    trackListItems.innerHTML = playlist
      .map(
        (s, i) =>
          `<div class="track-item ${i === currentIndex ? "active-track" : ""}" 
              onclick="loadSongWrapper(${i})" 
              data-tooltip="Phát bài: ${s.title}">
            ${s.artist} - ${s.title}
        </div>`,
      )
      .join("");

    // Thêm tooltip cho các ảnh Album bên dưới
    document.getElementById("album-gallery").innerHTML = playlist
      .map(
        (s, i) =>
          `<div class="album-circle" 
              onclick="loadSongWrapper(${i})" 
              data-tooltip="${s.artist} - ${s.title}">
            ${s.cover ? `<img src="${s.cover}">` : `<div style="width:100%;height:100%;background:hsl(${i * 75},40%,25%);"></div>`}
        </div>`,
      )
      .join("");
  }
  async function loadSong(index, shouldPlay = true) {
    if (index < 0 || index >= playlist.length) return;
    pauseMusic();
    currentIndex = index;
    const song = playlist[index];
    updateUI();

    songTitleEl.innerHTML = song.title;
    artistInput.value = song.artist;
    titleInput.value = song.title;
    audio.src = URL.createObjectURL(song.mp3);

    await fetchMetadata();
    if (shouldPlay) playMusic();
  }

  async function fetchMetadata() {
    const artist = artistInput.value;
    const title = titleInput.value;
    lyricsBox.innerHTML = `<div class="lyric-line active">SYNCHRONIZING...</div>`;
    artistNameEl.innerText = "LOADING_DATA...";

    try {
      const res = await fetch(
        `${BACKEND_URL}/get-metadata?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}`,
      );
      const data = await res.json();
      if (data.cover) {
        playlist[currentIndex].cover = data.cover;
        diskLabel.style.backgroundImage = `url(${data.cover})`;
        updateUI();
      }
      if (data.lyrics) parseLyrics(data.lyrics);
      else
        lyricsBox.innerHTML = `<div class="lyric-line active">(No Lyrics Found)</div>`;
      artistNameEl.innerText = data.artist?.toUpperCase() || "UNKNOWN";
    } catch (e) {
      artistNameEl.innerText = "OFFLINE_MODE";
    }
  }

  function parseLyrics(lrc) {
    lyricsData = lrc
      .split("\n")
      .map((line) => {
        const m = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        return m
          ? { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() }
          : null;
      })
      .filter((x) => x && x.text);

    lyricsBox.innerHTML = lyricsData
      .map((l, i) => `<div class="lyric-line" id="l-${i}">${l.text}</div>`)
      .join("");
  }

  // --- MUSIC CONTROL ---

  function playMusic() {
    if (!audio.src || currentIndex < 0) return;
    isPlaying = true;
    document.body.classList.add("playing");
    audio.play();
    requestAnimationFrame(spin);
  }

  function pauseMusic() {
    isPlaying = false;
    document.body.classList.remove("playing");
    audio.pause();
  }

  audio.onended = () => {
    if (playbackMode === "repeat-one") {
      loadSong(currentIndex);
    } else {
      let nextIndex = currentIndex + 1;
      if (nextIndex < playlist.length) {
        loadSong(nextIndex);
      } else {
        // Hết bài: Đưa kim về vị trí nghỉ
        pauseMusic();
        armPivot.style.transform = `rotate(${IDLE_ANGLE}deg)`;
      }
    }
  };

  function spin() {
    if (!isPlaying) return;
    rotation += 0.15 * audio.playbackRate;
    disk.style.transform = `rotate(${rotation}deg)`;
    requestAnimationFrame(spin);
  }

  // --- TONE ARM LOGIC (THE NEW PROGRESS BAR) ---

  function getArmAngle(e) {
    const rect = armPivot.getBoundingClientRect();
    const centerX = rect.left;
    const centerY = rect.top;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
  }

  armPivot.addEventListener("mousedown", (e) => {
    if (!audio.src) return;
    isDraggingArm = true;
    dragStartTime = Date.now();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    armTimeHint.style.display = "block";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingArm) return;
    let angle = getArmAngle(e);

    // GIỚI HẠN GÓC KÉO: Chỉ cho phép kéo trong vùng đĩa nhạc
    if (angle < START_ANGLE) angle = START_ANGLE;
    if (angle > END_ANGLE) angle = END_ANGLE; // Chặn đứng ở rìa ngoài, không cho nhảy tới IDLE_ANGLE

    armPivot.style.transform = `rotate(${angle}deg)`;

    // Tính toán thời gian hiển thị (dùng biến cục bộ let)
    const progress = (angle - START_ANGLE) / (END_ANGLE - START_ANGLE);
    const seekTime = progress * audio.duration;

    const mins = Math.floor(seekTime / 60);
    const secs = Math.floor(seekTime % 60);
    armTimeHint.innerText = `${mins}:${secs.toString().padStart(2, "0")}`;

    updateLyricsManually(seekTime, true);
  });

  window.addEventListener("mouseup", (e) => {
    if (!isDraggingArm) return;
    isDraggingArm = false;
    armTimeHint.style.display = "none";

    const dragDuration = Date.now() - dragStartTime;
    const dragDistance = Math.hypot(
      e.clientX - dragStartX,
      e.clientY - dragStartY,
    );

    // 1. XỬ LÝ CLICK (Nhấn nhanh vào kim): Play/Pause
    if (dragDuration < 200 && dragDistance < 10) {
      if (isPlaying) {
        pauseMusic();
      } else {
        // Nếu đang ở vị trí nghỉ, đưa vào bài hát rồi chơi
        if (currentIndex === -1) return;
        playMusic();
      }
      return;
    }

    // 2. XỬ LÝ KÉO (Drag): Tua nhạc
    let angle = getArmAngle(e);
    // Chặn giá trị để không bị lỗi 404 thời gian
    if (angle < START_ANGLE) angle = START_ANGLE;
    if (angle > END_ANGLE) angle = END_ANGLE;

    const progress = (angle - START_ANGLE) / (END_ANGLE - START_ANGLE);
    const finalSeekTime = progress * audio.duration; // Đã sửa: dùng finalSeekTime rõ ràng

    if (!isNaN(finalSeekTime)) {
      audio.currentTime = finalSeekTime;
      updateLyricsManually(finalSeekTime, true);
      playMusic();
    }
  });

  // Cập nhật vị trí kim khi nhạc đang trôi
  audio.ontimeupdate = () => {
    if (isDraggingArm || isNaN(audio.duration) || !isPlaying) return;

    const progress = audio.currentTime / audio.duration;
    // Kim chạy từ START (22) đến END (55)
    const currentAngle = START_ANGLE + progress * (END_ANGLE - START_ANGLE);
    armPivot.style.transform = `rotate(${currentAngle}deg)`;

    document.getElementById("progress-fill").style.width = `${progress * 100}%`;
    updateLyricsManually(audio.currentTime);
  };

  function updateLyricsManually(time, isFast = false) {
    if (!lyricsData || lyricsData.length === 0) return;

    const idx = lyricsData.findIndex(
      (l, i) =>
        time >= l.time && (!lyricsData[i + 1] || time < lyricsData[i + 1].time),
    );

    if (idx !== -1) {
      const el = document.getElementById(`l-${idx}`);
      if (el) {
        if (!el.classList.contains("active")) {
          document
            .querySelectorAll(".lyric-line.active")
            .forEach((l) => l.classList.remove("active"));
          el.classList.add("active");
        }

        const container = lyricsBox;
        const targetScroll =
          el.offsetTop - container.offsetHeight / 2 + el.offsetHeight / 2;

        container.scrollTo({
          top: targetScroll,
          // Nếu đang tua (isFast) thì cuộn tức thì, nếu đang nghe bình thường thì cuộn mượt
          behavior: isFast ? "auto" : "smooth",
        });
      }
    }
  }

  // --- AUTO HIDE GALLERY ---
  function showGallery() {
    galleryContainer.classList.add("visible");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (isPlaying && !isDraggingArm)
        galleryContainer.classList.remove("visible");
    }, 3000);
  }
  window.addEventListener("mousemove", showGallery);

  audio.onended = () => {
    let nextIndex = (currentIndex + 1) % playlist.length;
    if (playbackMode === "repeat-one") nextIndex = currentIndex;
    else if (playbackMode === "shuffle")
      nextIndex = Math.floor(Math.random() * playlist.length);
    loadSong(nextIndex);
  };

  window.loadSongWrapper = (index) => {
    if (index !== currentIndex) loadSong(index);
  };

  const armTrigger = document.getElementById("arm-trigger");
  const hintText = document.getElementById("hint-text");

  armTrigger.addEventListener("mouseenter", () => {
    hintText.style.opacity = "0.6";
  });
  armTrigger.addEventListener("mouseleave", () => {
    hintText.style.opacity = "0";
  });

  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (!target) return;

    // Ép trình duyệt render tooltip ngầm để lấy kích thước
    const tooltip = window.getComputedStyle(target, "::before");

    // Đợi một chút để CSS transition bắt đầu hoặc dùng getBoundingClientRect
    const rect = target.getBoundingClientRect();
    const tooltipWidth = 160; // Chiều rộng trung bình của tooltip

    // Kiểm tra lề trái
    if (rect.left < tooltipWidth / 2) {
      target.style.setProperty("--tooltip-left", "0");
      target.style.setProperty("--tooltip-translate", "0");
    }
    // Kiểm tra lề phải
    else if (window.innerWidth - rect.right < tooltipWidth / 2) {
      target.style.setProperty("--tooltip-left", "auto");
      target.style.setProperty("--tooltip-right", "0");
      target.style.setProperty("--tooltip-translate", "0");
    }
  });
});
