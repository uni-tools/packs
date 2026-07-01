# uni-tools 公开市场站

静态页面，读取 `../registry/index.json` 展示 Pack / UI 插件目录。

## 本地预览

```bash
cd packs
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/web/
```

## GitHub Pages

将 `web/` 与 `registry/` 一并发布即可；页面默认从 `../registry/index.json` 拉取数据。
