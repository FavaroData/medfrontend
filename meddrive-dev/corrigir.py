import os, re

base = r'C:\Users\suporte\Python\Nova\meddrive-dev'

# ── 1. Corrige caminhos absolutos no all.min.css ──────────────────────────
css_path = os.path.join(base, 'webjars', 'font-awesome', '6.4.0', 'css', 'all.min.css')
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Troca /webjars/font-awesome/6.4.0/webfonts/ por ../webfonts/
css_fixed = css.replace('/webjars/font-awesome/6.4.0/webfonts/', '../webfonts/')
with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css_fixed)
print('Corrigido: all.min.css')

# ── 2. Injeta dados estáticos no dev-override.js ─────────────────────────
override_path = os.path.join(base, 'js', 'dev-override.js')
with open(override_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Só adiciona se ainda não tiver os dados
if 'STATIC_WORKLIST' not in js:
    injection = """

// Dados estáticos da worklist para dev
window.STATIC_WORKLIST = {
    step1: [
        {date:"09/06/26 08:19", patient:"Joseane Aparecida Lopes", birth:"16/04/1968", cpf:"740.195.979-87", procedure:"Angiofluoresceinografia - Monocular", atend:"181781", prescr:"324121-1", acc:"3241211", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 08:19", patient:"Alvisio Ribeiro da Silva", birth:"11/03/1942", cpf:"033.110.909-34", procedure:"Retinografia - Monocular", atend:"181780", prescr:"324120-2", acc:"3241202", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 08:19", patient:"Alvisio Ribeiro da Silva", birth:"11/03/1942", cpf:"033.110.909-34", procedure:"Tomografia De Coerencia Optica Monocular", atend:"181780", prescr:"324120-1", acc:"3241201", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 08:06", patient:"Marlene da Silva Santana", birth:"13/10/1950", cpf:"016.082.269-64", procedure:"Tomografia De Coerencia Optica Monocular", atend:"181779", prescr:"324119-1", acc:"3241191", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:53", patient:"Samuel Evangelista de Carvalho", birth:"06/04/1956", cpf:"333.835.029-53", procedure:"Estéreo-Foto De Papila - Monocular", atend:"181778", prescr:"324117-3", acc:"3241173", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:53", patient:"Samuel Evangelista de Carvalho", birth:"06/04/1956", cpf:"333.835.029-53", procedure:"Retinografia - Monocular", atend:"181778", prescr:"324117-1", acc:"3241171", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:41", patient:"Pergentina Vanusia de Andrade", birth:"11/08/1955", cpf:"011.722.668-83", procedure:"Angiofluoresceinografia - Monocular", atend:"181775", prescr:"324115-2", acc:"3241152", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:28", patient:"Rosineia Bordinhao", birth:"11/07/1972", cpf:"842.345.809-10", procedure:"Retinografia", atend:"181774", prescr:"324112-3", acc:"3241123", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:28", patient:"Rosineia Bordinhao", birth:"11/07/1972", cpf:"842.345.809-10", procedure:"Tomografia de Coerência Óptica - OCT", atend:"181774", prescr:"324112-1", acc:"3241121", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:26", patient:"Sergio Roberto Biss", birth:"14/10/1958", cpf:"253.329.029-72", procedure:"Retinografia - Monocular", atend:"181773", prescr:"324111-6", acc:"3241116", doctor:"Aramis de Castro Bach", status:"Pendente", statusClass:"warning"},
        {date:"09/06/26 07:26", patient:"Sergio Roberto Biss", birth:"14/10/1958", cpf:"253.329.029-72", procedure:"Microscopia Especular De Córnea - Monocular", atend:"181773", prescr:"324111-2", acc:"3241112", doctor:"Sandra Zandavalli Avila", status:"Pendente Aprovação", statusClass:"info"},
        {date:"09/06/26 07:26", patient:"Sergio Roberto Biss", birth:"14/10/1958", cpf:"253.329.029-72", procedure:"Biometria Ultra-Sônica - Monocular", atend:"181773", prescr:"324111-1", acc:"3241111", doctor:"Sandra Zandavalli Avila", status:"Pendente Aprovação", statusClass:"info"},
        {date:"08/06/26 08:59", patient:"Cleonice Antonia Zanlorenzi", birth:"13/06/1948", cpf:"185.684.679-20", procedure:"Microscopia Especular De Córnea - Monocular", atend:"181673", prescr:"323996-2", acc:"3239962", doctor:"Virginia Santos de Paula Soares Pilati", status:"Pendente Aprovação", statusClass:"info"},
        {date:"08/06/26 07:52", patient:"Paulo Eduardo Guimaraes Stroparo", birth:"04/08/1971", cpf:"864.502.639-20", procedure:"Ceratoscopia Computadorizada - Monocular", atend:"181659", prescr:"323987-3", acc:"3239873", doctor:"Virginia Santos de Paula Soares Pilati", status:"Pendente", statusClass:"warning"},
        {date:"08/06/26 07:31", patient:"Neusa Marli Vieira Godoy", birth:"09/01/1954", cpf:"171.950.559-49", procedure:"Angiofluoresceinografia - Monocular", atend:"181654", prescr:"323984-1", acc:"3239841", doctor:"Alex Treiger Grupenmacher", status:"Pendente", statusClass:"warning"},
        {date:"27/05/26 07:42", patient:"Pedro Luiz Bastian Vidal", birth:"25/02/1983", cpf:"038.123.129-13", procedure:"Paquimetria Ultra-Sônica - Monocular", atend:"180910", prescr:"323213-2", acc:"3232132", doctor:"Sandra Zandavalli Avila", status:"Pendente", statusClass:"warning"},
        {date:"20/05/26 13:01", patient:"Lais do Rocio Anachewski", birth:"25/09/1954", cpf:"232.333.979-68", procedure:"Paquimetria Ultra-Sônica - Monocular", atend:"180283", prescr:"322563-4", acc:"3225634", doctor:"Virginia Santos de Paula Soares Pilati", status:"Pendente", statusClass:"warning"}
    ]
};

// Popula a tabela com dados estáticos após o DOM estar pronto
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        var tbody = document.querySelector('#imagerWorklistTable tbody');
        if (!tbody || !window.STATIC_WORKLIST) return;
        var rows = window.STATIC_WORKLIST.step1;
        tbody.innerHTML = rows.map(function(r) {
            return '<tr>' +
                '<td class="text-nowrap align-middle">' + r.date + '</td>' +
                '<td class="text-nowrap align-middle">' + r.patient + '<br><small class="text-muted">Nasc: ' + r.birth + ' | CPF: ' + r.cpf + '</small></td>' +
                '<td class="text-nowrap align-middle">' + r.procedure + '<br><small class="text-muted">Atend: ' + r.atend + ' | Prescr: ' + r.prescr + ' | Acc: ' + r.acc + '</small></td>' +
                '<td class="text-nowrap align-middle">' + r.doctor + '</td>' +
                '<td class="text-nowrap align-middle text-center"><span class="badge bg-' + r.statusClass + '">' + r.status + '</span></td>' +
                '</tr>';
        }).join('');
        console.log('[dev-override] tabela populada com', rows.length, 'registros');
    }, 500);
});
"""
    js = js + injection
    with open(override_path, 'w', encoding='utf-8') as f:
        f.write(js)
    print('Atualizado: dev-override.js com dados estáticos')
else:
    print('dev-override.js já contém os dados')

print('Concluído.')