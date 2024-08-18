# This script allows you to convert raw .dat image files from VPA storage into PNG's. Run using python datToImageConverter.py /path/to/vpa/image.dat.
from PIL import Image # pip install pillow
import numpy as np # pip install numpy
import argparse

CANVAS_WIDTH = 448
"""
The size of the virtual canvas as configured in your VPA script.js and server.mjs files.
"""
CANVAS_HEIGHT = 224
"""
The size of the virtual canvas as configured in your VPA script.js and server.mjs files.
"""
PIXEL_WHITE = 255
"""
The size of the virtual canvas as configured in your VPA script.js and server.mjs files.
"""
PIXEL_GRAY = 37

def save_png_from_image_buffer(pixels, file_path):
    """
    Saves the given VPA pixels buffer to the given filepath as a PNG.
    """
    img = Image.new('L', (CANVAS_WIDTH, CANVAS_HEIGHT), 0)
    img_pixels = img.load()

    # VPA utilizes bit manipulation to store images with a single bit per pixel. The following code reconstructs the VPA formatted data as a PNG.
    for y in range(CANVAS_HEIGHT):
        for x in range(CANVAS_WIDTH):
            byte_index = (y * CANVAS_WIDTH + x) // 8
            bit_index = 7 - ((y * CANVAS_WIDTH + x) % 8)
            bit = (pixels[byte_index] >> bit_index) & 1
            img_pixels[x,y] = PIXEL_WHITE if bit else PIXEL_GRAY

    # Save the image to the current directory as a PNG file (assumes the given filename ends with .dat)
    img.save(file_path[:-3] + 'png')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="This script allows you to convert .dat image files from VPA storage into PNG's. Run using python datToImageConverter.py /path/to/vpa/image.dat.")
    parser.add_argument('file_path', type=str, help='/path/to/vpa/image.dat file')
    args = parser.parse_args()
    
    file_path = args.file_path

    with open(file_path, 'rb') as f:
        data = f.read()
        pixels = np.frombuffer(data, dtype=np.uint8)
        save_png_from_image_buffer(pixels, file_path)