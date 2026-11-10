"""One-time conversion of the design-tool template (x-dc + React runtime) into plain static HTML.
Usage: python3 tools/build_static.py index.html  (rewrites in place)"""
import re, sys
p = sys.argv[1]; s = open(p).read()
wm = re.search(r"var NV_WM = '([^']+)'", s).group(1)
accent = re.search(r"const accent = '([^']+)'", s).group(1)

head, rest = s.split('<body>', 1)
head = re.sub(r'<script defer src="\./(vendor/react(-dom)?|support)\.js"></script>\n', '', head)
xdc = re.search(r'<x-dc>(.*?)</x-dc>', rest, re.S).group(1)
helmet = re.search(r'<helmet>(.*?)</helmet>', xdc, re.S).group(1)
body = xdc.replace(re.search(r'<helmet>.*?</helmet>', xdc, re.S).group(0), '')

# expand the extruded-logo layer loop exactly like the old renderVals()
def layers(m):
    inner = m.group(1); out = []
    for i in range(26, 0, -1):
        k = i / 26; shade = round(62 - 50 * k)
        fill = f'rgba({round(shade*0.7)},{round(shade*0.9)},{round(shade*1.25)},0.82)'
        stroke = 'rgba(127,232,255,0.3)' if i == 26 else ('rgba(127,232,255,0.07)' if i % 6 == 0 else 'none')
        out.append(inner.replace('{{l.z}}', f'{-i*2.6:g}px').replace('{{l.fill}}', fill).replace('{{l.stroke}}', stroke))
    return ''.join(out)
body = re.sub(r'<sc-for list="\{\{layers\}\}"[^>]*>(.*?)</sc-for>', layers, body, flags=re.S)
body = body.replace('{{wm}}', wm).replace('{{accent}}', accent)
assert '{{' not in body, re.findall(r'\{\{[^}]*\}\}', body)[:5]

tail = rest.split('</x-dc>', 1)[1]
tail = re.sub(r'<script type="text/x-dc".*?</script>\n?', '', tail, flags=re.S)
out = head.replace('</head>', helmet.strip() + '\n</head>') + '<body>\n' + body.strip() + '\n' + tail.lstrip('\n')
open(p, 'w').write(out)
print('ok', len(s), '->', len(out))
