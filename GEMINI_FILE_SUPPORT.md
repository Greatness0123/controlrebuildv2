# Gemini API File Support

## Overview

Google's Gemini API (specifically Gemini 1.5 and later) supports various file types for multimodal input.

## Supported File Types

### Images
- ✅ **PNG** (`image/png`)
- ✅ **JPEG/JPG** (`image/jpeg`)
- ✅ **WebP** (`image/webp`)
- ✅ **GIF** (`image/gif`)
- ✅ **BMP** (`image/bmp`)

### Documents
- ✅ **PDF** (`application/pdf`) - **Gemini 1.5+**
- ✅ **Text files** (`.txt`, `.md`, `.csv`, etc.) - Read as text content

### Video (Gemini 1.5 Pro)
- ✅ **MP4** (`video/mp4`)
- ✅ **MOV** (`video/quicktime`)
- ✅ **AVI** (`video/x-msvideo`)

### Audio (Gemini 1.5 Pro)
- ✅ **MP3** (`audio/mpeg`)
- ✅ **WAV** (`audio/wav`)
- ✅ **FLAC** (`audio/flac`)

## Implementation in Control

### Current Support

**Ask Mode (`ask_backend.py`):**
- ✅ Images (PNG, JPG, JPEG, WebP, GIF, BMP)
- ✅ PDF files
- ✅ Text files

**Act Mode (`act_backend.py`):**
- ✅ Images (PNG, JPG, JPEG, WebP, GIF, BMP)
- ✅ PDF files
- ✅ Text files

### How It Works

1. **File Upload:** User attaches file via chat interface
2. **File Storage:** File saved to temporary directory
3. **File Reading:** Backend reads file based on type:
   - **Images/PDFs:** Read as binary, sent with MIME type
   - **Text files:** Read as UTF-8 text, appended to prompt
4. **API Call:** File data sent to Gemini via `generate_content()` with `content_parts` array

### Code Example

```python
content_parts = []

# Image
with open('image.png', 'rb') as f:
    image_data = f.read()
content_parts.append({
    "mime_type": "image/png",
    "data": image_data
})

# PDF
with open('document.pdf', 'rb') as f:
    pdf_data = f.read()
content_parts.append({
    "mime_type": "application/pdf",
    "data": pdf_data
})

# Text
with open('file.txt', 'r', encoding='utf-8') as f:
    text = f.read()
content_parts.append(f"\n[Attachment: file.txt]\n{text}\n")

# Send to Gemini
response = model.generate_content(content_parts)
```

## Limitations

### File Size Limits
- **Images:** Typically up to 20MB
- **PDFs:** Up to 2MB per page (Gemini 1.5 Pro supports up to 1,000 pages)
- **Text:** No hard limit, but very large files may timeout

### Model Requirements
- **PDF support:** Requires Gemini 1.5 or later
- **Video/Audio:** Requires Gemini 1.5 Pro
- **Basic images:** Supported in all Gemini models

## Future Enhancements

Potential additions:
- Video file support (MP4, MOV)
- Audio file support (MP3, WAV)
- Office documents (DOCX, XLSX) - convert to PDF first
- Code files with syntax highlighting context

## References

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini 1.5 Features](https://deepmind.google/technologies/gemini/)
- [File Upload Guide](https://ai.google.dev/gemini-api/docs/upload)

