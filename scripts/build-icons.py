"""Rasterize the existing honey/heart icon geometry, with antialiasing for Home Screen PNGs.
Requires Pillow. No remote images, fonts, or image generation services are used.
"""
from pathlib import Path
from PIL import Image, ImageDraw

output = Path(__file__).resolve().parent.parent / 'public'

def cubic(a, b, c, d):
    return [tuple((1-t)**3*a[k] + 3*(1-t)**2*t*b[k] + 3*(1-t)*t*t*c[k] + t**3*d[k]
                  for k in range(2)) for t in (i/100 for i in range(101))]

heart = cubic((32,46),(8,32),(17,16),(27,23)) + [(32,28),(37,23)]
heart += cubic((37,23),(47,16),(56,32),(32,46))
for filename, size in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512)]:
    scale = size * 4 / 64
    image = Image.new('RGB', (size*4,size*4), '#eab44a')
    ImageDraw.Draw(image).polygon([(x*scale,y*scale) for x,y in heart], fill='#433d2f')
    image.resize((size,size), Image.Resampling.LANCZOS).save(output / filename)
