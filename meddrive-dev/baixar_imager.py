
import urllib.request, os
base = 'http://192.168.0.4:8081'
cookie = 'JSESSIONID=809C90B8B8A1B1B7CAA9F0E329BAA8DC'
out = r'C:\Users\suporte\Python\Nova\meddrive-dev\css'
url = '/css/imager-3ff00425ea48d1e11f89995f77291b1b.css'
req = urllib.request.Request(base+url, headers={'Cookie': cookie})
data = urllib.request.urlopen(req).read()
open(os.path.join(out, url.split('/')[-1]), 'wb').write(data)
print('OK', url)
