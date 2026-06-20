import os
import io
import zipfile
import shutil
import threading
import time
import multiprocessing
import re
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from flask import Flask, request, jsonify, send_file, render_template_string

SAFE_JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def configure_vips_path():
    """Use VIPS_BIN from the environment, or a local vips_lib folder if present."""
    configured = os.environ.get("VIPS_BIN")
    bundled = Path(__file__).parent / "vips_lib" / "vips-dev-8.16" / "bin"
    vips_bin = Path(configured) if configured else bundled
    if vips_bin.exists():
        os.environ["PATH"] = str(vips_bin) + os.pathsep + os.environ.get("PATH", "")


def is_safe_job_id(job_id):
    return bool(SAFE_JOB_ID_RE.fullmatch(str(job_id or "")))


def safe_extract_zip(zip_file, destination):
    destination = destination.resolve()
    for member in zip_file.infolist():
        target = (destination / member.filename).resolve()
        if target != destination and destination not in target.parents:
            raise ValueError("Unsafe path in ZIP file")
        zip_file.extract(member, destination)


configure_vips_path()

app = Flask(__name__)

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("output")
TEMP_DIR = Path("temp_extracted")
SPLIT_DIR = Path("split_output")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
SPLIT_DIR.mkdir(exist_ok=True)

jobs = {}

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tiff", ".tif",
    ".webp", ".ico", ".ppm", ".pgm", ".pbm", ".pnm",
    ".heic", ".heif", ".avif", ".jfif",
}

NUM_WORKERS = 10
WEBP_QUALITY = 82
WEBP_METHOD = 1


