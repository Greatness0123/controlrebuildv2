from PIL import Image
import os

source_path = "assets/icons/icon-removebg-preview.png"
icon_dir = "assets/icons"

if not os.path.exists(source_path):
    print(f"Error: {source_path} not found")
    exit(1)

img = Image.open(source_path)

# 1. Generate Windows ICO (Multi-size including 256x256)
# Electron builder requires at least 256x256. Best to include standard sizes.
icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
img.save(os.path.join(icon_dir, "icon.ico"), format="ICO", sizes=icon_sizes)
print("Generated icon.ico with sizes:", icon_sizes)

# 2. Generate Linux PNGs
# 512x512
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(icon_dir, "512x512.png"))
print("Generated 512x512.png")

# 256x256
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
img_256.save(os.path.join(icon_dir, "256x256.png"))
print("Generated 256x256.png")
