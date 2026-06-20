# WooCommerce CSV Generator

Python script for generating WooCommerce import files from a PDF price list and product image folders.

## What it creates

- `final_import.csv`
- `final_import_semicolon.csv`
- `final_import.xlsx`
- image, price, and manual-review reports
- `log.txt` with validation notes

## Requirements

- Python 3.10+
- Dependencies from `requirements.txt`

Install dependencies:

```bash
pip install -r requirements.txt
```

## Usage

Place the source PDF and image folders locally, then run:

```bash
python generate_woocommerce_csv.py --pdf "PierreCardinShop2026.pdf" --images-root "extracted_images/Pierre Cardin 2026/Pierre Cardin 2026" --output-dir "output"
```

Optional image URL override:

```bash
python generate_woocommerce_csv.py --image-base-url "https://example.com/wp-content/uploads/products"
```

## Repository hygiene

The repository intentionally excludes generated exports, source PDFs, product images, archives, caches, and local environment files.