def make_unique_filename(name, counts):
    stem = Path(name).stem
    suffix = Path(name).suffix
    key = stem.lower()
    dup_idx = counts.get(key, 0)
    counts[key] = dup_idx + 1
    if dup_idx == 0:
        return f"{stem}{suffix}"
    return f"{stem}_{dup_idx}{suffix}"

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZIP Digger</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f0f0f;
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding-top: 60px;
        }
        .container { max-width: 760px; width: 100%; padding: 40px; }
        h1 { font-size: 2em; margin-bottom: 8px; color: #fff; }
        .subtitle { color: #888; margin-bottom: 32px; font-size: 0.95em; }
        .tools-grid { display: grid; gap: 20px; margin-top: 28px; }
        .tool-card {
            background: linear-gradient(180deg, #181818, #141414);
            border: 1px solid #2a2a2a;
            border-radius: 22px;
            padding: 22px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
        }
        .tool-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: 999px;
            background: #202631;
            color: #8dbdff;
            font-size: 0.75em;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            margin-bottom: 12px;
        }
        .tool-title { font-size: 1.35em; color: #fff; margin-bottom: 8px; }
        .tool-desc {
            color: #9b9b9b;
            margin-bottom: 18px;
            font-size: 0.95em;
            line-height: 1.55;
            max-width: 58ch;
        }
        .drop-zone {
            border: 2px dashed #333; border-radius: 16px; padding: 60px 20px;
            text-align: center; cursor: pointer; transition: all 0.2s; background: #1a1a1a;
        }
        .drop-zone:hover, .drop-zone.dragover { border-color: #4a9eff; background: #1a1a2e; }
        .drop-zone-text { font-size: 1.1em; color: #aaa; }
        .drop-zone-hint { font-size: 0.85em; color: #555; margin-top: 8px; }
        input[type="file"] { display: none; }
        .progress-section { margin-top: 24px; display: none; }
        .progress-bar-outer { background: #222; border-radius: 8px; height: 12px; overflow: hidden; margin-top: 12px; }
        .progress-bar-inner {
            height: 100%; background: linear-gradient(90deg, #4a9eff, #7b5eff);
            width: 0%; transition: width 0.3s; border-radius: 8px;
        }
        .status-text { margin-top: 12px; font-size: 0.9em; color: #aaa; }
        .stats { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .stat-box { background: #1a1a1a; border-radius: 10px; padding: 16px; text-align: center; }
        .stat-value { font-size: 1.6em; color: #fff; font-weight: 700; }
        .stat-label { font-size: 0.75em; color: #666; margin-top: 4px; }
        .download-btn {
            display: none; margin-top: 16px; width: 100%; padding: 16px;
            background: linear-gradient(90deg, #4a9eff, #7b5eff); color: #fff;
            border: none; border-radius: 12px; font-size: 1.05em;
            cursor: pointer; font-weight: 600; transition: opacity 0.2s;
        }
        .download-btn:hover { opacity: 0.85; }
        .error-text { color: #ff5555; margin-top: 12px; font-size: 0.9em; }

        .split-section {
            display: none; margin-top: 20px; padding: 20px;
            background: #1a1a1a; border-radius: 12px; border: 1px solid #333;
        }
        .split-section h3 { font-size: 1em; color: #ccc; margin-bottom: 12px; }
        .split-row { display: flex; gap: 10px; align-items: center; }
        .split-input {
            flex: 1; padding: 10px 14px; background: #111; border: 1px solid #444;
            border-radius: 8px; color: #fff; font-size: 0.95em; outline: none;
        }
        .split-input:focus { border-color: #4a9eff; }
        .split-input::placeholder { color: #555; }
        .split-btn {
            padding: 10px 20px; background: #333; color: #fff; border: none;
            border-radius: 8px; cursor: pointer; font-size: 0.95em; transition: background 0.2s;
        }
        .split-btn:hover { background: #444; }
        .split-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .split-status { margin-top: 10px; font-size: 0.85em; color: #aaa; }
        .split-downloads { margin-top: 12px; }
        .split-downloads a {
            display: inline-block; margin: 4px 6px 4px 0; padding: 8px 14px;
            background: #222; border: 1px solid #444; border-radius: 8px;
            color: #4a9eff; text-decoration: none; font-size: 0.85em;
            transition: background 0.2s;
        }
        .split-downloads a:hover { background: #2a2a3e; }
        .split-mode-btn {
            padding: 8px 14px; background: #222; border: 1px solid #444; border-radius: 8px;
            color: #888; cursor: pointer; font-size: 0.85em; transition: all 0.2s;
        }
        .split-mode-btn:hover { background: #2a2a2a; color: #ccc; }
        .split-mode-btn.active { background: #333; color: #fff; border-color: #4a9eff; }

        .file-lists { margin-top: 24px; display: none; }
        .file-list-toggle {
            background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
            padding: 12px 16px; margin-bottom: 8px; cursor: pointer;
            display: flex; justify-content: space-between; align-items: center;
            transition: background 0.2s;
        }
        .file-list-toggle:hover { background: #222; }
        .file-list-toggle .label { font-size: 0.9em; }
        .file-list-toggle .count { font-size: 0.85em; color: #888; }
        .file-list-toggle .arrow { color: #555; transition: transform 0.2s; }
        .file-list-toggle.open .arrow { transform: rotate(90deg); }
        .file-list-toggle.good .label { color: #4ade80; }
        .file-list-toggle.bad .label { color: #f87171; }
        .file-list-items {
            display: none; max-height: 300px; overflow-y: auto;
            background: #111; border: 1px solid #222; border-radius: 8px;
            margin-bottom: 12px; padding: 8px 0;
        }
        .file-list-items.open { display: block; }
        .file-item {
            padding: 4px 14px; font-size: 0.8em; color: #bbb;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .file-item .err { color: #888; font-size: 0.85em; margin-left: 8px; }
        .file-list-items::-webkit-scrollbar { width: 6px; }
        .file-list-items::-webkit-scrollbar-track { background: #111; }
        .file-list-items::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        @media (max-width: 720px) {
            body { padding-top: 24px; }
            .container { padding: 18px; }
            .tool-card { padding: 18px; border-radius: 18px; }
            .drop-zone { padding: 42px 18px; }
            .split-row { flex-direction: column; align-items: stretch; }
            .stats { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
<div class="container">
    <h1>ZIP Digger</h1>
    <p class="subtitle">Загрузи ZIP — получи все рабочие картинки в WebP</p>
    <div class="drop-zone" id="dropZone">
        <div class="drop-zone-text">Нажми или перетащи ZIP файл сюда</div>
        <div class="drop-zone-hint">Поддерживаются файлы до 15 ГБ</div>
    </div>
    <input type="file" id="fileInput" accept=".zip">
    <div class="progress-section" id="progressSection">
        <div class="status-text" id="statusText">Загрузка файла...</div>
        <div class="progress-bar-outer"><div class="progress-bar-inner" id="progressBar"></div></div>
        <div class="stats" id="statsSection" style="display:none">
            <div class="stat-box"><div class="stat-value" id="totalFiles">0</div><div class="stat-label">Всего файлов</div></div>
            <div class="stat-box"><div class="stat-value" id="goodFiles">0</div><div class="stat-label">Рабочих картинок</div></div>
            <div class="stat-box"><div class="stat-value" id="badFiles">0</div><div class="stat-label">Битых</div></div>
        </div>
    </div>
    <div class="error-text" id="errorText"></div>
    <button class="download-btn" id="downloadBtn">Скачать всё одним ZIP</button>

    <div class="file-lists" id="fileLists">
        <div class="file-list-toggle good" id="goodToggle">
            <span class="label">Рабочие картинки</span>
            <span><span class="count" id="goodCount"></span> <span class="arrow">&#9654;</span></span>
        </div>
        <div class="file-list-items" id="goodItems"></div>
        <div class="file-list-toggle bad" id="badToggle">
            <span class="label">Битые файлы</span>
            <span><span class="count" id="badCount"></span> <span class="arrow">&#9654;</span></span>
        </div>
        <div class="file-list-items" id="badItems"></div>
    </div>

    <hr style="border:none; border-top:1px solid #333; margin: 40px 0;">

    <h2 style="font-size:1.3em; color:#fff; margin-bottom:8px;">Разделить ZIP на части</h2>
    <p style="color:#888; margin-bottom:16px; font-size:0.9em;">Кинь готовый ZIP — он разобьётся на части по папкам (папки не разрезаются)</p>

    <div class="drop-zone" id="splitDropZone" style="padding:40px 20px;">
        <div class="drop-zone-text">Нажми или перетащи ZIP для разделения</div>
    </div>
    <input type="file" id="splitFileInput" accept=".zip" style="display:none">

    <div class="split-section" id="splitSection" style="display:none; margin-top:16px;">
        <div style="display:flex; gap:6px; margin-bottom:12px;">
            <button class="split-mode-btn active" id="modeMb" onclick="setSplitMode('mb')">По размеру (МБ)</button>
            <button class="split-mode-btn" id="modeCount" onclick="setSplitMode('count')">По количеству частей</button>
        </div>
        <div class="split-row">
            <input type="number" class="split-input" id="splitSize" placeholder="Макс. размер в МБ (напр. 500)" min="1">
            <input type="number" class="split-input" id="splitCount" placeholder="Кол-во частей (напр. 4)" min="2" style="display:none;">
            <button class="split-btn" id="splitBtn">Разбить</button>
        </div>
        <div class="split-status" id="splitStatus"></div>
        <div class="split-progress" style="display:none; margin-top:10px;" id="splitProgress">
            <div class="progress-bar-outer"><div class="progress-bar-inner" id="splitProgressBar"></div></div>
        </div>
        <div class="split-downloads" id="splitDownloads"></div>
    </div>

    <hr style="border:none; border-top:1px solid #333; margin: 40px 0;">

    <h2 style="font-size:1.3em; color:#fff; margin-bottom:8px;">Конвертировать в WebP</h2>
    <p style="color:#888; margin-bottom:16px; font-size:0.9em;">Кинь ZIP с картинками — все будут переделаны в WebP (структура папок сохраняется)</p>

    <div class="drop-zone" id="convertDropZone" style="padding:40px 20px;">
        <div class="drop-zone-text">Нажми или перетащи ZIP для конвертации</div>
    </div>
    <input type="file" id="convertFileInput" accept=".zip" style="display:none">

    <div id="convertProgressSection" style="margin-top:16px; display:none;">
        <div class="status-text" id="convertStatus">Загрузка...</div>
        <div class="progress-bar-outer"><div class="progress-bar-inner" id="convertProgressBar"></div></div>
        <div class="stats" id="convertStats" style="display:none; margin-top:12px;">
            <div class="stat-box"><div class="stat-value" id="convertTotal">0</div><div class="stat-label">Всего</div></div>
            <div class="stat-box"><div class="stat-value" id="convertDone">0</div><div class="stat-label">Готово</div></div>
            <div class="stat-box"><div class="stat-value" id="convertFailed">0</div><div class="stat-label">Ошибки</div></div>
        </div>
    </div>
    <button class="download-btn" id="convertDownloadBtn" style="display:none;">Скачать WebP (ZIP)</button>

    <hr style="border:none; border-top:1px solid #333; margin: 40px 0;">

    <h2 style="font-size:1.3em; color:#fff; margin-bottom:8px;">Конвертировать в WebP (без папок)</h2>
    <p style="color:#888; margin-bottom:16px; font-size:0.9em;">Кинь ZIP — все картинки станут WebP и лягут в один список без папок</p>

    <div class="drop-zone" id="flatDropZone" style="padding:40px 20px;">
        <div class="drop-zone-text">Нажми или перетащи ZIP</div>
    </div>
    <input type="file" id="flatFileInput" accept=".zip" style="display:none">

    <div id="flatProgressSection" style="margin-top:16px; display:none;">
        <div class="status-text" id="flatStatus">Загрузка...</div>
        <div class="progress-bar-outer"><div class="progress-bar-inner" id="flatProgressBar"></div></div>
        <div class="stats" id="flatStats" style="display:none; margin-top:12px;">
            <div class="stat-box"><div class="stat-value" id="flatTotal">0</div><div class="stat-label">Всего</div></div>
            <div class="stat-box"><div class="stat-value" id="flatDone">0</div><div class="stat-label">Готово</div></div>
            <div class="stat-box"><div class="stat-value" id="flatFailed">0</div><div class="stat-label">Ошибки</div></div>
        </div>
    </div>
    <button class="download-btn" id="flatDownloadBtn" style="display:none;">Скачать WebP (ZIP)</button>

    <hr style="border:none; border-top:1px solid #333; margin: 40px 0;">

    <h2 style="font-size:1.3em; color:#fff; margin-bottom:8px;">Объединить ZIP файлы</h2>
    <p style="color:#888; margin-bottom:16px; font-size:0.9em;">Кинь несколько ZIP — они сольются в один с сохранением папок</p>

    <h2 style="font-size:1.3em; color:#fff; margin-bottom:8px;">Картинки → WebP</h2>
    <p style="color:#888; margin-bottom:16px; font-size:0.9em;">Кинь обычные картинки или выбери сразу несколько файлов — программа переделает их в WebP и соберёт в ZIP</p>

    <div class="drop-zone" id="imagesDropZone" style="padding:40px 20px;">
        <div class="drop-zone-text">Нажми или перетащи сюда картинки</div>
        <div class="drop-zone-hint">Можно выбрать сразу несколько JPG, PNG, TIFF, HEIC и др. файлов</div>
    </div>
    <input type="file" id="imagesFileInput" accept=".jpg,.jpeg,.png,.bmp,.gif,.tiff,.tif,.webp,.ico,.ppm,.pgm,.pbm,.pnm,.heic,.heif,.avif,.jfif,image/*" multiple style="display:none">

    <div id="imagesProgressSection" style="margin-top:16px; display:none;">
        <div class="status-text" id="imagesStatus">Загрузка...</div>
        <div class="progress-bar-outer"><div class="progress-bar-inner" id="imagesProgressBar"></div></div>
        <div class="stats" id="imagesStats" style="display:none; margin-top:12px;">
            <div class="stat-box"><div class="stat-value" id="imagesTotal">0</div><div class="stat-label">Всего</div></div>
            <div class="stat-box"><div class="stat-value" id="imagesDone">0</div><div class="stat-label">Готово</div></div>
            <div class="stat-box"><div class="stat-value" id="imagesFailed">0</div><div class="stat-label">Ошибки</div></div>
        </div>
    </div>
    <button class="download-btn" id="imagesDownloadBtn" style="display:none;">Скачать WebP (ZIP)</button>

    <hr style="border:none; border-top:1px solid #333; margin: 40px 0;">

    <div class="drop-zone" id="mergeDropZone" style="padding:40px 20px;">
        <div class="drop-zone-text">Нажми или перетащи ZIP файлы (можно несколько)</div>
        <div class="drop-zone-hint">Выбери сразу несколько через Ctrl+клик</div>
    </div>
    <input type="file" id="mergeFileInput" accept=".zip" multiple style="display:none">

    <div id="mergeFileList" style="margin-top:12px;"></div>

    <div id="mergeProgressSection" style="margin-top:16px; display:none;">
        <div class="status-text" id="mergeStatus">Загрузка...</div>
        <div class="progress-bar-outer"><div class="progress-bar-inner" id="mergeProgressBar"></div></div>
    </div>
    <button class="download-btn" id="mergeBtn" style="display:none; background:#333;">Объединить</button>
    <button class="download-btn" id="mergeDownloadBtn" style="display:none;">Скачать объединённый ZIP</button>
</div>
<script>
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const statsSection = document.getElementById('statsSection');
const downloadBtn = document.getElementById('downloadBtn');
const errorText = document.getElementById('errorText');

let currentJobId = null;

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) { errorText.textContent = 'Нужен .zip файл'; return; }
    errorText.textContent = '';
    progressSection.style.display = 'block';
    statsSection.style.display = 'none';
    downloadBtn.style.display = 'none';
    document.getElementById('splitSection').style.display = 'none';
    document.getElementById('splitDownloads').innerHTML = '';
    document.getElementById('splitStatus').textContent = '';
    progressBar.style.width = '0%';

    const CHUNK_SIZE = 50 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const jobId = crypto.randomUUID();
    currentJobId = jobId;

    for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, Math.min((i+1) * CHUNK_SIZE, file.size));
        const fd = new FormData();
        fd.append('chunk', chunk);
        fd.append('chunk_index', i);
        fd.append('total_chunks', totalChunks);
        fd.append('filename', file.name);
        fd.append('job_id', jobId);
        const resp = await fetch('/upload_chunk', { method: 'POST', body: fd });
        if (!resp.ok) { errorText.textContent = 'Upload error'; return; }
        const pct = Math.round(((i+1) / totalChunks) * 100);
        progressBar.style.width = pct + '%';
        statusText.textContent = 'Upload: ' + pct + '%';
    }

    statusText.textContent = 'Extracting images from ZIP...';
    progressBar.style.width = '0%';

    const startResp = await fetch('/process', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({job_id: jobId})
    });
    if (!startResp.ok) { errorText.textContent = 'Process start error'; return; }
    pollStatus(jobId);
}

async function pollStatus(jobId) {
    const resp = await fetch('/status/' + jobId);
    const data = await resp.json();
    const phase = data.phase || '';

    if (data.status === 'processing') {
        statsSection.style.display = 'grid';
        document.getElementById('totalFiles').textContent = data.total || 0;
        document.getElementById('goodFiles').textContent = data.good || 0;
        document.getElementById('badFiles').textContent = data.bad || 0;
        if (phase === 'extracting') {
            const pct = data.total > 0 ? Math.round((data.extracted / data.total) * 100) : 0;
            progressBar.style.width = pct + '%';
            statusText.textContent = 'Extracting: ' + (data.extracted||0) + ' / ' + (data.total||'?');
        } else if (phase === 'converting') {
            const done = (data.good||0) + (data.bad||0);
            const pct = data.total > 0 ? Math.round((done / data.total) * 100) : 0;
            progressBar.style.width = pct + '%';
            statusText.textContent = 'Converting: ' + done + ' / ' + data.total;
        }
        setTimeout(() => pollStatus(jobId), 400);
    } else if (data.status === 'done') {
        statsSection.style.display = 'grid';
        document.getElementById('totalFiles').textContent = data.total || 0;
        document.getElementById('goodFiles').textContent = data.good || 0;
        document.getElementById('badFiles').textContent = data.bad || 0;
        progressBar.style.width = '100%';
        statusText.textContent = 'Done!';
        if (data.good > 0) {
            downloadBtn.style.display = 'block';
            downloadBtn.onclick = () => { window.location = '/download/' + jobId; };
        } else { statusText.textContent = 'No valid images found :('; }
        loadFileLists(jobId);
    } else if (data.status === 'error') {
        errorText.textContent = 'Error: ' + (data.message || 'unknown');
    }
}

// --- Standalone Split Section ---
const splitDropZone = document.getElementById('splitDropZone');
const splitFileInput = document.getElementById('splitFileInput');
let splitJobId = null;

splitDropZone.addEventListener('click', () => splitFileInput.click());
splitDropZone.addEventListener('dragover', e => { e.preventDefault(); splitDropZone.classList.add('dragover'); });
splitDropZone.addEventListener('dragleave', () => splitDropZone.classList.remove('dragover'));
splitDropZone.addEventListener('drop', e => {
    e.preventDefault(); splitDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleSplitFile(e.dataTransfer.files[0]);
});
splitFileInput.addEventListener('change', () => { if (splitFileInput.files.length) handleSplitFile(splitFileInput.files[0]); });

async function handleSplitFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
        document.getElementById('splitStatus').textContent = 'Нужен .zip файл';
        return;
    }
    document.getElementById('splitSection').style.display = 'block';
    document.getElementById('splitStatus').textContent = 'Загрузка файла...';
    document.getElementById('splitDownloads').innerHTML = '';
    document.getElementById('splitProgress').style.display = 'block';
    document.getElementById('splitProgressBar').style.width = '0%';

    const CHUNK_SIZE = 50 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const jobId = crypto.randomUUID();
    splitJobId = jobId;

    for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, Math.min((i+1) * CHUNK_SIZE, file.size));
        const fd = new FormData();
        fd.append('chunk', chunk);
        fd.append('chunk_index', i);
        fd.append('total_chunks', totalChunks);
        fd.append('filename', file.name);
        fd.append('job_id', jobId);
        const resp = await fetch('/upload_chunk', { method: 'POST', body: fd });
        if (!resp.ok) { document.getElementById('splitStatus').textContent = 'Ошибка загрузки'; return; }
        const pct = Math.round(((i+1) / totalChunks) * 100);
        document.getElementById('splitProgressBar').style.width = pct + '%';
        document.getElementById('splitStatus').textContent = 'Загрузка: ' + pct + '%';
    }

    document.getElementById('splitProgressBar').style.width = '100%';
    document.getElementById('splitStatus').textContent = 'Файл загружен! Выбери режим, укажи значение и нажми "Разбить"';
    document.getElementById('splitProgress').style.display = 'none';
}

let splitMode = 'mb';
function setSplitMode(mode) {
    splitMode = mode;
    document.getElementById('modeMb').classList.toggle('active', mode === 'mb');
    document.getElementById('modeCount').classList.toggle('active', mode === 'count');
    document.getElementById('splitSize').style.display = mode === 'mb' ? '' : 'none';
    document.getElementById('splitCount').style.display = mode === 'count' ? '' : 'none';
}

document.getElementById('splitBtn').addEventListener('click', async () => {
    if (!splitJobId) {
        document.getElementById('splitStatus').textContent = 'Сначала загрузи ZIP файл';
        return;
    }

    let body = {job_id: splitJobId};
    if (splitMode === 'mb') {
        const sizeMb = parseInt(document.getElementById('splitSize').value);
        if (!sizeMb || sizeMb < 1) {
            document.getElementById('splitStatus').textContent = 'Укажи размер в МБ';
            return;
        }
        body.max_mb = sizeMb;
    } else {
        const parts = parseInt(document.getElementById('splitCount').value);
        if (!parts || parts < 2) {
            document.getElementById('splitStatus').textContent = 'Укажи количество частей (минимум 2)';
            return;
        }
        body.num_parts = parts;
    }

    const btn = document.getElementById('splitBtn');
    btn.disabled = true;
    document.getElementById('splitStatus').textContent = 'Разбиваю...';
    document.getElementById('splitDownloads').innerHTML = '';

    const resp = await fetch('/split', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    btn.disabled = false;

    if (data.error) {
        document.getElementById('splitStatus').textContent = 'Ошибка: ' + data.error;
        return;
    }

    const count = data.count;
    document.getElementById('splitStatus').textContent =
        'Готово! ' + count + ' архив(ов). Размеры: ' + data.sizes.join(', ');

    let html = '';
    for (let i = 0; i < count; i++) {
        html += '<a href="/download_split/' + splitJobId + '/' + i + '">ZIP ' + (i+1) +
                ' (' + data.sizes[i] + ')</a>';
    }
    document.getElementById('splitDownloads').innerHTML = html;
});

async function loadFileLists(jobId) {
    const resp = await fetch('/files/' + jobId);
    const data = await resp.json();
    const fileLists = document.getElementById('fileLists');
    const goodItems = document.getElementById('goodItems');
    const badItems = document.getElementById('badItems');

    document.getElementById('goodCount').textContent = data.good_list.length;
    document.getElementById('badCount').textContent = data.bad_list.length;

    goodItems.innerHTML = data.good_list.map(n =>
        '<div class="file-item">' + escHtml(n) + '</div>'
    ).join('');

    badItems.innerHTML = data.bad_list.map(f =>
        '<div class="file-item">' + escHtml(f.name) + '<span class="err">' + escHtml(f.error) + '</span></div>'
    ).join('');

    fileLists.style.display = 'block';

    document.getElementById('goodToggle').onclick = () => {
        document.getElementById('goodToggle').classList.toggle('open');
        goodItems.classList.toggle('open');
    };
    document.getElementById('badToggle').onclick = () => {
        document.getElementById('badToggle').classList.toggle('open');
        badItems.classList.toggle('open');
    };
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// --- Convert to WebP Section ---
const convertDropZone = document.getElementById('convertDropZone');
const convertFileInput = document.getElementById('convertFileInput');
let convertJobId = null;

convertDropZone.addEventListener('click', () => convertFileInput.click());
convertDropZone.addEventListener('dragover', e => { e.preventDefault(); convertDropZone.classList.add('dragover'); });
convertDropZone.addEventListener('dragleave', () => convertDropZone.classList.remove('dragover'));
convertDropZone.addEventListener('drop', e => {
    e.preventDefault(); convertDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleConvertFile(e.dataTransfer.files[0]);
});
convertFileInput.addEventListener('change', () => { if (convertFileInput.files.length) handleConvertFile(convertFileInput.files[0]); });

async function handleConvertFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) return;
    const section = document.getElementById('convertProgressSection');
    const bar = document.getElementById('convertProgressBar');
    const status = document.getElementById('convertStatus');
    const dlBtn = document.getElementById('convertDownloadBtn');
    section.style.display = 'block';
    dlBtn.style.display = 'none';
    document.getElementById('convertStats').style.display = 'none';
    bar.style.width = '0%';

    const CHUNK_SIZE = 50 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const jobId = crypto.randomUUID();
    convertJobId = jobId;

    for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, Math.min((i+1) * CHUNK_SIZE, file.size));
        const fd = new FormData();
        fd.append('chunk', chunk);
        fd.append('chunk_index', i);
        fd.append('total_chunks', totalChunks);
        fd.append('filename', file.name);
        fd.append('job_id', jobId);
        const resp = await fetch('/upload_chunk', { method: 'POST', body: fd });
        if (!resp.ok) { status.textContent = 'Upload error'; return; }
        const pct = Math.round(((i+1) / totalChunks) * 100);
        bar.style.width = pct + '%';
        status.textContent = 'Upload: ' + pct + '%';
    }

    status.textContent = 'Starting conversion...';
    bar.style.width = '0%';

    const resp = await fetch('/convert_webp', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({job_id: jobId})
    });
    if (!resp.ok) { status.textContent = 'Error starting conversion'; return; }
    pollConvert(jobId);
}

async function pollConvert(jobId) {
    const resp = await fetch('/status/' + jobId);
    const data = await resp.json();
    const bar = document.getElementById('convertProgressBar');
    const status = document.getElementById('convertStatus');
    const stats = document.getElementById('convertStats');

    if (data.status === 'processing') {
        stats.style.display = 'grid';
        document.getElementById('convertTotal').textContent = data.total || 0;
        document.getElementById('convertDone').textContent = data.good || 0;
        document.getElementById('convertFailed').textContent = data.bad || 0;
        const done = (data.good||0) + (data.bad||0);
        const pct = data.total > 0 ? Math.round((done / data.total) * 100) : 0;
        bar.style.width = pct + '%';
        status.textContent = 'Converting: ' + done + ' / ' + (data.total||'?');
        setTimeout(() => pollConvert(jobId), 400);
    } else if (data.status === 'done') {
        stats.style.display = 'grid';
        document.getElementById('convertTotal').textContent = data.total || 0;
        document.getElementById('convertDone').textContent = data.good || 0;
        document.getElementById('convertFailed').textContent = data.bad || 0;
        bar.style.width = '100%';
        status.textContent = 'Done!';
        if (data.good > 0) {
            const dlBtn = document.getElementById('convertDownloadBtn');
            dlBtn.style.display = 'block';
            dlBtn.onclick = () => { window.location = '/download/' + jobId; };
        }
    } else if (data.status === 'error') {
        status.textContent = 'Error: ' + (data.message || 'unknown');
    }
}

// --- Flat Convert (no folders) Section ---
const flatDropZone = document.getElementById('flatDropZone');
const flatFileInput = document.getElementById('flatFileInput');
let flatJobId = null;

flatDropZone.addEventListener('click', () => flatFileInput.click());
flatDropZone.addEventListener('dragover', e => { e.preventDefault(); flatDropZone.classList.add('dragover'); });
flatDropZone.addEventListener('dragleave', () => flatDropZone.classList.remove('dragover'));
flatDropZone.addEventListener('drop', e => {
    e.preventDefault(); flatDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFlatFile(e.dataTransfer.files[0]);
});
flatFileInput.addEventListener('change', () => { if (flatFileInput.files.length) handleFlatFile(flatFileInput.files[0]); });

async function handleFlatFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) return;
    const section = document.getElementById('flatProgressSection');
    const bar = document.getElementById('flatProgressBar');
    const status = document.getElementById('flatStatus');
    const dlBtn = document.getElementById('flatDownloadBtn');
    section.style.display = 'block';
    dlBtn.style.display = 'none';
    document.getElementById('flatStats').style.display = 'none';
    bar.style.width = '0%';

    const CHUNK_SIZE = 50 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const jobId = crypto.randomUUID();
    flatJobId = jobId;

    for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, Math.min((i+1) * CHUNK_SIZE, file.size));
        const fd = new FormData();
        fd.append('chunk', chunk);
        fd.append('chunk_index', i);
        fd.append('total_chunks', totalChunks);
        fd.append('filename', file.name);
        fd.append('job_id', jobId);
        const resp = await fetch('/upload_chunk', { method: 'POST', body: fd });
        if (!resp.ok) { status.textContent = 'Upload error'; return; }
        const pct = Math.round(((i+1) / totalChunks) * 100);
        bar.style.width = pct + '%';
        status.textContent = 'Upload: ' + pct + '%';
    }

    status.textContent = 'Starting conversion...';
    bar.style.width = '0%';

    const resp = await fetch('/convert_flat', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({job_id: jobId})
    });
    if (!resp.ok) { status.textContent = 'Error'; return; }
    pollFlat(jobId);
}

async function pollFlat(jobId) {
    const resp = await fetch('/status/' + jobId);
    const data = await resp.json();
    const bar = document.getElementById('flatProgressBar');
    const status = document.getElementById('flatStatus');
    const stats = document.getElementById('flatStats');

    if (data.status === 'processing') {
        stats.style.display = 'grid';
        document.getElementById('flatTotal').textContent = data.total || 0;
        document.getElementById('flatDone').textContent = data.good || 0;
        document.getElementById('flatFailed').textContent = data.bad || 0;
        const done = (data.good||0) + (data.bad||0);
        const pct = data.total > 0 ? Math.round((done / data.total) * 100) : 0;
        bar.style.width = pct + '%';
        status.textContent = 'Converting: ' + done + ' / ' + (data.total||'?');
        setTimeout(() => pollFlat(jobId), 400);
    } else if (data.status === 'done') {
        stats.style.display = 'grid';
        document.getElementById('flatTotal').textContent = data.total || 0;
        document.getElementById('flatDone').textContent = data.good || 0;
        document.getElementById('flatFailed').textContent = data.bad || 0;
        bar.style.width = '100%';
        status.textContent = 'Done!';
        if (data.good > 0) {
            const dlBtn = document.getElementById('flatDownloadBtn');
            dlBtn.style.display = 'block';
            dlBtn.onclick = () => { window.location = '/download/' + jobId; };
        }
    } else if (data.status === 'error') {
        status.textContent = 'Error: ' + (data.message || 'unknown');
    }
}

// --- Images to WebP Section ---
const imagesDropZone = document.getElementById('imagesDropZone');
const imagesFileInput = document.getElementById('imagesFileInput');
const allowedImageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.tif', '.webp', '.ico', '.ppm', '.pgm', '.pbm', '.pnm', '.heic', '.heif', '.avif', '.jfif'];
let imagesJobId = null;

imagesDropZone.addEventListener('click', () => imagesFileInput.click());
imagesDropZone.addEventListener('dragover', e => { e.preventDefault(); imagesDropZone.classList.add('dragover'); });
imagesDropZone.addEventListener('dragleave', () => imagesDropZone.classList.remove('dragover'));
imagesDropZone.addEventListener('drop', e => {
    e.preventDefault(); imagesDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleImageFiles(Array.from(e.dataTransfer.files));
});
imagesFileInput.addEventListener('change', () => {
    if (imagesFileInput.files.length) handleImageFiles(Array.from(imagesFileInput.files));
    imagesFileInput.value = '';
});

function isImageFile(file) {
    const name = file.name.toLowerCase();
    return allowedImageExtensions.some(ext => name.endsWith(ext));
}

async function handleImageFiles(files) {
    const imageFiles = files.filter(isImageFile);
    const section = document.getElementById('imagesProgressSection');
    const bar = document.getElementById('imagesProgressBar');
    const status = document.getElementById('imagesStatus');
    const dlBtn = document.getElementById('imagesDownloadBtn');
    const stats = document.getElementById('imagesStats');

    section.style.display = 'block';
    stats.style.display = 'none';
    dlBtn.style.display = 'none';
    bar.style.width = '0%';

    if (!imageFiles.length) {
        status.textContent = 'Нужны файлы картинок';
        return;
    }

    const jobId = crypto.randomUUID();
    imagesJobId = jobId;

    status.textContent = 'Загрузка: ' + imageFiles.length + ' файлов';

    const fd = new FormData();
    fd.append('job_id', jobId);
    imageFiles.forEach(file => fd.append('images', file, file.name));

    const uploadResp = await fetch('/upload_images', { method: 'POST', body: fd });
    if (!uploadResp.ok) {
        status.textContent = 'Ошибка загрузки';
        return;
    }

    bar.style.width = '100%';
    status.textContent = 'Запуск конвертации...';

    const resp = await fetch('/convert_images_webp', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({job_id: jobId})
    });
    if (!resp.ok) {
        status.textContent = 'Ошибка запуска';
        return;
    }
    pollImages(jobId);
}

async function pollImages(jobId) {
    const resp = await fetch('/status/' + jobId);
    const data = await resp.json();
    const bar = document.getElementById('imagesProgressBar');
    const status = document.getElementById('imagesStatus');
    const stats = document.getElementById('imagesStats');

    if (data.status === 'processing') {
        stats.style.display = 'grid';
        document.getElementById('imagesTotal').textContent = data.total || 0;
        document.getElementById('imagesDone').textContent = data.good || 0;
        document.getElementById('imagesFailed').textContent = data.bad || 0;
        const done = (data.good||0) + (data.bad||0);
        const pct = data.total > 0 ? Math.round((done / data.total) * 100) : 0;
        bar.style.width = pct + '%';
        status.textContent = 'Converting: ' + done + ' / ' + (data.total||'?');
        setTimeout(() => pollImages(jobId), 400);
    } else if (data.status === 'done') {
        stats.style.display = 'grid';
        document.getElementById('imagesTotal').textContent = data.total || 0;
        document.getElementById('imagesDone').textContent = data.good || 0;
        document.getElementById('imagesFailed').textContent = data.bad || 0;
        bar.style.width = '100%';
        status.textContent = 'Done!';
        if (data.good > 0) {
            const dlBtn = document.getElementById('imagesDownloadBtn');
            dlBtn.style.display = 'block';
            dlBtn.onclick = () => { window.location = '/download/' + jobId; };
        }
    } else if (data.status === 'error') {
        status.textContent = 'Error: ' + (data.message || 'unknown');
    }
}

// --- Merge ZIPs Section ---
const mergeDropZone = document.getElementById('mergeDropZone');
const mergeFileInput = document.getElementById('mergeFileInput');
let mergeFiles = [];
let mergeJobId = null;

mergeDropZone.addEventListener('click', () => mergeFileInput.click());
mergeDropZone.addEventListener('dragover', e => { e.preventDefault(); mergeDropZone.classList.add('dragover'); });
mergeDropZone.addEventListener('dragleave', () => mergeDropZone.classList.remove('dragover'));
mergeDropZone.addEventListener('drop', e => {
    e.preventDefault(); mergeDropZone.classList.remove('dragover');
    addMergeFiles(e.dataTransfer.files);
});
mergeFileInput.addEventListener('change', () => { addMergeFiles(mergeFileInput.files); mergeFileInput.value = ''; });

function addMergeFiles(files) {
    for (const f of files) {
        if (f.name.toLowerCase().endsWith('.zip')) mergeFiles.push(f);
    }
    renderMergeList();
}

function removeMergeFile(idx) {
    mergeFiles.splice(idx, 1);
    renderMergeList();
}

function renderMergeList() {
    const list = document.getElementById('mergeFileList');
    const btn = document.getElementById('mergeBtn');
    if (mergeFiles.length === 0) {
        list.innerHTML = '';
        btn.style.display = 'none';
        return;
    }
    let html = '<div style="font-size:0.85em; color:#aaa; margin-bottom:6px;">Файлы для объединения:</div>';
    mergeFiles.forEach((f, i) => {
        const sizeMb = (f.size / (1024*1024)).toFixed(1);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#1a1a1a;border-radius:8px;margin-bottom:4px;">' +
            '<span style="font-size:0.85em;color:#ccc;">' + escHtml(f.name) + ' <span style="color:#666;">(' + sizeMb + ' MB)</span></span>' +
            '<span style="color:#f87171;cursor:pointer;font-size:0.8em;" onclick="removeMergeFile(' + i + ')">удалить</span></div>';
    });
    list.innerHTML = html;
    btn.style.display = 'block';
}

document.getElementById('mergeBtn').addEventListener('click', async () => {
    if (mergeFiles.length < 2) {
        document.getElementById('mergeStatus').textContent = 'Нужно минимум 2 ZIP файла';
        document.getElementById('mergeProgressSection').style.display = 'block';
        return;
    }

    const section = document.getElementById('mergeProgressSection');
    const bar = document.getElementById('mergeProgressBar');
    const status = document.getElementById('mergeStatus');
    const dlBtn = document.getElementById('mergeDownloadBtn');
    section.style.display = 'block';
    dlBtn.style.display = 'none';
    document.getElementById('mergeBtn').style.display = 'none';

    const jobId = crypto.randomUUID();
    mergeJobId = jobId;

    // Upload each ZIP file
    const totalFiles = mergeFiles.length;
    const CHUNK_SIZE = 50 * 1024 * 1024;

    for (let fi = 0; fi < totalFiles; fi++) {
        const file = mergeFiles[fi];
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const fileJobId = jobId + '_' + fi;

        for (let i = 0; i < totalChunks; i++) {
            const chunk = file.slice(i * CHUNK_SIZE, Math.min((i+1) * CHUNK_SIZE, file.size));
            const fd = new FormData();
            fd.append('chunk', chunk);
            fd.append('chunk_index', i);
            fd.append('total_chunks', totalChunks);
            fd.append('filename', file.name);
            fd.append('job_id', fileJobId);
            const resp = await fetch('/upload_chunk', { method: 'POST', body: fd });
            if (!resp.ok) { status.textContent = 'Upload error'; return; }
        }
        const pct = Math.round(((fi+1) / totalFiles) * 100);
        bar.style.width = pct + '%';
        status.textContent = 'Uploading: ' + (fi+1) + ' / ' + totalFiles + ' files';
    }

    status.textContent = 'Merging...';
    bar.style.width = '100%';

    const resp = await fetch('/merge', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({job_id: jobId, count: totalFiles})
    });
    const data = await resp.json();

    if (data.error) {
        status.textContent = 'Error: ' + data.error;
        return;
    }

    status.textContent = 'Done! Size: ' + data.size;
    dlBtn.style.display = 'block';
    dlBtn.onclick = () => { window.location = '/download_merge/' + jobId; };
    mergeFiles = [];
    document.getElementById('mergeFileList').innerHTML = '';
});

function setupToolLayout() {
    const container = document.querySelector('.container');
    if (!container) return;

    container.querySelectorAll(':scope > hr, :scope > h2, :scope > h2 + p').forEach(el => {
        el.style.display = 'none';
    });

    const existingGrid = container.querySelector(':scope > .tools-grid');
    if (existingGrid) existingGrid.remove();

    const grid = document.createElement('div');
    grid.className = 'tools-grid';

    const title = container.querySelector('h1');
    const subtitle = container.querySelector('.subtitle');
    if (subtitle && subtitle.nextSibling) {
        container.insertBefore(grid, subtitle.nextSibling);
    } else {
        container.appendChild(grid);
    }

    const makeCard = (badge, heading, desc, nodes) => {
        const card = document.createElement('section');
        card.className = 'tool-card';

        const badgeEl = document.createElement('div');
        badgeEl.className = 'tool-badge';
        badgeEl.textContent = badge;

        const titleEl = document.createElement('h2');
        titleEl.className = 'tool-title';
        titleEl.textContent = heading;

        const descEl = document.createElement('p');
        descEl.className = 'tool-desc';
        descEl.textContent = desc;

        card.appendChild(badgeEl);
        card.appendChild(titleEl);
        card.appendChild(descEl);

        nodes.forEach(node => {
            if (node) card.appendChild(node);
        });

        return card;
    };

    const cards = [
        makeCard(
            '1. Проверка ZIP',
            'Вытащить все рабочие картинки из ZIP',
            'Основной режим. Загружаешь архив, сервис находит изображения, отбрасывает битые и собирает всё рабочее в один ZIP с WebP.',
            [
                document.getElementById('dropZone'),
                document.getElementById('fileInput'),
                document.getElementById('progressSection'),
                document.getElementById('errorText'),
                document.getElementById('downloadBtn'),
                document.getElementById('fileLists'),
            ]
        ),
        makeCard(
            '2. Разделение',
            'Разделить ZIP на части',
            'Если архив слишком большой, этот режим разобьёт его на несколько ZIP по размеру или по количеству частей.',
            [
                document.getElementById('splitDropZone'),
                document.getElementById('splitFileInput'),
                document.getElementById('splitSection'),
            ]
        ),
        makeCard(
            '3. Конвертация',
            'ZIP с папками → WebP',
            'Подходит для архива, где изображения уже разложены по папкам. Структура папок на выходе сохранится.',
            [
                document.getElementById('convertDropZone'),
                document.getElementById('convertFileInput'),
                document.getElementById('convertProgressSection'),
                document.getElementById('convertDownloadBtn'),
            ]
        ),
        makeCard(
            '4. Конвертация',
            'ZIP без папок → WebP',
            'Все изображения из архива станут WebP и будут лежать в одном уровне, без внутренних папок.',
            [
                document.getElementById('flatDropZone'),
                document.getElementById('flatFileInput'),
                document.getElementById('flatProgressSection'),
                document.getElementById('flatDownloadBtn'),
            ]
        ),
        makeCard(
            '5. Быстрый режим',
            'Обычные картинки → WebP',
            'Для отдельных JPG, PNG, TIFF, HEIC и других файлов без ZIP. Просто выбираешь изображения и получаешь архив с WebP.',
            [
                document.getElementById('imagesDropZone'),
                document.getElementById('imagesFileInput'),
                document.getElementById('imagesProgressSection'),
                document.getElementById('imagesDownloadBtn'),
            ]
        ),
        makeCard(
            '6. Объединение',
            'Объединить ZIP файлы',
            'Если архивов несколько, этот режим сольёт их в один ZIP с сохранением структуры папок.',
            [
                document.getElementById('mergeDropZone'),
                document.getElementById('mergeFileInput'),
                document.getElementById('mergeFileList'),
                document.getElementById('mergeProgressSection'),
                document.getElementById('mergeBtn'),
                document.getElementById('mergeDownloadBtn'),
            ]
        ),
    ];

    cards.forEach(card => grid.appendChild(card));
}

setupToolLayout();
</script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route("/upload_chunk", methods=["POST"])
def upload_chunk():
    job_id = request.form.get("job_id")
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    chunk_index = int(request.form["chunk_index"])
    total_chunks = int(request.form["total_chunks"])
    filename = Path(request.form["filename"]).name
    if not filename.lower().endswith(".zip"):
        return jsonify({"error": "only ZIP files are supported"}), 400
    chunk = request.files["chunk"]

    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(exist_ok=True)
    chunk_path = job_dir / f"chunk_{chunk_index:06d}"
    chunk.save(chunk_path)

    received = len(list(job_dir.glob("chunk_*")))
    if received == total_chunks:
        final_path = job_dir / filename
        with open(final_path, "wb") as out:
            for i in range(total_chunks):
                cp = job_dir / f"chunk_{i:06d}"
                with open(cp, "rb") as c:
                    shutil.copyfileobj(c, out)
                cp.unlink()
        jobs[job_id] = {"zip_path": str(final_path), "status": "uploaded"}

    return jsonify({"ok": True})


@app.route("/upload_images", methods=["POST"])
def upload_images():
    job_id = request.form.get("job_id")
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "no files"}), 400

    job_dir = UPLOAD_DIR / job_id / "images"
    job_dir.mkdir(parents=True, exist_ok=True)

    saved = 0
    name_counts = {}
    for file in files:
        original_name = Path(file.filename or "").name
        if not original_name:
            continue
        ext = Path(original_name).suffix.lower()
        if ext not in IMAGE_EXTENSIONS:
            continue

        safe_name = make_unique_filename(original_name, name_counts)
        file.save(job_dir / safe_name)
        saved += 1

    if saved == 0:
        shutil.rmtree(UPLOAD_DIR / job_id, ignore_errors=True)
        return jsonify({"error": "no valid images"}), 400

    jobs[job_id] = {
        "input_dir": str(job_dir),
        "status": "uploaded",
        "source": "images",
        "total": saved,
    }
    return jsonify({"ok": True, "saved": saved})


@app.route("/process", methods=["POST"])
def start_process():
    data = request.get_json()
    job_id = data["job_id"]
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    if job_id not in jobs:
        return jsonify({"error": "job not found"}), 404

    jobs[job_id].update({"status": "processing", "phase": "extracting",
                         "total": 0, "good": 0, "bad": 0, "extracted": 0,
                         "good_list": [], "bad_list": []})
    thread = threading.Thread(target=process_zip, args=(job_id,), daemon=True)
    thread.start()
    return jsonify({"ok": True})


def _init_worker():
    """Set PATH in each child process so pyvips can find libvips DLLs."""
    configure_vips_path()


def convert_single_image(args):
    """Run in a separate PROCESS — no GIL. Full CPU core utilization via pyvips."""
    src_path, dst_path, original_name = args
    try:
        import pyvips
        img = pyvips.Image.new_from_file(src_path, access="sequential")
        img.write_to_file(dst_path + "[Q=" + str(WEBP_QUALITY) + ",effort=" + str(WEBP_METHOD) + "]")
        return ("good", original_name)
    except Exception as e:
        return ("bad", original_name, str(e))


def process_zip(job_id):
    job = jobs[job_id]
    zip_path = job["zip_path"]
    out_dir = OUTPUT_DIR / job_id
    out_dir.mkdir(exist_ok=True)

    extract_dir = TEMP_DIR / job_id
    extract_dir.mkdir(exist_ok=True)

    try:
        # Phase 1: Extract image files from ZIP to disk
        job["phase"] = "extracting"
        with zipfile.ZipFile(zip_path, "r") as zf:
            image_entries = [
                e for e in zf.namelist()
                if not e.endswith("/")
                and Path(e).suffix.lower() in IMAGE_EXTENSIONS
            ]
            job["total"] = len(image_entries)

            entry_map = {}
            for i, entry in enumerate(image_entries):
                try:
                    ext = Path(entry).suffix
                    # Use only index as filename to avoid issues with special chars
                    dest = extract_dir / f"{i:06d}{ext}"
                    with zf.open(entry) as src, open(dest, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    entry_map[i] = entry
                except Exception:
                    pass
                job["extracted"] = i + 1

        # Delete ZIP immediately to free disk space
        try:
            shutil.rmtree(UPLOAD_DIR / job_id)
        except Exception:
            pass

        # Phase 2: Convert with multiprocessing
        job["phase"] = "converting"

        # Build work list, preserving folder structure from original ZIP
        work = []
        name_counts = {}
        for f in sorted(extract_dir.iterdir()):
            if f.is_file():
                # Index is the filename (e.g. "000042.jpg" -> 42)
                try:
                    idx_num = int(f.stem)
                except ValueError:
                    continue
                original_zip_path = entry_map.get(idx_num)
                if not original_zip_path:
                    continue

                # Preserve original folder structure
                original_parent = str(Path(original_zip_path).parent)
                if original_parent == ".":
                    original_parent = ""
                original_stem = Path(original_zip_path).stem

                # Unique name within the same folder
                full_key = original_parent + "/" + original_stem
                if full_key not in name_counts:
                    name_counts[full_key] = 0
                dup_idx = name_counts[full_key]
                name_counts[full_key] += 1
                if dup_idx == 0:
                    out_name = f"{original_stem}.webp"
                else:
                    out_name = f"{original_stem}_{dup_idx}.webp"

                # Create subfolder in output
                if original_parent:
                    (out_dir / original_parent).mkdir(parents=True, exist_ok=True)
                    out_path = str(out_dir / original_parent / out_name)
                else:
                    out_path = str(out_dir / out_name)

                work.append((str(f), out_path, original_zip_path))

        with ProcessPoolExecutor(max_workers=NUM_WORKERS, initializer=_init_worker) as pool:
            for result in pool.map(convert_single_image, work, chunksize=4):
                if result[0] == "good":
                    job["good"] += 1
                    job["good_list"].append(result[1])
                else:
                    job["bad"] += 1
                    job["bad_list"].append({"name": result[1], "error": result[2]})

    except Exception as e:
        job["status"] = "error"
        job["message"] = str(e)
        shutil.rmtree(extract_dir, ignore_errors=True)
        return

    shutil.rmtree(extract_dir, ignore_errors=True)
    job["status"] = "done"


@app.route("/status/<job_id>")
def status(job_id):
    if not is_safe_job_id(job_id):
        return jsonify({"status": "unknown"}), 400
    if job_id not in jobs:
        return jsonify({"status": "unknown"})
    j = {k: v for k, v in jobs[job_id].items() if k not in ("good_list", "bad_list")}
    return jsonify(j)


@app.route("/files/<job_id>")
def file_lists(job_id):
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    if job_id not in jobs:
        return jsonify({"error": "not found"}), 404
    j = jobs[job_id]
    return jsonify({"good_list": j.get("good_list", []),
                     "bad_list": j.get("bad_list", [])})


@app.route("/download/<job_id>")
def download(job_id):
    if not is_safe_job_id(job_id):
        return "Invalid job id", 400
    out_dir = OUTPUT_DIR / job_id
    if not out_dir.exists():
        return "Not found", 404

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_STORED) as zf:
        for f in out_dir.rglob("*"):
            if f.is_file():
                arcname = str(f.relative_to(out_dir))
                zf.write(f, arcname)
    zip_buf.seek(0)

    return send_file(zip_buf, download_name="images_webp.zip", as_attachment=True)


@app.route("/convert_webp", methods=["POST"])
def start_convert_webp():
    data = request.get_json()
    job_id = data["job_id"]
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    if job_id not in jobs:
        return jsonify({"error": "job not found"}), 404

    jobs[job_id].update({"status": "processing", "phase": "converting",
                         "total": 0, "good": 0, "bad": 0, "extracted": 0,
                         "good_list": [], "bad_list": []})
    thread = threading.Thread(target=convert_webp_job, args=(job_id,), daemon=True)
    thread.start()
    return jsonify({"ok": True})


def convert_webp_job(job_id):
    """Extract ZIP, convert ALL images to WebP, preserve folder structure."""
    job = jobs[job_id]
    zip_path = job["zip_path"]
    out_dir = OUTPUT_DIR / job_id
    out_dir.mkdir(exist_ok=True)
    extract_dir = TEMP_DIR / job_id
    extract_dir.mkdir(exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            image_entries = [
                e for e in zf.namelist()
                if not e.endswith("/")
                and Path(e).suffix.lower() in IMAGE_EXTENSIONS
            ]
            job["total"] = len(image_entries)

            entry_map = {}
            for i, entry in enumerate(image_entries):
                try:
                    ext = Path(entry).suffix
                    dest = extract_dir / f"{i:06d}{ext}"
                    with zf.open(entry) as src, open(dest, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    entry_map[i] = entry
                except Exception:
                    pass

        # Delete uploaded ZIP
        try:
            shutil.rmtree(UPLOAD_DIR / job_id)
        except Exception:
            pass

        # Build work list preserving folders
        work = []
        name_counts = {}
        for f in sorted(extract_dir.iterdir()):
            if f.is_file():
                try:
                    idx_num = int(f.stem)
                except ValueError:
                    continue
                original_zip_path = entry_map.get(idx_num)
                if not original_zip_path:
                    continue

                original_parent = str(Path(original_zip_path).parent)
                if original_parent == ".":
                    original_parent = ""
                original_stem = Path(original_zip_path).stem

                full_key = original_parent + "/" + original_stem
                if full_key not in name_counts:
                    name_counts[full_key] = 0
                dup_idx = name_counts[full_key]
                name_counts[full_key] += 1
                out_name = f"{original_stem}.webp" if dup_idx == 0 else f"{original_stem}_{dup_idx}.webp"

                if original_parent:
                    (out_dir / original_parent).mkdir(parents=True, exist_ok=True)
                    out_path = str(out_dir / original_parent / out_name)
                else:
                    out_path = str(out_dir / out_name)

                work.append((str(f), out_path, original_zip_path))

        with ProcessPoolExecutor(max_workers=NUM_WORKERS, initializer=_init_worker) as pool:
            for result in pool.map(convert_single_image, work, chunksize=4):
                if result[0] == "good":
                    job["good"] += 1
                else:
                    job["bad"] += 1

    except Exception as e:
        job["status"] = "error"
        job["message"] = str(e)
        shutil.rmtree(extract_dir, ignore_errors=True)
        return

    shutil.rmtree(extract_dir, ignore_errors=True)
    job["status"] = "done"


@app.route("/convert_flat", methods=["POST"])
def start_convert_flat():
    data = request.get_json()
    job_id = data["job_id"]
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    if job_id not in jobs:
        return jsonify({"error": "job not found"}), 404

    jobs[job_id].update({"status": "processing", "phase": "converting",
                         "total": 0, "good": 0, "bad": 0,
                         "good_list": [], "bad_list": []})
    thread = threading.Thread(target=convert_flat_job, args=(job_id,), daemon=True)
    thread.start()
    return jsonify({"ok": True})


def convert_flat_job(job_id):
    """Extract ZIP, convert ALL images to WebP, flat (no folders), keep original names."""
    job = jobs[job_id]
    zip_path = job["zip_path"]
    out_dir = OUTPUT_DIR / job_id
    out_dir.mkdir(exist_ok=True)
    extract_dir = TEMP_DIR / job_id
    extract_dir.mkdir(exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            image_entries = [
                e for e in zf.namelist()
                if not e.endswith("/")
                and Path(e).suffix.lower() in IMAGE_EXTENSIONS
            ]
            job["total"] = len(image_entries)

            entry_map = {}
            for i, entry in enumerate(image_entries):
                try:
                    ext = Path(entry).suffix
                    dest = extract_dir / f"{i:06d}{ext}"
                    with zf.open(entry) as src, open(dest, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    entry_map[i] = entry
                except Exception:
                    pass

        try:
            shutil.rmtree(UPLOAD_DIR / job_id)
        except Exception:
            pass

        # Build work list — flat, no folders, original names
        work = []
        name_counts = {}
        for f in sorted(extract_dir.iterdir()):
            if f.is_file():
                try:
                    idx_num = int(f.stem)
                except ValueError:
                    continue
                original_zip_path = entry_map.get(idx_num)
                if not original_zip_path:
                    continue

                original_stem = Path(original_zip_path).stem

                # Handle duplicates
                if original_stem not in name_counts:
                    name_counts[original_stem] = 0
                dup_idx = name_counts[original_stem]
                name_counts[original_stem] += 1
                out_name = f"{original_stem}.webp" if dup_idx == 0 else f"{original_stem}_{dup_idx}.webp"

                out_path = str(out_dir / out_name)
                work.append((str(f), out_path, original_zip_path))

        with ProcessPoolExecutor(max_workers=NUM_WORKERS, initializer=_init_worker) as pool:
            for result in pool.map(convert_single_image, work, chunksize=4):
                if result[0] == "good":
                    job["good"] += 1
                else:
                    job["bad"] += 1

    except Exception as e:
        job["status"] = "error"
        job["message"] = str(e)
        shutil.rmtree(extract_dir, ignore_errors=True)
        return

    shutil.rmtree(extract_dir, ignore_errors=True)
    job["status"] = "done"


@app.route("/convert_images_webp", methods=["POST"])
def start_convert_images_webp():
    data = request.get_json()
    job_id = data["job_id"]
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    if job_id not in jobs or "input_dir" not in jobs[job_id]:
        return jsonify({"error": "job not found"}), 404

    jobs[job_id].update({
        "status": "processing",
        "phase": "converting",
        "good": 0,
        "bad": 0,
        "good_list": [],
        "bad_list": [],
    })
    thread = threading.Thread(target=convert_uploaded_images_job, args=(job_id,), daemon=True)
    thread.start()
    return jsonify({"ok": True})


def convert_uploaded_images_job(job_id):
    """Convert directly uploaded image files to WebP and pack them for download."""
    job = jobs[job_id]
    input_dir = Path(job["input_dir"])
    out_dir = OUTPUT_DIR / job_id
    out_dir.mkdir(exist_ok=True)

    try:
        files = [f for f in sorted(input_dir.iterdir()) if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
        job["total"] = len(files)

        work = []
        name_counts = {}
        for f in files:
            out_name = make_unique_filename(f"{f.stem}.webp", name_counts)
            out_path = str(out_dir / out_name)
            work.append((str(f), out_path, f.name))

        with ProcessPoolExecutor(max_workers=NUM_WORKERS, initializer=_init_worker) as pool:
            for result in pool.map(convert_single_image, work, chunksize=4):
                if result[0] == "good":
                    job["good"] += 1
                    job["good_list"].append(result[1])
                else:
                    job["bad"] += 1
                    job["bad_list"].append({"name": result[1], "error": result[2]})

    except Exception as e:
        job["status"] = "error"
        job["message"] = str(e)
        return
    finally:
        shutil.rmtree(UPLOAD_DIR / job_id, ignore_errors=True)

    job["status"] = "done"


@app.route("/split", methods=["POST"])
def split_zip():
    data = request.get_json()
    job_id = data["job_id"]
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    max_mb = data.get("max_mb")
    num_parts = data.get("num_parts")

    # Check if this is from the converter output or a standalone uploaded ZIP
    out_dir = OUTPUT_DIR / job_id
    extract_dir = TEMP_DIR / (job_id + "_split")

    if not out_dir.exists():
        # Standalone split: extract the uploaded ZIP first
        if job_id not in jobs or "zip_path" not in jobs[job_id]:
            return jsonify({"error": "file not found"}), 404

        zip_path = jobs[job_id]["zip_path"]
        if not Path(zip_path).exists():
            return jsonify({"error": "ZIP file not found on disk"}), 404

        if extract_dir.exists():
            shutil.rmtree(extract_dir)
        extract_dir.mkdir(parents=True)

        with zipfile.ZipFile(zip_path, "r") as zf:
            safe_extract_zip(zf, extract_dir)

        out_dir = extract_dir

    # Clean previous split
    split_job_dir = SPLIT_DIR / job_id
    if split_job_dir.exists():
        shutil.rmtree(split_job_dir)
    split_job_dir.mkdir(parents=True)

    # Build a list of "units" — smallest indivisible chunks.
    # A unit is all files sharing the same immediate parent folder.
    # Files in root are each their own unit (so they can be split individually).
    folder_groups = defaultdict(list)
    for f in out_dir.rglob("*"):
        if f.is_file():
            rel = f.relative_to(out_dir)
            folder = str(rel.parent) if str(rel.parent) != "." else ""
            folder_groups[folder].append(f)

    # Break into units: each subfolder is one unit, root files are individual units
    units = []  # list of (label, [files], size)
    for folder in sorted(folder_groups.keys()):
        files = folder_groups[folder]
        if folder == "":
            # Root files — each is its own unit so they can be distributed
            for f in files:
                sz = f.stat().st_size
                units.append((f.name, [f], sz))
        else:
            sz = sum(f.stat().st_size for f in files)
            units.append((folder, files, sz))

    total_size = sum(u[2] for u in units)

    if num_parts:
        max_bytes = total_size // num_parts
    else:
        max_bytes = max_mb * 1024 * 1024

    # Pack units into parts
    zip_parts = []  # list of lists of (label, [files])
    current_part = []
    current_size = 0

    for label, files, usize in units:
        if current_size + usize > max_bytes and current_part:
            zip_parts.append(current_part)
            current_part = []
            current_size = 0

        current_part.append((label, files))
        current_size += usize

    if current_part:
        zip_parts.append(current_part)

    # Create ZIP files
    sizes = []
    for i, part in enumerate(zip_parts):
        zip_path = split_job_dir / f"part_{i + 1}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:
            for label, files in part:
                for f in files:
                    arcname = str(f.relative_to(out_dir))
                    zf.write(f, arcname)

        size = zip_path.stat().st_size
        if size < 1024 * 1024:
            sizes.append(f"{size / 1024:.0f} KB")
        else:
            sizes.append(f"{size / (1024 * 1024):.1f} MB")

    # Cleanup extracted temp dir if it was a standalone split
    if extract_dir.exists():
        shutil.rmtree(extract_dir, ignore_errors=True)

    return jsonify({"count": len(zip_parts), "sizes": sizes})


@app.route("/download_split/<job_id>/<int:part_index>")
def download_split(job_id, part_index):
    if not is_safe_job_id(job_id):
        return "Invalid job id", 400
    split_job_dir = SPLIT_DIR / job_id
    zip_path = split_job_dir / f"part_{part_index + 1}.zip"
    if not zip_path.exists():
        return "Not found", 404

    return send_file(zip_path, download_name=f"images_part_{part_index + 1}.zip", as_attachment=True)


MERGE_DIR = Path("merge_output")
MERGE_DIR.mkdir(exist_ok=True)


@app.route("/merge", methods=["POST"])
def merge_zips():
    data = request.get_json()
    job_id = data["job_id"]
    if not is_safe_job_id(job_id):
        return jsonify({"error": "invalid job_id"}), 400
    count = data["count"]

    merge_out = MERGE_DIR / job_id
    if merge_out.exists():
        shutil.rmtree(merge_out)
    merge_out.mkdir(parents=True)

    merged_zip_path = merge_out / "merged.zip"

    try:
        with zipfile.ZipFile(merged_zip_path, "w", zipfile.ZIP_STORED) as out_zf:
            existing_names = set()

            for fi in range(count):
                file_job_id = f"{job_id}_{fi}"
                if file_job_id not in jobs:
                    continue
                src_zip_path = jobs[file_job_id]["zip_path"]

                with zipfile.ZipFile(src_zip_path, "r") as src_zf:
                    for entry in src_zf.namelist():
                        if entry.endswith("/"):
                            continue

                        # Keep original path as arcname
                        arcname = entry

                        # Handle duplicates
                        if arcname in existing_names:
                            stem = Path(arcname).stem
                            ext = Path(arcname).suffix
                            parent = str(Path(arcname).parent)
                            counter = 1
                            while arcname in existing_names:
                                new_name = f"{stem}_{counter}{ext}"
                                arcname = f"{parent}/{new_name}" if parent != "." else new_name
                                counter += 1

                        existing_names.add(arcname)
                        data_bytes = src_zf.read(entry)
                        out_zf.writestr(arcname, data_bytes)

                # Cleanup uploaded source
                try:
                    shutil.rmtree(UPLOAD_DIR / file_job_id)
                except Exception:
                    pass

        size_bytes = merged_zip_path.stat().st_size
        if size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.0f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

        return jsonify({"ok": True, "size": size_str})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/download_merge/<job_id>")
def download_merge(job_id):
    if not is_safe_job_id(job_id):
        return "Invalid job id", 400
    merged_zip_path = MERGE_DIR / job_id / "merged.zip"
    if not merged_zip_path.exists():
        return "Not found", 404
    return send_file(merged_zip_path, download_name="merged.zip", as_attachment=True)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    print("=" * 50)
    print("  ZIP Digger is running!")
    print("  Open in browser: http://localhost:5000")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=False)
