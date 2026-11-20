"""Render the code-native honey-pot/dollar brand icon as SVG and Home Screen PNGs.
Requires Pillow. Geometry is shared between vector and raster output.
"""
from pathlib import Path
from PIL import Image, ImageDraw

output = Path(__file__).resolve().parent.parent / 'public'
pot = 'M22 19 C17 24 12 34 15 45 C18 57 46 57 49 45 C52 34 47 24 42 19 Z'
honey = 'M19 21 L45 21 L45 27 C45 33 38 33 38 27 L38 25 C38 23 33 23 33 25 L33 27 C33 31 27 31 27 26 L27 24 L19 24 Z'
dollar = 'M38 35 C35 31 27 32 26 36 C24 41 39 39 38 44 C37 49 29 50 25 45'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#faf8f1"/><path d="{pot}" fill="#3c5342"/><path d="{honey}" fill="#edc362"/><rect x="18" y="12" width="28" height="10" rx="4" fill="#edc362" stroke="#3c5342" stroke-width="2"/><path d="{dollar} M32 29 L32 52" fill="none" stroke="#fff9e9" stroke-width="2.6" stroke-linecap="round"/></svg>'''
(output / 'public-icon.svg').write_text(svg, encoding='utf-8')

def cubic(a,b,c,d):
    return [tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k] for k in range(2)) for t in (i/100 for i in range(101))]

pot_points = cubic((22,19),(17,24),(12,34),(15,45))+cubic((15,45),(18,57),(46,57),(49,45))+cubic((49,45),(52,34),(47,24),(42,19))
honey_points = [(19,21),(45,21),(45,27)]+cubic((45,27),(45,33),(38,33),(38,27))+[(38,25)]+cubic((38,25),(38,23),(33,23),(33,25))+[(33,27)]+cubic((33,27),(33,31),(27,31),(27,26))+[(27,24),(19,24)]
dollar_points = cubic((38,35),(35,31),(27,32),(26,36))+cubic((26,36),(24,41),(39,39),(38,44))+cubic((38,44),(37,49),(29,50),(25,45))
for filename,size in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512)]:
    scale=size*4/64
    image=Image.new('RGB',(size*4,size*4),'#faf8f1'); draw=ImageDraw.Draw(image)
    points=lambda values:[(round(x*scale),round(y*scale)) for x,y in values]
    draw.polygon(points(pot_points),fill='#3c5342')
    draw.polygon(points(honey_points),fill='#edc362')
    draw.rounded_rectangle((18*scale,12*scale,46*scale,22*scale),radius=4*scale,fill='#edc362',outline='#3c5342',width=round(2*scale))
    draw.line(points(dollar_points),fill='#fff9e9',width=round(2.6*scale),joint='curve')
    draw.line(points([(32,29),(32,52)]),fill='#fff9e9',width=round(2.6*scale))
    image.resize((size,size),Image.Resampling.LANCZOS).save(output / filename)
