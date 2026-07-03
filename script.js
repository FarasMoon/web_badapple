(function(){
  'use strict';

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('overlay');
  var btnPlay = document.getElementById('btn-play');
  var btnSwitch = document.getElementById('btn-switch');
  var btnSwitch2 = document.getElementById('btn-switch2');
  var btnReset = document.getElementById('btn-reset');
  var btnBlock = document.getElementById('btn-block');
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

  var blockMode = false;

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function showHint(msg) {
    hintEl.textContent = msg;
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

  function drawTile(c, r, img, cellW, cellH, startX, startY) {
    var x = startX + (c + 0.5) * cellW;
    var y = startY + (r + 0.5) * cellH;
    var s = cellW;
    ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
  }

  function drawBlock(c, r, bw, bh, img, cellW, cellH, startX, startY) {
    var x = startX + (c + bw / 2) * cellW;
    var y = startY + (r + bh / 2) * cellH;
    var w = bw * cellW;
    var h = bh * cellH;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  }

  function drawBlocks(buf, cols, rows, dw, dh) {
    var bgColor = bgMode === 'dark' ? '#000' : '#fff';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    var startX = (W - dw) / 2;
    var startY = (H - dh) / 2;
    var cellW = dw / cols;
    var cellH = dh / rows;

    var total = cols * rows;
    var visited = new Uint8Array(total);

    function at(r, c) { return buf[r * cols + c]; }
    function mark(r0, c0, r1, c1) {
      for (var i = r0; i < r1; i++)
        for (var j = c0; j < c1; j++)
          visited[i * cols + j] = 1;
    }

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (visited[r * cols + c]) continue;

        var val = at(r, c);
        var isWhite = val > 128;

        var maxDim = Math.min(cols - c, rows - r);
        var size = 1;
        while (size < maxDim) {
          var ok = true;
          for (var i = r; i <= r + size; i++) {
            for (var j = c; j <= c + size; j++) {
              if (visited[i * cols + j] || (at(i, j) > 128) !== isWhite) {
                ok = false;
                break;
              }
            }
            if (!ok) break;
          }
          if (!ok) break;
          size++;
        }

        var img = null;
        if (isWhite && imgWhiteReady) img = imgWhite;
        else if (!isWhite && imgBlackReady) img = imgBlack;

        if (img && size > 1) {
          drawBlock(c, r, size, size, img, cellW, cellH, startX, startY);
        } else if (img) {
          drawTile(c, r, img, cellW, cellH, startX, startY);
        }

        mark(r, c, r + size, c + size);
      }
    }
  }

  function drawTiles(buf, cols, rows, dw, dh) {
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
          drawTile(c, r, imgWhite, cellW, cellH, startX, startY);
        } else if (val <= 128 && imgBlackReady) {
          drawTile(c, r, imgBlack, cellW, cellH, startX, startY);
        }
      }
    }
  }

  function doDraw(buf, cols, rows, dw, dh) {
    if (blockMode) {
      drawBlocks(buf, cols, rows, dw, dh);
    } else {
      drawTiles(buf, cols, rows, dw, dh);
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

    doDraw(buf, cacheSampleW, cacheRows, dw, dh);
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

    doDraw(frameCache[idx], cacheSampleW, cacheRows, dw, dh);
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

  function resetCache() {
    frameCache = null;
    cacheReady = false;
    recording = false;
  }

  function updateBlockUI() {
    if (blockMode) {
      btnBlock.classList.add('on');
      setStatus('整图模式');
    } else {
      btnBlock.classList.remove('on');
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
    updateBlockUI();

    video.currentTime = 0;
    video.play().catch(function(){});
    animate();
  });

  btnBlock.addEventListener('click', function() {
    blockMode = !blockMode;
    updateBlockUI();

    if (blockMode) {
      showHint('滚轮调节分辨率');
    } else {
      showHint('滚轮调节分辨率');
    }
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
    blockMode = false;
    btnBlock.classList.remove('on');
    resetCache();

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
    resetCache();
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

    var delta = e.deltaY > 0 ? -4 : 4;
    SAMPLE_W = Math.max(8, Math.min(120, SAMPLE_W + delta));
    resetCache();

    sampleH = Math.round(SAMPLE_W * (video.videoHeight / video.videoWidth));
    if (sampleH < 1) sampleH = 1;
    buildCache(SAMPLE_W, sampleH);

    showHint('分辨率 ' + SAMPLE_W);
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
