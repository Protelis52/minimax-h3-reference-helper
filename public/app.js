(() => {
  const $ = (s) => document.querySelector(s);
  const drop = $("#drop");
  const fileInput = $("#file");
  const video = $("#video");
  const canvas = $("#canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const workspace = $("#workspace");
  const first = $("#first");
  const last = $("#last");
  const samplesEl = $("#samples");
  const status = $("#status");
  const dropStatus = $("#dropStatus");
  const output = $("#output");

  let objectUrl = null;
  let firstPng = null;
  let meta = null;

  function nearestH3(s) {
    const k = Math.max(0, Math.round((s * 24 - 5) / 17));
    const frames = 17 * k + 5;
    return { frames, seconds: frames / 24 };
  }

  function waitForEvent(el, eventName, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        el.removeEventListener(eventName, onEvent);
        el.removeEventListener("error", onError);
      };
      const onEvent = () => { cleanup(); resolve(); };
      const onError = () => {
        cleanup();
        reject(new Error("The browser could not decode this video. Try MP4/H.264."));
      };
      el.addEventListener(eventName, onEvent, { once: true });
      el.addEventListener("error", onError, { once: true });
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while loading the video."));
      }, timeoutMs);
    });
  }

  async function seekTo(seconds) {
    const maxTime = Math.max(0, video.duration - 0.001);
    const target = Math.max(0, Math.min(seconds, maxTime));

    if (Math.abs(video.currentTime - target) > 0.002) {
      const ready = waitForEvent(video, "seeked", 7000);
      video.currentTime = target;
      await ready;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  function capture(type = "image/png", quality = 0.92) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(type, quality);
  }

  function frameBrightness() {
    const w = Math.min(canvas.width, 160);
    const h = Math.min(canvas.height, 90);
    if (!w || !h) return 0;

    const sample = document.createElement("canvas");
    sample.width = w;
    sample.height = h;
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(canvas, 0, 0, w, h);
    const data = sctx.getImageData(0, 0, w, h).data;

    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 64) {
      total += data[i] + data[i + 1] + data[i + 2];
      count += 3;
    }
    return count ? total / count : 0;
  }

  async function captureFirstVisibleFrame() {
    const candidates = [0.05, 0.10, 0.15, 0.25, 0.40, 0.60]
      .filter((t) => t < video.duration);

    if (!candidates.length) candidates.push(Math.max(0, video.duration * 0.05));

    let fallback = null;
    for (const t of candidates) {
      await seekTo(t);
      const data = capture();
      fallback = data;
      if (frameBrightness() > 8) return data;
    }
    return fallback;
  }

  function dataUrlToBlob(dataUrl) {
    const [header, body] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const raw = atob(body);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return;
    const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function processVideo(file) {
    dropStatus.textContent = "Loading " + file.name + "…";
    status.textContent = "";
    workspace.classList.add("hidden");
    output.value = "";
    $("#copy").disabled = true;
    $("#build").disabled = true;

    try {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);

      const metadataPromise = waitForEvent(video, "loadedmetadata", 10000);
      video.src = objectUrl;
      video.preload = "auto";
      video.load();
      await metadataPromise;

      if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
        throw new Error("This video loaded without usable duration or dimensions.");
      }

      workspace.classList.remove("hidden");
      status.textContent = "Extracting frames…";

      if (video.readyState < 2) {
        await waitForEvent(video, "loadeddata", 10000);
      }

      meta = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        recommendedH3: nearestH3(video.duration)
      };

      $("#duration").textContent = meta.duration.toFixed(2) + " s";
      $("#resolution").textContent = meta.width + " × " + meta.height;
      $("#h3").textContent =
        meta.recommendedH3.seconds.toFixed(3) + " s · " +
        meta.recommendedH3.frames + " frames";

      firstPng = await captureFirstVisibleFrame();
      first.src = firstPng;

      samplesEl.innerHTML = "";
      const sampleTimes = [];
      for (let i = 1; i <= 8; i++) {
        const t = meta.duration * i / 9;
        sampleTimes.push(t);
        await seekTo(t);
        const dataUrl = capture("image/jpeg", 0.76);
        const el = document.createElement("div");
        el.className = "sample";
        el.innerHTML = '<img alt="Timeline sample"><span>' + t.toFixed(2) + 's</span>';
        el.querySelector("img").src = dataUrl;
        samplesEl.appendChild(el);
      }

      $("#sampleCount").textContent = sampleTimes.length + " samples";
      $("#build").disabled = false;
      status.textContent = "";
      dropStatus.textContent = "Loaded: " + file.name;
    } catch (err) {
      console.error(err);
      const message = err && err.message ? err.message : "Could not load the video.";
      dropStatus.textContent = message;
      status.textContent = message;
      workspace.classList.remove("hidden");
    }
  }

  function pickDroppedFile(e) {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove("drag");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      dropStatus.textContent = "File received: " + f.name;
      processVideo(f);
    } else {
      dropStatus.textContent = "No video file was received.";
    }
  }

  ["dragenter", "dragover"].forEach((name) => {
    drop.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.add("drag");
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
  });

  ["dragleave", "dragend"].forEach((name) => {
    drop.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove("drag");
    });
  });

  drop.addEventListener("drop", pickDroppedFile);

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) {
      dropStatus.textContent = "File selected: " + f.name;
      processVideo(f);
    }
  });

  $("#dlFirst").addEventListener("click", () => downloadDataUrl(firstPng, "first-frame.png"));
  $("#build").addEventListener("click", () => {
    if (!meta) return;
    const notes = $("#notes").value.trim();
    let text = "Using what you know about my MiniMax H3 workflow, write a concise MiniMax H3 prompt in the same style we previously used.\n\n";
    text += "IMPORTANT: This is a first-frame-only workflow. Do not reference or request a last frame / Picture 2.\n\n";
    text += "I am attaching:\n";
    text += "- Picture 1 = the first frame extracted from my reference video and the sole identity/start-frame reference\n";
    text += "- Video 1 = the original reference video\n";
    text += "- Audio 1 = the audio from that same reference video\n\n";
    text += "Reference video duration: " + meta.duration.toFixed(2) + " seconds\n";
    text += "Reference resolution: " + meta.width + " x " + meta.height + "\n";
    text += "Closest valid H3 length: " + meta.recommendedH3.seconds.toFixed(3) + " seconds / " + meta.recommendedH3.frames + " frames at 24 fps\n\n";
    text += "Use this structure:\nsubject_definitions:\nsummary:\nretention_analysis:\ndetailed_description:\n\n";
    text += "Requirements:\n";
    text += "- <Subject 1> is defined exclusively by <Picture 1>\n";
    text += "- <Picture 1> is the sole facial identity, appearance, and opening-frame reference\n";
    text += "- <Video 1> is motion-only reference and defines the exact performance order, motion, timing, facial expressions, gaze, head/body movement, hand/arm gestures, camera behavior, and pacing\n";
    text += "- Do not inherit facial identity, facial structure, hair, skin, clothing, or appearance from <Video 1>\n";
    text += "- <Audio 1>: fully_copy — use it 1:1 as the complete synchronized soundtrack\n";
    text += "- Maintain one continuous identity from <Picture 1> through every frame\n";
    text += "- Match <Video 1> chronologically as closely as possible\n";
    text += "- Do not invent, delay, repeat, or compress gestures unless I explicitly ask for a shorter duration\n";
    text += "- Keep the prompt concise and practical for MiniMax H3\n";
    text += "- Explicitly forbid identity interpolation, midpoint face replacement, face crossfades, regenerated facial geometry, beauty-filter changes, cuts, jump cuts, morphing, extra fingers/limbs, sudden clothing changes, scene changes, or invented actions\n";
    if (notes) text += "\nAdditional instructions:\n" + notes + "\n";
    text += "\nAnalyze the attached video and Picture 1 and output only the finished MiniMax H3 prompt. Never mention Picture 2 or a last-frame reference.\n";
    output.value = text;
    $("#copy").disabled = false;
    status.textContent = "Request package ready.";
  });

  $("#copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      const b = $("#copy");
      const old = b.textContent;
      b.textContent = "Copied";
      setTimeout(() => b.textContent = old, 1000);
    } catch {
      output.select();
      document.execCommand("copy");
    }
  });

  dropStatus.textContent = "Ready — drop a video here or click to choose one.";
})();