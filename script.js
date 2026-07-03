(function(){
  'use strict';

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('overlay');
  var btnPlay = document.getElementById('btn-play');
  var btnSwitch = document.getElementById('btn-switch');
  var btnSwitch2 = document.getElementById('btn-switch2');
  var btnReset = document.getElementById('btn-reset');
  var fileInput = document.getElementById('file-input');
  var fileInput2 = document.getElementById('file-input2');
  var statusEl = document.getElementById('status');
  var hintEl = document.getElementById('hint');
  var video = document.getElementById('v');

  var imgWhite = new Image();
  var imgBlack = new Image();
  var imgWhiteReady = false;
  var imgBlackReady = false;
  var videoReady = false;
  var playing = false;

  var W = 0, H = 0, dpr = 1;

  var offCanvas = document.createElement('canvas');
  var offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
  var SAMPLE_W = 40;
  var sampleH = 0;

  var bgMode = 'dark';

  var frameCache = null;
  var cacheReady = false;
  var cacheSampleW = 0, cacheRows = 0;
  var recording = false;
  var lastVideoT = -1;

  var videoDuration = 0;
  var hintTimer = null;

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function showHint() {
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function() { hintEl.classList.remove('show'); }, 2000);
  }

  function buildCache(sampleW, rows) {
    frameCache = [];
    cacheSampleW = sampleW;
    cacheRows = rows;
    recording = true;
    cacheReady = false;
    lastVideoT = -1;

    offCanvas.width = sampleW;
    offCanvas.height = rows;
  }

  function cacheCurrentFrame() {
    offCtx.drawImage(video, 0, 0, cacheSampleW, cacheRows);
    var imgData = offCtx.getImageData(0, 0, cacheSampleW, cacheRows);
    var pixels = imgData.data;
    var len = cacheSampleW * cacheRows;
    var buf = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      var pi = i * 4;
      buf[i] = Math.round((pixels[pi] + pixels[pi + 1] + pixels[pi + 2]) / 3);
    }
    frameCache.push(buf);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }

  function drawTiles(buf, cols, rows, dw, dh) {
    var ts = dw / cols;
    var bgColor = bgMode === 'dark' ? '#000' : '#fff';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    var startX = (W - dw) / 2;
    var startY = (H - dh) / 2;
    var cellW = dw / cols;
    var cellH = dh / rows;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var val = buf[r * cols + c];
        if (val > 128 && imgWhiteReady) {
          var x = startX + (c + 0.5) * cellW;
          var y = startY + (r + 0.5) * cellH;
          ctx.drawImage(imgWhite, x - ts / 2, y - ts / 2, ts, ts);
        } else if (val <= 128 && imgBlackReady) {
          var x2 = startX + (c + 0.5) * cellW;
          var y2 = startY + (r + 0.5) * cellH;
          ctx.drawImage(imgBlack, x2 - ts / 2, y2 - ts / 2, ts, ts);
        }
      }
    }
  }

  function renderFromVideo() {
    if (!imgWhiteReady || !videoReady || video.readyState < 2) return;

    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return;

    var vScale = Math.max(W / vw, H / vh);
    var dw = vw * vScale;
    var dh = vh * vScale;

    if (!recording || cacheSampleW !== SAMPLE_W || cacheRows !== sampleH) {
      sampleH = Math.round(SAMPLE_W * (vh / vw));
      if (sampleH < 1) sampleH = 1;
      buildCache(SAMPLE_W, sampleH);
    }

    var vt = video.currentTime;
    var buf;
    if (recording) {
      if (lastVideoT > vt + 0.02) {
        recording = false;
        cacheReady = true;
        return;
      }
      lastVideoT = vt;
      cacheCurrentFrame();
      buf = frameCache[frameCache.length - 1];
    }

    if (!buf) return;

    drawTiles(buf, cacheSampleW, cacheRows, dw, dh);
  }

  function renderFromCache() {
    if (frameCache.length === 0) return;

    var vw = video.videoWidth;
    var vh = video.videoHeight;
    var vScale = Math.max(W / vw, H / vh);
    var dw = vw * vScale;
    var dh = vh * vScale;

    var total = frameCache.length;
    var idx = Math.floor((video.currentTime / videoDuration) * total);
    if (idx >= total) idx = total - 1;
    if (idx < 0) idx = 0;

    drawTiles(frameCache[idx], cacheSampleW, cacheRows, dw, dh);
  }

  function render() {
    if (cacheReady) {
      renderFromCache();
    } else {
      renderFromVideo();
    }
  }

  function animate() {
    if (playing) {
      render();
      requestAnimationFrame(animate);
    }
  }

  btnPlay.addEventListener('click', function() {
    if (!imgWhiteReady || !videoReady) {
      if (!imgWhiteReady) setStatus('白区图片还没加载好');
      else setStatus('视频还没加载好');
      return;
    }

    playing = true;
    overlay.classList.add('hidden');
    videoDuration = video.duration;

    sampleH = Math.round(SAMPLE_W * (video.videoHeight / video.videoWidth));
    if (sampleH < 1) sampleH = 1;

    buildCache(SAMPLE_W, sampleH);

    video.currentTime = 0;
    video.play().catch(function(){});
    animate();
  });

  btnSwitch.addEventListener('click', function() {
    fileInput.click();
  });

  btnSwitch2.addEventListener('click', function() {
    fileInput2.click();
  });

  btnReset.addEventListener('click', function() {
    playing = false;
    video.pause();
    overlay.classList.remove('hidden');
    document.body.classList.remove('light');

    SAMPLE_W = 40;
    sampleH = 0;
    frameCache = null;
    cacheReady = false;
    recording = false;
    lastVideoT = -1;

    imgWhite.src = '1.jpg';
    imgWhiteReady = false;
    imgWhite.onload = function() {
      imgWhiteReady = true;
      resize();
    };
    imgBlack.src = '';
    imgBlackReady = false;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    setStatus('已恢复默认 - 点击开始播放');
  });

  function loadImageFromFile(file, targetImg, setReady) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      targetImg.onload = function() {
        setReady();
        resize();
      };
      targetImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);

    if (cacheReady) {
      frameCache = null;
      cacheReady = false;
      recording = false;
    }
  }

  fileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    loadImageFromFile(file, imgWhite, function() {
      imgWhiteReady = true;
      setStatus('白区图已更换');
    });
  });

  fileInput2.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    loadImageFromFile(file, imgBlack, function() {
      imgBlackReady = true;
      setStatus('黑区图已更换');
    });
  });

  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (!playing) return;

    var d = e.deltaY > 0 ? -4 : 4;
    SAMPLE_W = Math.max(8, Math.min(120, SAMPLE_W + d));

    frameCache = null;
    cacheReady = false;
    recording = false;

    sampleH = Math.round(SAMPLE_W * (video.videoHeight / video.videoWidth));
    if (sampleH < 1) sampleH = 1;
    buildCache(SAMPLE_W, sampleH);

    showHint();
    setStatus('分辨率 ' + SAMPLE_W);
  }, { passive: false });

  imgWhite.onload = function() {
    imgWhiteReady = true;
    resize();
    setStatus('就绪 - 点击开始播放');
  };
  imgWhite.src = '1.jpg';

  video.addEventListener('loadedmetadata', function() {
    videoReady = true;
    videoDuration = video.duration;
    if (imgWhiteReady) setStatus('就绪 - 点击开始播放');
    else setStatus('视频加载完成，等待图片...');
  });
  video.load();

  window.addEventListener('resize', resize);

  document.addEventListener('keydown', function(e) {
    document.body.classList.remove('light');
    if (e.key === 'Escape' && playing) {
      playing = false;
      video.pause();
      overlay.classList.remove('hidden');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      setStatus('已退出 - 点击开始播放');
    }
  });
})();
