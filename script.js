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
  var cropOverlay = document.getElementById('crop-overlay');
  var cropCanvas = document.getElementById('crop-canvas');
  var cropCtx = cropCanvas.getContext('2d');
  var cropCancel = document.getElementById('crop-cancel');
  var cropConfirm = document.getElementById('crop-confirm');
  var progressBar = document.getElementById('progress-bar');
  var progressFill = document.getElementById('progress-fill');
  var mwToggle = document.getElementById('mw-toggle');
  var mwCtrls = document.getElementById('mw-ctrls');
  var mwUp = document.getElementById('mw-up');
  var mwDown = document.getElementById('mw-down');
  var mwVal = document.getElementById('mw-val');
  var backBtn = document.getElementById('back-btn');

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
      if (recording && !cacheReady) {
        progressBar.classList.add('show');
        var pct = videoDuration > 0 ? Math.min(100, (video.currentTime / videoDuration) * 100) : 0;
        progressFill.style.width = pct + '%';
      } else if (cacheReady) {
        progressBar.classList.remove('show');
      }
      render();
      requestAnimationFrame(animate);
    }
  }

  function resetCache() {
    frameCache = null;
    cacheReady = false;
    recording = false;
    progressBar.classList.remove('show');
  }

  function updateResUI() {
    setStatus('分辨率 ' + SAMPLE_W);
    mwVal.textContent = SAMPLE_W;
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
    if (!imgWhiteReady) {
      setStatus('白区图片还没加载好');
      return;
    }
    if (video.readyState < 1) {
      video.load();
      setStatus('视频加载中，请稍候再试...');
      return;
    }
    if (!videoReady) videoReady = true;

    playing = true;
    overlay.classList.add('hidden');
    backBtn.classList.add('show');
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
    backBtn.classList.remove('show');
    document.body.classList.remove('light');
    SAMPLE_W = 40;
    sampleH = 0;
    blockMode = false;
    btnBlock.classList.remove('on');
    resetCache();

    imgWhite.src = '';
    imgWhiteReady = false;
    imgBlack.src = '';
    imgBlackReady = false;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    setStatus('已恢复默认 - 点击开始播放');
  });

  function startCrop(file, targetImg, setReady, label) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var srcImg = new Image();
      srcImg.onload = function() {
        var isMobile = window.innerWidth < 768;
        var maxW = window.innerWidth * (isMobile ? 0.95 : 0.9);
        var maxH = window.innerHeight * (isMobile ? 0.5 : 0.7);
        var scale = Math.min(maxW / srcImg.width, maxH / srcImg.height, 1);
        var cw = Math.round(srcImg.width * scale);
        var ch = Math.round(srcImg.height * scale);
        cropCanvas.width = cw;
        cropCanvas.height = ch;
        cropCanvas.style.width = cw + 'px';
        cropCanvas.style.height = ch + 'px';
        cropCtx.drawImage(srcImg, 0, 0, cw, ch);

        var sqSize = Math.min(cw, ch);
        var cx = (cw - sqSize) / 2;
        var cy = (ch - sqSize) / 2;
        var dragging = false, dragX = 0, dragY = 0;

        function drawFrame() {
          cropCtx.drawImage(srcImg, 0, 0, cw, ch);
          cropCtx.fillStyle = 'rgba(0,0,0,0.5)';
          cropCtx.fillRect(0, 0, cw, cy);
          cropCtx.fillRect(0, cy + sqSize, cw, ch - cy - sqSize);
          cropCtx.fillRect(0, cy, cx, sqSize);
          cropCtx.fillRect(cx + sqSize, cy, cw - cx - sqSize, sqSize);
          cropCtx.strokeStyle = '#fff';
          cropCtx.lineWidth = 2;
          cropCtx.strokeRect(cx, cy, sqSize, sqSize);
        }

        function constrain() {
          cx = Math.max(0, Math.min(cw - sqSize, cx));
          cy = Math.max(0, Math.min(ch - sqSize, cy));
          if (sqSize < 10) sqSize = 10;
          if (sqSize > Math.min(cw, ch)) sqSize = Math.min(cw, ch);
          cx = Math.min(cx, cw - sqSize);
          cy = Math.min(cy, ch - sqSize);
        }

        drawFrame();
        cropOverlay.classList.add('show');

        function onDown(e) {
          e.preventDefault();
          var rect = cropCanvas.getBoundingClientRect();
          var mx = (e.clientX || e.touches[0].clientX) - rect.left;
          var my = (e.clientY || e.touches[0].clientY) - rect.top;
          if (mx >= cx && mx <= cx + sqSize && my >= cy && my <= cy + sqSize) {
            dragging = true;
            dragX = mx - cx;
            dragY = my - cy;
          }
        }
        function onMove(e) {
          if (!dragging) return;
          e.preventDefault();
          var rect = cropCanvas.getBoundingClientRect();
          cx = (e.clientX || e.touches[0].clientX) - rect.left - dragX;
          cy = (e.clientY || e.touches[0].clientY) - rect.top - dragY;
          constrain();
          drawFrame();
        }
        function onUp() { dragging = false; }
        function onWheel(e) {
          e.preventDefault();
          var d = e.deltaY > 0 ? -10 : 10;
          sqSize = Math.max(10, Math.min(Math.min(cw, ch), sqSize + d));
          constrain();
          drawFrame();
        }

        cropCanvas.addEventListener('mousedown', onDown);
        cropCanvas.addEventListener('mousemove', onMove);
        cropCanvas.addEventListener('mouseup', onUp);
        cropCanvas.addEventListener('mouseleave', onUp);
        cropCanvas.addEventListener('touchstart', onDown, { passive: false });
        cropCanvas.addEventListener('touchmove', onMove, { passive: false });
        cropCanvas.addEventListener('touchend', onUp);
        cropCanvas.addEventListener('wheel', onWheel, { passive: false });

        function cleanup() {
          cropOverlay.classList.remove('show');
          cropCanvas.removeEventListener('mousedown', onDown);
          cropCanvas.removeEventListener('mousemove', onMove);
          cropCanvas.removeEventListener('mouseup', onUp);
          cropCanvas.removeEventListener('mouseleave', onUp);
          cropCanvas.removeEventListener('touchstart', onDown);
          cropCanvas.removeEventListener('touchmove', onMove);
          cropCanvas.removeEventListener('touchend', onUp);
          cropCanvas.removeEventListener('wheel', onWheel);
        }

        function doCrop() {
          var offC = document.createElement('canvas');
          offC.width = sqSize; offC.height = sqSize;
          var offCtx2 = offC.getContext('2d');
          offCtx2.drawImage(srcImg, cx / scale, cy / scale, sqSize / scale, sqSize / scale, 0, 0, sqSize, sqSize);
          var dataUrl = offC.toDataURL('image/jpeg', 0.9);

          targetImg.onload = function() {
            setReady();
            resize();
          };
          targetImg.src = dataUrl;
          setStatus(label + '已更换');
          cleanup();
        }

        cropConfirm.onclick = doCrop;
        cropCancel.onclick = function() { cleanup(); };

        cropConfirm.replaceWith(cropConfirm.cloneNode(true));
        cropCancel.replaceWith(cropCancel.cloneNode(true));
        cropConfirm = document.getElementById('crop-confirm');
        cropCancel = document.getElementById('crop-cancel');
        cropConfirm.onclick = doCrop;
        cropCancel.onclick = function() { cleanup(); };
      };
      srcImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    resetCache();
  }

  fileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    startCrop(file, imgWhite, function() { imgWhiteReady = true; }, '白区图');
    fileInput.value = '';
  });

  fileInput2.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    startCrop(file, imgBlack, function() { imgBlackReady = true; }, '黑区图');
    fileInput2.value = '';
  });

  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();

    var delta = e.deltaY > 0 ? -4 : 4;
    SAMPLE_W = Math.max(8, Math.min(200, SAMPLE_W + delta));

    if (playing) {
      resetCache();
      sampleH = Math.round(SAMPLE_W * (video.videoHeight / video.videoWidth));
      if (sampleH < 1) sampleH = 1;
      buildCache(SAMPLE_W, sampleH);
    }

    showHint('分辨率 ' + SAMPLE_W);
    updateResUI();
  }, { passive: false });

  mwToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    mwCtrls.classList.toggle('show');
  });

  function adjustRes(delta) {
    SAMPLE_W = Math.max(8, Math.min(200, SAMPLE_W + delta));
    if (playing) {
      resetCache();
      sampleH = Math.round(SAMPLE_W * (video.videoHeight / video.videoWidth));
      if (sampleH < 1) sampleH = 1;
      buildCache(SAMPLE_W, sampleH);
    }
    updateResUI();
  }

  mwUp.addEventListener('click', function(e) {
    e.stopPropagation();
    adjustRes(4);
  });

  mwDown.addEventListener('click', function(e) {
    e.stopPropagation();
    adjustRes(-4);
  });

  video.addEventListener('loadedmetadata', function() {
    videoReady = true;
    videoDuration = video.duration;
    if (!imgWhiteReady) setStatus('视频就绪 - 请上传图片');
    else setStatus('就绪 - 点击开始播放');
  });

  video.addEventListener('canplay', function() {
    if (!videoReady) {
      videoReady = true;
      videoDuration = video.duration;
    }
    if (!imgWhiteReady) setStatus('视频已缓存 - 请上传图片');
  });

  video.addEventListener('error', function() {
    setStatus('视频加载失败，请刷新页面');
  });

  video.addEventListener('ended', function() {
    playing = false;
    overlay.classList.remove('hidden');
    backBtn.classList.remove('show');
    document.body.classList.remove('light');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    setStatus('播放完毕 - 点击重新播放');
  });

  video.load();
  setStatus('视频加载中...');

  updateResUI();

  window.addEventListener('resize', resize);

  backBtn.addEventListener('click', function() {
    playing = false;
    video.pause();
    overlay.classList.remove('hidden');
    backBtn.classList.remove('show');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    setStatus('已退出 - 点击开始播放');
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && playing) {
      playing = false;
      video.pause();
      overlay.classList.remove('hidden');
      backBtn.classList.remove('show');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      setStatus('已退出 - 点击开始播放');
    }
  });
})();
