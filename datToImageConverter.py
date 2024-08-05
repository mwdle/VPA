# This script allows you to convert raw .dat image files from VPA storage into PNG's. Run using python datToImageConverter.py /path/to/vpa/image.dat.
from PIL import Image
import numpy as np
import argparse

CANVAS_WIDTH = 448
CANVAS_HEIGHT = 224

file_path = ''

def create_png_from_monochrome_image(pixels):
    img = Image.new('L', (CANVAS_WIDTH, CANVAS_HEIGHT), 0)
    img_pixels = img.load()

    for y in range(CANVAS_HEIGHT):
        for x in range(CANVAS_WIDTH):
            byte_index = (y * CANVAS_WIDTH + x) // 8
            bit_index = 7 - ((y * CANVAS_WIDTH + x) % 8)
            bit = (pixels[byte_index] >> bit_index) & 1
            img_pixels[x,y] = 255 if bit else 37

    # Save the image as a PNG file (assumes the given filename ends with .dat)
    img.save(file_path[:-3] + 'png')

def main():
    # Read the binary data from the file
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Convert the binary data to a NumPy array
    pixels = np.frombuffer(data, dtype=np.uint8)

    create_png_from_monochrome_image(pixels)

if __name__ == '__main__':
    # Set up argument parsing
    parser = argparse.ArgumentParser(description='Binary image filepath')
    parser.add_argument('file_path', type=str, help='/path/to/vpa/image.dat file')
    
    # Parse command-line arguments
    args = parser.parse_args()
    
    # Call the main function with the provided file path
    file_path = args.file_path
    main()