import os, re

out = r'C:\Users\suporte\meddrive-dev'
html_path = os.path.join(out, 'dashboard.html')

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Remove jsessionid dos links
html = re.sub(r';jsessionid=[A-F0-9]+', '', html)

# Troca caminhos absolutos /css /js /images /webjars /vendor por relativos
html = re.sub(r'(href|src)="/(css|js|images|webjars|vendor|css/report)', r'\1="\2', html)
html = re.sub(r'(href|src)=\'/(css|js|images|webjars|vendor)', r"\1='\2", html)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

print('HTML ajustado')