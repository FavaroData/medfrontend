import urllib.request, os

base = 'http://192.168.0.4:8081'
cookie = 'JSESSIONID=809C90B8B8A1B1B7CAA9F0E329BAA8DC'
out = r'C:\Users\suporte\Python\Nova\meddrive-dev\webjars\font-awesome\6.4.0\webfonts'
os.makedirs(out, exist_ok=True)

fonts = [
    'fa-solid-900.ttf',
    'fa-regular-400.ttf',
    'fa-brands-400.ttf',
    'fa-v4compatibility.woff2',
    'fa-v4compatibility.ttf',
]

for f in fonts:
    url = f'/webjars/font-awesome/6.4.0/webfonts/{f}'
    req = urllib.request.Request(base + url, headers={'Cookie': cookie})
    try:
        data = urllib.request.urlopen(req).read()
        with open(os.path.join(out, f), 'wb') as fp:
            fp.write(data)
        print('OK', f)
    except Exception as e:
        print('FAIL', f, e)