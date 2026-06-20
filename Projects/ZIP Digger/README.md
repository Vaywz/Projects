# ZIP Digger

ZIP Digger is a local Flask tool for working with ZIP archives and images:

- extract valid images from ZIP archives
- convert images to WebP
- split ZIP archives into parts
- merge multiple ZIP archives
- convert directly uploaded images to WebP

## Setup

1. Install Python 3.12 or newer.
2. Install libvips and make sure its `bin` directory is available in `PATH`.
   On Windows, you can also set `VIPS_BIN` to the libvips `bin` folder.
3. Install Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

4. Start the app:

```powershell
python app.py
```

Open `http://localhost:5000` in a browser.

## Notes

Runtime folders such as `uploads/`, `output/`, `merge_output/`, `split_output/`,
`temp_extracted/`, local assistant settings, `.env` files, ZIP files, and the
local `vips_lib/` dependency bundle are intentionally ignored by Git.
