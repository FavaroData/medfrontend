import urllib.request, os

base   = 'http://192.168.0.4:8081'
cookie = 'JSESSIONID=6E72C29A18DBE7C3D5E04016F151A39C'
out    = r'C:\Users\suporte\Python\Nova\meddrive-dev\fragments'

os.makedirs(out, exist_ok=True)

fragments = {
    'home.html':            '/fragments/home-dashboard',
    'dicom-server.html':    '/dicom/fragments/dashboard-data',
    'dicom-worklist.html':  '/dicom-worklist/fragments/dashboard-data',
    'imager.html':          '/imager/fragments/dashboard-data',
    'gateway.html':         '/api/gateway/fragments/dashboard',
    'report.html':          '/report/fragments/dashboard',
    'admin.html':           '/admin/configurations-fragment',
}

for filename, url in fragments.items():
    try:
        req  = urllib.request.Request(base + url, headers={'Cookie': cookie})
        data = urllib.request.urlopen(req).read()
        path = os.path.join(out, filename)
        with open(path, 'wb') as f:
            f.write(data)
        print(f'OK   {url} -> fragments/{filename} ({len(data)} bytes)')
    except Exception as e:
        print(f'FAIL {url} -> {e}')