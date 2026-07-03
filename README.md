# Bad Apple - 图片马赛克播放器

用图片拼成的 Bad Apple!! 视频播放器，上传任意图片替换白色/黑色区域。

## 在线体验

[https://web-badapple.pages.dev](https://web-badapple.pages.dev)

## 本地运行

用任意静态文件服务器打开即可，例如：

```bash
npx serve .
```

或直接双击 `index.html`（部分浏览器可能因跨域限制无法加载视频，推荐用本地服务器）。

## 使用说明

- 点击 **开始播放** 观看效果
- 点击 **换白区图** / **换黑区图** 上传自定义图片
- 点击 **恢复默认** 重置
- 滚轮调节分辨率

## 文件结构

```
├── index.html    # 主页面
├── style.css     # 样式
├── script.js     # 逻辑
├── 1.jpg         # 默认白区图
└── badapple.mp4  # 视频源
```
