# Deed OCR runtime

The API reads text-based PDFs directly. Scanned PDFs and JPG/PNG images require
the Python packages in `backend/requirements.txt` and the native Tesseract OCR
engine with Bengali (`ben`) and English (`eng`) trained data installed on the
backend host.

The API tries both languages by default (`TESSERACT_LANG=ben+eng`). It detects
Tesseract in `C:\Program Files\Tesseract-OCR` and in the project's local
`backend/.venv/Tools/Tesseract` directory. It also uses Bengali/English data in
`backend/.venv/Tools/Tesseract/tessdata` when present. Set `TESSERACT_CMD` or
`TESSDATA_PREFIX` in `.env` to override those paths.

On Windows, install the native Tesseract engine and check `tesseract --list-langs`.
The Bengali (`ben`) and English (`eng`) trained data can be kept in the project's
local Tesseract `tessdata` directory, avoiding writes to `Program Files`. Install
the Python packages from the active backend virtual environment with
`python -m pip install -r requirements.txt`, then restart Uvicorn.

The upload endpoint extracts labelled fields for review. It does not submit a
deed verification, infer missing values, or use OCR text as proof of ownership.
